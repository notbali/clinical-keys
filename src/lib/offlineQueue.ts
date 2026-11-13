import type { NewAttempt } from '../data/api';
import type { Attempt } from '../data/types';
import type { KeyValueStore } from './resume';

/**
 * Flaky-wifi tolerance. A run that fails to save is kept in localStorage (one queue per student) and retried with
 * exponential backoff, when the browser goes back online, and on the next page load, until the server has it.
 *
 * Double-saving: the API has no idempotency key, so a request whose response was lost may already be stored. Before
 * re-sending a queued run we fetch the student's own runs and skip the send if an identical run (same drill, passage,
 * day, activity and scores) was created after the run was queued, allowing 10 minutes of clock difference. A second
 * browser tab is kept out by a short-lived lock in localStorage.
 *
 * Remaining risk: (1) two tabs racing inside the few milliseconds between reading and writing the lock could both
 * send; (2) a device clock more than 10 minutes off the server's lets a lost-response duplicate slip through;
 * (3) a run that the server permanently rejects stays queued (retrying every 5 minutes at most) and the banner keeps
 * showing it, which is deliberate: runs are never silently dropped; (4) if the browser blocks localStorage, a run that
 * fails to save exists only on screen. A durable fix is a client-generated id column checked by the database.
 */

export const QUEUE_VERSION = 1;
export const MAX_QUEUE = 200;
export const BASE_BACKOFF_MS = 2000;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const LOCK_TTL_MS = 30_000;
const CLOCK_SKEW_MS = 10 * 60 * 1000;

export interface QueueEntry {
  id: string;
  attempt: NewAttempt;
  /** Wall-clock time the run was queued. */
  queuedAt: number;
  /** How many saves of this run have failed so far. */
  tries: number;
  /** Wall-clock time of the next automatic retry. */
  nextAt: number;
}
export interface QueueState { entries: QueueEntry[] }

export const EMPTY_QUEUE: QueueState = { entries: [] };

export const queueKey = (studentId: string) => `ck:save-queue:${studentId}`;
const lockKey = (studentId: string) => `${queueKey(studentId)}:lock`;

export const backoffMs = (tries: number): number => Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (Math.max(1, tries) - 1));

export const pendingCount = (q: QueueState): number => q.entries.length;

export function enqueue(q: QueueState, attempt: NewAttempt, id: string, now: number): QueueState {
  const entries = [...q.entries, { id, attempt, queuedAt: now, tries: 1, nextAt: now + backoffMs(1) }];
  return { entries: entries.length > MAX_QUEUE ? entries.slice(entries.length - MAX_QUEUE) : entries };
}

export function markFailed(q: QueueState, id: string, now: number): QueueState {
  return { entries: q.entries.map((e) => (e.id === id ? { ...e, tries: e.tries + 1, nextAt: now + backoffMs(e.tries + 1) } : e)) };
}

export const markSaved = (q: QueueState, id: string): QueueState => ({ entries: q.entries.filter((e) => e.id !== id) });

export const retryAllNow = (q: QueueState, now: number): QueueState => ({ entries: q.entries.map((e) => ({ ...e, nextAt: now })) });

/** Runs ready to send, least-failed first so one rejected run cannot hold up the others. */
export function dueEntries(q: QueueState, now: number): QueueEntry[] {
  return q.entries.filter((e) => e.nextAt <= now).sort((a, b) => a.tries - b.tries || a.queuedAt - b.queuedAt);
}

/** Milliseconds until the next automatic retry, or null when nothing is waiting. */
export function nextWakeMs(q: QueueState, now: number): number | null {
  if (!q.entries.length) return null;
  return Math.max(0, Math.min(...q.entries.map((e) => e.nextAt)) - now);
}

// ---- Persistence ---------------------------------------------------------------------------------------------

export const serializeQueue = (q: QueueState): string => JSON.stringify({ v: QUEUE_VERSION, entries: q.entries });

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const bool = (v: unknown) => typeof v === 'boolean';

/** Only the fields the API requires are checked; any extra fields on the run are kept as they are. */
function validAttempt(a: unknown): a is NewAttempt {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  const r = a as Record<string, unknown>;
  return (r.kind === 'drill' || r.kind === 'sprint') && (r.track === 'ma' || r.track === 'rx')
    && num(r.passage) && num(r.wpm) && num(r.accuracy) && num(r.errorsLeft) && num(r.seconds)
    && bool(r.completed) && bool(r.clean) && bool(r.revealed)
    && (r.drillId === undefined || typeof r.drillId === 'string')
    && (r.day === undefined || num(r.day)) && (r.act === undefined || num(r.act));
}

export function parseQueue(raw: string | null): QueueState {
  if (!raw) return { entries: [] };
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return { entries: [] }; }
  if (!o || typeof o !== 'object') return { entries: [] };
  const r = o as Record<string, unknown>;
  if (r.v !== QUEUE_VERSION || !Array.isArray(r.entries)) return { entries: [] };
  const seen = new Set<string>();
  const entries: QueueEntry[] = [];
  for (const item of r.entries) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id || seen.has(e.id) || !validAttempt(e.attempt)) continue;
    seen.add(e.id);
    entries.push({
      id: e.id, attempt: e.attempt,
      queuedAt: num(e.queuedAt) ? (e.queuedAt as number) : 0,
      tries: num(e.tries) && (e.tries as number) >= 1 ? Math.floor(e.tries as number) : 1,
      nextAt: num(e.nextAt) ? (e.nextAt as number) : 0,
    });
  }
  return { entries: entries.length > MAX_QUEUE ? entries.slice(entries.length - MAX_QUEUE) : entries };
}

