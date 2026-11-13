import { describe, expect, it } from 'vitest';
import {
  CLEAN_ACCURACY, POLL_MS, displayName, isCleanResult, leaderboardRows, passageFor, rankResults, resolveChallengePassage, summarize,
  validateNewChallenge, validateResult,
} from './challenge';
import type { Challenge, ChallengeResult } from '../data/challengeTypes';
import { GENERATED_DRILLS } from '../content/generated';

let n = 0;
const res = (o: Partial<ChallengeResult> = {}): ChallengeResult => ({
  id: `r${n++}`, challengeId: 'c1', studentId: `s${n}`, displayName: 'Maya S.', track: 'ma',
  wpm: 40, accuracy: 98, errorsLeft: 0, seconds: 60, revealed: false, clean: true, submittedAt: '2026-11-12T13:00:00.000Z', ...o,
});
const names = (rs: { studentId: string }[]) => rs.map((r) => r.studentId);

describe('display names for a classroom screen', () => {
  it('is the first name and the last initial only', () => {
    expect(displayName('Maya', 'Santos')).toBe('Maya S.');
    expect(displayName('  maya ', ' santos ')).toBe('maya S.');
    expect(displayName('Imani', 'brooks-Hall')).toBe('Imani B.');
  });
  it('never includes more than the first letter of the last name', () => {
    expect(displayName('Priya', 'Raman')).not.toMatch(/Raman|aman/);
  });
  it('copes with a missing last name or first name', () => {
    expect(displayName('Cher', '')).toBe('Cher');
    expect(displayName('Cher', '   ')).toBe('Cher');
    expect(displayName('', 'Santos')).toBe('S.');
  });
  it('uses the first full name when the first name has several parts', () => {
    expect(displayName('Mary Ann', 'Lee')).toBe('Mary Ann L.');
  });
});

describe('what counts as a clean result', () => {
  it('needs zero errors left, 95% accuracy or better, and the answer not shown', () => {
    expect(CLEAN_ACCURACY).toBe(95);
    expect(isCleanResult({ errorsLeft: 0, accuracy: 95, revealed: false })).toBe(true);
    expect(isCleanResult({ errorsLeft: 0, accuracy: 100, revealed: false })).toBe(true);
    expect(isCleanResult({ errorsLeft: 0, accuracy: 94.9, revealed: false })).toBe(false);
    expect(isCleanResult({ errorsLeft: 1, accuracy: 99, revealed: false })).toBe(false);
    expect(isCleanResult({ errorsLeft: 0, accuracy: 99, revealed: true })).toBe(false);
  });
});

