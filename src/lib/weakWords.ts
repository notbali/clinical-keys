import type { Rng } from '../content/generate/rng';
import type { MissedWord } from '../typing/engine';

/**
 * A student's rolling record of the words they miss while typing. It lives in this browser's localStorage, per
 * student, and only the most recent runs are kept, so old trouble fades. All logic here is pure; only
 * loadRecord/saveRecord touch storage, and they never throw.
 */
export interface WeakRun {
  at: string;
  /** Words missed in this run, with how many places each was missed. */
  missed: Record<string, number>;
  /** Words that were weak before this run and were typed right in it. */
  ok: string[];
}
export interface WeakRecord { runs: WeakRun[] }

/** How many recent runs the record keeps. */
export const MAX_RUNS = 30;

export const emptyRecord = (): WeakRecord => ({ runs: [] });

/** Each word's current score: every miss adds its count, every later run that types it right takes one off. Never below 0. */
function scores(rec: WeakRecord): Map<string, number> {
  const out = new Map<string, number>();
  for (const run of rec.runs) {
    for (const [w, n] of Object.entries(run.missed)) out.set(w, (out.get(w) ?? 0) + n);
    for (const w of run.ok) if (out.has(w)) out.set(w, Math.max(0, out.get(w)! - 1));
  }
  return out;
}

/** The words the student misses most right now, most missed first. Empty when there are none. */
export function weakList(rec: WeakRecord, limit = 10): MissedWord[] {
  return [...scores(rec).entries()]
    .filter(([, count]) => count > 0)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** Adds a finished run to the record. Returns the same record when the run changes nothing. */
export function recordRun(rec: WeakRecord, run: { at: string; missedWords: readonly MissedWord[]; cleanWords: readonly string[] }): WeakRecord {
  const missed = Object.fromEntries(run.missedWords.filter((m) => m.count > 0).map((m) => [m.word, m.count]));
  const current = scores(rec);
  const ok = run.cleanWords.filter((w) => (current.get(w) ?? 0) > 0 && !(w in missed));
  if (!Object.keys(missed).length && !ok.length) return rec;
  return { runs: [...rec.runs, { at: run.at, missed, ok }].slice(-MAX_RUNS) };
}

/** Plain sentence for the result card, or null when nothing was missed. Names the top three. */
export function missedLine(missed: readonly MissedWord[]): string | null {
  if (!missed.length) return null;
  const phrase = ({ word, count }: MissedWord) => `${word} ${count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`}`;
  const top = missed.slice(0, 3).map(phrase);
  const list = top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`;
  const more = missed.length - top.length;
  return `You missed ${list}${more > 0 ? `, plus ${more} more` : ''}.`;
}

/** Length the sprint text is built to: enough that a fast typist cannot finish it in 60 seconds. */
const SPRINT_CHARS = 600;

/**
 * Text for a 60-second weak-word sprint: the student's weak words in a seeded random order, the most missed showing up
 * more often, never the same word twice in a row (unless there is only one). Empty when there are no weak words.
 */
export function buildWeakSprint(words: readonly MissedWord[], rng: Rng): string {
  if (!words.length) return '';
  const out: string[] = [];
  let length = 0;
  let last = '';
  while (length < SPRINT_CHARS) {
    const pool = words.length > 1 ? words.filter((w) => w.word !== last) : words;
    const total = pool.reduce((s, w) => s + Math.min(w.count, 3), 0);
    let roll = rng() * total;
    let next = pool[pool.length - 1].word;
    for (const w of pool) {
      roll -= Math.min(w.count, 3);
      if (roll < 0) { next = w.word; break; }
    }
    out.push(next);
    length += next.length + 1;
    last = next;
  }
  return out.join(' ');
}

// ---- Storage ----

/** The two Storage methods used here, so tests can pass a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyFor = (studentId: string) => `clinical-keys.weak-words.v1.${studentId}`;

export const serializeRecord = (rec: WeakRecord): string => JSON.stringify(rec);

/** Reads a stored record, dropping anything malformed. Never throws. */
export function parseRecord(raw: string | null): WeakRecord {
  if (!raw) return emptyRecord();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return emptyRecord(); }
  const runs = (data as { runs?: unknown } | null)?.runs;
  if (!Array.isArray(runs)) return emptyRecord();
  const clean: WeakRun[] = [];
  for (const r of runs) {
    if (!r || typeof r !== 'object') continue;
    const { at, missed, ok } = r as { at?: unknown; missed?: unknown; ok?: unknown };
    const m: Record<string, number> = {};
    if (missed && typeof missed === 'object') {
      for (const [w, n] of Object.entries(missed)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) m[w] = Math.floor(n);
    }
    clean.push({ at: typeof at === 'string' ? at : '', missed: m, ok: Array.isArray(ok) ? ok.filter((w): w is string => typeof w === 'string') : [] });
  }
  return { runs: clean.slice(-MAX_RUNS) };
}

/** The browser's localStorage, or undefined where it is blocked (private windows, some school Chromebooks). */
export function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function loadRecord(storage: StorageLike | undefined, studentId: string): WeakRecord {
  try { return parseRecord(storage?.getItem(keyFor(studentId)) ?? null); } catch { return emptyRecord(); }
}

export function saveRecord(storage: StorageLike | undefined, studentId: string, rec: WeakRecord): void {
  try { storage?.setItem(keyFor(studentId), serializeRecord(rec)); } catch { /* storage full or blocked: the report is a nicety */ }
}
