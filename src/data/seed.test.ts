import { describe, expect, it } from 'vitest';
import { buildSeed, startForDay } from './seed';
import { programDay, todayISO } from '../lib/dates';
import { computeTypingGrade } from '../lib/grades';
import { DEFAULT_SETTINGS } from './types';

describe('startForDay', () => {
  it('lands the student on the requested program day, including across a weekend', () => {
    for (const today of ['2026-11-12', '2026-11-16', '2026-11-13', '2026-11-14', '2026-11-15']) {
      for (const n of [1, 2, 4, 6, 9, 10]) {
        expect(programDay(startForDay(n, today), today), `day ${n} on ${today}`).toBe(n);
      }
    }
  });
});

describe('demo seed', () => {
  const now = new Date(2026, 10, 12, 13, 5);
  const seed = buildSeed(now);
  const today = todayISO(now);
  const byName = (first: string) => seed.students.find((s) => s.firstName === first)!;
  const day = (first: string) => programDay(seed.enrollments.find((e) => e.studentId === byName(first).id)!.startDate, today);

  it('puts every demo student on the day the mockups show', () => {
    expect(['Tyler', 'Marcus', 'Imani', 'Priya', 'Maya', 'Jordan', 'Daniel', 'Elena'].map(day)).toEqual([10, 9, 7, 6, 4, 4, 3, 1]);
  });
  it('uses unique lastnamefirstname usernames and one enrollment per student', () => {
    const names = seed.students.map((s) => s.username);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('santosmaya');
    expect(seed.enrollments).toHaveLength(seed.students.length);
  });
  it('never invents a run in the future', () => {
    expect(seed.attempts.every((a) => new Date(a.createdAt).getTime() <= now.getTime())).toBe(true);
  });
  it('leaves the brand-new student with no runs, and everyone else with some', () => {
    const runs = (first: string) => seed.attempts.filter((a) => a.studentId === byName(first).id).length;
    expect(runs('Elena')).toBe(0);
    for (const n of ['Tyler', 'Marcus', 'Imani', 'Priya', 'Maya', 'Jordan', 'Daniel']) expect(runs(n), n).toBeGreaterThan(0);
  });
  it('gives the strong students clean runs and the strugglers runs that finish but are not clean', () => {
    const grade = (first: string) => computeTypingGrade({ attempts: seed.attempts.filter((a) => a.studentId === byName(first).id), track: byName(first).track, day: day(first), settings: DEFAULT_SETTINGS });
    expect(grade('Marcus').accuracyAvg ?? 0).toBeGreaterThanOrEqual(95);
    const jordanRuns = seed.attempts.filter((a) => a.studentId === byName('Jordan').id);
    expect(jordanRuns.length).toBeGreaterThan(0);
    expect(jordanRuns.every((a) => a.completed && !a.clean)).toBe(true);
    // Finished-but-not-clean runs still count toward the grade, so the accuracy part is partial credit, not 0.
    expect(grade('Jordan').accuracyAvg).toBeGreaterThan(80);
    expect(grade('Jordan').accuracyAvg).toBeLessThan(95);
    expect(grade('Jordan').accuracyScore).toBeGreaterThan(80);
  });
});
