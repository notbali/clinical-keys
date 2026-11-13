import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, loadPrefs, parsePrefs, prefsToAttributes, savePrefs, serializePrefs, updatePref } from './prefs';
import type { KeyValueStore } from './resume';

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('parsePrefs', () => {
  it('returns the defaults for nothing, junk or the wrong shape', () => {
    for (const raw of [null, '', 'x', '[]', 'null', '7', '"large"']) expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
  });
  it('reads valid values', () => {
    const raw = JSON.stringify({ textSize: 'xlarge', font: 'dyslexia', contrast: 'high', motion: 'reduce' });
    expect(parsePrefs(raw)).toEqual({ textSize: 'xlarge', font: 'dyslexia', contrast: 'high', motion: 'reduce' });
  });
  it('keeps the valid fields and defaults only the invalid ones', () => {
    const raw = JSON.stringify({ textSize: 'gigantic', font: 'dyslexia', contrast: 3, motion: 'reduce', extra: 1 });
    expect(parsePrefs(raw)).toEqual({ ...DEFAULT_PREFS, font: 'dyslexia', motion: 'reduce' });
  });
  it('defaults are the plain look that follows the system', () => {
    expect(DEFAULT_PREFS).toEqual({ textSize: 'normal', font: 'default', contrast: 'normal', motion: 'system' });
  });
});

describe('serializePrefs', () => {
  it('round-trips', () => {
    const p = { textSize: 'large', font: 'dyslexia', contrast: 'high', motion: 'reduce' } as const;
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
  });
});

describe('updatePref', () => {
  it('changes one field and ignores an invalid value', () => {
    expect(updatePref(DEFAULT_PREFS, 'font', 'dyslexia').font).toBe('dyslexia');
    expect(updatePref(DEFAULT_PREFS, 'textSize', 'huge' as never)).toEqual(DEFAULT_PREFS);
  });
});

describe('prefsToAttributes', () => {
  it('sets every data attribute, with the plain look as explicit defaults', () => {
    expect(prefsToAttributes(DEFAULT_PREFS)).toEqual({ 'data-text': 'normal', 'data-font': 'default', 'data-contrast': 'normal', 'data-motion': 'system' });
  });
  it('maps chosen options', () => {
    expect(prefsToAttributes({ textSize: 'large', font: 'dyslexia', contrast: 'high', motion: 'reduce' }))
      .toEqual({ 'data-text': 'large', 'data-font': 'dyslexia', 'data-contrast': 'high', 'data-motion': 'reduce' });
  });
});

describe('storage', () => {
  it('saves and loads', () => {
    const s = new FakeStore();
    savePrefs(s, { ...DEFAULT_PREFS, contrast: 'high' });
    expect(s.getItem(PREFS_KEY)).toBeTruthy();
    expect(loadPrefs(s).contrast).toBe('high');
  });
  it('falls back to the defaults and never throws when storage is blocked', () => {
    const broken: KeyValueStore = {
      length: 0, key: () => null,
      getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, DEFAULT_PREFS)).not.toThrow();
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});
