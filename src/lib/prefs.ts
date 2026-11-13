import { browserStore, type KeyValueStore } from './resume';

/**
 * Per-browser display preferences. They are stored in localStorage and applied as data attributes on <html>;
 * theme.css turns the attributes into larger text, the Atkinson Hyperlegible font, higher contrast and no motion.
 */
export interface Prefs {
  textSize: 'normal' | 'large' | 'xlarge';
  font: 'default' | 'dyslexia';
  contrast: 'normal' | 'high';
  /** "system" follows the operating system setting; "reduce" always turns motion off. */
  motion: 'system' | 'reduce';
}

export const PREFS_KEY = 'ck:prefs';

export const PREF_OPTIONS: { [K in keyof Prefs]: readonly Prefs[K][] } = {
  textSize: ['normal', 'large', 'xlarge'],
  font: ['default', 'dyslexia'],
  contrast: ['normal', 'high'],
  motion: ['system', 'reduce'],
};

export const DEFAULT_PREFS: Prefs = { textSize: 'normal', font: 'default', contrast: 'normal', motion: 'system' };

const valid = <K extends keyof Prefs>(k: K, v: unknown): v is Prefs[K] => (PREF_OPTIONS[k] as readonly unknown[]).includes(v);

/** Reads stored preferences. Each field is checked on its own, so one bad value does not reset the rest. */
export function parsePrefs(raw: string | null): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  if (!raw) return out;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return out; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  const r = o as Record<string, unknown>;
  if (valid('textSize', r.textSize)) out.textSize = r.textSize;
  if (valid('font', r.font)) out.font = r.font;
  if (valid('contrast', r.contrast)) out.contrast = r.contrast;
  if (valid('motion', r.motion)) out.motion = r.motion;
  return out;
}

export const serializePrefs = (p: Prefs): string => JSON.stringify(p);

export function updatePref<K extends keyof Prefs>(p: Prefs, key: K, value: Prefs[K]): Prefs {
  return valid(key, value) ? { ...p, [key]: value } : p;
}

/** The attributes to put on <html>. */
export function prefsToAttributes(p: Prefs): Record<string, string> {
  return { 'data-text': p.textSize, 'data-font': p.font, 'data-contrast': p.contrast, 'data-motion': p.motion };
}

export function loadPrefs(store: KeyValueStore | null = browserStore()): Prefs {
  try { return parsePrefs(store?.getItem(PREFS_KEY) ?? null); } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(store: KeyValueStore | null, p: Prefs): void {
  try { store?.setItem(PREFS_KEY, serializePrefs(p)); } catch { /* the choice still applies for this visit */ }
}

/** Applies preferences to the page. The only function here that touches the DOM. */
export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(prefsToAttributes(p))) root.setAttribute(k, v);
}
