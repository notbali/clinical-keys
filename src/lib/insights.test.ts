import { describe, expect, it } from 'vitest';
import {
  AT_RISK_ACCURACY_BELOW, AT_RISK_ACCURACY_RUNS, AT_RISK_INACTIVE_SCHOOL_DAYS, AT_RISK_UNFINISHED_EARLIER,
  CELL_INFO, atRiskFlags, heatmapRow, missedSchoolDays, rollingGroups, unfinishedEarlier,
} from './insights';
import { assignedThrough } from './program';
import { at, attempt, completeActivities } from '../test/fixtures';

const TODAY = '2026-11-12'; // Thursday
const NONE = new Set<string>();
const risk = (over: Partial<Parameters<typeof atRiskFlags>[0]> = {}) =>
  atRiskFlags({ track: 'ma', startDate: '2026-11-09', attempts: [], today: TODAY, closed: NONE, ...over });
const kinds = (f: { kind: string }[]) => f.map((x) => x.kind);

describe('thresholds are named constants', () => {
  it('uses the agreed numbers', () => {
    expect(AT_RISK_INACTIVE_SCHOOL_DAYS).toBe(2);
    expect(AT_RISK_ACCURACY_BELOW).toBe(90);
    expect(AT_RISK_ACCURACY_RUNS).toBe(3);
    expect(AT_RISK_UNFINISHED_EARLIER).toBe(2);
  });
});

describe('missedSchoolDays', () => {
  it('counts school days after the last activity and before today', () => {
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: '2026-11-09', today: TODAY, closed: NONE })).toBe(2);
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: '2026-11-11', today: TODAY, closed: NONE })).toBe(0);
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: TODAY, today: TODAY, closed: NONE })).toBe(0);
  });
  it('counts from the start when there is no activity', () => {
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: null, today: TODAY, closed: NONE })).toBe(3);
    expect(missedSchoolDays({ start: '2026-11-12', lastActive: null, today: TODAY, closed: NONE })).toBe(0);
  });
  it('skips weekends and closed days', () => {
    // Friday Nov 13 is missed; the weekend and today (Monday Nov 16) are not counted.
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: '2026-11-12', today: '2026-11-16', closed: NONE })).toBe(1);
    expect(missedSchoolDays({ start: '2026-11-09', lastActive: '2026-11-09', today: TODAY, closed: new Set(['2026-11-10']) })).toBe(1);
  });
});

describe('at-risk: inactive', () => {
  it('flags a student with no activity in 2 school days, in words', () => {
    const f = risk({ attempts: [attempt({ createdAt: at('2026-11-09') })] }).find((x) => x.kind === 'inactive');
    expect(f?.text).toBe('No activity in 2 school days');
  });
  it('does not flag 1 missed school day or activity today', () => {
    expect(kinds(risk({ attempts: [attempt({ createdAt: at('2026-11-10') })] }))).not.toContain('inactive');
    expect(kinds(risk({ attempts: [attempt({ createdAt: at(TODAY) })] }))).not.toContain('inactive');
  });
  it('counts incomplete runs as activity', () => {
    const a = attempt({ createdAt: at('2026-11-11'), completed: false, clean: false, errorsLeft: 3 });
    expect(kinds(risk({ attempts: [a] }))).not.toContain('inactive');
  });
  it('flags a student who has never typed once 2 school days have gone by', () => {
    expect(risk().find((x) => x.kind === 'inactive')?.text).toBe('No activity in 3 school days');
    expect(kinds(risk({ startDate: '2026-11-11' }))).not.toContain('inactive');
  });
  it('does not flag a weekend', () => {
    // Last run Thursday, today Monday: only Friday was missed.
    const f = risk({ today: '2026-11-16', attempts: [attempt({ createdAt: at('2026-11-12') })] });
    expect(kinds(f)).not.toContain('inactive');
  });
});

