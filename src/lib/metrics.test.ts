import { describe, expect, it } from 'vitest';
import { buildMetrics } from './metrics';
import { assignedThrough } from './program';
import { DEFAULT_SETTINGS } from '../data/types';
import { at, attempt, completeActivities, student } from '../test/fixtures';

const TODAY = '2026-11-12'; // Thursday
const build = (students: ReturnType<typeof student>[], attempts: ReturnType<typeof attempt>[] = [], extra: { overrides?: never[]; settings?: typeof DEFAULT_SETTINGS; today?: string } = {}) =>
  buildMetrics({ students, attempts, overrides: extra.overrides ?? [], settings: extra.settings ?? DEFAULT_SETTINGS, today: extra.today ?? TODAY });
const flagKinds = (m: { flags: { kind: string }[] }) => m.flags.map((f) => f.kind);

describe('program day', () => {
  it('counts school days from the start date through today', () => {
    expect(build([student({ startDate: '2026-11-09' })])[0].day).toBe(4);
    expect(build([student({ startDate: '2026-11-12' })])[0].day).toBe(1);
  });
  it('is 0 before the start date and does not skip a closing in the count', () => {
    expect(build([student({ startDate: '2026-11-20' })])[0].day).toBe(0);
    const closed = { ...DEFAULT_SETTINGS, closedDays: ['2026-11-10'] };
    expect(build([student({ startDate: '2026-11-09' })], [], { settings: closed })[0].day).toBe(3);
  });
});

describe('today count', () => {
  it('counts the real activities for the current day and how many are done', () => {
    // Maya, Day 4 (MA): warm-up sprint and SOAP notes I are the two real activities.
    const none = build([student()])[0];
    expect(none.todayTotal).toBe(2);
    expect(none.todayDone).toBe(0);
    const sprint = attempt({ day: 4, act: 0, passage: 0 });
    expect(build([student()], [sprint])[0].todayDone).toBe(1);
  });
  it('needs every passage of an activity before it counts as done', () => {
    const soap = (p: number) => attempt({ day: 4, act: 1, passage: p, drillId: 'ma-soap', kind: 'drill' });
    expect(build([student()], [soap(0), soap(1)])[0].todayDone).toBe(0);
    expect(build([student()], [soap(0), soap(1), soap(2)])[0].todayDone).toBe(1);
  });
  it('ignores "coming soon" activities (Day 5 has only the sprint for MA)', () => {
    const d5 = build([student({ startDate: '2026-11-06' })])[0]; // Fri Nov 6 is Day 5 on Thu Nov 12
    expect(d5.day).toBe(5);
    expect(d5.todayTotal).toBe(1);
  });
});

