import { describe, expect, it } from 'vitest';
import {
  PRIORITY_LABEL, SHIFT_PRESETS, buildShiftQueue, maxTaskPoints, scoreTask, shiftAttempt, shiftNote, summarizeShift,
  type Priority, type ShiftTask, type TaskOutcome, type TaskResult,
} from './shift';
import { generatedDrillsForTrack, generatePassage, getGeneratedDrill } from '../content';

const IDS = { ma: generatedDrillsForTrack('ma').map((d) => d.id), rx: generatedDrillsForTrack('rx').map((d) => d.id) };

/** A clean run unless the test says otherwise. */
const run = (over: Partial<TaskResult> = {}): TaskResult => ({
  wpm: 40, accuracy: 100, errorsLeft: 0, seconds: 60, keys: 200, wrong: 0, revealed: false, peeks: 0, completed: true, clean: true, ...over,
});
const done = (over: Partial<TaskResult> = {}): TaskOutcome => ({ kind: 'finished', result: run(over) });
const skipped: TaskOutcome = { kind: 'skipped' };
const points = (p: Priority, o: TaskOutcome) => scoreTask(p, o).total;

describe('shift presets', () => {
  it('offers a few lengths, each with about 5 to 8 tasks, and more tasks for a longer shift', () => {
    expect(SHIFT_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(SHIFT_PRESETS.map((p) => p.minutes)).toEqual(expect.arrayContaining([10, 20, 30]));
    for (const p of SHIFT_PRESETS) { expect(p.tasks).toBeGreaterThanOrEqual(5); expect(p.tasks).toBeLessThanOrEqual(8); expect(p.label).toContain(String(p.minutes)); }
    const tasks = [...SHIFT_PRESETS].sort((a, b) => a.minutes - b.minutes).map((p) => p.tasks);
    expect(tasks).toEqual([...tasks].sort((a, b) => a - b));
    expect(new Set(SHIFT_PRESETS.map((p) => p.minutes)).size).toBe(SHIFT_PRESETS.length);
  });
});

describe('building the queue', () => {
  it('is the same queue for the same drills, count and seed, and a different one for another seed', () => {
    for (const t of ['ma', 'rx'] as const) {
      expect(buildShiftQueue(IDS[t], 6, 123)).toEqual(buildShiftQueue(IDS[t], 6, 123));
      expect(buildShiftQueue(IDS[t], 6, 123)).not.toEqual(buildShiftQueue(IDS[t], 6, 124));
    }
  });

  it('has the requested number of tasks, numbered from 1, each from the track’s own generated drills', () => {
    for (const t of ['ma', 'rx'] as const) for (const p of SHIFT_PRESETS) for (const seed of [1, 99, 2147483647]) {
      const q = buildShiftQueue(IDS[t], p.tasks, seed);
      expect(q).toHaveLength(p.tasks);
      expect(q.map((x) => x.n)).toEqual(q.map((_, i) => i + 1));
      for (const task of q) expect(getGeneratedDrill(task.drillId)?.track, task.drillId).toBe(t);
    }
  });

  it('gives every task a whole-number seed a database can hold, and a different one each, so no two passages repeat', () => {
    for (const t of ['ma', 'rx'] as const) for (const seed of [0, 5, 77777]) {
      const q = buildShiftQueue(IDS[t], 8, seed);
      for (const task of q) { expect(Number.isInteger(task.seed)).toBe(true); expect(task.seed).toBeGreaterThanOrEqual(0); expect(task.seed).toBeLessThanOrEqual(2147483647); }
      expect(new Set(q.map((x) => x.seed)).size).toBe(q.length);
      const texts = q.map((x) => generatePassage(getGeneratedDrill(x.drillId)!, x.seed, '2026-11-12').text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('mixes the task types: all of the track’s drills appear in a full shift, never the same drill twice in a row', () => {
    for (const t of ['ma', 'rx'] as const) for (const seed of [1, 2, 3, 40, 500]) {
      const q = buildShiftQueue(IDS[t], 6, seed);
      expect(new Set(q.map((x) => x.drillId)).size).toBe(Math.min(IDS[t].length, 6));
      q.slice(1).forEach((x, i) => expect(x.drillId, `${t} ${seed} #${i + 2}`).not.toBe(q[i].drillId));
    }
  });

  it('puts STAT first, then urgent, then routine, with at least one STAT and some routine work', () => {
    const rank: Record<Priority, number> = { stat: 0, urgent: 1, routine: 2 };
    for (const p of SHIFT_PRESETS) for (const seed of [1, 2, 3]) {
      const q = buildShiftQueue(IDS.ma, p.tasks, seed);
      const ranks = q.map((x) => rank[x.priority]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(q.filter((x) => x.priority === 'stat').length).toBeGreaterThanOrEqual(1);
      expect(q.filter((x) => x.priority === 'stat').length).toBeLessThanOrEqual(2);
      expect(q.filter((x) => x.priority === 'routine').length).toBeGreaterThanOrEqual(2);
      expect(q[0].priority).toBe('stat');
    }
  });

  it('copes with a single drill, a tiny count and bad input without throwing', () => {
    const one = buildShiftQueue(['ma-gen-soap'], 5, 9);
    expect(one).toHaveLength(5);
    expect(one.every((x) => x.drillId === 'ma-gen-soap')).toBe(true);
    expect(buildShiftQueue(IDS.ma, 1, 9)).toHaveLength(1);
    expect(buildShiftQueue(IDS.ma, 0, 9)).toEqual([]);
    expect(buildShiftQueue(IDS.ma, -2, 9)).toEqual([]);
    expect(buildShiftQueue([], 5, 9)).toEqual([]);
  });

  it('does not change the list it is given', () => {
    const ids = [...IDS.rx];
    buildShiftQueue(ids, 6, 8);
    expect(ids).toEqual(IDS.rx);
  });

  it('has a plain-language label for each priority', () => {
    expect(PRIORITY_LABEL).toEqual({ stat: 'STAT', urgent: 'Urgent', routine: 'Routine' });
  });
});

describe('scoring one task', () => {
  it('gives a perfect run the full marks, and the most for the higher priorities', () => {
    for (const p of ['stat', 'urgent', 'routine'] as const) expect(points(p, done({ wpm: 70 })), p).toBe(maxTaskPoints(p));
    expect(maxTaskPoints('stat')).toBeGreaterThan(maxTaskPoints('urgent'));
    expect(maxTaskPoints('urgent')).toBeGreaterThan(maxTaskPoints('routine'));
    expect(maxTaskPoints('routine')).toBeGreaterThan(0);
  });

  it('adds the parts up: the breakdown always sums to the total, and every part is a whole number', () => {
    const outcomes: TaskOutcome[] = [done(), done({ accuracy: 91.3, wpm: 17 }), done({ errorsLeft: 3, accuracy: 96, completed: false, clean: false }), done({ peeks: 2 }), skipped, done({ revealed: true, completed: false, clean: false })];
    for (const p of ['stat', 'urgent', 'routine'] as const) for (const o of outcomes) {
      const s = scoreTask(p, o);
      const sum = s.completion + s.accuracy + s.speed + s.cleanBonus + s.priorityBonus + s.errors + s.peeks + s.skip;
      expect(sum, `${p} ${JSON.stringify(o)}`).toBe(s.total);
      for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('rewards accuracy before speed: a slow clean task beats a fast one with an uncorrected error', () => {
    for (const p of ['stat', 'urgent', 'routine'] as const) {
      const slowClean = points(p, done({ wpm: 8, accuracy: 100, seconds: 300 }));
      const fastWithError = points(p, done({ wpm: 90, accuracy: 99.5, errorsLeft: 1, completed: false, clean: false, seconds: 30 }));
      expect(slowClean, p).toBeGreaterThan(fastWithError);
    }
  });

  it('costs more for one uncorrected error than all the points speed can earn', () => {
    const clean = scoreTask('routine', done({ wpm: 120 }));
    const dirty = scoreTask('routine', done({ wpm: 120, errorsLeft: 1, completed: false, clean: false }));
    expect(clean.speed).toBeGreaterThan(0);
    expect(-dirty.errors).toBeGreaterThan(clean.speed);
    expect(dirty.total).toBeLessThan(clean.total);
  });

  it('charges more for each extra uncorrected error, up to a limit, and gives a task that went out with errors no clean bonus', () => {
    const t = (n: number) => points('routine', done({ errorsLeft: n, accuracy: 97, completed: false, clean: false }));
    expect(t(1)).toBeGreaterThan(t(2));
    expect(t(2)).toBeGreaterThan(t(3));
    expect(scoreTask('routine', done({ errorsLeft: 1, accuracy: 99, completed: false, clean: false })).cleanBonus).toBe(0);
    expect(t(500)).toBe(t(5000)); // a flood of errors costs a lot, but not without limit
    expect(t(500)).toBeLessThan(0);
  });

  it('pays a clean task a bonus over one that was finished but bumpy', () => {
    const bumpy = scoreTask('routine', done({ accuracy: 90, clean: false }));
    const clean = scoreTask('routine', done({ accuracy: 97, clean: true }));
    expect(clean.cleanBonus).toBeGreaterThan(0);
    expect(bumpy.cleanBonus).toBe(0);
    expect(bumpy.errors).toBe(0);
    expect(clean.total).toBeGreaterThan(bumpy.total);
    expect(bumpy.total).toBeGreaterThan(0); // fixing your mistakes as you go still earns points
  });

  it('pays more for higher accuracy and never more than the accuracy part allows', () => {
    const acc = (a: number) => scoreTask('routine', done({ accuracy: a, clean: a >= 95 })).accuracy;
    expect(acc(100)).toBeGreaterThan(acc(98));
    expect(acc(98)).toBeGreaterThan(acc(92));
    expect(acc(92)).toBeGreaterThan(acc(85));
    expect(acc(60)).toBe(0);
    expect(acc(0)).toBe(0);
  });

  it('pays only a little for speed, and only on clean runs, and caps it', () => {
    const sp = (w: number, over: Partial<TaskResult> = {}) => scoreTask('routine', done({ wpm: w, ...over })).speed;
    expect(sp(60)).toBeGreaterThan(sp(20));
    expect(sp(20)).toBeGreaterThan(sp(0));
    expect(sp(200)).toBe(sp(100));
    expect(sp(200)).toBeLessThanOrEqual(10);
    expect(sp(80, { accuracy: 90, clean: false })).toBe(0);
    expect(sp(-5)).toBe(0);
    expect(sp(Number.NaN)).toBe(0);
  });

  it('charges for skipping, more for the more urgent task, and a skip is worse than an honest clean slow task but better than sending errors out', () => {
    expect(points('routine', skipped)).toBeLessThan(0);
    expect(points('urgent', skipped)).toBeLessThan(points('routine', skipped));
    expect(points('stat', skipped)).toBeLessThan(points('urgent', skipped));
    const slow = points('routine', done({ wpm: 5, seconds: 400 }));
    expect(slow).toBeGreaterThan(0);
    const flood = points('routine', done({ errorsLeft: 60, accuracy: 70, completed: false, clean: false }));
    expect(flood).toBeLessThan(points('routine', skipped));
  });

  it('gives nothing for a task finished with the answer showing, and charges a little for each peek', () => {
    const shown = scoreTask('stat', done({ revealed: true, completed: false, clean: false, peeks: 0 }));
    expect(shown.total).toBe(0);
    const peeked = scoreTask('routine', done({ peeks: 2 }));
    const none = scoreTask('routine', done({ peeks: 0 }));
    expect(peeked.peeks).toBeLessThan(0);
    expect(peeked.total).toBeLessThan(none.total);
    expect(scoreTask('routine', done({ peeks: 100 })).peeks).toBe(scoreTask('routine', done({ peeks: 50 })).peeks);
  });

  it('treats an out-of-range accuracy as if it were in range', () => {
    expect(points('routine', done({ accuracy: 140 }))).toBe(points('routine', done({ accuracy: 100 })));
    expect(points('routine', done({ accuracy: Number.NaN, clean: false }))).toBeGreaterThanOrEqual(0);
  });
});

describe('the shift report', () => {
  const queue = (priorities: Priority[]): ShiftTask[] => priorities.map((priority, i) => ({ n: i + 1, drillId: 'ma-gen-vitals', seed: i + 1, priority }));
  const q5 = queue(['stat', 'urgent', 'routine', 'routine', 'routine']);

  it('counts tasks done, clean, finished with errors, skipped and not reached', () => {
    const outcomes: (TaskOutcome | undefined)[] = [done(), done({ accuracy: 90, clean: false }), done({ errorsLeft: 2, completed: false, clean: false }), skipped, undefined];
    const r = summarizeShift(q5, outcomes);
    expect(r).toMatchObject({ total: 5, done: 3, clean: 1, withErrors: 1, skipped: 1, notReached: 1 });
  });

  it('adds up the points, can show the most possible, and never goes below zero', () => {
    const r = summarizeShift(q5, q5.map(() => done({ wpm: 70 })));
    expect(r.points).toBe(r.maxPoints);
    expect(r.maxPoints).toBe(maxTaskPoints('stat') + maxTaskPoints('urgent') + 3 * maxTaskPoints('routine'));
    expect(r.perTask.map((t) => t.points).reduce((a, b) => a + b, 0)).toBe(r.points);
    const bad = summarizeShift(q5, q5.map(() => skipped));
    expect(bad.points).toBe(0);
    expect(bad.perTask.every((t) => t.points < 0)).toBe(true);
    const mixed = summarizeShift(q5, [done(), skipped, undefined, undefined, undefined]);
    expect(mixed.points).toBe(Math.max(0, points('stat', done()) + points('urgent', skipped)));
  });

  it('gives accuracy across all the keystrokes, not an average of averages', () => {
    const r = summarizeShift(q5.slice(0, 2), [done({ keys: 100, wrong: 0 }), done({ keys: 300, wrong: 30, accuracy: 90, clean: false })]);
    expect(r.accuracy).toBe(92.5); // 370 right of 400
    expect(summarizeShift(q5, [skipped, undefined, undefined, undefined, undefined]).accuracy).toBeNull();
  });

  it('gives WPM weighted by time spent typing', () => {
    const r = summarizeShift(q5.slice(0, 2), [done({ wpm: 60, seconds: 30 }), done({ wpm: 30, seconds: 90 })]);
    expect(r.wpm).toBe(37.5);
    expect(summarizeShift(q5, [skipped, undefined, undefined, undefined, undefined]).wpm).toBeNull();
    expect(summarizeShift(q5.slice(0, 1), [done({ wpm: 44, seconds: 0 })]).wpm).toBe(44);
  });

  it('names the best task by points and the slowest by WPM, and ignores skipped and unreached tasks', () => {
    const outcomes: (TaskOutcome | undefined)[] = [done({ wpm: 50 }), skipped, done({ wpm: 22 }), done({ wpm: 61, accuracy: 90, clean: false }), undefined];
    const r = summarizeShift(q5, outcomes);
    expect(r.best).toBe(0);
    expect(r.slowest).toBe(2);
    expect(r.perTask[1].skipped).toBe(true);
    expect(r.perTask[4].reached).toBe(false);
  });

  it('breaks ties toward the earlier task, and has no best or slowest when nothing was typed', () => {
    const r = summarizeShift(q5, [done(), done(), undefined, undefined, undefined]);
    expect(r.best).toBe(0);
    expect(r.slowest).toBe(0);
    const none = summarizeShift(q5, [skipped, skipped, undefined, undefined, undefined]);
    expect(none.best).toBeNull();
    expect(none.slowest).toBeNull();
    expect(summarizeShift([], [])).toMatchObject({ total: 0, done: 0, points: 0, maxPoints: 0, accuracy: null, wpm: null, best: null, slowest: null });
  });

  it('does not name a slowest task when only one was finished', () => {
    const r = summarizeShift(q5, [done(), undefined, undefined, undefined, undefined]);
    expect(r.best).toBe(0);
    expect(r.slowest).toBeNull();
  });

  it('gives a short note that puts accuracy first', () => {
    const clean = shiftNote(summarizeShift(q5, q5.map(() => done())));
    const errs = shiftNote(summarizeShift(q5, [done({ errorsLeft: 1, completed: false, clean: false }), done(), done(), done(), done()]));
    const none = shiftNote(summarizeShift(q5, q5.map(() => undefined)));
    expect(clean).toMatch(/clean|accura/i);
    expect(errs).toMatch(/error/i);
    expect(errs).toMatch(/1 task/);
    expect(none.length).toBeGreaterThan(0);
    expect(clean).not.toBe(errs);
  });
});

describe('saving a finished task as an attempt', () => {
  it('is a drill attempt for the generated drill, with the seed in the passage field and no program day', () => {
    const task: ShiftTask = { n: 3, drillId: 'rx-gen-labels', seed: 424242, priority: 'urgent' };
    const a = shiftAttempt('rx', task, run({ wpm: 33, accuracy: 98.4, seconds: 91, errorsLeft: 0, revealed: false, completed: true, clean: true }));
    expect(a).toEqual({
      kind: 'drill', track: 'rx', drillId: 'rx-gen-labels', passage: 424242, wpm: 33, accuracy: 98.4, errorsLeft: 0, seconds: 91,
      completed: true, clean: true, revealed: false,
    });
    expect('day' in a || 'act' in a).toBe(false);
  });

  it('keeps errors left and not-completed runs as they are, so personal bests still only count clean runs', () => {
    const a = shiftAttempt('ma', { n: 1, drillId: 'ma-gen-soap', seed: 7, priority: 'stat' }, run({ errorsLeft: 2, completed: false, clean: false, accuracy: 96 }));
    expect(a).toMatchObject({ errorsLeft: 2, completed: false, clean: false });
  });
});
