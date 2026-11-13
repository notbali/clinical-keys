import { describe, expect, it } from 'vitest';
import {
  assignedDays, defaultPlan, effectiveDay, isAssigned, isDefaultPlan, moveDay, normalizePlan, positionOfDay, programLength,
  restoreDay, skipDay, skippedDays, taughtDays, validatePlan, type ClassPlan,
} from './plan';
import { programDay } from './dates';
import { buildMetrics } from './metrics';
import { computeTypingGrade } from './grades';
import { assignedThrough } from './program';
import { DEFAULT_SETTINGS } from '../data/types';
import { attempt, completeActivities, student } from '../test/fixtures';

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const plan = (...days: number[]): ClassPlan => ({ days });
const SKIP3 = plan(1, 2, 4, 5, 6, 7, 8, 9, 10);
const SWAP45 = plan(1, 2, 3, 5, 4, 6, 7, 8, 9, 10);

describe('default plan', () => {
  it('is Day 1 to Day 10 in order, and a fresh copy every time', () => {
    expect(defaultPlan()).toEqual({ days: ONE_TO_TEN });
    const a = defaultPlan();
    a.days.reverse();
    expect(defaultPlan().days).toEqual(ONE_TO_TEN);
  });
  it('is recognised, including when there is no plan at all', () => {
    expect(isDefaultPlan(defaultPlan())).toBe(true);
    expect(isDefaultPlan(undefined)).toBe(true);
    expect(isDefaultPlan(null)).toBe(true);
    expect(isDefaultPlan(SKIP3)).toBe(false);
    expect(isDefaultPlan(SWAP45)).toBe(false);
  });
  it('has a program length of 10 with nothing skipped', () => {
    expect(programLength(undefined)).toBe(10);
    expect(taughtDays(undefined)).toEqual(ONE_TO_TEN);
    expect(skippedDays(undefined)).toEqual([]);
  });
});

describe('validatePlan', () => {
  it('accepts the default plan, a reorder, and any non-empty subset in any order', () => {
    expect(validatePlan(defaultPlan())).toBeNull();
    expect(validatePlan(SWAP45)).toBeNull();
    expect(validatePlan(SKIP3)).toBeNull();
    expect(validatePlan(plan(10))).toBeNull();
    expect(validatePlan(plan(7, 3, 9, 1))).toBeNull();
  });
  it('rejects anything that is not a plan', () => {
    for (const bad of [null, undefined, 5, 'days', [], [1, 2], {}, { days: 'abc' }, { days: null }, { order: ONE_TO_TEN }]) {
      expect(validatePlan(bad), JSON.stringify(bad)).toEqual(expect.any(String));
    }
  });
  it('rejects an empty plan: at least one day must be taught', () => {
    expect(validatePlan(plan())).toMatch(/at least one/i);
  });
  it('rejects a day that is not a whole number from 1 to 10', () => {
    for (const bad of [0, 11, -1, 1.5, Number.NaN, Infinity]) {
      expect(validatePlan(plan(1, bad)), String(bad)).toEqual(expect.any(String));
    }
    expect(validatePlan({ days: [1, '2'] })).toEqual(expect.any(String));
    expect(validatePlan({ days: [1, null] })).toEqual(expect.any(String));
  });
  it('rejects a repeated day', () => {
    expect(validatePlan(plan(1, 2, 2))).toMatch(/once|repeat|duplicate/i);
  });
  it('rejects more than ten days', () => {
    expect(validatePlan(plan(...ONE_TO_TEN, 1))).toEqual(expect.any(String));
  });
});

describe('normalizePlan (old or damaged saved data)', () => {
  it('falls back to the default plan for missing or invalid data', () => {
    for (const bad of [undefined, null, 0, 'x', {}, { days: [] }, { days: [1, 1] }, { days: [0] }]) {
      expect(normalizePlan(bad)).toEqual(defaultPlan());
    }
  });
  it('returns a copy of a valid plan', () => {
    const src = { days: [3, 1, 2] };
    const out = normalizePlan(src);
    expect(out).toEqual({ days: [3, 1, 2] });
    out.days.push(9);
    expect(src.days).toEqual([3, 1, 2]);
  });
});

