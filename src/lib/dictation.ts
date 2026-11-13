/**
 * Dictation: a voice reads a note aloud and the student types it. The voice reads a *script* made from the written
 * passage (numbers, units and dates in words), while the student still types the passage as a chart would write it.
 * Everything here is pure, so it is easy to test. The speaking itself is in src/pages/student/Dictation.tsx.
 */
import { diffTokens, tokenize, type DiffOp } from './wordDiff';
import type { Track } from '../content/types';

// ---------------------------------------------------------------------------------------------------------------------
// Numbers in words

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL_ONES = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
  'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 128 -> "one hundred twenty-eight". Whole numbers from 0 to 9,999; anything bigger is read digit by digit. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n).split('').map((d) => ONES[Number(d)] ?? d).join(' ');
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ''}`;
  return `${ONES[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ''}`;
}

/** "0142" -> "zero one four two". */
const digitsToWords = (digits: string): string => digits.split('').map((d) => ONES[Number(d)]).join(' ');

/** "98.6" -> "ninety-eight point six", "0.005" -> "zero point zero zero five". */
function decimalToWords(s: string): string {
  const [whole, frac] = s.split('.');
  const w = whole.length > 1 && whole.startsWith('0') ? digitsToWords(whole) : numberToWords(Number(whole));
  return frac === undefined ? w : `${w} point ${digitsToWords(frac)}`;
}

/** 17 -> "seventeenth", 23 -> "twenty-third", 30 -> "thirtieth". */
function ordinal(n: number): string {
  if (n < 20) return ORDINAL_ONES[n];
  if (n % 10 === 0) return `${TENS[n / 10].slice(0, -1)}ieth`;
  return `${TENS[Math.floor(n / 10)]}-${ORDINAL_ONES[n % 10]}`;
}

/** 1994 -> "nineteen ninety-four", 2026 -> "twenty twenty-six", 2005 -> "two thousand five". */
function yearToWords(y: number): string {
  if (y >= 2000 && y < 2010) return y === 2000 ? 'two thousand' : `two thousand ${ONES[y - 2000]}`;
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  if (lo === 0) return `${numberToWords(hi)} hundred`;
  return `${numberToWords(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : numberToWords(lo)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The script the voice reads

/** Unit as written -> [one, more than one]. */
const UNITS: Record<string, [string, string]> = {
  'mg/dL': ['milligram per deciliter', 'milligrams per deciliter'],
  mmHg: ['millimeters of mercury', 'millimeters of mercury'],
  mcg: ['microgram', 'micrograms'],
  mg: ['milligram', 'milligrams'],
  mL: ['milliliter', 'milliliters'],
  lb: ['pound', 'pounds'],
  bpm: ['beat per minute', 'beats per minute'],
  ft: ['foot', 'feet'],
  in: ['inch', 'inches'],
  kg: ['kilogram', 'kilograms'],
  g: ['gram', 'grams'],
  '%': ['percent', 'percent'],
};

const SPELLED = (s: string): string => s.toUpperCase().split('').join(' ');

/** Joins the lines of a passage with a pause between them. A line that already ends a sentence needs no extra full stop. */
function joinLines(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^S: /, 'Subjective: ').replace(/^O: /, 'Objective: ').replace(/^A: /, 'Assessment: ').replace(/^P: /, 'Plan: '));
  return lines.reduce((out, l, i) => (i === 0 ? l : `${out}${/[.!?:;,]$/.test(out) ? ' ' : '. '}${l}`), '');
}

/**
 * The words a voice should say for a passage. "10 mg" becomes "ten milligrams", "11/17" becomes a date, "BP 128/84"
 * is read as a blood pressure, and sig shorthand such as BID is spelled letter by letter, because that is what the
 * student has to type. The student still types the passage as written.
 */
export function speechScript(text: string): string {
  let t = joinLines(text.replace(/\r/g, ''));

  t = t.replace(/Rx# ?(\d+)/g, (_, d: string) => `prescription number ${digitsToWords(d)}`);
  t = t.replace(/\bPain (\d{1,2})\/10\b/g, (_, n: string) => `Pain ${numberToWords(Number(n))} out of ten`);
  t = t.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\b/g,
    (_, m: string, d: string, y: string) => `${MONTHS[Number(m) - 1]} ${ordinal(Number(d))}, ${yearToWords(Number(y))}`);
  t = t.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b/g, (_, m: string, d: string) => `${MONTHS[Number(m) - 1]} ${ordinal(Number(d))}`);
  t = t.replace(/\b(\d{2,3})\/(\d{2,3})\b/g, (_, a: string, b: string) => `${numberToWords(Number(a))} over ${numberToWords(Number(b))}`);

  t = t.replace(/\b(\d{1,2}):(\d{2}) ?([ap])\.m\.(\s+(?=[A-Z]))?/g, (_, h: string, m: string, ap: string, after?: string) => {
    const mins = Number(m);
    const minutes = mins === 0 ? 'o clock' : mins < 10 ? `oh ${ONES[mins]}` : numberToWords(mins);
    return `${numberToWords(Number(h))} ${minutes} ${ap.toUpperCase()} M${after ? '. ' : ''}`;
  });
  t = t.replace(/\b(\d{3})-(\d{4})\b/g, (_, a: string, b: string) => `${digitsToWords(a)}, ${digitsToWords(b)}`);

  t = t.replace(/\bT (\d+(?:\.\d+)?) F\b/g, (_, n: string) => `temperature ${decimalToWords(n)} degrees Fahrenheit`);
  t = t.replace(/(\d+(?:\.\d+)?) F\b/g, (_, n: string) => `${decimalToWords(n)} degrees Fahrenheit`);
  t = t.replace(/\bBP\b/g, 'blood pressure').replace(/\bP (?=\d)/g, 'pulse ').replace(/\bR (?=\d)/g, 'respirations ');
  t = t.replace(/\bL arm\b/g, 'left arm').replace(/\bR arm\b/g, 'right arm');
  t = t.replace(/\bSpO2\b/g, 'oxygen saturation').replace(/\bWt\b/g, 'weight').replace(/\bHt\b/g, 'height');

  t = t.replace(/\bx (?=\d)/g, 'for ');
  t = t.replace(/\by\/o\b/g, 'year old').replace(/\bc\/o\b/g, 'complains of').replace(/\bPt\b/g, 'patient');
  t = t.replace(/\bDr\./g, 'Doctor').replace(/\bDOB\b/g, 'date of birth').replace(/\bQty:/g, 'quantity:').replace(/\bRx\b/g, 'prescription');

  // Sig shorthand is spelled out so that a sig is still typed as a sig.
  t = t.replace(/\bq(\d+)h\b/g, (_, n: string) => `Q ${numberToWords(Number(n))} H`);
  t = t.replace(/\b(qhs|qAM|qPM|BID|TID|QID|PRN|PO|bid|tid|qid|prn|po)\b/g, (w) => SPELLED(w));

  t = t.replace(/\bA1c\b/g, 'A one C');
  // A number with its unit, then any bare number.
  t = t.replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)(?: ?(mg\/dL|mmHg|mcg|mg|mL|lb|bpm|ft|in|kg|g|%)(?![A-Za-z]))?/g, (_, n: string, unit?: string) => {
    const words = decimalToWords(n);
    if (!unit) return words;
    const [one, many] = UNITS[unit];
    return `${words} ${n === '1' ? one : many}`;
  });

  t = t.replace(/\bmmHg\b/g, 'millimeters of mercury');
  t = t.replace(/\//g, ' slash ');
  t = t.replace(/ - /g, ', ');

  // Letters of what is left: ER, DS, UTI, BMI are said as letters. Tall Man names are said as one lower-case word.
  t = t.replace(/\b[A-Z]{2,6}\b/g, (w) => SPELLED(w));
  t = t.replace(/\b(?=[A-Za-z]*[a-z])(?=[A-Za-z]*[A-Z])(?![A-Z][a-z]+\b)[A-Za-z]{5,}\b/g, (w) => w.toLowerCase());

  return t.replace(/ {2,}/g, ' ').replace(/ ([,.;:])/g, '$1').trim();
}

