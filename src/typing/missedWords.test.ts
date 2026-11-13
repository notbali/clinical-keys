import { describe, expect, it } from 'vitest';
import { applyInput, finishRun, newRun, targetWords, wordKey } from './engine';

const T = 'Give hydrOXYzine 25 mg. Then hydrOXYzine again, daily.';

/** Feeds the textarea values in order, the way the browser would (each value is the whole box after one edit). */
function typeSteps(target: string, steps: string[]) {
  let s = newRun();
  steps.forEach((v, i) => { s = applyInput(s, target, v, i); });
  return s;
}

describe('wordKey', () => {
  it('drops punctuation around a word but keeps case and inner characters', () => {
    expect(wordKey('hydrOXYzine,')).toBe('hydrOXYzine');
    expect(wordKey('(mg/mL).')).toBe('mg/mL');
    expect(wordKey('1/2')).toBe('1/2');
    expect(wordKey('--')).toBe('');
  });
});

describe('targetWords', () => {
  it('splits on whitespace with character positions', () => {
    const text = 'Take 1 tablet.\nOnce daily';
    const w = targetWords(text);
    expect(w.map((x) => x.word)).toEqual(['Take', '1', 'tablet.', 'Once', 'daily']);
    expect(text.slice(w[2].start, w[2].end)).toBe('tablet.');
  });
});

describe('missed words in a run', () => {
  it('a clean run misses nothing', () => {
    const r = finishRun(typeSteps(T, [T]), T, 20_000);
    expect(r.missedWords).toEqual([]);
  });

  it('records a word typed wrong even when it was fixed afterwards', () => {
    const s = typeSteps(T, ['Give hydrOXYzo', 'Give hydrOXYz', T]);
    const r = finishRun(s, T, 20_000);
    expect(r.errorsLeft).toBe(0);
    expect(r.missedWords).toEqual([{ word: 'hydrOXYzine', count: 1 }]);
  });

  it('counts one place a word was missed once, however many wrong keystrokes it took', () => {
    const s = typeSteps(T, ['Give hydrOXYzxx', 'Give hydrOXYz', 'Give hydrOXYzyy', 'Give hydrOXYz', T]);
    expect(finishRun(s, T, 20_000).missedWords).toEqual([{ word: 'hydrOXYzine', count: 1 }]);
  });

  it('counts separate misses of the same word and sorts the most missed first', () => {
    const second = 'Give hydrOXYzine 25 mg. Then hydrOXYzinq';
    const s = typeSteps(T, ['Give hydrOXYzinq', 'Give hydrOXYzin', 'Give hydrOXYzine 25 mg. Then ', second, 'Give hydrOXYzine 25 mg. Then hydrOXYzin', T]);
    expect(finishRun(s, T, 20_000).missedWords).toEqual([{ word: 'hydrOXYzine', count: 2 }]);

    const g = typeSteps(T, ['Gove', 'Gov', 'Give hydrOXYzinq', 'Give hydrOXYzin', T]);
    expect(finishRun(g, T, 20_000).missedWords).toEqual([
      { word: 'Give', count: 1 },
      { word: 'hydrOXYzine', count: 1 },
    ]);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    const t = 'beta alpha';
    const s = typeSteps(t, ['x', '', 'beta x', 'beta ', t]);
    expect(finishRun(s, t, 5000).missedWords).toEqual([
      { word: 'alpha', count: 1 },
      { word: 'beta', count: 1 },
    ]);
  });

  it('counts a missed punctuation mark against its word, and ignores a wrong key in the gap between words', () => {
    const s = typeSteps(T, ['Give hydrOXYzine 25 mg,', 'Give hydrOXYzine 25 mg']);
    expect(finishRun(s, T, 5000).missedWords).toEqual([{ word: 'mg', count: 1 }]);
    const t2 = 'one two';
    const s3 = typeSteps(t2, ['one-two']);
    expect(finishRun(s3, t2, 5000).missedWords).toEqual([]);
  });

  it('ignores one-letter words', () => {
    const t = 'a b cd';
    expect(finishRun(typeSteps(t, ['x y zz']), t, 5000).missedWords).toEqual([{ word: 'cd', count: 1 }]);
  });

  it('lists words fully typed without a miss, and not words never reached', () => {
    const t = 'alpha beta gamma delta';
    const s = typeSteps(t, ['alpha bexa', 'alpha bet', 'alpha beta gam']);
    const r = finishRun(s, t, 5000, { limit: 60 });
    expect(r.cleanWords).toEqual(['alpha']);
    expect(r.missedWords).toEqual([{ word: 'beta', count: 1 }]);
  });

  it('does not change the existing scoring fields', () => {
    const s = typeSteps(T, ['Give hydrOXYzo']);
    const r = finishRun(s, T, 5000);
    expect(r.wrong).toBe(1);
    expect(r.keys).toBe(14);
  });
});
