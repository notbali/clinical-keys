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
}

export const newRun = (): RunState => ({ typed: '', keys: 0, wrong: 0, start: null });

const normalize = (s: string) => s.replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Applies the textarea's new value. Only newly added characters count as keystrokes. */
export function applyInput(state: RunState, target: string, raw: string, now: number): RunState {
  let v = normalize(raw);
  if (v.length > target.length) v = v.slice(0, target.length);
  let { keys, wrong } = state;
  for (let i = state.typed.length; i < v.length; i++) {
    keys++;
    if (v[i] !== target[i]) wrong++;
  }
  return { typed: v, keys, wrong, start: state.start ?? (v.length ? now : null) };
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
  };
}
