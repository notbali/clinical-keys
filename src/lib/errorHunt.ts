import type { HuntCategory } from '../content/types';
import type { RunResult } from '../typing/engine';
import { diffTokens, tokenize, type DiffOp } from './wordDiff';

/**
 * Error hunt: a note with planted mistakes. The student edits it until it is right.
 * Which mistakes were planted is not written down twice: it is the difference between the flawed note and the correct one.
 */

/** What to call each kind of mistake in a hint. */
export const HUNT_LABEL: Record<HuntCategory, string> = {
  number: 'a number',
  unit: 'a unit',
  spelling: 'a spelling mistake',
  patient: 'something that does not match the chart banner',
  allergy: 'an allergy problem',
  'tall-man': 'a drug name',
  'do-not-use': 'an unsafe abbreviation or number format',
  logic: 'something that does not make sense',
};

export interface PlantedError {
  /** The wrong words in the flawed note (empty when a word was taken out). */
  flawed: string;
  /** The right words (empty when a word was put in). */
  fixed: string;
  /** Line of the flawed note, from 1. */
  line: number;
  /** The two words just before the mistake, to point at it without giving it away. */
  before: string;
  /** Which words of the correct note this covers, as a range [start, end). Empty when a word was put in. */
  targetStart: number;
  targetEnd: number;
}

const withLines = (text: string): { tokens: string[]; lines: number[] } => {
  const tokens: string[] = [];
  const lines: number[] = [];
  text.split('\n').forEach((line, i) => { for (const t of tokenize(line)) { tokens.push(t); lines.push(i + 1); } });
  return { tokens, lines };
};

export function plantedErrors(flawed: string, fixed: string): PlantedError[] {
  const f = withLines(flawed);
  const target = tokenize(fixed);
  const ops = diffTokens(f.tokens, target);
  const out: PlantedError[] = [];
  let consumedTarget = 0;
  let consumedTyped = 0;
  for (let k = 0; k < ops.length;) {
    const op = ops[k];
    if (op.gap == null) { consumedTarget++; consumedTyped++; k++; continue; }
    const run = ops.filter((o) => o.gap === op.gap);
    const typedIdx = run.filter((o) => o.typedIndex != null).map((o) => o.typedIndex!);
    const targetIdx = run.filter((o) => o.targetIndex != null).map((o) => o.targetIndex!);
    const anchor = typedIdx.length ? Math.min(...typedIdx) : consumedTyped;
    const lineAt = typedIdx.length ? f.lines[anchor] : f.lines[Math.max(0, anchor - 1)] ?? 1;
    out.push({
      flawed: typedIdx.map((i) => f.tokens[i]).join(' '),
      fixed: targetIdx.map((i) => target[i]).join(' '),
      line: lineAt,
      before: f.tokens.slice(Math.max(0, anchor - 2), anchor).join(' '),
      targetStart: targetIdx.length ? Math.min(...targetIdx) : consumedTarget,
      targetEnd: targetIdx.length ? Math.max(...targetIdx) + 1 : consumedTarget,
    });
    consumedTarget += targetIdx.length;
    consumedTyped += typedIdx.length;
    k += run.length;
  }
  return out;
}

export interface HuntScore {
  /** Mistakes planted in the note. */
  planted: number;
  /** Planted mistakes that are now right. */
  fixed: number;
  /** Planted mistakes still wrong (not fixed, or fixed the wrong way). */
  remaining: number;
  /** Words the student changed that were right: new mistakes. */
  introduced: number;
  /** For each planted mistake, in order: is it fixed? */
  found: boolean[];
  /** Mistakes fixed, out of those planted plus those introduced, 0 to 100 with one decimal. */
  accuracy: number;
  /** Every mistake fixed and no new ones. */
  completed: boolean;
  introducedOps: DiffOp[];
}

/** Scores the student's edited note against the correct one, using the planted mistakes as the answer key. */
export function scoreHunt(flawed: string, fixed: string, typed: string): HuntScore {
  const planted = plantedErrors(flawed, fixed);
  const ops = diffTokens(tokenize(typed), tokenize(fixed));
  const found = planted.map(() => true);
  const introducedOps: DiffOp[] = [];
  let consumed = 0;
  for (const op of ops) {
    if (op.kind !== 'ok') {
      // A wrong or missing word belongs to the planted mistake whose words it sits in. An extra word only
      // belongs to a planted mistake that was a word put in, at the same place.
      const at = op.kind === 'extra'
        ? planted.findIndex((p) => p.targetStart === p.targetEnd && p.targetStart === consumed)
        : planted.findIndex((p) => op.targetIndex! >= p.targetStart && op.targetIndex! < p.targetEnd);
      if (at >= 0) found[at] = false; else introducedOps.push(op);
    }
    if (op.kind !== 'extra') consumed++;
  }
  const fixedCount = found.filter(Boolean).length;
  const introduced = introducedOps.length;
  const denominator = planted.length + introduced;
  return {
    planted: planted.length, fixed: fixedCount, remaining: planted.length - fixedCount, introduced, found,
    accuracy: denominator ? Math.round((fixedCount / denominator) * 1000) / 10 : 0,
    completed: planted.length > 0 && fixedCount === planted.length && introduced === 0,
    introducedOps,
  };
}

/** Points at the first mistake still in the note, by the words just before it. */
export function nextHint(flawed: string, fixed: string, typed: string): { index: number; before: string } | null {
  const index = scoreHunt(flawed, fixed, typed).found.indexOf(false);
  return index < 0 ? null : { index, before: plantedErrors(flawed, fixed)[index].before };
}

/** A hunt in the same shape the typing drills save. It has no typing speed and never counts as a personal best. */
export function huntRunResult(score: HuntScore, o: { seconds: number; hints: number; revealed: boolean; typedChars: number }): RunResult {
  const left = score.remaining + score.introduced;
  return {
    wpm: 0, accuracy: score.accuracy, errorsLeft: left, seconds: Math.round(o.seconds), keys: o.typedChars, wrong: left,
    revealed: o.revealed, peeks: o.hints, completed: score.completed && !o.revealed, clean: false,
  };
}
