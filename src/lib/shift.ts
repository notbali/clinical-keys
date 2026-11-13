import { hashSeed, mulberry32, shuffle } from '../content/generate/rng';
import type { Track } from '../content/types';
import type { NewAttempt } from '../data/api';
import type { RunResult } from '../typing/engine';

/**
 * Shift simulation: a timed queue of mixed tasks with priorities, scored accuracy first. Everything here is pure and
 * deterministic from a seed, so a queue can be rebuilt from its seed and every rule can be tested.
 */

export type Priority = 'stat' | 'urgent' | 'routine';
export const PRIORITY_LABEL: Record<Priority, string> = { stat: 'STAT', urgent: 'Urgent', routine: 'Routine' };

export interface ShiftPreset { minutes: number; tasks: number; label: string }
/** How long a shift lasts and how many tasks wait in the queue. A task is about 100 to 400 characters, so these leave room to type carefully. */
export const SHIFT_PRESETS: ShiftPreset[] = [
  { minutes: 10, tasks: 5, label: '10-minute shift' },
  { minutes: 20, tasks: 6, label: '20-minute shift' },
  { minutes: 30, tasks: 8, label: '30-minute shift' },
];

export interface ShiftTask {
  /** Position in the queue, starting at 1. */
  n: number;
  /** A generated drill. */
  drillId: string;
  /** Builds this task's passage (with the drill id and the chart date). Saved in the attempt's `passage` field. */
  seed: number;
  priority: Priority;
}

const MAX_SEED = 2147483647;

/**
 * The queue for a shift: `count` tasks, STAT first, then urgent, then routine. The drills are mixed, and the same drill never
 * comes twice in a row unless there is only one. Every task has its own seed, so no two passages repeat.
 */
