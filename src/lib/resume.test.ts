import { describe, expect, it } from 'vitest';
import { applyInput, elapsed, newRun } from '../typing/engine';
import {
  RESUME_MAX_AGE_MS, clearRun, hashText, loadRun, parseRun, pauseRun, pruneRuns, restoreRunState, resumeKey, saveRun, serializeRun,
  type KeyValueStore,
} from './resume';

const T = 'Take 1 tablet by mouth once daily.';
const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

/** A run with one wrong keystroke that was fixed, started at performance time 1000. */
function midRun() {
  let s = newRun();
  s = applyInput(s, T, 'Take 1 tablat', 1000);
  s = applyInput(s, T, 'Take 1 tabl', 2000);
  s = applyInput(s, T, 'Take 1 tablet b', 5000);
  return s;
}

describe('resumeKey', () => {
  it('is per student, drill and passage or seed', () => {
    const a = resumeKey('stu1', 'drill', 'ma-vitals', 2);
    expect(a).toBeTruthy();
    expect(a).not.toBe(resumeKey('stu2', 'drill', 'ma-vitals', 2));
    expect(a).not.toBe(resumeKey('stu1', 'drill', 'ma-vitals', 3));
    expect(a).not.toBe(resumeKey('stu1', 'drill', 'ma-soap', 2));
  });
  it('gives no key for timed sprints, which are not resumable', () => {
    expect(resumeKey('stu1', 'sprint', undefined, 0)).toBeNull();
  });
  it('gives no key without a drill id', () => {
    expect(resumeKey('stu1', 'drill', undefined, 0)).toBeNull();
  });
});

describe('hashText', () => {
  it('is stable and differs for different text', () => {
    expect(hashText(T)).toBe(hashText(T));
    expect(hashText(T)).not.toBe(hashText(T + ' '));
    expect(hashText('Take 1 tablet')).not.toBe(hashText('Take 2 tablet'));
  });
});

describe('serialize and parse a run', () => {
  it('round-trips typed text, counts and hint use', () => {
    const raw = serializeRun(midRun(), { revealed: false, peeks: 2 }, T, 6000, NOW)!;
    const back = parseRun(raw, T, NOW + 60_000)!;
    expect(back.typed).toBe('Take 1 tablet b');
    expect(back.keys).toBe(13 + 2 + 4);
    expect(back.wrong).toBe(1);
    expect(back.peeks).toBe(2);
    expect(back.revealed).toBe(false);
  });
  it('keeps a revealed answer revealed', () => {
    const raw = serializeRun(midRun(), { revealed: true, peeks: 0 }, T, 6000, NOW)!;
    expect(parseRun(raw, T, NOW)!.revealed).toBe(true);
  });
  it('has nothing to save before the first keystroke', () => {
    expect(serializeRun(newRun(), { revealed: false, peeks: 0 }, T, 100, NOW)).toBeNull();
  });
  it('discards a run saved for different target text', () => {
    const raw = serializeRun(midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW)!;
    expect(parseRun(raw, 'Take 2 tablets by mouth once daily.', NOW)).toBeNull();
    expect(parseRun(raw, T + ' More.', NOW)).toBeNull();
  });
  it('discards stale runs but keeps a run from earlier today', () => {
    const raw = serializeRun(midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW)!;
    expect(parseRun(raw, T, NOW + 3 * 3600_000)).not.toBeNull();
    expect(parseRun(raw, T, NOW + RESUME_MAX_AGE_MS + 1)).toBeNull();
  });
  it('discards corrupt, malformed and tampered data without throwing', () => {
    const good = JSON.parse(serializeRun(midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW)!);
    const bad = (patch: object) => JSON.stringify({ ...good, ...patch });
    for (const raw of [
      null, '', 'not json', '[]', 'null', '42', '{"v":1}',
      bad({ v: 99 }), bad({ typed: 7 }), bad({ typed: T + 'extra' }), bad({ keys: -1 }), bad({ keys: 1.5 }),
      bad({ keys: 3 }), // fewer keystrokes than characters typed
      bad({ wrong: 999 }), bad({ wrong: -2 }), bad({ peeks: 'x' }), bad({ revealed: 'yes' }),
      bad({ activeMs: -5 }), bad({ activeMs: 1e12 }), bad({ activeMs: null }), bad({ savedAt: 'yesterday' }), bad({ savedAt: NOW + 10 * 86_400_000 }),
    ]) {
      expect(parseRun(raw, T, NOW)).toBeNull();
    }
  });
});