describe('at-risk: accuracy', () => {
  const runs = (accs: number[], date = TODAY) => accs.map((accuracy, i) => attempt({ accuracy, createdAt: at(date, 9 + i) }));
  it('flags an average under 90% over the last 3 finished runs', () => {
    const f = risk({ attempts: runs([85, 88, 89]) }).find((x) => x.kind === 'accuracy');
    expect(f?.text).toBe('Accuracy averaging 87% over the last 3 runs, under 90%');
  });
  it('does not flag exactly 90%', () => {
    expect(kinds(risk({ attempts: runs([88, 90, 92]) }))).not.toContain('accuracy');
  });
  it('needs 3 finished runs', () => {
    expect(kinds(risk({ attempts: runs([60, 60]) }))).not.toContain('accuracy');
  });
  it('ignores unfinished runs and only looks at the latest 3', () => {
    const old = runs([60, 60, 60], '2026-11-10');
    const recent = runs([97, 96, 98]);
    expect(kinds(risk({ attempts: [...old, ...recent] }))).not.toContain('accuracy');
    const unfinished = attempt({ accuracy: 50, completed: false, clean: false, createdAt: at(TODAY, 15) });
    expect(kinds(risk({ attempts: [...recent, unfinished] }))).not.toContain('accuracy');
  });
});

describe('at-risk: unfinished earlier activities', () => {
  it('lists activities from days before today that are not complete', () => {
    const done = completeActivities('s1', 'ma', 4, 5);
    const list = unfinishedEarlier('ma', 4, done);
    expect(list.map((a) => a.day)).toEqual([3, 3]);
    expect(unfinishedEarlier('ma', 4, completeActivities('s1', 'ma', 4, 7))).toEqual([]);
    expect(assignedThrough('ma', 3)).toHaveLength(7);
  });
  it('flags 2 or more, names the days, and does not count today', () => {
    const f = risk({ attempts: completeActivities('s1', 'ma', 4, 5) }).find((x) => x.kind === 'unfinished');
    expect(f?.text).toBe('2 activities unfinished from earlier days (Day 3)');
    expect(kinds(risk({ attempts: completeActivities('s1', 'ma', 4, 6) }))).not.toContain('unfinished');
    expect(kinds(risk({ attempts: completeActivities('s1', 'ma', 4, 7) }))).not.toContain('unfinished');
  });
  it('lists several days in order', () => {
    const f = risk({ attempts: completeActivities('s1', 'ma', 4, 2) }).find((x) => x.kind === 'unfinished');
    expect(f?.text).toBe('5 activities unfinished from earlier days (Days 1, 2, 3)');
  });
  it('needs every passage of an activity', () => {
    const all = completeActivities('s1', 'ma', 4, 7);
    const partial = all.filter((a) => !(a.day === 1 && a.act === 1 && a.passage === 0));
    expect(unfinishedEarlier('ma', 4, partial)).toHaveLength(1);
  });
});

describe('at-risk: who is skipped', () => {
  it('does not flag students who have not started or are past Day 10', () => {
    expect(risk({ startDate: '2026-11-20' })).toEqual([]);
    expect(risk({ startDate: '2026-10-01' })).toEqual([]);
  });
  it('flags nothing for a student who is caught up and active', () => {
    expect(risk({ attempts: completeActivities('s1', 'ma', 4, 9) })).toEqual([]);
  });
});

