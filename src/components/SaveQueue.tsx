import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApi } from '../data/context';
import type { NewAttempt } from '../data/api';
import { flushQueue, loadQueue, nextWakeMs, pendingCount, submitAttempt, type FlushDeps } from '../lib/offlineQueue';
import { browserStore } from '../lib/resume';
import { Button } from './ui';

interface SaveQueueApi {
  /** Number of runs waiting on this device to upload. */
  pending: number;
  /** Saves a run now; if that fails the run is queued on this device and retried automatically. */
  submit: (a: NewAttempt) => Promise<'saved' | 'queued' | 'failed'>;
  /** Tries to upload everything waiting, right now. */
  retryNow: () => void;
}
const Ctx = createContext<SaveQueueApi | null>(null);

export function useSaveQueue(): SaveQueueApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSaveQueue must be used inside SaveQueueProvider');
  return c;
}

const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Holds the offline queue for the signed-in student. Flushes on load, when the browser comes back online, and on a backoff timer. */
export function SaveQueueProvider({ studentId, onSaved, children }: { studentId: string; onSaved: () => void; children: ReactNode }) {
  const api = useApi();
  const owner = useRef(randomId()).current;
  const busy = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const [pending, setPending] = useState(() => pendingCount(loadQueue(browserStore(), studentId)));
  const [tick, setTick] = useState(0);

  const deps = useMemo<FlushDeps>(() => ({
    store: browserStore(), studentId, owner, newId: randomId, now: () => Date.now(),
    save: (a) => api.saveAttempt(a), list: () => api.listAttempts(),
  }), [api, studentId, owner]);

  const refresh = useCallback(() => { setPending(pendingCount(loadQueue(deps.store, studentId))); setTick((n) => n + 1); }, [deps, studentId]);

  const flush = useCallback(async (force: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await flushQueue(deps, { force });
      if (r.saved > 0) onSavedRef.current();
    } finally { busy.current = false; refresh(); }
  }, [deps, refresh]);

  // On load, and whenever the browser says it is back online.
  useEffect(() => {
    void flush(true);
    const online = () => void flush(true);
    const storage = () => refresh(); // another tab changed the queue
    window.addEventListener('online', online);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('online', online); window.removeEventListener('storage', storage); };
  }, [flush, refresh]);

  // Backoff timer for the next retry.
  useEffect(() => {
    const wait = nextWakeMs(loadQueue(deps.store, studentId), Date.now());
    if (wait == null) return;
    const id = setTimeout(() => void flush(false), wait + 100);
    return () => clearTimeout(id);
  }, [tick, pending, deps, studentId, flush]);

  const submit = useCallback(async (a: NewAttempt) => {
    const r = await submitAttempt(deps, a);
    if (r === 'saved') onSavedRef.current();
    refresh();
    return r;
  }, [deps, refresh]);

  const value = useMemo<SaveQueueApi>(() => ({ pending, submit, retryNow: () => void flush(true) }), [pending, submit, flush]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Small banner shown while runs are waiting to upload. */
export function SaveQueueBanner() {
  const { pending, retryNow } = useSaveQueue();
  const [busy, setBusy] = useState(false);
  if (!pending) return null;
  return (
    <div className="queue-banner" role="status">
      <span><b>{pending} {pending === 1 ? 'run is' : 'runs are'} waiting to upload.</b> {pending === 1 ? 'It is' : 'They are'} saved on this device and will go up by themselves when your connection is back. Keep this page open or come back later.</span>
      <Button className="btn-sm" busy={busy} onClick={() => { setBusy(true); retryNow(); setTimeout(() => setBusy(false), 1500); }}>Try now</Button>
    </div>
  );
}