describe('elapsed time on resume', () => {
  it('does not count the time the student was away', () => {
    const before = midRun(); // started at 1000, last saved at 6000 -> 5 s of active time
    const raw = serializeRun(before, { revealed: false, peeks: 0 }, T, 6000, NOW)!;
    const saved = parseRun(raw, T, NOW + 20 * 3600_000)!; // back the next morning
    expect(saved.activeMs).toBe(5000);
    const perfNow = 9_000_000; // performance.now() in the new page
    const restored = restoreRunState(saved, perfNow);
    expect(elapsed(restored, perfNow)).toBeCloseTo(5, 5);
    expect(elapsed(restored, perfNow + 3000)).toBeCloseTo(8, 5);
  });
  it('restores the counts and typed text exactly', () => {
    const before = midRun();
    const saved = parseRun(serializeRun(before, { revealed: false, peeks: 0 }, T, 6000, NOW)!, T, NOW)!;
    const r = restoreRunState(saved, 500);
    expect(r.typed).toBe(before.typed);
    expect(r.keys).toBe(before.keys);
    expect(r.wrong).toBe(before.wrong);
  });
  it('pauseRun moves the start forward by the time the tab was hidden', () => {
    const s = midRun();
    const p = pauseRun(s, 10_000);
    expect(p.start).toBe(11_000);
    expect(elapsed(p, 16_000)).toBeCloseTo(elapsed(s, 6000), 5);
  });
  it('pauseRun leaves a run that has not started, and negative gaps, alone', () => {
    expect(pauseRun(newRun(), 5000).start).toBeNull();
    expect(pauseRun(midRun(), -50).start).toBe(1000);
  });
});

describe('storage helpers', () => {
  it('saves, loads and clears a run', () => {
    const store = new FakeStore();
    const key = resumeKey('stu1', 'drill', 'ma-vitals', 0)!;
    saveRun(store, key, midRun(), { revealed: false, peeks: 1 }, T, 6000, NOW);
    expect(loadRun(store, key, T, NOW)!.typed).toBe('Take 1 tablet b');
    clearRun(store, key);
    expect(loadRun(store, key, T, NOW)).toBeNull();
    expect(store.length).toBe(0);
  });
  it('removes an unusable stored run when it is loaded', () => {
    const store = new FakeStore();
    const key = resumeKey('stu1', 'drill', 'ma-vitals', 0)!;
    store.setItem(key, '{broken');
    expect(loadRun(store, key, T, NOW)).toBeNull();
    expect(store.getItem(key)).toBeNull();
    saveRun(store, key, midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW);
    expect(loadRun(store, key, 'Different text now.', NOW)).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });
  it('saving an empty run clears any stored one', () => {
    const store = new FakeStore();
    const key = resumeKey('stu1', 'drill', 'ma-vitals', 0)!;
    saveRun(store, key, midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW);
    saveRun(store, key, newRun(), { revealed: false, peeks: 0 }, T, 7000, NOW);
    expect(store.getItem(key)).toBeNull();
  });
  it('never throws when storage is unavailable or full', () => {
    const broken: KeyValueStore = {
      length: 0, key: () => { throw new Error('no'); },
      getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); },
    };
    const key = resumeKey('stu1', 'drill', 'ma-vitals', 0)!;
    expect(() => saveRun(broken, key, midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW)).not.toThrow();
    expect(loadRun(broken, key, T, NOW)).toBeNull();
    expect(() => clearRun(broken, key)).not.toThrow();
    expect(() => pruneRuns(broken, NOW)).not.toThrow();
  });
  it('prunes stale and corrupt runs and leaves fresh runs and unrelated keys alone', () => {
    const store = new FakeStore();
    const fresh = resumeKey('stu1', 'drill', 'ma-vitals', 0)!;
    const old = resumeKey('stu1', 'drill', 'ma-soap', 0)!;
    saveRun(store, fresh, midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW);
    saveRun(store, old, midRun(), { revealed: false, peeks: 0 }, T, 6000, NOW - RESUME_MAX_AGE_MS - 1000);
    const junk = fresh + 'x';
    store.setItem(junk, 'garbage');
    store.setItem('unrelated', 'keep');
    pruneRuns(store, NOW);
    expect(store.getItem(fresh)).not.toBeNull();
    expect(store.getItem(old)).toBeNull();
    expect(store.getItem(junk)).toBeNull();
    expect(store.getItem('unrelated')).toBe('keep');
  });
});