describe('heatmapRow', () => {
  const row = (day: number, attempts = [] as ReturnType<typeof attempt>[], track: 'ma' | 'rx' = 'ma') => heatmapRow({ track, day, attempts });
  it('always has 10 cells, one per program day', () => {
    expect(row(4).map((c) => c.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('marks past days behind, today unstarted as today, later days upcoming', () => {
    expect(row(4).map((c) => c.status)).toEqual(['behind', 'behind', 'behind', 'today', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });
  it('marks a fully done day done and a partly done day partial (today) or behind (passed)', () => {
    const d1 = completeActivities('s1', 'ma', 1, 3); // all of Day 1
    expect(row(4, d1)[0]).toMatchObject({ status: 'done', done: 3, total: 3 });
    const part = completeActivities('s1', 'ma', 1, 2);
    expect(row(4, part)[0]).toMatchObject({ status: 'behind', done: 2, total: 3 });
    const today = [attempt({ day: 4, act: 0, passage: 0 })];
    expect(row(4, today)[3]).toMatchObject({ status: 'partial', done: 1, total: 2 });
  });
  it('shows work done ahead of time as partial or done', () => {
    const ahead = [attempt({ day: 6, act: 0, passage: 0 })];
    expect(row(4, ahead)[5]).toMatchObject({ status: 'partial', done: 1 });
  });
  it('averages finished-run accuracy per day and leaves it null with no runs', () => {
    const a = [attempt({ day: 2, act: 0, accuracy: 90 }), attempt({ day: 2, act: 0, accuracy: 96 })];
    const cells = row(4, a);
    expect(cells[1].accuracy).toBe(93);
    expect(cells[0].accuracy).toBeNull();
  });
  it('before the start date every day is upcoming; past Day 10 every unfinished day is behind', () => {
    expect(row(0).every((c) => c.status === 'upcoming')).toBe(true);
    expect(row(12).every((c) => c.status === 'behind')).toBe(true);
  });
  it('totals follow each track', () => {
    expect(row(1, [], 'rx')[0].total).toBeGreaterThan(0);
    expect(row(1, [], 'rx')).toHaveLength(10);
  });
  it('gives every status a distinct symbol and a word, so colour is never the only signal', () => {
    const infos = Object.values(CELL_INFO);
    expect(infos).toHaveLength(5);
    expect(new Set(infos.map((i) => i.symbol)).size).toBe(infos.length);
    expect(infos.every((i) => i.label.length > 0)).toBe(true);
  });
});

describe('rollingGroups', () => {
  const classes = [{ id: 'c1', name: 'Fall A' }, { id: 'c2', name: 'Fall B' }];
  const item = (over: { id: string; last?: string; track?: 'ma' | 'rx'; classId?: string; day: number; behindBy?: number; risk?: number; status?: 'active' | 'archived' }) => ({
    student: { id: over.id, firstName: 'A', lastName: over.last ?? over.id, track: over.track ?? 'ma', classId: over.classId, status: over.status ?? 'active' as const },
    day: over.day, behindBy: over.behindBy ?? 0, riskCount: over.risk ?? 0,
  });

  it('groups by class, then track (MA first), and drops archived students and empty groups', () => {
    const g = rollingGroups([
      item({ id: 'a', track: 'rx', day: 3, classId: 'c1' }), item({ id: 'b', track: 'ma', day: 3, classId: 'c1' }),
      item({ id: 'c', classId: 'c2', day: 2 }), item({ id: 'd', status: 'archived', day: 2, classId: 'c1' }),
    ], classes);
    expect(g.map((x) => `${x.className}/${x.track}/${x.rows.map((r) => r.student.id).join('')}`)).toEqual(['Fall A/ma/b', 'Fall A/rx/a', 'Fall B/ma/c']);
  });
  it('puts students who are behind first, most behind first', () => {
    const g = rollingGroups([
      item({ id: 'ontrack', day: 7, classId: 'c1' }), item({ id: 'slightly', day: 5, behindBy: 1, classId: 'c1' }), item({ id: 'very', day: 3, behindBy: 6, classId: 'c1' }),
    ], classes);
    expect(g[0].rows.map((r) => r.student.id)).toEqual(['very', 'slightly', 'ontrack']);
  });
  it('breaks ties by risk flags, then the later program day, then last name', () => {
    const g = rollingGroups([
      item({ id: 'z', last: 'Zed', day: 4, classId: 'c1' }), item({ id: 'y', last: 'Yu', day: 4, classId: 'c1' }),
      item({ id: 'late', day: 8, classId: 'c1' }), item({ id: 'risky', day: 2, risk: 2, classId: 'c1' }),
    ], classes);
    expect(g[0].rows.map((r) => r.student.id)).toEqual(['risky', 'late', 'y', 'z']);
  });
  it('puts students without a class in their own group last', () => {
    const g = rollingGroups([item({ id: 'x', day: 1 }), item({ id: 'a', day: 1, classId: 'c1' })], classes);
    expect(g.map((x) => x.className)).toEqual(['Fall A', 'No class']);
  });
  it('counts how many in a group are behind', () => {
    const g = rollingGroups([item({ id: 'a', day: 4, behindBy: 2, classId: 'c1' }), item({ id: 'b', day: 4, classId: 'c1' })], classes);
    expect(g[0].behindCount).toBe(1);
  });
});
