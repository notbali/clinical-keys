import { describe, expect, it } from 'vitest';
import { createDemoApi, MemoryStorage } from './demoApi';
import type { ChallengePassages, NewChallengeResult } from './challengeTypes';

const NOW = new Date(2026, 10, 12, 13, 5);
const MA = { drillId: 'ma-gen-vitals', seed: 111, chartDate: '2026-11-12' };
const RX = { drillId: 'rx-gen-labels', seed: 222, chartDate: '2026-11-12' };
const GOOD: NewChallengeResult = { wpm: 44, accuracy: 98, errorsLeft: 0, seconds: 70, revealed: false };

/** Seed roster: "Nov 9 group" (class-3) has Maya Santos (MA), Jordan Fischer and Daniel Park (PT) and Elena Vasquez (MA). "Nov 2 group" has others. */
const CLASS = 'class-3';
const OTHER_CLASS = 'class-2';

function setup() {
  let t = 0;
  const api = createDemoApi({ storage: new MemoryStorage(), now: () => new Date(NOW.getTime() + 1000 * t++) });
  const as = async (who: 'instructor' | string) => {
    await api.signOut();
    if (who === 'instructor') await api.signInInstructor('demo@school.example', 'x');
    else expect((await api.signInStudent(who)).ok).toBe(true);
  };
  const open = async (passages: ChallengePassages = { ma: MA, rx: RX }, classId = CLASS) => {
    await as('instructor');
    return api.createChallenge(classId, passages);
  };
  return { api, as, open };
}