describe('ranking', () => {
  it('ranks clean results by WPM, fastest first', () => {
    const a = res({ studentId: 'a', wpm: 30 }), b = res({ studentId: 'b', wpm: 55 }), c = res({ studentId: 'c', wpm: 42 });
    expect(names(rankResults([a, b, c]))).toEqual(['b', 'c', 'a']);
    expect(rankResults([a, b, c]).map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a WPM tie by accuracy, then by the earlier submission', () => {
    const a = res({ studentId: 'a', wpm: 40, accuracy: 96, submittedAt: '2026-11-12T13:00:01.000Z' });
    const b = res({ studentId: 'b', wpm: 40, accuracy: 99, submittedAt: '2026-11-12T13:00:09.000Z' });
    const c = res({ studentId: 'c', wpm: 40, accuracy: 99, submittedAt: '2026-11-12T13:00:05.000Z' });
    expect(names(rankResults([a, b, c]))).toEqual(['c', 'b', 'a']);
  });

  it('puts every result with errors or under 95% accuracy below every clean result, even a much faster one', () => {
    const slowClean = res({ studentId: 'slow', wpm: 12, accuracy: 100 });
    const fastErrors = res({ studentId: 'fast-err', wpm: 90, accuracy: 99, errorsLeft: 2, clean: false });
    const fastSloppy = res({ studentId: 'fast-sloppy', wpm: 80, accuracy: 94.9, clean: false });
    const edge = res({ studentId: 'edge', wpm: 20, accuracy: 95 });
    const ranked = rankResults([fastErrors, fastSloppy, slowClean, edge]);
    expect(names(ranked)).toEqual(['edge', 'slow', 'fast-err', 'fast-sloppy']);
    expect(ranked.map((r) => r.clean)).toEqual([true, true, false, false]);
  });

  it('ranks the not-clean results by accuracy, then fewer errors left, then WPM, then earlier submission', () => {
    const a = res({ studentId: 'a', wpm: 70, accuracy: 90, errorsLeft: 0, clean: false });
    const b = res({ studentId: 'b', wpm: 30, accuracy: 97, errorsLeft: 3, clean: false });
    const c = res({ studentId: 'c', wpm: 30, accuracy: 97, errorsLeft: 1, clean: false });
    const d = res({ studentId: 'd', wpm: 50, accuracy: 97, errorsLeft: 1, clean: false });
    const e = res({ studentId: 'e', wpm: 50, accuracy: 97, errorsLeft: 1, clean: false, submittedAt: '2026-11-12T13:00:00.500Z' });
    expect(names(rankResults([a, b, c, d, e]))).toEqual(['d', 'e', 'c', 'b', 'a']);
  });

  it('decides cleanliness from the numbers, not from a stored flag, and never lets a revealed answer rank as clean', () => {
    const liar = res({ studentId: 'liar', wpm: 100, errorsLeft: 4, accuracy: 99, clean: true });
    const honest = res({ studentId: 'honest', wpm: 10 });
    const peeker = res({ studentId: 'peek', wpm: 99, revealed: true, clean: true });
    const ranked = rankResults([liar, peeker, honest]);
    // Not clean ranks by accuracy: the 99% run with errors left sits above the 98% run that showed the answer.
    expect(names(ranked)).toEqual(['honest', 'liar', 'peek']);
    expect(ranked.map((r) => r.clean)).toEqual([true, false, false]);
  });

  it('is deterministic when everything ties, using the id', () => {
    const a = res({ id: 'x2', studentId: 'a' }), b = res({ id: 'x1', studentId: 'b' });
    expect(names(rankResults([a, b]))).toEqual(['b', 'a']);
    expect(names(rankResults([b, a]))).toEqual(['b', 'a']);
  });

  it('keeps only the first result from a student', () => {
    const first = res({ studentId: 'a', wpm: 20, submittedAt: '2026-11-12T13:00:00.000Z' });
    const later = res({ studentId: 'a', wpm: 90, submittedAt: '2026-11-12T13:05:00.000Z' });
    const other = res({ studentId: 'b', wpm: 30 });
    const ranked = rankResults([later, other, first]);
    expect(ranked).toHaveLength(2);
    expect(ranked.find((r) => r.studentId === 'a')!.wpm).toBe(20);
  });

  it('handles an empty list and does not change its input', () => {
    expect(rankResults([])).toEqual([]);
    const list = [res({ studentId: 'a', wpm: 1 }), res({ studentId: 'b', wpm: 2 })];
    const copy = JSON.parse(JSON.stringify(list));
    rankResults(list);
    expect(list).toEqual(copy);
  });

  it('ranks MA and PT students together', () => {
    const ma = res({ studentId: 'ma', track: 'ma', wpm: 41 }), rx = res({ studentId: 'rx', track: 'rx', wpm: 44 });
    expect(names(rankResults([ma, rx]))).toEqual(['rx', 'ma']);
  });
});

describe('the leaderboard rows and summary', () => {
  const many = Array.from({ length: 12 }, (_, i) => res({ studentId: `s${i}`, wpm: 20 + i }));
  it('shows the top rows and counts the rest', () => {
    const ranked = rankResults(many);
    const { rows, hidden } = leaderboardRows(ranked, 10);
    expect(rows).toHaveLength(10);
    expect(hidden).toBe(2);
    expect(rows[0].wpm).toBe(31);
    expect(leaderboardRows(ranked, 20)).toEqual({ rows: ranked, hidden: 0 });
    expect(leaderboardRows([], 10)).toEqual({ rows: [], hidden: 0 });
  });
  it('counts finished and clean results', () => {
    const ranked = rankResults([res({ studentId: 'a' }), res({ studentId: 'b', errorsLeft: 1, clean: false }), res({ studentId: 'c' })]);
    expect(summarize(ranked)).toEqual({ finished: 3, clean: 2 });
    expect(summarize([])).toEqual({ finished: 0, clean: 0 });
  });
  it('polls about every two seconds', () => {
    expect(POLL_MS).toBe(2000);
  });
});

describe('validating a result before it is saved', () => {
  const ok = { wpm: 42, accuracy: 97.5, errorsLeft: 0, seconds: 75, revealed: false };
  it('accepts a normal run', () => {
    expect(validateResult(ok)).toBeNull();
    expect(validateResult({ ...ok, wpm: 0, accuracy: 0, errorsLeft: 12, seconds: 0 })).toBeNull();
    expect(validateResult({ ...ok, wpm: 400, accuracy: 100, seconds: 3600 })).toBeNull();
  });
  it('rejects numbers the database could not hold or that make no sense', () => {
    for (const bad of [
      { wpm: -1 }, { wpm: 401 }, { wpm: 41.5 }, { wpm: NaN }, { wpm: Infinity },
      { accuracy: -0.1 }, { accuracy: 100.1 }, { accuracy: NaN },
      { errorsLeft: -1 }, { errorsLeft: 1.5 }, { errorsLeft: NaN },
      { seconds: -1 }, { seconds: 3601 }, { seconds: 10.5 },
    ]) expect(validateResult({ ...ok, ...bad }), JSON.stringify(bad)).not.toBeNull();
  });
  it('rejects values of the wrong type', () => {
    expect(validateResult({ ...ok, wpm: '40' as unknown as number })).not.toBeNull();
    expect(validateResult({ ...ok, revealed: undefined as unknown as boolean })).not.toBeNull();
    expect(validateResult(null as never)).not.toBeNull();
  });
});

describe('validating a new round', () => {
  const ma = { drillId: 'ma-gen-vitals', seed: 12345, chartDate: '2026-11-12' };
  const rx = { drillId: 'rx-gen-labels', seed: 777, chartDate: '2026-11-12' };
  it('accepts one passage per track, or just one track', () => {
    expect(validateNewChallenge({ ma, rx })).toBeNull();
    expect(validateNewChallenge({ ma })).toBeNull();
    expect(validateNewChallenge({ rx })).toBeNull();
  });
  it('needs at least one passage', () => {
    expect(validateNewChallenge({})).not.toBeNull();
    expect(validateNewChallenge({ ma: undefined })).not.toBeNull();
  });
  it('only takes generated drills of the right track', () => {
    expect(validateNewChallenge({ ma: { ...ma, drillId: 'rx-gen-labels' } })).not.toBeNull();
    expect(validateNewChallenge({ rx: { ...rx, drillId: 'ma-gen-soap' } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, drillId: 'ma-terms' } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, drillId: 'nope' } })).not.toBeNull();
  });
  it('checks the seed and the chart date', () => {
    expect(validateNewChallenge({ ma: { ...ma, seed: -1 } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, seed: 1.5 } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, seed: 2147483648 } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, seed: 2147483647 } })).toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, seed: 0 } })).toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, chartDate: '11/12/2026' } })).not.toBeNull();
    expect(validateNewChallenge({ ma: { ...ma, chartDate: '' } })).not.toBeNull();
  });
  it('ignores nothing it does not know: an unknown track is rejected', () => {
    expect(validateNewChallenge({ ma, xx: rx } as never)).not.toBeNull();
  });
});

