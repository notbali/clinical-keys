import { describe, expect, it } from 'vitest';
import { buildMetrics } from './metrics';
import { computeTypingGrade } from './grades';
import { assignedThrough } from './program';
import { DEFAULT_SETTINGS } from '../data/types';
import { attempt, completeActivities, student } from '../test/fixtures';

/**
 * Golden snapshots of today's behavior (no class plan). They were recorded BEFORE the class plan was added to
 * grades.ts, metrics.ts and program.ts, and must never change just because a plan feature exists: a class with
 * no plan, or with the default 1..10 plan, must be graded and shown exactly as it was.
 */
const TODAY = '2026-11-12'; // Thursday

const roster = () => [
  student({ id: 'new', startDate: '2026-11-12' }),
  student({ id: 'future', startDate: '2026-11-20' }),
  student({ id: 'ma4', startDate: '2026-11-09' }),
  student({ id: 'rx4', track: 'rx', startDate: '2026-11-09' }),
  student({ id: 'ma5', startDate: '2026-11-06' }),
  student({ id: 'ma9', startDate: '2026-11-02' }),
  student({ id: 'rx10', track: 'rx', startDate: '2026-10-30' }),
  student({ id: 'ma14', startDate: '2026-10-23' }),
];

const runs = () => [
  ...completeActivities('ma4', 'ma', 3, 3, { accuracy: 98, wpm: 31 }),
  ...completeActivities('rx4', 'rx', 4, 5, { accuracy: 93, wpm: 28 }),
  ...completeActivities('ma5', 'ma', 5, 6, { accuracy: 96, wpm: 36 }),
  ...completeActivities('ma9', 'ma', 9, 14, { accuracy: 94, wpm: 33 }),
  ...completeActivities('rx10', 'rx', 10, 18, { accuracy: 97, wpm: 40 }),
  ...completeActivities('ma14', 'ma', 10, 40, { accuracy: 99, wpm: 45 }),
  attempt({ studentId: 'new', day: 1, act: 0, passage: 0 }),
];

/** Everything the screens read, minus the (large, unchanged) student and attempt lists. */
const summarize = (settings = DEFAULT_SETTINGS) =>
  buildMetrics({ students: roster(), attempts: runs(), overrides: [], settings, today: TODAY }).map((m) => ({
    id: m.student.id, day: m.day, todayDone: m.todayDone, todayTotal: m.todayTotal, grade: { ...m.grade, override: undefined },
    flags: m.flags.map((f) => `${f.kind}:${f.tone}:${f.text}`), latestWpm: m.latestWpm, latestAccuracy: m.latestAccuracy,
  }));

describe('behavior with no class plan (golden)', () => {
  it('assignedThrough returns the same activities for every track and day', () => {
    for (const track of ['ma', 'rx'] as const) {
      expect(Array.from({ length: 13 }, (_, n) => assignedThrough(track, n).map((a) => `${a.day}:${a.act}:${a.passages.join('.')}`).join(' '))).toMatchSnapshot(track);
    }
  });

  it('computes the same typing grade', () => {
    const mine = completeActivities('s1', 'ma', 6, 8, { accuracy: 96, wpm: 34 });
    const g = (day: number) => computeTypingGrade({ attempts: mine, track: 'ma', day, settings: DEFAULT_SETTINGS });
    expect([0, 1, 4, 6, 10, 14].map((d) => g(d))).toMatchSnapshot();
  });

  it('builds the same instructor metrics', () => {
    expect(summarize()).toMatchSnapshot();
  });

  it('builds the same metrics with school closings', () => {
    expect(summarize({ ...DEFAULT_SETTINGS, closedDays: ['2026-11-10', '2026-11-04'] })).toMatchSnapshot();
  });
});
