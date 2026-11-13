import { describe, expect, it } from 'vitest';
import { activityLabel, bestTimeline, drillKey, improvement, improvementPhrase } from './progress';
import { at, attempt } from '../test/fixtures';
import type { Attempt } from '../data/types';

/** One passage of the program typing test (ma-test has two passages; Day 1 is activity 2, Day 5 is activity 1, Day 10 is activity 1). */
const test = (day: 1 | 5 | 10, passage: number, wpm: number, accuracy: number, date: string, over: Partial<Attempt> = {}): Attempt =>
  attempt({ kind: 'drill', drillId: 'ma-test', day, act: day === 1 ? 2 : 1, passage, wpm, accuracy, createdAt: at(date), ...over });

describe('drillKey', () => {
  it('tells drills, warm-up sprints and weak-word sprints apart', () => {
    expect(drillKey(attempt({ kind: 'drill', drillId: 'ma-terms' }))).toBe('ma-terms');
    expect(drillKey(attempt({ kind: 'sprint' }))).toBe('sprint');
    expect(drillKey(attempt({ kind: 'sprint', drillId: 'weak-words' }))).toBe('weak-words');
  });
});

describe('bestTimeline', () => {
  it('is empty with no clean runs', () => {
    expect(bestTimeline([])).toEqual([]);
    expect(bestTimeline([attempt({ clean: false, completed: false })])).toEqual([]);
  });

  it('lists each time a clean run set a new best for a drill, oldest first', () => {
    const runs = [
      attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 20, accuracy: 96, createdAt: at('2026-11-09') }),
      attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 18, accuracy: 99, createdAt: at('2026-11-10') }),
      attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 25, accuracy: 97, createdAt: at('2026-11-11') }),
      attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 25, accuracy: 99, createdAt: at('2026-11-12') }),
      attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 40, accuracy: 80, clean: false, createdAt: at('2026-11-12', 15) }),
    ];
    const [t] = bestTimeline(runs);
    expect(t.key).toBe('ma-terms');
    expect(t.points.map((p) => [p.wpm, p.accuracy])).toEqual([[20, 96], [25, 97]]);
    expect(t.best).toBe(25);
  });

  it('does not depend on the order the runs arrive in', () => {
    const a = attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 20, createdAt: at('2026-11-09') });
    const b = attempt({ kind: 'drill', drillId: 'ma-terms', wpm: 25, createdAt: at('2026-11-11') });
    expect(bestTimeline([b, a])[0].points.map((p) => p.wpm)).toEqual([20, 25]);
  });

  it('keeps drills, sprints and weak-word sprints on separate lines, sorted by key', () => {
    const lines = bestTimeline([
      attempt({ kind: 'sprint', wpm: 30 }),
      attempt({ kind: 'drill', drillId: 'ma-vitals', wpm: 22 }),
      attempt({ kind: 'sprint', drillId: 'weak-words', wpm: 28 }),
    ]);
    expect(lines.map((l) => l.key)).toEqual(['ma-vitals', 'sprint', 'weak-words']);
  });

  it('skips runs with no speed, such as error hunts', () => {
    expect(bestTimeline([attempt({ kind: 'drill', drillId: 'ma-hunt', wpm: 0 })])).toEqual([]);
  });
});