describe('taught and skipped days', () => {
  it('lists taught days in teaching order and skipped days ascending', () => {
    expect(taughtDays(SWAP45)).toEqual([1, 2, 3, 5, 4, 6, 7, 8, 9, 10]);
    expect(skippedDays(plan(9, 4, 1))).toEqual([2, 3, 5, 6, 7, 8, 10]);
    expect(programLength(plan(9, 4, 1))).toBe(3);
    expect(programLength(SKIP3)).toBe(9);
  });
  it('finds the position of an original day', () => {
    expect(positionOfDay(SWAP45, 5)).toBe(4);
    expect(positionOfDay(SWAP45, 4)).toBe(5);
    expect(positionOfDay(SKIP3, 3)).toBe(0);
    expect(positionOfDay(undefined, 7)).toBe(7);
  });
  it('knows which days are assigned at all', () => {
    expect(isAssigned(SKIP3, 3)).toBe(false);
    expect(isAssigned(SKIP3, 4)).toBe(true);
    expect(isAssigned(undefined, 3)).toBe(true);
  });
});

describe('effectiveDay: which original day a student sees', () => {
  it('with no plan or the default plan it is the school-day count itself, past Day 10 too', () => {
    for (const p of [undefined, null, defaultPlan()]) {
      for (let n = 0; n <= 25; n++) expect(effectiveDay(p, n), `n=${n}`).toBe(n);
    }
  });
  it('is 0 before the student starts', () => {
    expect(effectiveDay(SKIP3, 0)).toBe(0);
    expect(effectiveDay(SKIP3, -2)).toBe(0);
  });
  it('jumps over a skipped day', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => effectiveDay(SKIP3, n))).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('follows a reorder', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => effectiveDay(SWAP45, n))).toEqual([1, 2, 3, 5, 4, 6]);
  });
  it('counts past the end of a shorter program from 11, so "past Day 10" still means finished', () => {
    expect(effectiveDay(SKIP3, 9)).toBe(10);
    expect(effectiveDay(SKIP3, 10)).toBe(11);
    expect(effectiveDay(SKIP3, 13)).toBe(14);
    expect(effectiveDay(plan(2, 1), 2)).toBe(1);
    expect(effectiveDay(plan(2, 1), 3)).toBe(11);
  });
  it('agrees with programDay for a real student and a school closing', () => {
    const closed = new Set(['2026-11-10']);
    const n = programDay('2026-11-09', '2026-11-12', closed); // Mon, (Tue closed), Wed, Thu => 3
    expect(n).toBe(3);
    expect(effectiveDay(SKIP3, n)).toBe(4);
  });
});

