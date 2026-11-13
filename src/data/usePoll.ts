import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Runs `load` now and then every `ms` milliseconds while `enabled`. One call at a time (a slow answer never piles up),
 * and a failed poll keeps the last good data and shows the error until the next one works.
 */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: DependencyList, enabled = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(load);
  latest.current = load;
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const d = await latest.current();
        if (live) { setData(d); setError(null); }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally { busy = false; }
    };
    void run();
    const id = setInterval(() => void run(), ms);
    return () => { live = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, enabled, tick, ...deps]);

  return { data, error, refresh };
}
