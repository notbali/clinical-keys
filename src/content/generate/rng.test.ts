import { describe, expect, it } from 'vitest';
import { chance, hashSeed, int, mulberry32, pick, shuffle } from './rng';

describe('mulberry32 (a seeded random source)', () => {
  it('gives the same sequence for the same seed, so a passage can be reproduced from its seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('gives different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(1)));
    const b = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(2)));
    expect(a).not.toEqual(b);
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 5000; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe('hashSeed', () => {
  it('is stable and is a whole number that fits a database integer', () => {
    expect(hashSeed('ma-gen-soap', 123)).toBe(hashSeed('ma-gen-soap', 123));
    for (const s of ['a', 'ma-gen-soap', 'rx-gen-labels']) for (const n of [0, 1, 2147483647]) {
      const h = hashSeed(s, n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(2147483647);
    }
  });

  it('depends on every part and on their order', () => {
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('b', 'a'));
    expect(hashSeed('ma-gen-soap', 1)).not.toBe(hashSeed('ma-gen-soap', 2));
    expect(hashSeed('ma-gen-soap', 1)).not.toBe(hashSeed('ma-gen-phone', 1));
  });
});

describe('int, pick, shuffle, chance', () => {
  it('int is inclusive at both ends and reaches every value', () => {
    const r = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(int(r, 5, 9));
    expect([...seen].sort()).toEqual([5, 6, 7, 8, 9]);
    expect(int(r, 4, 4)).toBe(4);
  });

  it('pick only returns members, and reaches all of them', () => {
    const r = mulberry32(4);
    const items = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pick(r, items));
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const r = mulberry32(5);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(r, input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it('chance follows its probability', () => {
    const r = mulberry32(6);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (chance(r, 0.25)) hits++;
    expect(hits / 4000).toBeGreaterThan(0.2);
    expect(hits / 4000).toBeLessThan(0.3);
    expect(chance(r, 0)).toBe(false);
    expect(chance(r, 1)).toBe(true);
  });
});
