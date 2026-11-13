/** Pure typing-run scoring. No DOM, so it is easy to test. */
export interface RunState {
  /** What the student has typed so far (after normalizing quotes, clamped to the target length). */
  typed: string;
  /** Every keystroke counted, including ones later fixed. */
  keys: number;
  /** Keystrokes that were wrong when typed, even if fixed later. */
  wrong: number;
  /** performance.now() at the first keystroke, or null before starting. */
  start: number | null;
  /** Target positions where a wrong key was typed, even if fixed later. Feeds the weak-word report. */
  missedAt?: number[];
}

export const newRun = (): RunState => ({ typed: '', keys: 0, wrong: 0, start: null, missedAt: [] });

const normalize = (s: string) => s.replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Applies the textarea's new value. Only newly added characters count as keystrokes. */
export function applyInput(state: RunState, target: string, raw: string, now: number): RunState {
  let v = normalize(raw);
  if (v.length > target.length) v = v.slice(0, target.length);
  let { keys, wrong } = state;
  let missedAt = state.missedAt;
  for (let i = state.typed.length; i < v.length; i++) {
    keys++;
    if (v[i] !== target[i]) {
      wrong++;
      missedAt = [...(missedAt ?? []), i];
    }
  }
  return { typed: v, keys, wrong, start: state.start ?? (v.length ? now : null), missedAt };
}

export function correctCount(typed: string, target: string): number {
  let c = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) c++;
  return c;
}

/** Typed characters that are still wrong. Untyped text does not count against the student. */
export const errorsLeft = (s: RunState, target: string): number => s.typed.length - correctCount(s.typed, target);

export const accuracy = (s: RunState): number => (s.keys ? Math.round(((s.keys - s.wrong) / s.keys) * 1000) / 10 : 100);

/** Seconds since the first keystroke. A timed run never reports more than its limit. */
export function elapsed(s: RunState, now: number, limit?: number): number {
  if (s.start == null) return 0;
  const sec = Math.max(0, (now - s.start) / 1000);
  return limit ? Math.min(sec, limit) : sec;
}

/** Words per minute from correctly typed characters only (5 characters = 1 word). */
export function wpm(s: RunState, target: string, now: number, limit?: number): number {
  const mins = elapsed(s, now, limit) / 60;
  return mins > 0.03 ? Math.round(correctCount(s.typed, target) / 5 / mins) : 0;
}

/** A word as it sits in the target text: `word` is the whole token, `start`/`end` are its character positions. */
export interface TargetWord { word: string; start: number; end: number }

/** The word without punctuation around it ("hydrOXYzine," becomes "hydrOXYzine"). Case is kept: Tall Man letters matter. */
export const wordKey = (token: string): string => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Every whitespace-separated token of the target, in order. */
export function targetWords(target: string): TargetWord[] {
  const out: TargetWord[] = [];
  for (const m of target.matchAll(/\S+/g)) out.push({ word: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** Words shorter than this are skipped in the weak-word report ("a", "x"). */
const MIN_WORD = 2;

export interface MissedWord { word: string; count: number }

/**
 * Words a run got wrong at least once, with how many places in the text each was missed. A word with several wrong
 * keystrokes in one place counts once. Wrong keys in the gaps between words belong to no word. Most missed first.
 */
export function missedWordsOf(missedAt: readonly number[], target: string): MissedWord[] {
  const spans = targetWords(target);
  const hit = new Set<number>();
  let w = 0;
  for (const pos of [...missedAt].sort((a, b) => a - b)) {
    while (w < spans.length && spans[w].end <= pos) w++;
    if (w < spans.length && pos >= spans[w].start) hit.add(w);
  }
  const counts = new Map<string, number>();
  for (const i of hit) {
    const key = wordKey(spans[i].word);
    if (key.length >= MIN_WORD) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** Words that were fully typed without a single wrong key (each listed once). Words not reached yet are left out. */
export function cleanWordsOf(missedAt: readonly number[], typedLength: number, target: string): string[] {
  const missed = new Set(missedWordsOf(missedAt, target).map((m) => m.word));
  const out = new Set<string>();
  for (const { word, end } of targetWords(target)) {
    const key = wordKey(word);
    if (end <= typedLength && key.length >= MIN_WORD && !missed.has(key)) out.add(key);
  }
  return [...out];
}

export interface RunResult {
  wpm: number;
  accuracy: number;
  errorsLeft: number;
  seconds: number;
  keys: number;
  wrong: number;
  revealed: boolean;
  peeks: number;
  /** Zero errors left and the answer was not shown. */
  completed: boolean;
  /** Completed with 95% accuracy or better: the only runs that count as personal bests. */
  clean: boolean;
  /** Words missed during the run (typing runs only; absent for error hunts). */
  missedWords?: MissedWord[];
  /** Words typed completely with no wrong key, so a weak word can be cleared once it is typed right. */
  cleanWords?: string[];
}

export function finishRun(s: RunState, target: string, endAt: number, opts: { limit?: number; revealed?: boolean; peeks?: number } = {}): RunResult {
  const revealed = !!opts.revealed;
  const left = errorsLeft(s, target);
  const acc = accuracy(s);
  const completed = left === 0 && !revealed;
  return {
    wpm: wpm(s, target, endAt, opts.limit),
    accuracy: acc,
    errorsLeft: left,
    seconds: Math.round(elapsed(s, endAt, opts.limit)),
    keys: s.keys,
    wrong: s.wrong,
    revealed,
    peeks: opts.peeks ?? 0,
    completed,
    clean: completed && acc >= 95,
    missedWords: missedWordsOf(s.missedAt ?? [], target),
    cleanWords: cleanWordsOf(s.missedAt ?? [], s.typed.length, target),
  };
}
