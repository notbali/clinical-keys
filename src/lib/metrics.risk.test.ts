import { describe, expect, it } from 'vitest';
import { attentionReasons, buildMetrics, needsAttention } from './metrics';
import { DEFAULT_SETTINGS } from '../data/types';
import { at, attempt, completeActivities, student } from '../test/fixtures';

const TODAY = '2026-11-12';
const build = (s = [student()], a: ReturnType<typeof attempt>[] = [], settings = DEFAULT_SETTINGS) =>
  buildMetrics({ students: s, attempts: a, overrides: [], settings, today: TODAY });

describe('metrics carry the at-risk flags', () => {
  it('has an empty risk list for a student who is caught up and active', () => {
    expect(build([student()], completeActivities('s1', 'ma', 4, 9))[0].risk).toEqual([]);
  });
  it('flags inactivity from the student’s own runs and the school closings', () => {
    const a = [attempt({ createdAt: at('2026-11-09') })];
    expect(build([student()], a)[0].risk.map((r) => r.kind)).toContain('inactive');
    const closed = { ...DEFAULT_SETTINGS, closedDays: ['2026-11-10'] };
    expect(build([student()], a, closed)[0].risk.map((r) => r.kind)).not.toContain('inactive');
  });
  it('does not mix up students', () => {
    const rows = build([student({ id: 's1' }), student({ id: 's2', username: 'x' })], [attempt({ studentId: 's2', createdAt: at(TODAY) })]);
    expect(rows[0].risk.map((r) => r.kind)).toContain('inactive');
    expect(rows[1].risk.map((r) => r.kind)).not.toContain('inactive');
  });
  it('carries what the rolling view needs: how many earlier activities are unfinished', () => {
    expect(build([student()], completeActivities('s1', 'ma', 4, 5))[0].behindBy).toBe(2);
    expect(build([student({ startDate: TODAY })])[0].behindBy).toBe(0);
  });
});

describe('needs attention', () => {
  it('is true for any at-risk flag, or the existing accuracy and behind flags', () => {
    expect(needsAttention(build()[0])).toBe(true);
    expect(needsAttention(build([student({ startDate: TODAY })])[0])).toBe(false);
  });
  it('never repeats a reason: the new flag replaces the older one of the same kind', () => {
    const runs = [80, 82, 84].map((accuracy, i) => attempt({ accuracy, createdAt: at(TODAY, 15 + i) }));
    const m = build([student()], [...completeActivities('s1', 'ma', 4, 9), ...runs])[0];
    const reasons = attentionReasons(m);
    expect(reasons.filter((r) => /^Accuracy/.test(r))).toHaveLength(1);
    expect(reasons[0]).toMatch(/under 90%/);
  });
  it('keeps the older behind flag when nothing at-risk covers it', () => {
    // Day 4: 9 activities assigned, 6 done leaves 3 short (older flag) but only 1 from earlier days.
    const m = build([student()], completeActivities('s1', 'ma', 4, 6))[0];
    expect(m.risk.map((r) => r.kind)).not.toContain('unfinished');
    expect(attentionReasons(m).some((r) => /^Behind/.test(r))).toBe(true);
  });
});