function readQueue(store: KeyValueStore | null, key: string): QueueState {
  try { return parseQueue(store?.getItem(key) ?? null); } catch { return { entries: [] }; }
}

/** False when the queue could not be written (storage blocked or full). */
function writeQueue(store: KeyValueStore | null, key: string, q: QueueState): boolean {
  if (!store) return false;
  try {
    if (q.entries.length) store.setItem(key, serializeQueue(q));
    else store.removeItem(key);
    return true;
  } catch { return false; }
}

/** The queue as stored right now (other tabs may have changed it). */
export const loadQueue = (store: KeyValueStore | null, studentId: string): QueueState => readQueue(store, queueKey(studentId));

// ---- Duplicate check -----------------------------------------------------------------------------------------

/** True if the server already holds this run: same scored fields, created after the run was queued. */
export function looksSaved(entry: QueueEntry, attempts: Attempt[]): boolean {
  const a = entry.attempt;
  return attempts.some((s) =>
    s.kind === a.kind && s.track === a.track && (s.drillId ?? null) === (a.drillId ?? null) && s.passage === a.passage
    && (s.day ?? null) === (a.day ?? null) && (s.act ?? null) === (a.act ?? null)
    && s.wpm === a.wpm && s.errorsLeft === a.errorsLeft && s.seconds === a.seconds
    && Math.abs(s.accuracy - a.accuracy) < 0.05
    && s.completed === a.completed && s.clean === a.clean && s.revealed === a.revealed
    && Date.parse(s.createdAt) >= entry.queuedAt - CLOCK_SKEW_MS);
}

// ---- Cross-tab lock ------------------------------------------------------------------------------------------

export function tryLock(raw: string | null, owner: string, now: number, ttl = LOCK_TTL_MS): { acquired: boolean; value: string } {
  if (raw) {
    try {
      const l = JSON.parse(raw) as { owner?: unknown; until?: unknown };
      if (typeof l.owner === 'string' && typeof l.until === 'number' && l.owner !== owner && l.until >= now) return { acquired: false, value: raw };
    } catch { /* corrupt lock counts as free */ }
  }
  return { acquired: true, value: JSON.stringify({ owner, until: now + ttl }) };
}

/** The lock value to keep after `owner` releases: null (delete it) if it was theirs. */
export function releaseLock(raw: string | null, owner: string): string | null {
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as { owner?: unknown };
    return l.owner === owner ? null : raw;
  } catch { return null; }
}

// ---- Saving and flushing -------------------------------------------------------------------------------------

export interface FlushDeps {
  store: KeyValueStore | null;
  studentId: string;
  /** Sends one run to the server; rejects on failure. */
  save: (a: NewAttempt) => Promise<unknown>;
  /** The signed-in student's own runs, used for the duplicate check. */
  list: () => Promise<Attempt[]>;
  now: () => number;
  /** Identifies this tab for the lock. */
  owner: string;
  newId: () => string;
}

/** Tries to save a finished run. If that fails, the run goes into the queue. */
export async function submitAttempt(d: FlushDeps, attempt: NewAttempt): Promise<'saved' | 'queued' | 'failed'> {
  try {
    await d.save(attempt);
    return 'saved';
  } catch {
    const key = queueKey(d.studentId);
    const q = enqueue(readQueue(d.store, key), attempt, d.newId(), d.now());
    return writeQueue(d.store, key, q) ? 'queued' : 'failed';
  }
}

export interface FlushResult { saved: number; remaining: number; skipped?: 'locked' }

/**
 * Sends the runs that are due (all of them when `force`, e.g. the browser just came back online). Stops at the first
 * failure and leaves the rest for the next timer, so an offline browser makes one request, not one per run.
 */
export async function flushQueue(d: FlushDeps, opts: { force?: boolean } = {}): Promise<FlushResult> {
  const key = queueKey(d.studentId);
  const lk = lockKey(d.studentId);
  const start = readQueue(d.store, key);
  if (!start.entries.length || !d.store) return { saved: 0, remaining: start.entries.length };
  if (!opts.force && !dueEntries(start, d.now()).length) return { saved: 0, remaining: start.entries.length };

  const lock = tryLock(safeGet(d.store, lk), d.owner, d.now());
  if (!lock.acquired) return { saved: 0, remaining: start.entries.length, skipped: 'locked' };
  safeSet(d.store, lk, lock.value);

  let saved = 0;
  try {
    if (opts.force) writeQueue(d.store, key, retryAllNow(readQueue(d.store, key), d.now()));
    let known: Attempt[] | null = null;
    for (;;) {
      const entry = dueEntries(readQueue(d.store, key), d.now())[0];
      if (!entry) break;
      try {
        known ??= await d.list();
        if (!looksSaved(entry, known)) await d.save(entry.attempt);
      } catch {
        writeQueue(d.store, key, markFailed(readQueue(d.store, key), entry.id, d.now()));
        break;
      }
      writeQueue(d.store, key, markSaved(readQueue(d.store, key), entry.id));
      saved++;
    }
  } finally {
    const kept = releaseLock(safeGet(d.store, lk), d.owner);
    if (kept == null) safeRemove(d.store, lk); else safeSet(d.store, lk, kept);
  }
  return { saved, remaining: readQueue(d.store, key).entries.length };
}

const safeGet = (s: KeyValueStore, k: string) => { try { return s.getItem(k); } catch { return null; } };
const safeSet = (s: KeyValueStore, k: string, v: string) => { try { s.setItem(k, v); } catch { /* ignore */ } };
const safeRemove = (s: KeyValueStore, k: string) => { try { s.removeItem(k); } catch { /* ignore */ } };