export function buildShiftQueue(drillIds: readonly string[], count: number, seed: number): ShiftTask[] {
  const ids = [...new Set(drillIds)];
  const n = Math.floor(count);
  if (!(n > 0) || ids.length === 0) return [];

  const stat = Math.min(n, n >= 7 ? 2 : 1);
  const urgent = Math.min(n - stat, n >= 6 ? 2 : n >= 4 ? 1 : 0);
  const priorities: Priority[] = Array.from({ length: n }, (_, i) => (i < stat ? 'stat' : i < stat + urgent ? 'urgent' : 'routine'));

  const rng = mulberry32(hashSeed('shift', seed));
  const seen = new Set<number>();
  let pool: string[] = [];
  let last = '';
  return priorities.map((priority, i) => {
    if (pool.length === 0) {
      pool = shuffle(rng, ids);
      // A new round must not start with the drill the last round ended on.
      if (pool.length > 1 && pool[0] === last) [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
    }
    const drillId = pool.shift()!;
    last = drillId;
    let taskSeed = hashSeed('shift-task', seed, i);
    while (seen.has(taskSeed)) taskSeed = (taskSeed + 1) % (MAX_SEED + 1);
    seen.add(taskSeed);
    return { n: i + 1, drillId, seed: taskSeed, priority };
  });
}

// ---- Scoring -------------------------------------------------------------------------------------------------------

/** What the scorer needs from a finished typing run. */
export type TaskResult = Pick<RunResult, 'wpm' | 'accuracy' | 'errorsLeft' | 'seconds' | 'keys' | 'wrong' | 'revealed' | 'peeks' | 'completed' | 'clean'>;

export type TaskOutcome = { kind: 'skipped' } | { kind: 'finished'; result: TaskResult };

export interface ScoreBreakdown {
  /** For typing the task all the way through with no errors left. */
  completion: number;
  /** Up to 40, from 80% accuracy (nothing) to 100% (all of it). */
  accuracy: number;
  /** Up to 10, for clean runs only. */
  speed: number;
  /** For a clean run: no errors left and 95% accuracy or better. */
  cleanBonus: number;
  /** The extra for a more urgent task. */
  priorityBonus: number;
  /** Negative: 15 for each uncorrected error, to a limit. */
  errors: number;
  /** Negative: a little for each peek at the answer. */
  peeks: number;
  /** Negative: skipping a task. */
  skip: number;
  total: number;
}

const COMPLETION = 40;
const ACCURACY_MAX = 40;
const ACCURACY_FLOOR = 80;
const CLEAN_BONUS = 20;
const SPEED_MAX = 10;
const WPM_PER_POINT = 6;
const PRIORITY_MULTIPLIER: Record<Priority, number> = { stat: 1.5, urgent: 1.2, routine: 1 };
const ERROR_COST = 15;
const ERROR_COST_LIMIT = 60;
const PEEK_COST = 3;
const PEEK_COST_LIMIT = 12;
const SKIP_COST: Record<Priority, number> = { stat: 20, urgent: 15, routine: 10 };

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Points for one task. Accuracy comes first: a slow clean task always beats a fast one that went out with an uncorrected error,
 * because one error costs more than speed can ever earn. Skipping costs points, more for a more urgent task. Priority
 * multiplies what was earned, never what was lost.
 */
export function scoreTask(priority: Priority, outcome: TaskOutcome): ScoreBreakdown {
  const zero = { completion: 0, accuracy: 0, speed: 0, cleanBonus: 0, priorityBonus: 0, errors: 0, peeks: 0, skip: 0 };
  if (outcome.kind === 'skipped') return { ...zero, skip: -SKIP_COST[priority], total: -SKIP_COST[priority] };

  const r = outcome.result;
  const shown = r.revealed; // the answer was on the screen: nothing earned
  const acc = Math.min(100, Math.max(0, finite(r.accuracy)));
  const completion = !shown && r.completed ? COMPLETION : 0;
  const accuracy = shown ? 0 : Math.round(Math.min(1, Math.max(0, (acc - ACCURACY_FLOOR) / (100 - ACCURACY_FLOOR))) * ACCURACY_MAX);
  const clean = !shown && r.clean;
  const speed = clean ? Math.min(SPEED_MAX, Math.max(0, Math.round(finite(r.wpm) / WPM_PER_POINT))) : 0;
  const cleanBonus = clean ? CLEAN_BONUS : 0;
  const earned = completion + accuracy + speed + cleanBonus;
  const priorityBonus = Math.round(earned * (PRIORITY_MULTIPLIER[priority] - 1));
  const errors = 0 - Math.min(ERROR_COST_LIMIT, Math.max(0, Math.floor(finite(r.errorsLeft))) * ERROR_COST);
  const peeks = 0 - Math.min(PEEK_COST_LIMIT, Math.max(0, Math.floor(finite(r.peeks))) * PEEK_COST);
  return { completion, accuracy, speed, cleanBonus, priorityBonus, errors, peeks, skip: 0, total: earned + priorityBonus + errors + peeks };
}

const PERFECT: TaskResult = { wpm: 1000, accuracy: 100, errorsLeft: 0, seconds: 1, keys: 1, wrong: 0, revealed: false, peeks: 0, completed: true, clean: true };
/** The most a task can earn, to show in the queue. */
export const maxTaskPoints = (priority: Priority): number => scoreTask(priority, { kind: 'finished', result: PERFECT }).total;

// ---- The report ----------------------------------------------------------------------------------------------------

export interface TaskReport {
  /** The student got to this task (finished or skipped it). */
  reached: boolean;
  skipped: boolean;
  /** Typed all the way through. */
  finished: boolean;
  points: number;
  score?: ScoreBreakdown;
  result?: TaskResult;
}

export interface ShiftReport {
  total: number;
  /** Typed all the way through, with or without errors left. */
  done: number;
  /** Clean: no errors left and 95% accuracy or better. */
  clean: number;
  /** Finished, but with errors still in the text. */
  withErrors: number;
  skipped: number;
  /** The shift ended before the student reached these. */
  notReached: number;
  /** Never below zero. */
  points: number;
  maxPoints: number;
  /** Across every keystroke of the finished tasks, or null if nothing was typed. */
  accuracy: number | null;
  /** Weighted by time spent typing, or null if nothing was typed. */
  wpm: number | null;
  /** Index in the queue of the task that earned the most points. */
  best: number | null;
  /** Index in the queue of the task with the lowest WPM; null unless at least two tasks were finished. */
  slowest: number | null;
  perTask: TaskReport[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The report for a shift. `outcomes[i]` is what happened to `queue[i]`; undefined means the shift ended before it. */
export function summarizeShift(queue: readonly ShiftTask[], outcomes: readonly (TaskOutcome | undefined)[]): ShiftReport {
  const perTask: TaskReport[] = queue.map((task, i) => {
    const o = outcomes[i];
    if (!o) return { reached: false, skipped: false, finished: false, points: 0 };
    const score = scoreTask(task.priority, o);
    return o.kind === 'skipped'
      ? { reached: true, skipped: true, finished: false, points: score.total, score }
      : { reached: true, skipped: false, finished: true, points: score.total, score, result: o.result };
  });
  const finished = perTask.map((t, i) => ({ t, i })).filter((x) => x.t.finished);

  const keys = finished.reduce((n, x) => n + finite(x.t.result!.keys), 0);
  const wrong = finished.reduce((n, x) => n + finite(x.t.result!.wrong), 0);
  const seconds = finished.reduce((n, x) => n + Math.max(0, finite(x.t.result!.seconds)), 0);
  let wpm: number | null = null;
  if (finished.length) {
    wpm = seconds > 0
      ? round1(finished.reduce((n, x) => n + finite(x.t.result!.wpm) * Math.max(0, finite(x.t.result!.seconds)), 0) / seconds)
      : round1(finished.reduce((n, x) => n + finite(x.t.result!.wpm), 0) / finished.length);
  }

  // Strictly better wins, so a tie goes to the earlier task.
  let best: number | null = null;
  let slowest: number | null = null;
  for (const { t, i } of finished) {
    if (best == null || t.points > perTask[best].points) best = i;
    if (slowest == null || t.result!.wpm < perTask[slowest].result!.wpm) slowest = i;
  }

  return {
    total: queue.length,
    done: finished.length,
    clean: finished.filter((x) => x.t.result!.clean && !x.t.result!.revealed).length,
    withErrors: finished.filter((x) => x.t.result!.errorsLeft > 0).length,
    skipped: perTask.filter((t) => t.skipped).length,
    notReached: perTask.filter((t) => !t.reached).length,
    points: Math.max(0, perTask.reduce((n, t) => n + t.points, 0)),
    maxPoints: queue.reduce((n, t) => n + maxTaskPoints(t.priority), 0),
    accuracy: finished.length && keys > 0 ? round1(((keys - wrong) / keys) * 100) : finished.length ? 100 : null,
    wpm,
    best,
    slowest: finished.length >= 2 ? slowest : null,
    perTask,
  };
}

/** One or two sentences under the report. Accuracy comes first, as it does in the scoring. */
export function shiftNote(r: ShiftReport): string {
  const tasks = (n: number) => `${n} task${n === 1 ? '' : 's'}`;
  if (r.done === 0) return r.skipped > 0
    ? 'Nothing was finished this shift. Skipped work costs points and still has to be done by someone, so next time start on the first task and take it one at a time.'
    : 'The shift ended before a task was finished. Next time, start on the first task right away and take it one at a time.';
  if (r.withErrors > 0) return `${tasks(r.withErrors)} went out with errors still in the text. On the job, every error is fixed before it goes out, and each one costs more than a slow task does. Slow down and correct as you go.`;
  if (r.clean === r.done && r.accuracy != null && r.accuracy >= 98 && r.skipped === 0) return r.notReached > 0
    ? `Every task you finished was clean and accurate. ${tasks(r.notReached)} ${r.notReached === 1 ? 'was' : 'were'} left in the queue, so next time keep this accuracy and let the speed come.`
    : 'A clean shift: every task finished, accurate and with no errors left. That is the combination that counts.';
  if (r.skipped > 0) return `Nothing went out with errors, but ${tasks(r.skipped)} ${r.skipped === 1 ? 'was' : 'were'} skipped. Skipping costs points, so try each task before giving up on it.`;
  return 'Nothing went out with errors. Fewer backspaces means a faster, safer shift: push for 98% accuracy.';
}

/** The attempt to save for a finished task: a drill attempt with the seed in `passage`, like any generated drill. */
export function shiftAttempt(track: Track, task: ShiftTask, r: TaskResult): NewAttempt {
  return {
    kind: 'drill', track, drillId: task.drillId, passage: task.seed,
    wpm: r.wpm, accuracy: r.accuracy, errorsLeft: r.errorsLeft, seconds: r.seconds, completed: r.completed, clean: r.clean, revealed: r.revealed,
  };
}
