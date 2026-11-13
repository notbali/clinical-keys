import { describe, expect, it } from 'vitest';
import type { NewAttempt } from '../data/api';
import type { Attempt } from '../data/types';
import {
  EMPTY_QUEUE, LOCK_TTL_MS, MAX_BACKOFF_MS, MAX_QUEUE, backoffMs, dueEntries, enqueue, flushQueue, looksSaved, markFailed, markSaved,
  nextWakeMs, parseQueue, pendingCount, queueKey, releaseLock, retryAllNow, serializeQueue, submitAttempt, tryLock, type FlushDeps,
} from './offlineQueue';
import type { KeyValueStore } from './resume';

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);

const run = (over: Partial<NewAttempt> = {}): NewAttempt => ({
  kind: 'drill', track: 'ma', drillId: 'ma-vitals', passage: 1, day: 2, act: 3,
  wpm: 31, accuracy: 97.5, errorsLeft: 0, seconds: 84, completed: true, clean: true, revealed: false, ...over,
});

const saved = (a: NewAttempt, createdAt: number, over: Partial<Attempt> = {}): Attempt =>
  ({ ...a, id: 'att-1', studentId: 'stu1', createdAt: new Date(createdAt).toISOString(), ...over }) as Attempt;

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('backoff', () => {
  it('doubles from two seconds and stops growing at the cap', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(40)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(0)).toBe(2000);
  });
});

describe('queue state machine', () => {
  it('queues a run that just failed to save, due after the first backoff', () => {
    const q = enqueue(EMPTY_QUEUE, run(), 'a', NOW);
    expect(pendingCount(q)).toBe(1);
    expect(q.entries[0]).toMatchObject({ id: 'a', tries: 1, queuedAt: NOW, nextAt: NOW + 2000 });
    expect(dueEntries(q, NOW)).toHaveLength(0);
    expect(dueEntries(q, NOW + 2000)).toHaveLength(1);
  });
  it('does not change the old state (pure)', () => {
    enqueue(EMPTY_QUEUE, run(), 'a', NOW);
    expect(EMPTY_QUEUE.entries).toHaveLength(0);
  });
  it('markFailed backs off further each time', () => {
    let q = enqueue(EMPTY_QUEUE, run(), 'a', NOW);
    q = markFailed(q, 'a', NOW + 2000);
    expect(q.entries[0]).toMatchObject({ tries: 2, nextAt: NOW + 2000 + 4000 });
    q = markFailed(q, 'a', NOW + 10_000);
    expect(q.entries[0]).toMatchObject({ tries: 3, nextAt: NOW + 10_000 + 8000 });
  });
  it('markSaved removes only that run', () => {
    let q = enqueue(EMPTY_QUEUE, run({ passage: 1 }), 'a', NOW);
    q = enqueue(q, run({ passage: 2 }), 'b', NOW);
    q = markSaved(q, 'a');
    expect(q.entries.map((e) => e.id)).toEqual(['b']);
    expect(markSaved(q, 'nope').entries).toHaveLength(1);
  });
  it('retryAllNow makes everything due at once without losing the try count', () => {
    let q = enqueue(EMPTY_QUEUE, run(), 'a', NOW);
    q = markFailed(markFailed(q, 'a', NOW), 'a', NOW);
    q = retryAllNow(q, NOW + 1000);
    expect(dueEntries(q, NOW + 1000)).toHaveLength(1);
    expect(q.entries[0].tries).toBe(3);
  });
  it('tries the least-failed run first so one rejected run cannot block the rest', () => {
    let q = enqueue(EMPTY_QUEUE, run({ passage: 1 }), 'poison', NOW);
    q = markFailed(markFailed(q, 'poison', NOW), 'poison', NOW);
    q = enqueue(q, run({ passage: 2 }), 'fresh', NOW);
    q = retryAllNow(q, NOW + 1);
    expect(dueEntries(q, NOW + 1).map((e) => e.id)).toEqual(['fresh', 'poison']);
  });
  it('nextWakeMs says when to try again, or null when empty', () => {
    expect(nextWakeMs(EMPTY_QUEUE, NOW)).toBeNull();
    const q = enqueue(EMPTY_QUEUE, run(), 'a', NOW);
    expect(nextWakeMs(q, NOW)).toBe(2000);
    expect(nextWakeMs(q, NOW + 50_000)).toBe(0);
  });
  it('keeps the newest runs if the queue ever overflows, never the oldest silently below the cap', () => {
    let q = EMPTY_QUEUE;
    for (let i = 0; i < MAX_QUEUE + 5; i++) q = enqueue(q, run({ passage: i }), `id${i}`, NOW + i);
    expect(q.entries).toHaveLength(MAX_QUEUE);
    expect(q.entries[q.entries.length - 1].id).toBe(`id${MAX_QUEUE + 4}`);
  });
});

