import type { Challenge, ChallengePassage, ChallengePassages, ChallengeResult, NewChallengeResult } from '../data/challengeTypes';
import { generatePassage, getGeneratedDrill } from '../content/generated';
import type { Passage, Track } from '../content/types';

/**
 * Class challenge: everyone in a class types the same generated passage, and a projector shows a leaderboard.
 * Accuracy comes first: any result with errors left, under 95% accuracy, or with the answer shown ranks below every
 * clean result, however fast it was. Pure functions only, so the rules are easy to test.
 */

/** The same bar as personal bests: only clean runs count. */
export const CLEAN_ACCURACY = 95;

/** How often the projector page and the student page ask for new results. */
export const POLL_MS = 2000;

const TRACKS: Track[] = ['ma', 'rx'];
const MAX_SEED = 2147483647; // the database's integer column, same limit as a generated drill's seed

/** "Maya S.": first name and last initial only. This is all a classroom screen ever shows of a student. */
export function displayName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const initial = lastName.trim().slice(0, 1).toUpperCase();
  return [first, initial && `${initial}.`].filter(Boolean).join(' ');
}

/** Zero errors left, accuracy at the bar or better, and the answer not shown. */
export const isCleanResult = (r: { errorsLeft: number; accuracy: number; revealed?: boolean }): boolean =>
  r.errorsLeft === 0 && r.accuracy >= CLEAN_ACCURACY && !r.revealed;

export type RankedResult = ChallengeResult & { rank: number };

/** Earlier first. ISO timestamps from the same source compare as text. */
const byTime = (a: ChallengeResult, b: ChallengeResult): number => a.submittedAt.localeCompare(b.submittedAt);
const byId = (a: ChallengeResult, b: ChallengeResult): number => a.id.localeCompare(b.id);

/**
 * Orders results best first. Cleanliness is worked out from the numbers, never read from a stored flag.
 * - Clean results: WPM, then accuracy, then the earlier submission.
 * - Everything else, below all of them: accuracy, then fewer errors left, then WPM, then the earlier submission.
 * A student's first result is the only one counted. The input is not changed.
 */
export function rankResults(results: readonly ChallengeResult[]): RankedResult[] {
  const firsts = new Map<string, ChallengeResult>();
  for (const r of results) {
    const have = firsts.get(r.studentId);
    if (!have || byTime(r, have) < 0) firsts.set(r.studentId, r);
  }
  const sorted = [...firsts.values()].map((r) => ({ ...r, clean: isCleanResult(r) })).sort((a, b) => {
    if (a.clean !== b.clean) return a.clean ? -1 : 1;
    if (a.clean) return b.wpm - a.wpm || b.accuracy - a.accuracy || byTime(a, b) || byId(a, b);
    return b.accuracy - a.accuracy || a.errorsLeft - b.errorsLeft || b.wpm - a.wpm || byTime(a, b) || byId(a, b);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** The top rows for a big screen, and how many are left out. */
export function leaderboardRows<T>(ranked: readonly T[], limit: number): { rows: T[]; hidden: number } {
  return { rows: ranked.slice(0, limit), hidden: Math.max(0, ranked.length - limit) };
}

export function summarize(ranked: readonly { clean: boolean }[]): { finished: number; clean: number } {
  return { finished: ranked.length, clean: ranked.filter((r) => r.clean).length };
}

const isInt = (n: unknown, min: number, max: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** A reason the result cannot be saved, or null. The limits match the database columns. */
export function validateResult(r: NewChallengeResult): string | null {
  if (!r || typeof r !== 'object') return 'That result could not be read.';
  if (!isInt(r.wpm, 0, 400)) return 'WPM must be a whole number from 0 to 400.';
  if (typeof r.accuracy !== 'number' || !Number.isFinite(r.accuracy) || r.accuracy < 0 || r.accuracy > 100) return 'Accuracy must be between 0 and 100.';
  if (!isInt(r.errorsLeft, 0, Number.MAX_SAFE_INTEGER)) return 'Errors left must be a whole number, 0 or more.';
  if (!isInt(r.seconds, 0, 3600)) return 'Time must be a whole number of seconds, up to 3600.';
  if (typeof r.revealed !== 'boolean') return 'It must say whether the answer was shown.';
  return null;
}

/** A reason the round cannot be opened, or null. Each passage must be a generated drill of its own track. */
export function validateNewChallenge(passages: ChallengePassages): string | null {
  if (!passages || typeof passages !== 'object') return 'Choose at least one passage.';
  const keys = Object.keys(passages);
  const unknown = keys.find((k) => !TRACKS.includes(k as Track));
  if (unknown) return `Unknown track: ${unknown}.`;
  const given = TRACKS.filter((t) => passages[t]);
  if (!given.length) return 'Choose at least one passage.';
  for (const t of given) {
    const p = passages[t] as ChallengePassage;
    const drill = getGeneratedDrill(p.drillId);
    if (!drill) return 'That drill cannot be used in a challenge. Choose a generated drill.';
    if (drill.track !== t) return `${drill.title} is not a ${t === 'ma' ? 'Medical Assistant' : 'Pharmacy Tech'} drill.`;
    if (!isInt(p.seed, 0, MAX_SEED)) return 'The passage seed is not valid.';
    if (typeof p.chartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.chartDate)) return 'The chart date is not valid.';
  }
  return null;
}

export const passageFor = (c: Pick<Challenge, 'passages'>, track: Track): ChallengePassage | undefined => c.passages[track];

/** The text everyone types: the same drill, seed and chart date always rebuild the same passage. */
export function resolveChallengePassage(p: ChallengePassage): Passage | undefined {
  const drill = getGeneratedDrill(p.drillId);
  return drill ? generatePassage(drill, p.seed, p.chartDate) : undefined;
}
