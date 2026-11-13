import { describe, expect, it } from 'vitest';
import { answerCard, betterRound, isRoundBest, maxScore, newGame, pointsFor, type GameState } from './flashcardGame';
import { readBest, writeBest, type KeyValueStore } from './localBest';

const play = (answers: boolean[]): GameState => answers.reduce((s, a) => answerCard(s, a).state, newGame());

describe('flash card scoring', () => {
  it('gives 10 points for a right answer and 2 more for each right answer already in a row, up to 10 more', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(pointsFor)).toEqual([10, 12, 14, 16, 18, 20, 20, 20]);
  });

  it('gives nothing for a wrong answer and starts the streak over', () => {
    const s = play([true, true, false]);
    expect(s).toMatchObject({ answered: 3, correct: 2, streak: 0, bestStreak: 2, score: 10 + 12 });
    expect(answerCard(s, false).points).toBe(0);
    expect(answerCard(s, true).points).toBe(10);
    expect(answerCard(s, true).state.streak).toBe(1);
  });

  it('remembers the longest streak, and does not change the state it is given', () => {
    const s = play([true, true, true, false, true, true]);
    expect(s.bestStreak).toBe(3);
    expect(s.streak).toBe(2);
    expect(s.results).toEqual([true, true, true, false, true, true]);
    const before = JSON.stringify(s);
    answerCard(s, true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('has a top score for a round that a perfect round reaches exactly', () => {
    expect(maxScore(10)).toBe(170);
    expect(play(Array(10).fill(true)).score).toBe(maxScore(10));
    expect(maxScore(0)).toBe(0);
    expect(maxScore(1)).toBe(10);
  });
});

describe('the local best', () => {
  const round = (score: number, over = {}) => ({ score, correct: 8, size: 10, bestStreak: 4, ...over });

  it('a higher score is a new best; a tie goes to the longer streak; nothing else counts', () => {
    expect(betterRound(null, round(50))).toBe(true);
    expect(betterRound(round(50), round(51))).toBe(true);
    expect(betterRound(round(50), round(49))).toBe(false);
    expect(betterRound(round(50), round(50))).toBe(false);
    expect(betterRound(round(50), round(50, { bestStreak: 5 }))).toBe(true);
    expect(betterRound(null, round(0, { correct: 0 }))).toBe(false);
  });

  it('only a full round counts', () => {
    expect(betterRound(null, round(60, { correct: 5, size: 5 }), 10)).toBe(false);
    expect(betterRound(null, round(60), 10)).toBe(true);
  });

  it('reads back only what looks like a saved best', () => {
    expect(isRoundBest(round(50))).toBe(true);
    for (const bad of [null, 5, 'x', {}, { score: '5' }, { score: -1, correct: 1, size: 10, bestStreak: 1 }, { score: 5, correct: 11, size: 10, bestStreak: 1 }]) expect(isRoundBest(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe('localBest storage', () => {
  const fake = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('saves and reads a value as JSON', () => {
    const s = fake();
    expect(writeBest(s, 'k', { a: 1 })).toBe(true);
    expect(readBest(s, 'k', (v): v is { a: number } => typeof (v as { a?: unknown })?.a === 'number')).toEqual({ a: 1 });
  });

  it('returns null for missing, broken or wrong-shaped data, with no store, and when the store throws', () => {
    const s = fake();
    const isNum = (v: unknown): v is number => typeof v === 'number';
    expect(readBest(s, 'missing', isNum)).toBeNull();
    s.data.set('bad', '{not json');
    expect(readBest(s, 'bad', isNum)).toBeNull();
    s.data.set('shape', '"text"');
    expect(readBest(s, 'shape', isNum)).toBeNull();
    expect(readBest(null, 'k', isNum)).toBeNull();
    expect(writeBest(null, 'k', 1)).toBe(false);
    const broken: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(readBest(broken, 'k', isNum)).toBeNull();
    expect(writeBest(broken, 'k', 1)).toBe(false);
  });
});