describe('class challenge in the demo back end', () => {
  it('lets an instructor open a round and ends any earlier open round of the same class', async () => {
    const { api, open } = setup();
    const a = await open();
    expect(a).toMatchObject({ classId: CLASS, status: 'open', passages: { ma: MA, rx: RX } });
    expect((await api.getActiveChallenge(CLASS))?.id).toBe(a.id);
    const b = await api.createChallenge(CLASS, { ma: MA });
    expect((await api.getActiveChallenge(CLASS))?.id).toBe(b.id);
    expect(await api.getChallenge(a.id)).toMatchObject({ status: 'ended' });
    expect((await api.getChallenge(a.id))?.endedAt).toBeTruthy();
  });

  it('rejects an invalid round, an unknown class and a student trying to open one', async () => {
    const { api, as, open } = setup();
    await open();
    await expect(api.createChallenge(CLASS, {})).rejects.toThrow();
    await expect(api.createChallenge(CLASS, { ma: { ...MA, drillId: 'rx-gen-labels' } })).rejects.toThrow();
    await expect(api.createChallenge('class-nope', { ma: MA })).rejects.toThrow();
    await as('santosmaya');
    await expect(api.createChallenge(CLASS, { ma: MA })).rejects.toThrow();
  });

  it('shows a student only the open round of their own class', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya');
    expect((await api.getActiveChallenge())?.id).toBe(c.id);
    expect(await api.getChallenge(c.id)).toMatchObject({ id: c.id });
    // Marcus Johnson is in another class: he sees nothing, and cannot read this round by id.
    await as('johnsonmarcus');
    expect(await api.getActiveChallenge()).toBeNull();
    expect(await api.getChallenge(c.id)).toBeNull();
    await expect(api.listChallengeResults(c.id)).rejects.toThrow();
  });

  it('gives a signed-out visitor nothing', async () => {
    const { api, open } = setup();
    const c = await open();
    await api.signOut();
    await expect(api.getActiveChallenge()).rejects.toThrow();
    await expect(api.getChallenge(c.id)).rejects.toThrow();
    await expect(api.listChallengeResults(c.id)).rejects.toThrow();
  });

  it('stamps a result with the student, their track and a first-name-and-initial display name, once', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya');
    const me = await api.getMe();
    const r = await api.submitChallengeResult(c.id, GOOD);
    expect(r).toMatchObject({ challengeId: c.id, studentId: me.id, displayName: 'Maya S.', track: 'ma', clean: true, wpm: 44 });
    expect(JSON.stringify(r)).not.toContain('Santos');
    await expect(api.submitChallengeResult(c.id, { ...GOOD, wpm: 99 })).rejects.toThrow(/already/i);
    expect(await api.listChallengeResults(c.id)).toHaveLength(1);
  });

  it('works out whether a result is clean on its own, whatever the student claims', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya');
    const r = await api.submitChallengeResult(c.id, { ...GOOD, errorsLeft: 3, ...({ clean: true } as object) });
    expect(r.clean).toBe(false);
    await as('vasquezelena');
    expect((await api.submitChallengeResult(c.id, { ...GOOD, accuracy: 94 })).clean).toBe(false);
  });

  it('rejects an invalid result, a closed round, another class’s round and a track with no passage', async () => {
    const { api, as, open } = setup();
    const c = await open({ ma: MA });
    await as('santosmaya');
    await expect(api.submitChallengeResult(c.id, { ...GOOD, wpm: 9999 })).rejects.toThrow();
    await expect(api.submitChallengeResult(c.id, { ...GOOD, accuracy: 101 })).rejects.toThrow();
    await expect(api.submitChallengeResult('nope', GOOD)).rejects.toThrow();
    // A PT student when the round has only an MA passage.
    await as('fischerjordan');
    await expect(api.submitChallengeResult(c.id, GOOD)).rejects.toThrow(/passage|track/i);
    // Another class.
    await as('johnsonmarcus');
    await expect(api.submitChallengeResult(c.id, GOOD)).rejects.toThrow();
    // Closed round.
    await as('instructor');
    await api.endChallenge(c.id);
    await as('santosmaya');
    await expect(api.submitChallengeResult(c.id, GOOD)).rejects.toThrow(/closed|ended/i);
    expect(await api.getActiveChallenge()).toBeNull();
  });

  it('lets only the instructor end a round, and ending twice is harmless', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya');
    await expect(api.endChallenge(c.id)).rejects.toThrow();
    await as('instructor');
    await api.endChallenge(c.id);
    const first = (await api.getChallenge(c.id))!.endedAt;
    await api.endChallenge(c.id);
    expect((await api.getChallenge(c.id))!.endedAt).toBe(first);
    expect(await api.getActiveChallenge(CLASS)).toBeNull();
    await expect(api.endChallenge('nope')).rejects.toThrow();
  });

  it('lets the instructor and classmates read the results, not other classes', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya'); await api.submitChallengeResult(c.id, GOOD);
    await as('fischerjordan'); await api.submitChallengeResult(c.id, { ...GOOD, wpm: 33 });
    await as('parkdaniel');
    expect((await api.listChallengeResults(c.id)).map((r) => r.displayName).sort()).toEqual(['Jordan F.', 'Maya S.']);
    await as('instructor');
    expect(await api.listChallengeResults(c.id)).toHaveLength(2);
    await expect(api.listChallengeResults('nope')).resolves.toEqual([]);
  });

  it('keeps rounds of different classes apart', async () => {
    const { api, as, open } = setup();
    const a = await open({ ma: MA }, CLASS);
    const b = await api.createChallenge(OTHER_CLASS, { ma: MA, rx: RX });
    expect((await api.getActiveChallenge(CLASS))?.id).toBe(a.id);
    expect((await api.getActiveChallenge(OTHER_CLASS))?.id).toBe(b.id);
    await as('johnsonmarcus');
    expect((await api.getActiveChallenge())?.id).toBe(b.id);
  });

  it('survives old saved state that has no challenge fields', async () => {
    const storage = new MemoryStorage();
    const first = createDemoApi({ storage, now: () => NOW });
    await first.signInInstructor('demo@school.example', 'x');
    const raw = JSON.parse(storage.getItem('ck-demo-v1')!);
    delete raw.challenges; delete raw.challengeResults;
    storage.setItem('ck-demo-v1', JSON.stringify(raw));
    const api = createDemoApi({ storage, now: () => NOW });
    expect(await api.getActiveChallenge(CLASS)).toBeNull();
    const c = await api.createChallenge(CLASS, { ma: MA });
    expect(await api.listChallengeResults(c.id)).toEqual([]);
  });

  it('is shared through storage, so a second tab sees the round (two apis on one storage)', async () => {
    const storage = new MemoryStorage();
    const host = createDemoApi({ storage, now: () => NOW });
    await host.signInInstructor('demo@school.example', 'x');
    const c = await host.createChallenge(CLASS, { ma: MA });
    const screen = createDemoApi({ storage, now: () => NOW });
    expect((await screen.getChallenge(c.id))?.status).toBe('open');
  });

  it('removes a class’s rounds and results when the class is deleted', async () => {
    const { api, as, open } = setup();
    const c = await open();
    await as('santosmaya'); await api.submitChallengeResult(c.id, GOOD);
    await as('instructor');
    await api.deleteClass(CLASS);
    expect(await api.getChallenge(c.id)).toBeNull();
    expect(await api.listChallengeResults(c.id)).toEqual([]);
  });
});
