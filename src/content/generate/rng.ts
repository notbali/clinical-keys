/**
 * A seeded random source. Generated passages are built from one of these, so the same seed always gives the same
 * passage: a result can be reproduced from its seed, and tests are repeatable.
 */
export type Rng = () => number;

/** Small, fast 32-bit generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Folds a drill id and a seed (or any parts) into one whole number from 0 to 2147483647, so drills do not share sequences. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.map((p) => `${p}|`).join('')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) % 2147483648;
}

/** A whole number from `min` to `max`, both included. */
export const int = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** A shuffled copy. The input is left alone. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const chance = (rng: Rng, p: number): boolean => rng() < p;
