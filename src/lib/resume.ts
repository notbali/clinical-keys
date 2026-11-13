import type { RunState } from '../typing/engine';

/**
 * Mid-passage resume. The typing screen saves the run after every keystroke so a sleeping Chromebook or a closed tab
 * does not cost the student their progress.
 *
 * Elapsed time: the clock only counts time spent on the page. The saved record holds `activeMs` (time from the first
 * keystroke to the last save). On return the clock is rebuilt so that exactly that much time has already passed, so
 * time away never counts against speed. While the tab stays open but hidden, `pauseRun` shifts the start forward by
 * the hidden time. Timed sprints are not resumable (their clock is the point), so they have no key.
 *
 * Stored data is never trusted: a run is restored only if it parses, passes sanity checks, is recent, and was saved
 * for exactly the same target text (checked with a hash and the length). Anything else is discarded.
 */

/** The part of Storage this app uses, so tests can pass a fake. */
export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RESUME_PREFIX = 'ck:run:';
export const RESUME_VERSION = 1;
export const RESUME_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** No real untimed passage takes this long; a bigger value means corrupt data. */
const MAX_ACTIVE_MS = 6 * 3600 * 1000;
const MAX_FUTURE_MS = 24 * 3600 * 1000;

export interface RunFlags { revealed: boolean; peeks: number }

export interface ResumedRun extends RunFlags {
  typed: string;
  keys: number;
  wrong: number;
  activeMs: number;
}

/** FNV-1a, 32 bit. Enough to tell two passages apart; this is not security. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Storage key for one student's run on one passage (or generated seed). Null when the run cannot be resumed. */
export function resumeKey(studentId: string, kind: 'drill' | 'sprint', drillId: string | undefined, passageOrSeed: number): string | null {
  if (kind !== 'drill' || !drillId) return null;
  return `${RESUME_PREFIX}${studentId}:${drillId}:${passageOrSeed}`;
}

/** The JSON to store, or null if nothing has been typed yet. */
export function serializeRun(run: RunState, flags: RunFlags, target: string, perfNow: number, wallNow: number): string | null {
  if (run.keys === 0 && run.typed.length === 0) return null;
  const activeMs = run.start == null ? 0 : Math.max(0, Math.round(perfNow - run.start));
  return JSON.stringify({
    v: RESUME_VERSION, th: hashText(target), tl: target.length, typed: run.typed, keys: run.keys, wrong: run.wrong,
    revealed: flags.revealed, peeks: flags.peeks, activeMs, savedAt: wallNow,
  });
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Validates stored text for this target. Returns null for anything that should be thrown away. */
export function parseRun(raw: string | null, target: string, wallNow: number): ResumedRun | null {
  if (!raw) return null;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (r.v !== RESUME_VERSION) return null;
  if (r.th !== hashText(target) || r.tl !== target.length) return null;
  const { typed, keys, wrong, revealed, peeks, activeMs, savedAt } = r;
  if (typeof typed !== 'string' || typed.length > target.length) return null;
  if (!isCount(keys) || !isCount(wrong) || keys < typed.length || wrong > keys) return null;
  if (typeof revealed !== 'boolean' || !isCount(peeks)) return null;
  if (typeof activeMs !== 'number' || !Number.isFinite(activeMs) || activeMs < 0 || activeMs > MAX_ACTIVE_MS) return null;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  if (savedAt > wallNow + MAX_FUTURE_MS || wallNow - savedAt > RESUME_MAX_AGE_MS) return null;
  return { typed, keys, wrong, revealed, peeks, activeMs };
}

/** Rebuilds the run state so the clock continues from where it stopped. */
export function restoreRunState(r: ResumedRun, perfNow: number): RunState {
  return { typed: r.typed, keys: r.keys, wrong: r.wrong, start: r.keys > 0 ? perfNow - r.activeMs : null };
}

/** The page was hidden for `awayMs`: move the start forward so that time is not counted. */
export function pauseRun(run: RunState, awayMs: number): RunState {
  if (run.start == null || !(awayMs > 0)) return run;
  return { ...run, start: run.start + awayMs };
}

export function saveRun(store: KeyValueStore | null, key: string, run: RunState, flags: RunFlags, target: string, perfNow: number, wallNow: number): void {
  try {
    const raw = serializeRun(run, flags, target, perfNow, wallNow);
    if (raw == null) store?.removeItem(key);
    else store?.setItem(key, raw);
  } catch { /* storage blocked or full: resume is a convenience, never an error */ }
}

export function loadRun(store: KeyValueStore | null, key: string, target: string, wallNow: number): ResumedRun | null {
  try {
    const raw = store?.getItem(key) ?? null;
    if (raw == null) return null;
    const r = parseRun(raw, target, wallNow);
    if (!r) store?.removeItem(key);
    return r;
  } catch { return null; }
}

export function clearRun(store: KeyValueStore | null, key: string): void {
  try { store?.removeItem(key); } catch { /* ignore */ }
}

/** Removes stale or corrupt saved runs. Runs only look at our own keys. */
export function pruneRuns(store: KeyValueStore | null, wallNow: number): void {
  try {
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(RESUME_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const raw = store.getItem(k);
      if (!staleOrCorrupt(raw, wallNow)) continue;
      store.removeItem(k);
    }
  } catch { /* ignore */ }
}

function staleOrCorrupt(raw: string | null, wallNow: number): boolean {
  if (!raw) return true;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return !o || typeof o !== 'object' || o.v !== RESUME_VERSION || typeof o.savedAt !== 'number'
      || wallNow - o.savedAt > RESUME_MAX_AGE_MS || o.savedAt > wallNow + MAX_FUTURE_MS;
  } catch { return true; }
}

/** localStorage, or null where it is unavailable (private windows, blocked site data, tests). */
export function browserStore(): KeyValueStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
