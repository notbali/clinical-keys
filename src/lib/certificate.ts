import type { Attempt } from '../data/types';
import type { Track } from '../content/types';
import { todayISO, type ISODate } from './dates';
import { improvement, type Improvement, type TestResult } from './progress';
import { doneCount, programFor, resolveActivity } from './program';

export const CERTIFICATE_NOTICE =
  'This is a fictional training certificate for a classroom typing course. It is not a credential, license or certification of any kind.';

/** The Day 10 final test activity of a track, with the passages it needs. */
function finalTest(track: Track): { act: number; passages: number[] } | null {
  const day10 = programFor(track).find((d) => d.n === 10);
  if (!day10) return null;
  for (let act = 0; act < day10.acts.length; act++) {
    if (day10.acts[act].type !== 'test') continue;
    const r = resolveActivity(day10.acts[act]);
    if (r.kind === 'drill') return { act, passages: r.passages };
  }
  return null;
}

/** True when every passage of the Day 10 final test has a finished run. */
export function finalTestDone(attempts: Attempt[], track: Track): boolean {
  const t = finalTest(track);
  return !!t && doneCount(attempts, 10, t.act, t.passages) >= t.passages.length;
}

export interface CertificateSummary {
  eligible: boolean;
  /** Why it is not available yet (when it is not), in plain words for the student. */
  reason: string | null;
  name: string;
  trackLabel: string;
  /** Local date shown on the certificate. */
  date: ISODate;
  day1: TestResult | null;
  final: Improvement['latest'];
  wpmGain: number | null;
  accuracyGain: number | null;
  notice: string;
}

/**
 * Whether the student can print a completion certificate, and what it says. Available once the Day 10 final test is
 * finished, or once the student is past Day 10. The date is the day the final test was finished, or today for a student
 * who is past Day 10 without it.
 */
export function certificateSummary(args: {
  attempts: Attempt[];
  track: Track;
  /** Raw program day (11 or more means past Day 10). */
  day: number;
  today: ISODate;
  firstName: string;
  lastName: string;
}): CertificateSummary {
  const { attempts, track, day, today } = args;
  const done = finalTestDone(attempts, track);
  const eligible = done || day > 10;
  const imp = improvement(attempts);

  const t = finalTest(track);
  const finalRuns = t ? attempts.filter((a) => a.completed && a.day === 10 && a.act === t.act) : [];
  const lastFinal = finalRuns.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), '');
  const date = done && lastFinal ? todayISO(new Date(lastFinal)) : today;

  return {
    eligible,
    reason: eligible ? null : 'Your certificate unlocks when you finish the Day 10 final typing test.',
    name: `${args.firstName} ${args.lastName}`.trim(),
    trackLabel: track === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech',
    date,
    day1: imp.baseline,
    final: imp.latest,
    wpmGain: imp.wpmGain,
    accuracyGain: imp.accuracyGain,
    notice: CERTIFICATE_NOTICE,
  };
}
