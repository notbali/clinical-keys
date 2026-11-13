import { describe, expect, it } from 'vitest';
import { certificateSummary, finalTestDone } from './certificate';
import { at, attempt } from '../test/fixtures';
import type { Attempt } from '../data/types';
import type { Track } from '../content/types';

const TEST_ID = { ma: 'ma-test', rx: 'rx-test' } as const;
const passages = (_track: Track) => 2; // both program tests have two passages

/** Finished runs of the program typing test on `day` (act 2 on Day 1, act 1 later), all passages. */
function testRuns(track: Track, day: number, wpm: number, accuracy: number, date: string, count = passages(track)): Attempt[] {
  return Array.from({ length: count }, (_, p) =>
    attempt({ track, kind: 'drill', drillId: TEST_ID[track], day, act: day === 1 ? 2 : 1, passage: p, wpm, accuracy, createdAt: at(date, 13, p) }));
}

const args = (over: Partial<Parameters<typeof certificateSummary>[0]> = {}) => ({
  attempts: [] as Attempt[], track: 'ma' as Track, day: 10, today: '2026-11-30', firstName: 'Maya', lastName: 'Santos', ...over,
});

describe('finalTestDone', () => {
  it('needs every passage of the Day 10 test', () => {
    expect(finalTestDone([], 'ma')).toBe(false);
    expect(finalTestDone(testRuns('ma', 10, 30, 97, '2026-11-20', 1), 'ma')).toBe(false);
    expect(finalTestDone(testRuns('ma', 10, 30, 97, '2026-11-20'), 'ma')).toBe(true);
    expect(finalTestDone(testRuns('rx', 10, 30, 97, '2026-11-20'), 'rx')).toBe(true);
  });
  it('ignores unfinished runs and the Day 5 test', () => {
    const unfinished = testRuns('ma', 10, 30, 97, '2026-11-20').map((a) => ({ ...a, completed: false, clean: false }));
    expect(finalTestDone(unfinished, 'ma')).toBe(false);
    expect(finalTestDone(testRuns('ma', 5, 30, 97, '2026-11-13'), 'ma')).toBe(false);
  });
});

describe('certificateSummary', () => {
  it('is not available before the final test is done', () => {
    const s = certificateSummary(args({ day: 9, attempts: testRuns('ma', 1, 20, 94, '2026-11-09') }));
    expect(s.eligible).toBe(false);
    expect(s.reason).toMatch(/Day 10/);
    // Being on Day 10 is not enough on its own.
    expect(certificateSummary(args({ day: 10 })).eligible).toBe(false);
  });

  it('is available once the Day 10 test is done, and shows Day 1 against Day 10', () => {
    const s = certificateSummary(args({
      day: 10,
      attempts: [...testRuns('ma', 1, 20, 94, '2026-11-09'), ...testRuns('ma', 10, 34, 98.5, '2026-11-20')],
    }));
    expect(s).toMatchObject({
      eligible: true, name: 'Maya Santos', trackLabel: 'Medical Assistant', date: '2026-11-20',
      day1: { wpm: 20, accuracy: 94 }, final: { wpm: 34, accuracy: 98.5, source: 'test' }, wpmGain: 14, accuracyGain: 4.5,
    });
  });

  it('is available to a student past Day 10 who skipped the final test, dated today, using their latest result', () => {
    const s = certificateSummary(args({
      day: 12, track: 'rx',
      attempts: [...testRuns('rx', 1, 20, 94, '2026-11-09'), attempt({ track: 'rx', kind: 'sprint', wpm: 31, accuracy: 96, createdAt: at('2026-11-25') })],
    }));
    expect(s).toMatchObject({ eligible: true, trackLabel: 'Pharmacy Tech', date: '2026-11-30', final: { wpm: 31, source: 'best' } });
  });

  it('still works with no baseline: Day 1 is empty and there is no gain', () => {
    const s = certificateSummary(args({ attempts: testRuns('ma', 10, 34, 98, '2026-11-20') }));
    expect(s.eligible).toBe(true);
    expect(s.day1).toBeNull();
    expect(s.wpmGain).toBeNull();
    expect(s.accuracyGain).toBeNull();
    expect(s.final).toMatchObject({ wpm: 34 });
  });

  it('uses the date of the last Day 10 test run, in local time', () => {
    const s = certificateSummary(args({ attempts: [...testRuns('ma', 10, 30, 97, '2026-11-19'), ...testRuns('ma', 10, 34, 98, '2026-11-20')] }));
    expect(s.date).toBe('2026-11-20');
  });

  it('always carries the not-a-credential notice', () => {
    expect(certificateSummary(args()).notice).toMatch(/fictional training certificate/i);
    expect(certificateSummary(args()).notice).toMatch(/not a (professional )?credential/i);
  });
});