describe('improvement', () => {
  it('has nothing to compare before the Day 1 baseline', () => {
    const imp = improvement([attempt({ wpm: 30 })]);
    expect(imp.baseline).toBeNull();
    expect(imp.wpmGain).toBeNull();
    expect(imp.accuracyGain).toBeNull();
    expect(improvement([])).toMatchObject({ baseline: null, latest: null });
  });

  it('averages the two passages of the Day 1 test', () => {
    const imp = improvement([test(1, 0, 20, 94, '2026-11-09'), test(1, 1, 24, 96, '2026-11-09')]);
    expect(imp.baseline).toMatchObject({ wpm: 22, accuracy: 95, day: 1 });
    expect(imp.latest).toBeNull();
    expect(imp.wpmGain).toBeNull();
  });

  it('uses the first finish of each passage as the baseline, even if the test is retaken', () => {
    const imp = improvement([test(1, 0, 20, 94, '2026-11-09'), test(1, 0, 35, 99, '2026-11-10'), test(1, 1, 24, 96, '2026-11-09')]);
    expect(imp.baseline).toMatchObject({ wpm: 22, accuracy: 95 });
  });

  it('ignores unfinished test runs', () => {
    const imp = improvement([test(1, 0, 50, 70, '2026-11-09', { completed: false, clean: false }), test(1, 0, 20, 94, '2026-11-09', { createdAt: at('2026-11-09', 14) })]);
    expect(imp.baseline).toMatchObject({ wpm: 20 });
  });

  it('compares Day 1 with the latest test (Day 5, then Day 10)', () => {
    const base = [test(1, 0, 20, 94, '2026-11-09'), test(1, 1, 24, 96, '2026-11-09')];
    const mid = improvement([...base, test(5, 0, 28, 96, '2026-11-13'), test(5, 1, 30, 97, '2026-11-13')]);
    expect(mid.latest).toMatchObject({ wpm: 29, accuracy: 96.5, day: 5, source: 'test' });
    expect(mid.wpmGain).toBe(7);
    expect(mid.accuracyGain).toBe(1.5);

    const fin = improvement([...base, test(5, 0, 28, 96, '2026-11-13'), test(10, 0, 34, 98, '2026-11-20'), test(10, 1, 36, 99, '2026-11-20')]);
    expect(fin.latest).toMatchObject({ wpm: 35, accuracy: 98.5, day: 10, source: 'test' });
    expect(fin.wpmGain).toBe(13);
    expect(fin.accuracyGain).toBe(3.5);
  });

  it('on a retaken later test, uses the newest finish of each passage', () => {
    const imp = improvement([
      test(1, 0, 20, 94, '2026-11-09'),
      test(5, 0, 28, 96, '2026-11-13'),
      test(5, 0, 31, 97, '2026-11-13', { createdAt: at('2026-11-13', 15) }),
    ]);
    expect(imp.latest).toMatchObject({ wpm: 31, day: 5 });
  });

  it('falls back to the best clean run when no later test is done', () => {
    const imp = improvement([
      test(1, 0, 20, 94, '2026-11-09'),
      attempt({ kind: 'drill', drillId: 'ma-vitals', day: 2, act: 1, wpm: 26, accuracy: 97, createdAt: at('2026-11-10') }),
      attempt({ kind: 'sprint', wpm: 31, accuracy: 96, createdAt: at('2026-11-11') }),
      attempt({ kind: 'sprint', wpm: 45, accuracy: 80, clean: false, createdAt: at('2026-11-11') }),
    ]);
    expect(imp.latest).toMatchObject({ wpm: 31, accuracy: 96, source: 'best' });
    expect(imp.wpmGain).toBe(11);
    expect(imp.accuracyGain).toBe(2);
  });

  it('does not count the baseline run itself as the best clean run', () => {
    const imp = improvement([test(1, 0, 20, 96, '2026-11-09')]);
    expect(imp.latest).toBeNull();
  });

  it('reports a drop honestly', () => {
    const imp = improvement([test(1, 0, 30, 98, '2026-11-09'), test(5, 0, 27, 96, '2026-11-13')]);
    expect(imp.wpmGain).toBe(-3);
    expect(imp.accuracyGain).toBe(-2);
  });
});

describe('improvementPhrase', () => {
  const imp = (wpmGain: number, accuracyGain: number) => ({ baseline: { wpm: 1, accuracy: 1, day: 1, at: '' }, latest: { wpm: 1, accuracy: 1, day: 5, at: '', source: 'test' as const }, wpmGain, accuracyGain });
  it('says up X WPM and Y accuracy points since Day 1', () => {
    expect(improvementPhrase(imp(8, 2.1))).toBe('Up 8 WPM and 2.1 accuracy points since Day 1');
    expect(improvementPhrase(imp(1, 1))).toBe('Up 1 WPM and 1 accuracy point since Day 1');
  });
  it('handles mixed, level and falling results', () => {
    expect(improvementPhrase(imp(8, -1.2))).toBe('Up 8 WPM, down 1.2 accuracy points since Day 1');
    expect(improvementPhrase(imp(0, 2))).toBe('Same WPM, up 2 accuracy points since Day 1');
    expect(improvementPhrase(imp(-3, -2))).toBe('Down 3 WPM and 2 accuracy points since Day 1');
    expect(improvementPhrase(imp(0, 0))).toBe('Same WPM and same accuracy since Day 1');
  });
  it('has no phrase until there is something to compare', () => {
    expect(improvementPhrase({ baseline: null, latest: null, wpmGain: null, accuracyGain: null })).toBeNull();
    expect(improvementPhrase({ baseline: { wpm: 1, accuracy: 1, day: 1, at: '' }, latest: null, wpmGain: null, accuracyGain: null })).toBeNull();
  });
});

describe('activityLabel', () => {
  it('names sprints, weak-word sprints, drills and generated drills', () => {
    expect(activityLabel('sprint')).toBe('Warm-up sprint');
    expect(activityLabel('weak-words')).toBe('Weak-word sprint');
    expect(activityLabel('ma-terms')).toBe('Medical Term Warm-Up');
    expect(activityLabel('ma-gen-vitals')).toBe('Vitals Entries (Generated)');
    expect(activityLabel('unknown-id')).toBe('unknown-id');
  });
});
