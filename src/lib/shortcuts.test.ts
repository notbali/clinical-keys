import { describe, expect, it } from 'vitest';
import { resultShortcut, RESULT_GRACE_MS, type KeyInfo } from './shortcuts';

const k = (over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: 'Enter', ctrl: false, meta: false, alt: false, shift: false, repeat: false, target: 'other', ...over,
});

describe('result shortcuts', () => {
  const ok = { hasResult: true, msSinceFinish: RESULT_GRACE_MS + 50 };
  it('Enter starts the next passage and Escape tries again', () => {
    expect(resultShortcut(k({ key: 'Enter' }), ok)).toBe('next');
    expect(resultShortcut(k({ key: 'Escape' }), ok)).toBe('again');
  });
  it('does nothing before there is a result', () => {
    expect(resultShortcut(k(), { hasResult: false, msSinceFinish: 99999 })).toBeNull();
  });
  it('ignores keys right after finishing, so a habitual Enter does not skip the result', () => {
    expect(resultShortcut(k(), { hasResult: true, msSinceFinish: 100 })).toBeNull();
    expect(resultShortcut(k({ key: 'Escape' }), { hasResult: true, msSinceFinish: 100 })).toBeNull();
  });
  it('lets buttons, links and fields handle their own Enter', () => {
    for (const target of ['button', 'link', 'field'] as const) {
      expect(resultShortcut(k({ target }), ok)).toBeNull();
    }
  });
  it('ignores held keys and modified keys', () => {
    expect(resultShortcut(k({ repeat: true }), ok)).toBeNull();
    expect(resultShortcut(k({ ctrl: true }), ok)).toBeNull();
    expect(resultShortcut(k({ meta: true }), ok)).toBeNull();
    expect(resultShortcut(k({ alt: true }), ok)).toBeNull();
    expect(resultShortcut(k({ shift: true }), ok)).toBeNull();
  });
  it('ignores other keys', () => {
    expect(resultShortcut(k({ key: 'a' }), ok)).toBeNull();
    expect(resultShortcut(k({ key: ' ' }), ok)).toBeNull();
  });
});