describe('flags', () => {
  it('flags the final day and anything past it', () => {
    expect(flagKinds(build([student({ startDate: '2026-10-30' })])[0])).toContain('exit'); // Day 10
    const final = build([student({ startDate: '2026-10-30' })])[0].flags.find((f) => f.kind === 'exit');
    expect(final?.text).toMatch(/Final day/);
    const past = build([student({ startDate: '2026-10-26' })])[0].flags.find((f) => f.kind === 'exit');
    expect(past?.text).toMatch(/Past Day 10/);
    expect(flagKinds(build([student({ startDate: '2026-11-09' })])[0])).not.toContain('exit');
  });

  it('flags new students with no runs on Day 1 only', () => {
    expect(flagKinds(build([student({ startDate: '2026-11-12' })])[0])).toContain('new');
    expect(flagKinds(build([student({ startDate: '2026-11-12' })], [attempt()])[0])).not.toContain('new');
    expect(flagKinds(build([student({ startDate: '2026-11-11' })])[0])).not.toContain('new');
  });

  describe('accuracy', () => {
    const runs = (acc: number, count = 6) => Array.from({ length: count }, (_, i) => attempt({ accuracy: acc, createdAt: at('2026-11-10', 10 + i) }));
    it('needs at least 3 finished runs before it flags', () => {
      expect(flagKinds(build([student()], runs(80, 2))[0])).not.toContain('accuracy');
      expect(flagKinds(build([student()], runs(80, 3))[0])).toContain('accuracy');
    });
    it('is a warning just under the target and bad when 4 or more points under', () => {
      const warn = build([student()], runs(93))[0].flags.find((f) => f.kind === 'accuracy');
      expect(warn).toMatchObject({ tone: 'warn', text: 'Accuracy 93%, under 95%' });
      const bad = build([student()], runs(90))[0].flags.find((f) => f.kind === 'accuracy');
      expect(bad?.tone).toBe('bad');
    });
    it('puts the warning/bad boundary at exactly 4 points under the target', () => {
      expect(build([student()], runs(91))[0].flags.find((f) => f.kind === 'accuracy')?.tone).toBe('warn');
      expect(build([student()], runs(90.9))[0].flags.find((f) => f.kind === 'accuracy')?.tone).toBe('bad');
    });
    it('does not flag accuracy at or above the target', () => {
      expect(flagKinds(build([student()], runs(95))[0])).not.toContain('accuracy');
      expect(flagKinds(build([student()], runs(98))[0])).not.toContain('accuracy');
    });
    it('only looks at the six most recent finished runs', () => {
      const old = Array.from({ length: 5 }, (_, i) => attempt({ accuracy: 70, createdAt: at('2026-11-09', 8 + i) }));
      const recent = Array.from({ length: 6 }, (_, i) => attempt({ accuracy: 97, createdAt: at('2026-11-12', 8 + i) }));
      expect(flagKinds(build([student()], [...old, ...recent])[0])).not.toContain('accuracy');
    });
    it('uses the track target (a stricter pharmacy target flags a 96)', () => {
      const strict = { ...DEFAULT_SETTINGS, targets: { ...DEFAULT_SETTINGS.targets, rx: { wpm: 35, accuracy: 98 } } };
      const pt = student({ track: 'rx', startDate: '2026-11-09' });
      expect(flagKinds(build([pt], runs(96).map((a) => ({ ...a, track: 'rx' as const })), { settings: strict })[0])).toContain('accuracy');
      expect(flagKinds(build([student()], runs(96), { settings: strict })[0])).not.toContain('accuracy');
    });
  });

  describe('behind', () => {
    it('flags a student who is 3 or more activities short on Day 2 or later', () => {
      // Day 4 MA: 7 real activities assigned through today.
      const m = build([student()])[0];
      expect(m.flags.find((f) => f.kind === 'behind')).toMatchObject({ tone: 'bad', text: 'Behind: 7 activities unfinished' });
    });
    it('does not flag a student who is caught up on everything before today', () => {
      // The 5 activities from Days 1 to 3 are done; today's 2 are not started: 2 short, under the limit of 3.
      const done = completeActivities('s1', 'ma', 4, 5);
      expect(flagKinds(build([student()], done)[0])).not.toContain('behind');
    });
    it('flags exactly at 3 short', () => {
      const done = completeActivities('s1', 'ma', 4, 4);
      expect(flagKinds(build([student()], done)[0])).toContain('behind');
      expect(assignedThrough('ma', 4).length - 4).toBe(3);
    });
    it('never flags on Day 1', () => {
      expect(flagKinds(build([student({ startDate: '2026-11-12' })])[0])).not.toContain('behind');
    });
  });
});

describe('grade and activity', () => {
  it('has no typing grade until the student has a run, and carries an override through', () => {
    expect(build([student()])[0].grade.total).toBeNull();
    const withRun = build([student()], [attempt()], {})[0];
    expect(withRun.grade.total).not.toBeNull();
    const override = { studentId: 's1', value: 70, reason: 'Missed time', by: 'x', at: 'now' };
    const m = buildMetrics({ students: [student()], attempts: [attempt()], overrides: [override], settings: DEFAULT_SETTINGS, today: TODAY })[0];
    expect(m.grade.total).toBe(70);
    expect(m.grade.computed).toBe(withRun.grade.computed);
  });
  it('only uses each student’s own runs', () => {
    const rows = build([student({ id: 's1' }), student({ id: 's2', username: 'johnsonmarcus', firstName: 'Marcus', lastName: 'Johnson' })], [attempt({ studentId: 's2', wpm: 41 })]);
    expect(rows[0].attempts).toHaveLength(0);
    expect(rows[0].latestWpm).toBeNull();
    expect(rows[1].latestWpm).toBe(41);
  });
  it('reports the most recent day’s numbers and the last active time', () => {
    const m = build([student()], [
      attempt({ createdAt: at('2026-11-10'), wpm: 50 }),
      attempt({ createdAt: at('2026-11-12', 9), wpm: 29, accuracy: 96 }),
      attempt({ createdAt: at('2026-11-12', 14), wpm: 31, accuracy: 98 }),
    ])[0];
    expect(m.latestWpm).toBe(31);
    expect(m.latestAccuracy).toBe(97);
    expect(m.lastActive).toBe(at('2026-11-12', 14));
  });
});
