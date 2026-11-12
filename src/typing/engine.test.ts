import { describe, expect, it } from 'vitest';
import { accuracy, applyInput, errorsLeft, finishRun, newRun, wpm } from './engine';

const T = 'Take 1 tablet by mouth once daily.';

describe('typing engine', () => {
  it('counts every keystroke, including corrected mistakes, toward accuracy', () => {
    let s = newRun();
    s = applyInput(s, T, 'Take 1 tablat', 0); // 'a' typed where 'e' belongs
    expect(s.wrong).toBe(1);
    s = applyInput(s, T, 'Take 1 tabl', 10); // backspace
    s = applyInput(s, T, 'Take 1 tablet', 20); // retype correctly: counted as a new keystroke
    expect(s.keys).toBe(13 + 2);
    expect(s.wrong).toBe(1);
    expect(errorsLeft(s, T)).toBe(0);
    expect(accuracy(s)).toBeCloseTo(((15 - 1) / 15) * 100, 0);
  });
  it('turns curly quotes into straight ones and never lets text exceed the target', () => {
    const s = applyInput(newRun(), 'It\'s "ok"', 'It’s “ok” and more', 0);
    expect(s.typed).toBe('It\'s "ok"');
  });
  it('computes WPM from correct characters only', () => {
    let s = applyInput(newRun(), T, T, 0);
    expect(s.start).toBe(0);
    // 34 chars in 12 seconds -> 34/5 words / 0.2 min = 34 WPM
    expect(wpm(s, T, 12_000)).toBe(34);
    s = applyInput(newRun(), T, 'Take 1 tablet by mouth once dailx.', 0);
    expect(errorsLeft(s, T)).toBe(1);
  });
  it('caps a timed run at its limit and ignores untyped text', () => {
    const long = 'abcde '.repeat(100);
    const s = applyInput(newRun(), long, 'abcde '.repeat(10), 0);
    const r = finishRun(s, long, 90_000, { limit: 60 });
    expect(r.seconds).toBe(60);
    expect(r.wpm).toBe(Math.round(60 / 5 / 1));
    expect(r.errorsLeft).toBe(0);
    expect(r.clean).toBe(true);
  });
  it('is not clean when errors are left, accuracy is under 95, or the answer was shown', () => {
    let s = applyInput(newRun(), T, 'Take 1 tablat', 0);
    expect(finishRun(s, T, 5000).completed).toBe(false);
    s = applyInput(newRun(), T, T, 0);
    expect(finishRun(s, T, 12000, { revealed: true }).completed).toBe(false);
    expect(finishRun(s, T, 12000).clean).toBe(true);
  });
});
