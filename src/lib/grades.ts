import { assignedThrough, doneCount } from './program';
import type { Attempt, GradeOverride, Settings } from '../data/types';
import type { Track } from '../content/types';
import type { WithPlan } from './plan';

export interface TypingGrade {
  /** Average accuracy of the last 3 finished runs (no errors left, answer not shown), or null if there are none. */
  accuracyAvg: number | null;
  /** Best WPM among finished runs, or null if there are none. */
  bestWpm: number | null;
  completion: { done: number; total: number };
  /** Each part is scored 0 to 100. */
  accuracyScore: number;
  speedScore: number;
  completionScore: number;
  /** Weighted total 0 to 100, or null when the student has no runs yet. */
  computed: number | null;
  /** What is shown: the override if there is one, otherwise the computed grade. */
  total: number | null;
  override?: GradeOverride;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeTypingGrade(args: {
  attempts: Attempt[];
  track: Track;
  /** The student's current program day. */
  day: number;
  /** `classPlan` (optional) leaves skipped days out of what is assigned. */
  settings: Pick<Settings, 'targets' | 'weights'> & WithPlan;
  override?: GradeOverride;
}): TypingGrade {
  const { attempts, track, day, settings, override } = args;
  const target = settings.targets[track];
  const w = settings.weights;

  // A finished run (no errors left, answer not shown) counts toward the grade even if accuracy was under 95%.
  // "Clean" (95% or better) is only the bar for personal bests, so a student who is still learning is not graded as 0.
  const finished = attempts.filter((a) => a.completed).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last3 = finished.slice(-3);
  const accuracyAvg = last3.length ? last3.reduce((s, a) => s + a.accuracy, 0) / last3.length : null;
  const bestWpm = finished.length ? Math.max(...finished.map((a) => a.wpm)) : null;

  const assigned = assignedThrough(track, Math.max(day, 1), settings.classPlan);
  const doneActs = assigned.filter((a) => doneCount(attempts, a.day, a.act, a.passages) >= a.passages.length).length;

  const accuracyScore = accuracyAvg == null ? 0 : clamp((accuracyAvg / target.accuracy) * 100);
  const speedScore = bestWpm == null ? 0 : clamp((bestWpm / target.wpm) * 100);
  const completionScore = assigned.length ? clamp((doneActs / assigned.length) * 100) : 0;

  const wsum = w.accuracy + w.speed + w.completion || 1;
  const weighted = (w.accuracy * accuracyScore + w.speed * speedScore + w.completion * completionScore) / wsum;
  const computed = attempts.length ? Math.round(weighted) : null;

  return {
    accuracyAvg: accuracyAvg == null ? null : Math.round(accuracyAvg * 10) / 10,
    bestWpm,
    completion: { done: doneActs, total: assigned.length },
    accuracyScore: Math.round(accuracyScore),
    speedScore: Math.round(speedScore),
    completionScore: Math.round(completionScore),
    computed,
    total: override ? override.value : computed,
    override,
  };
}