describe('persistence', () => {
  it('round-trips, including fields this version does not know about', () => {
    const extra = { ...run(), weakWords: ['hypertension'] } as NewAttempt;
    const q = enqueue(enqueue(EMPTY_QUEUE, extra, 'a', NOW), run({ passage: 4 }), 'b', NOW + 5);
    const back = parseQueue(serializeQueue(q));
    expect(back).toEqual(q);
    expect((back.entries[0].attempt as unknown as { weakWords: string[] }).weakWords).toEqual(['hypertension']);
  });
  it('treats missing or corrupt data as an empty queue', () => {
    for (const raw of [null, '', 'oops', '{}', '[]', 'null', '{"v":1,"entries":"x"}', '{"v":9,"entries":[]}']) {
      expect(parseQueue(raw).entries).toEqual([]);
    }
  });
  it('drops entries that are damaged and keeps the good ones', () => {
    const q = enqueue(EMPTY_QUEUE, run(), 'good', NOW);
    const obj = JSON.parse(serializeQueue(q));
    obj.entries.push(
      null, 7, { id: 'x' },
      { id: 'noattempt', queuedAt: NOW, tries: 1, nextAt: NOW },
      { id: 'badkind', queuedAt: NOW, tries: 1, nextAt: NOW, attempt: { ...run(), kind: 'quiz' } },
      { id: 'badwpm', queuedAt: NOW, tries: 1, nextAt: NOW, attempt: { ...run(), wpm: 'fast' } },
      { id: 'good', queuedAt: NOW, tries: 1, nextAt: NOW, attempt: run() }, // duplicate id
    );
    const back = parseQueue(JSON.stringify(obj));
    expect(back.entries.map((e) => e.id)).toEqual(['good']);
  });
  it('repairs odd timing fields instead of dropping the run', () => {
    const obj = { v: 1, entries: [{ id: 'a', attempt: run(), queuedAt: NOW, tries: -3, nextAt: 'soon' }] };
    const back = parseQueue(JSON.stringify(obj));
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0].tries).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(back.entries[0].nextAt)).toBe(true);
  });
  it('keys the queue per student so a shared Chromebook never mixes runs', () => {
    expect(queueKey('stu1')).not.toBe(queueKey('stu2'));
  });
});

describe('duplicate check', () => {
  const a = run();
  const entry = enqueue(EMPTY_QUEUE, a, 'a', NOW).entries[0];
  it('recognizes a run the server already has', () => {
    expect(looksSaved(entry, [saved(a, NOW + 500)])).toBe(true);
  });
  it('treats a missing optional field the same as null (the database stores null)', () => {
    const noDay = enqueue(EMPTY_QUEUE, run({ day: undefined, act: undefined, drillId: undefined, kind: 'sprint', passage: 0 }), 'b', NOW).entries[0];
    expect(looksSaved(noDay, [saved(run({ day: undefined, act: undefined, drillId: undefined, kind: 'sprint', passage: 0 }), NOW + 5)])).toBe(true);
  });
  it('is not fooled by a similar run that differs in any scored field', () => {
    for (const diff of [{ wpm: 32 }, { seconds: 85 }, { passage: 2 }, { drillId: 'ma-soap' }, { errorsLeft: 1 }, { accuracy: 96.5 }, { clean: false }, { day: 3 }] as Partial<NewAttempt>[]) {
      expect(looksSaved(entry, [saved(run(diff), NOW + 500)])).toBe(false);
    }
  });
  it('allows for tiny rounding in accuracy', () => {
    expect(looksSaved(entry, [saved(run({ accuracy: 97.52 }), NOW + 500)])).toBe(true);
  });
  it('ignores an identical run saved long before this one was queued', () => {
    expect(looksSaved(entry, [saved(a, NOW - 3600_000)])).toBe(false);
  });
});

describe('cross-tab lock', () => {
  it('lets one tab in at a time and frees an abandoned lock', () => {
    const first = tryLock(null, 'tab1', NOW);
    expect(first.acquired).toBe(true);
    const second = tryLock(first.value, 'tab2', NOW + 1000);
    expect(second.acquired).toBe(false);
    expect(second.value).toBe(first.value);
    expect(tryLock(first.value, 'tab2', NOW + LOCK_TTL_MS + 1).acquired).toBe(true);
    expect(tryLock(first.value, 'tab1', NOW + 1000).acquired).toBe(true); // same owner re-enters
  });
  it('treats a corrupt lock as free', () => {
    expect(tryLock('{{{', 'tab1', NOW).acquired).toBe(true);
  });
  it('only the owner releases', () => {
    const l = tryLock(null, 'tab1', NOW);
    expect(releaseLock(l.value, 'tab2')).toBe(l.value);
    expect(releaseLock(l.value, 'tab1')).toBeNull();
  });
});