/**
 * The script in short pieces. Some voices stop partway through a long text, so it is spoken a sentence or two at a time,
 * which also lets a student repeat just the last sentence. Pieces break at the ends of sentences, then at commas, then at spaces.
 */
export function speechChunks(script: string, max = 140): string[] {
  const text = script.trim();
  if (!text) return [];
  const merge = (pieces: string[], limit: number): string[] => {
    const out: string[] = [];
    for (const p of pieces) {
      const last = out.at(-1);
      if (last !== undefined && last.length + 1 + p.length <= limit) out[out.length - 1] = `${last} ${p}`;
      else out.push(p);
    }
    return out;
  };
  const sentences = text.split(/(?<=[.!?])(?<!(?:^|\s)[A-Z]\.)\s+/);
  const fitted = sentences.flatMap((s) => {
    if (s.length <= max) return [s];
    const parts = s.split(/(?<=[,;:])\s+/).flatMap((p) => (p.length <= max ? [p] : merge(p.split(/\s+/), max)));
    return merge(parts, max);
  });
  return merge(fitted, max);
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking what was typed

export interface DictationReview {
  ops: DiffOp[];
  wordsTotal: number;
  wordsRight: number;
  /** Words right out of the longer of the two texts, as a percent with one decimal place. */
  accuracy: number;
  exact: boolean;
  /** One sentence per difference, in the order they appear. */
  issues: string[];
}

const normalizeTyped = (s: string) => s.replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const issueFor = (op: DiffOp): string => {
  if (op.kind === 'wrong') {
    const caseOnly = op.typed!.toLowerCase() === op.target!.toLowerCase();
    return `You typed “${op.typed}” but the note has “${op.target}”.${caseOnly ? ' Check the capital letters.' : ''}`;
  }
  if (op.kind === 'missed') return `You skipped “${op.target}”.`;
  return `“${op.typed}” is not in the note.`;
};

/** Word-by-word comparison of what was typed with the passage. Exact: capital letters and punctuation count. */
export function reviewDictation(typed: string, target: string): DictationReview {
  const a = tokenize(normalizeTyped(typed));
  const b = tokenize(target);
  const ops = diffTokens(a, b);
  const wordsRight = ops.filter((o) => o.kind === 'ok').length;
  const longest = Math.max(a.length, b.length);
  const exact = ops.every((o) => o.kind === 'ok');
  return {
    ops,
    wordsTotal: b.length,
    wordsRight,
    accuracy: longest === 0 ? 100 : Math.round((wordsRight / longest) * 1000) / 10,
    exact,
    issues: ops.filter((o) => o.kind !== 'ok').map(issueFor),
  };
}

/** Seconds spent typing: the gaps between keystrokes, leaving out any gap longer than `maxGapMs` (time spent listening). */
export function activeTypingSeconds(keyTimes: readonly number[], maxGapMs = 5000): number {
  let ms = 0;
  for (let i = 1; i < keyTimes.length; i++) {
    const gap = keyTimes[i] - keyTimes[i - 1];
    if (gap >= 0 && gap <= maxGapMs) ms += gap;
  }
  return ms / 1000;
}

export interface DictationResult extends DictationReview {
  seconds: number;
  wpm: number;
  replays: number;
  revealed: boolean;
  /** Every word right and the text was never shown. */
  completed: boolean;
  /** Completed with 95% accuracy or better: the only runs that count as personal bests. */
  clean: boolean;
}

export function dictationResult(input: { typed: string; target: string; keyTimes: readonly number[]; replays: number; revealed: boolean }): DictationResult {
  const review = reviewDictation(input.typed, input.target);
  const seconds = Math.round(activeTypingSeconds(input.keyTimes) * 10) / 10;
  const right = review.ops.filter((o) => o.kind === 'ok');
  const chars = right.reduce((n, o) => n + o.target!.length, 0) + Math.max(right.length - 1, 0);
  const completed = review.exact && !input.revealed;
  return {
    ...review,
    seconds,
    wpm: seconds > 0 ? Math.round(chars / 5 / (seconds / 60)) : 0,
    replays: input.replays,
    revealed: input.revealed,
    completed,
    clean: completed && review.accuracy >= 95,
  };
}

/** What is kept as a personal best. */
export interface DictationBest { wpm: number; accuracy: number }

export function isDictationBest(v: unknown): v is DictationBest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.wpm === 'number' && typeof r.accuracy === 'number' && Number.isFinite(r.wpm) && r.wpm >= 0;
}

/** Is this run a new personal best? Only a clean run that took some time, and only if it is faster. */
export function betterDictation(prev: { wpm: number } | null, next: { wpm: number; clean: boolean }): boolean {
  return next.clean && next.wpm > 0 && (!prev || next.wpm > prev.wpm);
}

/** What a student can dictate: generated passages short enough to hold in the head. */
export function dictationSources(track: Track): { id: string; label: string }[] {
  return track === 'ma'
    ? [{ id: 'ma-gen-phone', label: 'Phone message' }, { id: 'ma-gen-vitals', label: 'Vitals entry' }, { id: 'ma-gen-soap', label: 'SOAP note' }]
    : [{ id: 'rx-gen-labels', label: 'Prescription label' }, { id: 'rx-gen-sig', label: 'Label directions' }];
}

/** True when this browser can read text aloud. Pass `window`. */
export function speechSupported(w: { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } | undefined): boolean {
  return !!w && !!w.speechSynthesis && typeof w.SpeechSynthesisUtterance === 'function';
}
