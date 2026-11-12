import { createContext, useCallback, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode } from 'react';
import type { Api } from './api';
import { createDemoApi } from './demoApi';
import { DEFAULT_SETTINGS, type Session, type Settings } from './types';

const ApiContext = createContext<Api | null>(null);

/** Picks the back end. With no Supabase settings in the environment the app runs on the demo adapter. */
function createApi(): Api {
  return createDemoApi();
}

interface SessionState {
  /** undefined while loading, null when signed out. */
  session: Session | null | undefined;
  settings: Settings;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<SessionState | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const api = useMemo(createApi, []);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(async () => {
    const [s, cfg] = await Promise.all([api.getSession(), api.getSettings()]);
    setSession(s);
    setSettings(cfg);
  }, [api]);
  const signOut = useCallback(async () => { await api.signOut(); await refresh(); }, [api, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({ session, settings, refresh, signOut }), [session, settings, refresh, signOut]);
  return (
    <ApiContext.Provider value={api}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </ApiContext.Provider>
  );
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside Providers');
  return api;
}
export function useSession(): SessionState {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside Providers');
  return s;
}

export interface Loaded<T> { data: T | undefined; error: string | null; loading: boolean; reload: () => void }

/** Runs an async loader and re-runs it when `deps` change or `reload()` is called. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    load().then(
      (d) => { if (live) { setData(d); setError(null); setLoading(false); } },
      (e: unknown) => { if (live) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); } },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
