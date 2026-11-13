/**
 * A personal best kept in this browser only (localStorage). It never leaves the device and is never graded.
 * Storage can be missing, full or blocked (private windows, locked-down school Chromebooks), so every call is
 * guarded and the screens work without it.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null when it cannot be reached. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The saved value, only if it is JSON that passes `isValid`. Anything else (missing, damaged, old shape) is null. */
export function readBest<T>(store: KeyValueStore | null, key: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

/** True when the value was saved. */
export function writeBest(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