describe('passages of a round', () => {
  const ch = (passages: Challenge['passages']): Challenge => ({ id: 'c1', classId: 'k', status: 'open', passages, createdAt: '2026-11-12T13:00:00.000Z' });
  it('finds the passage for a track, or none', () => {
    const p = { drillId: 'ma-gen-vitals', seed: 1, chartDate: '2026-11-12' };
    expect(passageFor(ch({ ma: p }), 'ma')).toEqual(p);
    expect(passageFor(ch({ ma: p }), 'rx')).toBeUndefined();
  });
  it('rebuilds the same text on every device, and a different text for a different seed', () => {
    for (const d of GENERATED_DRILLS) {
      const p = { drillId: d.id, seed: 4242, chartDate: '2026-11-12' };
      const a = resolveChallengePassage(p)!, b = resolveChallengePassage(p)!;
      expect(a.text.length).toBeGreaterThan(10);
      expect(a.text).toBe(b.text);
      expect(a.patient).toEqual(b.patient);
    }
    const texts = new Set([1, 2, 3, 4, 5, 6].map((seed) => resolveChallengePassage({ drillId: 'ma-gen-vitals', seed, chartDate: '2026-11-12' })!.text));
    expect(texts.size).toBeGreaterThan(1);
  });
  it('returns nothing for an unknown drill', () => {
    expect(resolveChallengePassage({ drillId: 'nope', seed: 1, chartDate: '2026-11-12' })).toBeUndefined();
  });
});
