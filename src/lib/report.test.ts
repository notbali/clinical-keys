import { describe, expect, it } from 'vitest';
import { buildMetrics } from './metrics';
import { buildReport, runCounts } from './report';
import { DEFAULT_SETTINGS, type GradeOverride, type Note } from '../data/types';
import { at, attempt, completeActivities, student } from '../test/fixtures';

const TODAY = '2026-11-12'; // Thursday, Day 4 for the default student
const OVERRIDE: GradeOverride = { studentId: 's1', value: 88, reason: 'SECRET-REASON missed days for an appointment', by: 'x', at: 'now' };
const NOTES: Note[] = [{ id: 'n1', studentId: 's1', text: 'SECRET-NOTE struggles with the number row', at: at(TODAY), by: 'x' }];

const report = (opts: { attempts?: ReturnType<typeof attempt>[]; override?: GradeOverride; includePrivate?: boolean; notes?: Note[]; start?: string; track?: 'ma' | 'rx' } = {}) => {
  const s = student({ startDate: opts.start ?? '2026-11-09', track: opts.track ?? 'ma' });
  const m = buildMetrics({ students: [s], attempts: opts.attempts ?? [], overrides: opts.override ? [opts.override] : [], settings: DEFAULT_SETTINGS, today: TODAY })[0];
  return buildReport({ metrics: m, settings: DEFAULT_SETTINGS, className: 'Fall A', today: TODAY, includePrivate: opts.includePrivate ?? false, notes: opts.notes ?? NOTES });
};

describe('privacy', () => {
  it('leaves out notes and the override reason unless asked', () => {
    const r = report({ override: OVERRIDE, attempts: [attempt()] });
    const text = JSON.stringify(r);
    expect(text).not.toContain('SECRET-NOTE');
    expect(text).not.toContain('SECRET-REASON');
    expect(r.private).toBeUndefined();
  });
  it('still shows the grade of record when it was overridden, without the reason', () => {
    const r = report({ override: OVERRIDE, attempts: [attempt()] });
    expect(r.grade.total).toBe(88);
    expect(r.grade.overridden).toBe(true);
    expect(r.grade.computed).not.toBeNull();
  });
  it('adds them only when the toggle is on', () => {
    const r = report({ override: OVERRIDE, attempts: [attempt()], includePrivate: true });
    expect(r.private?.overrideReason).toContain('SECRET-REASON');
    expect(r.private?.notes.map((n) => n.text)).toEqual([NOTES[0].text]);
  });
  it('has no override reason in the private block when there is no override', () => {
    expect(report({ includePrivate: true }).private?.overrideReason).toBeUndefined();
  });
});

describe('header and grade', () => {
  it('names the student, track, class and day', () => {
    const r = report();
    expect(r.student).toMatchObject({ name: 'Maya Santos', track: 'ma', trackLabel: 'Medical Assistant', className: 'Fall A' });
    expect(r.dayLabel).toBe('Day 4 of 10');
    expect(r.generatedOn).toBe(TODAY);
  });
  it('labels students who have not started or are past Day 10', () => {
    expect(report({ start: '2026-11-20' }).dayLabel).toBe('Starts 2026-11-20');
    expect(report({ start: '2026-10-01' }).dayLabel).toBe('Finished the 10 days');
  });
  it('carries the grade parts and has no total before the first run', () => {
    expect(report().grade.total).toBeNull();
    const r = report({ attempts: completeActivities('s1', 'ma', 4, 9) });
    expect(r.grade.total).not.toBeNull();
    expect(r.grade.completion).toEqual({ done: 9, total: 9 });
    expect(r.grade.parts.map((p) => p.name)).toEqual(['Accuracy', 'Speed', 'Activities completed']);
    expect(r.grade.parts.reduce((s, p) => s + p.weightPct, 0)).toBe(100);
  });
});

describe('program progress', () => {
  it('has a row per program day with title, status, count and accuracy', () => {
    const r = report({ attempts: completeActivities('s1', 'ma', 2, 5) });
    expect(r.program).toHaveLength(10);
    expect(r.program[0]).toMatchObject({ day: 1, title: 'Medical terms', status: 'done', done: 3, total: 3 });
    expect(r.program[2]).toMatchObject({ day: 3, status: 'behind', done: 0 });
    expect(r.program[3].status).toBe('today');
    expect(r.program[0].accuracy).toBe(97);
  });
  it('uses the pharmacy program for a PT student', () => {
    expect(report({ track: 'rx' }).program[0].title).toBe('Pharmacy terms');
  });
});

describe('Day 1 vs latest test', () => {
  const testRun = (day: number, act: number, wpm: number, accuracy: number, over = {}) =>
    attempt({ kind: 'drill', drillId: 'ma-test', day, act, passage: 0, wpm, accuracy, createdAt: at(TODAY, 9 + day), ...over });

  it('lists the three tests and marks the ones not taken', () => {
    const r = report({ attempts: [testRun(1, 2, 24, 92)] });
    expect(r.tests.map((t) => [t.day, t.taken])).toEqual([[1, true], [5, false], [10, false]]);
    expect(r.comparison).toBeNull();
  });
  it('compares the baseline with the latest later test', () => {
    const r = report({ attempts: [testRun(1, 2, 24, 92), testRun(5, 1, 31, 95.5)] });
    expect(r.comparison).toMatchObject({ from: { day: 1, wpm: 24, accuracy: 92 }, to: { day: 5, wpm: 31, accuracy: 95.5 }, wpmChange: 7, accuracyChange: 3.5 });
    const final = report({ attempts: [testRun(1, 2, 24, 92), testRun(5, 1, 31, 95.5), testRun(10, 1, 38, 97)] });
    expect(final.comparison?.to.day).toBe(10);
    expect(final.comparison?.wpmChange).toBe(14);
  });
  it('shows a drop as a negative change', () => {
    const r = report({ attempts: [testRun(1, 2, 30, 96), testRun(5, 1, 28, 94)] });
    expect(r.comparison).toMatchObject({ wpmChange: -2, accuracyChange: -2 });
  });
  it('uses the best finished run when a test was retaken, and ignores unfinished runs', () => {
    const r = report({ attempts: [testRun(1, 2, 20, 90), testRun(1, 2, 26, 94), testRun(1, 2, 40, 80, { completed: false, clean: false })] });
    expect(r.tests[0]).toMatchObject({ wpm: 26, accuracy: 94 });
  });
});

describe('run counts', () => {
  it('counts runs by kind and outcome and adds up the practice time', () => {
    const runs = [
      attempt({ kind: 'sprint', seconds: 60 }),
      attempt({ kind: 'drill', seconds: 120 }),
      attempt({ kind: 'drill', seconds: 90, accuracy: 91, clean: false }),
      attempt({ kind: 'drill', seconds: 30, completed: false, clean: false, errorsLeft: 4 }),
    ];
    expect(runCounts(runs)).toEqual({ total: 4, sprints: 1, drills: 3, finished: 3, clean: 2, errorsLeft: 1, seconds: 300 });
    expect(runCounts([])).toEqual({ total: 0, sprints: 0, drills: 0, finished: 0, clean: 0, errorsLeft: 0, seconds: 0 });
  });
  it('is part of the report', () => {
    expect(report({ attempts: [attempt()] }).runs.total).toBe(1);
  });
});
