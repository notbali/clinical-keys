import { describe, expect, it } from 'vitest';
import { diffTokens, tokenize } from './wordDiff';

describe('tokenize', () => {
  it('splits on any whitespace, including line breaks, and keeps punctuation and case', () => {
    expect(tokenize('Pain 3/10, right knee.\nPlan:  rest')).toEqual(['Pain', '3/10,', 'right', 'knee.', 'Plan:', 'rest']);
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' \n ')).toEqual([]);
  });
});

describe('diffTokens: typed words against the target words', () => {
  it('marks identical text as all ok, with the position of each word', () => {
    expect(diffTokens(['a', 'b'], ['a', 'b'])).toEqual([
      { kind: 'ok', typed: 'a', target: 'a', typedIndex: 0, targetIndex: 0 },
      { kind: 'ok', typed: 'b', target: 'b', typedIndex: 1, targetIndex: 1 },
    ]);
  });

  it('finds a wrong word, with both positions, in a gap numbered 0', () => {
    expect(diffTokens(['a', 'x', 'c'], ['a', 'b', 'c'])[1]).toEqual({ kind: 'wrong', typed: 'x', target: 'b', typedIndex: 1, targetIndex: 1, gap: 0 });
  });

  it('finds a skipped word and an extra word', () => {
    expect(diffTokens(['a', 'c'], ['a', 'b', 'c'])[1]).toEqual({ kind: 'missed', target: 'b', targetIndex: 1, gap: 0 });
    expect(diffTokens(['a', 'x', 'b'], ['a', 'b'])[1]).toEqual({ kind: 'extra', typed: 'x', typedIndex: 1, gap: 0 });
  });

  it('numbers separate gaps in order and leaves matching words without a gap', () => {
    const ops = diffTokens(['a', 'X', 'c', 'Y', 'e'], ['a', 'b', 'c', 'd', 'e']);
    expect(ops.map((o) => [o.kind, o.gap])).toEqual([['ok', undefined], ['wrong', 0], ['ok', undefined], ['wrong', 1], ['ok', undefined]]);
  });

  it('keeps one run of different words together as one gap: wrong pairs first, then the leftovers', () => {
    const ops = diffTokens(['a', 'x', 'y', 'z', 'e'], ['a', 'b', 'e']);
    expect(ops.slice(1, 4).map((o) => [o.kind, o.gap])).toEqual([['wrong', 0], ['extra', 0], ['extra', 0]]);
    const ops2 = diffTokens(['a', 'x', 'e'], ['a', 'b', 'c', 'd', 'e']);
    expect(ops2.slice(1, 4).map((o) => [o.kind, o.gap])).toEqual([['wrong', 0], ['missed', 0], ['missed', 0]]);
  });

  it('lines the words up again after a skip, so one missing word is one problem', () => {
    const ops = diffTokens(['the', 'patient', 'a', 'cough'], ['the', 'patient', 'has', 'a', 'cough']);
    expect(ops.filter((o) => o.kind !== 'ok')).toEqual([{ kind: 'missed', target: 'has', targetIndex: 2, gap: 0 }]);
  });

  it('is exact: capital letters and punctuation make words different', () => {
    expect(diffTokens(['hydralazine'], ['hydrALAZINE'])[0].kind).toBe('wrong');
    expect(diffTokens(['5.0'], ['5'])[0].kind).toBe('wrong');
    expect(diffTokens(['knee'], ['knee.'])[0].kind).toBe('wrong');
  });

  it('handles empty input on either side', () => {
    expect(diffTokens([], ['a', 'b']).map((o) => o.kind)).toEqual(['missed', 'missed']);
    expect(diffTokens(['a'], []).map((o) => o.kind)).toEqual(['extra']);
    expect(diffTokens([], [])).toEqual([]);
  });
});