describe('assignedDays: which original days count through a day', () => {
  it('with no plan or the default plan it is Day 1 through that day', () => {
    for (const p of [undefined, defaultPlan()]) {
      for (let d = 0; d <= 12; d++) expect(assignedDays(p, d), `d=${d}`).toEqual(ONE_TO_TEN.filter((x) => x <= d));
    }
  });
  it('leaves out a skipped day, before and after it', () => {
    expect(assignedDays(SKIP3, 2)).toEqual([1, 2]);
    expect(assignedDays(SKIP3, 4)).toEqual([1, 2, 4]);
    expect(assignedDays(SKIP3, 10)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('counts what has been taught so far in teaching order, not number order', () => {
    expect(assignedDays(SWAP45, 3)).toEqual([1, 2, 3]);
    expect(assignedDays(SWAP45, 5)).toEqual([1, 2, 3, 5]);
    expect(assignedDays(SWAP45, 4)).toEqual([1, 2, 3, 5, 4]);
  });
  it('assigns everything taught once the student is past the end (day above 10)', () => {
    expect(assignedDays(SWAP45, 11)).toEqual([1, 2, 3, 5, 4, 6, 7, 8, 9, 10]);
    expect(assignedDays(plan(3, 1), 12)).toEqual([3, 1]);
  });
  it('treats a skipped day number as "up to the days numbered no higher than it"', () => {
    expect(assignedDays(SKIP3, 3)).toEqual([1, 2]);
    expect(assignedDays(plan(1, 2, 3, 4, 5, 6, 7, 8, 9), 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('is empty before Day 1', () => {
    expect(assignedDays(SKIP3, 0)).toEqual([]);
  });
});

describe('editing a plan', () => {
  it('moves a day earlier or later without changing anything else', () => {
    expect(moveDay(defaultPlan(), 4, -1).days).toEqual([1, 2, 4, 3, 5, 6, 7, 8, 9, 10]);
    expect(moveDay(defaultPlan(), 4, 1).days).toEqual([1, 2, 3, 5, 4, 6, 7, 8, 9, 10]);
  });
  it('does nothing at either end of the list and for a day that is not taught', () => {
    expect(moveDay(defaultPlan(), 1, -1)).toEqual(defaultPlan());
    expect(moveDay(defaultPlan(), 10, 1)).toEqual(defaultPlan());
    expect(moveDay(SKIP3, 3, 1)).toEqual(SKIP3);
  });
  it('never changes the plan it was given', () => {
    const p = defaultPlan();
    moveDay(p, 4, 1); skipDay(p, 4);
    expect(p).toEqual(defaultPlan());
  });
  it('skips a day, and refuses to skip the last remaining one', () => {
    expect(skipDay(defaultPlan(), 3)).toEqual(SKIP3);
    expect(skipDay(plan(5), 5)).toEqual(plan(5));
    expect(skipDay(SKIP3, 3)).toEqual(SKIP3);
  });
  it('restores a skipped day in its natural place, or at the end if nothing later is taught', () => {
    expect(restoreDay(SKIP3, 3)).toEqual(defaultPlan());
    expect(restoreDay(plan(1, 2, 4), 3)).toEqual(plan(1, 2, 3, 4));
    expect(restoreDay(plan(1, 2), 5)).toEqual(plan(1, 2, 5));
    expect(restoreDay(plan(2, 1), 3)).toEqual(plan(2, 1, 3));
    expect(restoreDay(plan(1, 2), 2)).toEqual(plan(1, 2));
  });
  it('every edit leaves a valid plan', () => {
    let p = defaultPlan();
    for (const step of [() => skipDay(p, 2), () => moveDay(p, 9, -1), () => restoreDay(p, 2), () => moveDay(p, 1, 1), () => skipDay(p, 10)]) {
      p = step();
      expect(validatePlan(p)).toBeNull();
    }
  });
});

/* ---- The plan wired into program.ts, grades.ts and metrics.ts ---- */

describe('assignedThrough with a plan (program.ts)', () => {
  it('is identical to the old behavior for the default plan, on both tracks and every day', () => {
    for (const track of ['ma', 'rx'] as const) {
      for (let d = 0; d <= 14; d++) {
        expect(assignedThrough(track, d, defaultPlan()), `${track} ${d}`).toEqual(assignedThrough(track, d));
        expect(assignedThrough(track, d, undefined)).toEqual(assignedThrough(track, d));
      }
    }
  });
  it('leaves out a skipped day and keeps original day and activity numbers', () => {
    const days = new Set(assignedThrough('ma', 10, SKIP3).map((a) => a.day));
    expect(days.has(3)).toBe(false);
    expect(days.has(4)).toBe(true);
    const day4 = assignedThrough('ma', 4, SKIP3).filter((a) => a.day === 4);
    expect(day4).toEqual(assignedThrough('ma', 4).filter((a) => a.day === 4));
  });
  it('lists activities in teaching order', () => {
    // Day 4 is taught after Day 5, so "through Day 4" is the last of the first five taught.
    const order = [...new Set(assignedThrough('rx', 4, SWAP45).map((a) => a.day))];
    expect(order).toEqual([1, 2, 3, 5, 4]);
  });
});

describe('typing grade with a plan (grades.ts)', () => {
  const settings = (classPlan?: ClassPlan) => ({ ...DEFAULT_SETTINGS, classPlan });
  const mine = completeActivities('s1', 'ma', 6, 9, { accuracy: 96, wpm: 34 });

  it('is identical for the default plan', () => {
    for (const day of [0, 1, 4, 6, 10, 14]) {
      expect(computeTypingGrade({ attempts: mine, track: 'ma', day, settings: settings(defaultPlan()) }))
        .toEqual(computeTypingGrade({ attempts: mine, track: 'ma', day, settings: DEFAULT_SETTINGS }));
    }
  });
  it('does not count a skipped day against the student', () => {
    const base = computeTypingGrade({ attempts: [], track: 'ma', day: 4, settings: settings() });
    const skipped = computeTypingGrade({ attempts: [], track: 'ma', day: 4, settings: settings(SKIP3) });
    const day3 = assignedThrough('ma', 3).filter((a) => a.day === 3).length;
    expect(day3).toBeGreaterThan(0);
    expect(skipped.completion.total).toBe(base.completion.total - day3);
  });
  it('a student who did every day except the skipped one has full completion', () => {
    const all = assignedThrough('ma', 5, SKIP3);
    const runs = all.flatMap((a) => a.passages.map((p) => attempt({ studentId: 's1', day: a.day, act: a.act, passage: p })));
    const g = computeTypingGrade({ attempts: runs, track: 'ma', day: 5, settings: settings(SKIP3) });
    expect(g.completion.done).toBe(g.completion.total);
    expect(g.completionScore).toBe(100);
  });
  it('keeps the work a student already did on a day that is later skipped (nothing is deleted)', () => {
    const did3 = completeActivities('s1', 'ma', 3, 99).filter((a) => a.day === 3);
    expect(did3.length).toBeGreaterThan(0);
    const g = computeTypingGrade({ attempts: did3, track: 'ma', day: 4, settings: settings(SKIP3) });
    expect(g.completion.done).toBe(0);
    expect(g.bestWpm).toBe(30); // speed and accuracy still use every finished run
    expect(g.computed).not.toBeNull();
  });
});

describe('instructor metrics with plans (metrics.ts)', () => {
  const TODAY = '2026-11-12'; // Thursday
  const run = (students: ReturnType<typeof student>[], attempts: ReturnType<typeof attempt>[], plans?: Record<string, ClassPlan>) =>
    buildMetrics({ students, attempts, overrides: [], settings: DEFAULT_SETTINGS, today: TODAY, plans });

  const ROSTER = [
    student({ id: 'a', startDate: '2026-11-09' }), student({ id: 'b', track: 'rx', startDate: '2026-11-06' }),
    student({ id: 'c', startDate: '2026-11-02' }), student({ id: 'd', startDate: '2026-10-23' }), student({ id: 'e', startDate: '2026-11-12' }),
  ];
  const RUNS = [...completeActivities('a', 'ma', 3, 4), ...completeActivities('c', 'ma', 9, 12), ...completeActivities('d', 'ma', 10, 30)];

  it('is identical with no plans, an empty map, or the default plan for the class', () => {
    const base = run(ROSTER, RUNS);
    expect(run(ROSTER, RUNS, {})).toEqual(base);
    expect(run(ROSTER, RUNS, { c1: defaultPlan() })).toEqual(base);
    expect(run(ROSTER, RUNS, { other: SKIP3 })).toEqual(base);
  });

  it('shows the effective original day and keeps the school-day position', () => {
    const [a] = run(ROSTER, RUNS, { c1: SKIP3 }); // school day 4 => Day 5
    expect(a.position).toBe(4);
    expect(a.day).toBe(5);
    expect(a.programLength).toBe(9);
    const [d0] = run(ROSTER, RUNS);
    expect(d0.position).toBe(4);
    expect(d0.day).toBe(4);
    expect(d0.programLength).toBe(10);
  });

  it('counts today\'s activities from the effective day, and a reorder changes which day that is', () => {
    const swapped = run([student({ id: 'a', startDate: '2026-11-09' })], [], { c1: SWAP45 })[0];
    expect(swapped.day).toBe(5); // Day 5 is the mid-point test: sprint + test
    expect(swapped.todayTotal).toBe(2);
  });

  it('does not count a skipped day in the behind total or the completion total', () => {
    const only = [student({ id: 'a', startDate: '2026-11-09' })];
    // School day 4 is Day 5 with Day 3 skipped: Days 1, 2, 4, 5 are assigned (not Day 3).
    const withSkip = run(only, [], { c1: SKIP3 })[0];
    const day3 = assignedThrough('ma', 3).filter((a) => a.day === 3).length;
    expect(withSkip.day).toBe(5);
    expect(withSkip.grade.completion.total).toBe(assignedThrough('ma', 5).length - day3);
    // behind = unfinished among those: nothing done, so it is the whole total
    expect(withSkip.flags.find((f) => f.kind === 'behind')?.text).toContain(String(withSkip.grade.completion.total));
  });

  it('flags the final day and the end by the length of the plan, not by Day 10', () => {
    const kinds = (m: { flags: { kind: string; text: string }[] }) => m.flags.filter((f) => f.kind === 'exit').map((f) => f.text);
    // c: started Nov 2 => school day 9 today. Default: not final. 9-day plan: final day.
    expect(kinds(run(ROSTER, RUNS)[2])).toEqual([]);
    expect(kinds(run(ROSTER, RUNS, { c1: SKIP3 })[2])[0]).toMatch(/Final day/);
    // d: started Oct 23 => school day 15. Past the end either way.
    expect(kinds(run(ROSTER, RUNS, { c1: SKIP3 })[3])[0]).toMatch(/Past/);
  });

  it('uses each class\'s own plan', () => {
    const students = [student({ id: 'a', startDate: '2026-11-09' }), student({ id: 'z', startDate: '2026-11-09', classId: 'c2' })];
    const out = run(students, [], { c1: SKIP3, c2: SWAP45 });
    expect(out.map((m) => m.day)).toEqual([5, 5]);
    expect(out.map((m) => m.programLength)).toEqual([9, 10]);
    const out2 = run(students, [], { c1: SKIP3 });
    expect(out2.map((m) => m.day)).toEqual([5, 4]);
  });
});