/** An api whose saves fail while `online` is false and which remembers what it saved. */
function fakeApi() {
  const state = { online: true, calls: 0, listCalls: 0, rows: [] as Attempt[], clock: NOW, loseResponse: false };
  return {
    state,
    save: async (a: NewAttempt) => {
      state.calls++;
      if (!state.online) throw new Error('network down');
      const row = saved(a, state.clock, { id: `att-${state.calls}` });
      state.rows.push(row);
      if (state.loseResponse) { state.loseResponse = false; throw new Error('response lost'); }
      return row;
    },
    list: async () => { state.listCalls++; if (!state.online) throw new Error('network down'); return state.rows.slice(); },
  };
}

function deps(api: ReturnType<typeof fakeApi>, store: KeyValueStore, over: Partial<FlushDeps> = {}): FlushDeps {
  let n = 0;
  return { store, studentId: 'stu1', save: api.save, list: api.list, now: () => api.state.clock, owner: 'tab1', newId: () => `id${++n}`, ...over };
}

describe('submitAttempt', () => {
  it('saves straight away when the connection is fine and queues nothing', async () => {
    const api = fakeApi(); const store = new FakeStore();
    expect(await submitAttempt(deps(api, store), run())).toBe('saved');
    expect(api.state.rows).toHaveLength(1);
    expect(parseQueue(store.getItem(queueKey('stu1'))).entries).toHaveLength(0);
  });
  it('queues the run when the save fails', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    expect(await submitAttempt(deps(api, store), run())).toBe('queued');
    expect(parseQueue(store.getItem(queueKey('stu1'))).entries).toHaveLength(1);
  });
  it('still queues the run when storage is unavailable, without throwing', async () => {
    const api = fakeApi(); api.state.online = false;
    const broken: KeyValueStore = { length: 0, key: () => null, getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    await expect(submitAttempt(deps(api, broken), run())).resolves.toBe('failed');
  });
});

describe('flushQueue', () => {
  it('uploads everything that was queued offline once the connection returns, oldest first', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store), run({ passage: 1 }));
    await submitAttempt(deps(api, store), run({ passage: 2 }));
    api.state.online = true;
    api.state.clock += 60_000;
    const r = await flushQueue(deps(api, store), { force: true });
    expect(r).toMatchObject({ saved: 2, remaining: 0 });
    expect(api.state.rows.map((x) => x.passage)).toEqual([1, 2]);
    expect(parseQueue(store.getItem(queueKey('stu1'))).entries).toHaveLength(0);
  });
  it('waits for the backoff unless forced (the online event forces)', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store), run());
    api.state.online = true;
    const early = await flushQueue(deps(api, store));
    expect(early).toMatchObject({ saved: 0, remaining: 1 });
    const forced = await flushQueue(deps(api, store), { force: true });
    expect(forced).toMatchObject({ saved: 1, remaining: 0 });
  });
  it('keeps the run and backs off when the retry fails too', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store), run());
    const r = await flushQueue(deps(api, store), { force: true });
    expect(r).toMatchObject({ saved: 0, remaining: 1 });
    const q = parseQueue(store.getItem(queueKey('stu1')));
    expect(q.entries[0].tries).toBe(2);
    expect(q.entries[0].nextAt).toBeGreaterThan(api.state.clock);
  });
  it('does not save a run twice when the first response was lost but the server kept it', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.loseResponse = true;
    expect(await submitAttempt(deps(api, store), run())).toBe('queued');
    expect(api.state.rows).toHaveLength(1); // the server did get it
    api.state.clock += 30_000;
    const r = await flushQueue(deps(api, store), { force: true });
    expect(r).toMatchObject({ saved: 1, remaining: 0 });
    expect(api.state.rows).toHaveLength(1); // not duplicated
  });
  it('does not save while another tab holds the lock, and does not lose anything', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store), run());
    api.state.online = true;
    const other = tryLock(null, 'tab2', api.state.clock).value;
    store.setItem(`${queueKey('stu1')}:lock`, other);
    const r = await flushQueue(deps(api, store), { force: true });
    expect(r).toMatchObject({ saved: 0, remaining: 1, skipped: 'locked' });
    expect(api.state.rows).toHaveLength(0);
  });
  it('releases the lock when done, even after a failure', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store), run());
    await flushQueue(deps(api, store), { force: true });
    expect(store.getItem(`${queueKey('stu1')}:lock`)).toBeNull();
  });
  it('reports nothing to do on an empty queue without calling the api', async () => {
    const api = fakeApi(); const store = new FakeStore();
    const r = await flushQueue(deps(api, store), { force: true });
    expect(r).toMatchObject({ saved: 0, remaining: 0 });
    expect(api.state.calls).toBe(0);
    expect(api.state.listCalls).toBe(0);
  });
  it('only flushes the signed-in student\'s own queue', async () => {
    const api = fakeApi(); const store = new FakeStore();
    api.state.online = false;
    await submitAttempt(deps(api, store, { studentId: 'stu1' }), run());
    api.state.online = true;
    const r = await flushQueue(deps(api, store, { studentId: 'stu2' }), { force: true });
    expect(r.saved).toBe(0);
    expect(api.state.rows).toHaveLength(0);
    expect(parseQueue(store.getItem(queueKey('stu1'))).entries).toHaveLength(1);
  });
});
