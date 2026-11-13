/** Scoring for a round of flash cards. Pure, so the rules are easy to test. */

export interface GameState {
  answered: number;
  correct: number;
  /** Right answers in a row, right now. */
  streak: number;
  bestStreak: number;
  score: number;
  /** One entry per card answered: was the answer right? */
  results: boolean[];
}

export const newGame = (): GameState => ({ answered: 0, correct: 0, streak: 0, bestStreak: 0, score: 0, results: [] });

const BASE = 10;
const STREAK_STEP = 2;
const STREAK_STEPS_MAX = 5;

/** Points for a right answer that makes the streak `streakAfter`: 10, plus 2 for each right answer already in a row, up to 10 more. */
export const pointsFor = (streakAfter: number): number => BASE + STREAK_STEP * Math.min(Math.max(streakAfter - 1, 0), STREAK_STEPS_MAX);

/** The score for answering a round of `size` cards without a miss. */
export function maxScore(size: number): number {
  let total = 0;
  for (let i = 1; i <= size; i++) total += pointsFor(i);
  return total;
}

/** The state after one answer, and the points it earned. The state passed in is not changed. */
export function answerCard(state: GameState, right: boolean): { state: GameState; points: number } {
  const streak = right ? state.streak + 1 : 0;
  const points = right ? pointsFor(streak) : 0;
  return {
    points,
    state: {
      answered: state.answered + 1,
      correct: state.correct + (right ? 1 : 0),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      score: state.score + points,
      results: [...state.results, right],
    },
  };
}

/** What is kept as a personal best. */
export interface RoundBest { score: number; correct: number; size: number; bestStreak: number }

export function isRoundBest(v: unknown): v is RoundBest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const whole = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  return whole(r.score) && whole(r.correct) && whole(r.size) && whole(r.bestStreak) && r.correct <= r.size && r.bestStreak <= r.size;
}

/** Is `next` a new personal best? A higher score wins; a tie goes to the longer streak. Only full rounds with at least one right answer count. */
export function betterRound(prev: RoundBest | null, next: RoundBest, fullSize?: number): boolean {
  if (next.correct === 0) return false;
  if (fullSize != null && next.size !== fullSize) return false;
  if (!prev) return true;
  return next.score > prev.score || (next.score === prev.score && next.bestStreak > prev.bestStreak);
}

/** localStorage key for a student's best round. Kept per student, because Chromebooks are shared. */
export const flashBestKey = (studentId: string): string => `ck.flashcards.best.${studentId}`;
