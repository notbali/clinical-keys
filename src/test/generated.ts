import { expect } from 'vitest';
import { FDA_TALL_MAN } from './tallman';

/** Chart dates the generator tests run against: a normal day, a leap day (age maths), and New Year's Day (year rollover). */
export const CHART_DATES = ['2026-11-12', '2028-02-29', '2027-01-01'] as const;

/** `n` different seeds, always the same ones. */
export const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => 1000 + i * 7919);

/** Whole years between a MM/DD/YYYY date of birth and an ISO date. Written out independently of the generator. */
export const ageOnDate = (dob: string, iso: string): number => {
  const [m, d, y] = dob.split('/').map(Number);
  const [ty, tm, td] = iso.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

/** Lowercase name -> the FDA's Tall Man spelling. */
export const FDA_BY_LOWER = new Map([...FDA_TALL_MAN].map((n) => [n.toLowerCase(), n]));

/** The same rules the hand-written drills must pass: ASCII and Enter only, no stray spaces, no blank lines. */
export function expectTypeable(text: string, where: string): void {
  expect(text, where).toMatch(/^[\x20-\x7E\n]+$/);
  expect(text, `${where}: leading or trailing space`).toBe(text.trim());
  expect(text, `${where}: double space`).not.toMatch(/ {2}/);
  for (const line of text.split('\n')) {
    expect(line.length, `${where}: blank line`).toBeGreaterThan(0);
    expect(line, `${where}: trailing space`).toBe(line.trimEnd());
  }
}

/** Do-not-use abbreviations, trailing zeros and missing leading zeros are never modeled as correct output. */
export function expectSafeNotation(text: string, where: string): void {
  expect(text, where).not.toMatch(/\b(QD|Q\.D\.|QOD|Q\.O\.D\.|IU|MSO4|MgSO4|MS|U)\b/);
  expect(text, where).not.toMatch(/\b\d+\.0+ ?(mg|mcg|g|mL|units)\b/i);
  expect(text, where).not.toMatch(/(^|[^\d.])\.\d+ ?(mg|mcg|g|mL)\b/i);
}

/** Every drug name that is on the FDA Tall Man list must be spelled exactly as the FDA spells it. */
export function expectTallManNames(text: string, where: string): void {
  for (const w of text.match(/[A-Za-z]{5,}/g) ?? []) {
    const fda = FDA_BY_LOWER.get(w.toLowerCase());
    if (fda) expect(w, `${where}: "${w}" must use Tall Man lettering`).toBe(fda);
  }
}

/** The html fragments in `ctx` are trusted markup: tags balanced and ampersands escaped. */
export function expectValidCtx(html: string, where: string): void {
  expect(html.trim().length, where).toBeGreaterThan(0);
  for (const tag of ['b', 'code']) {
    const open = (html.match(new RegExp(`<${tag}>`, 'g')) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    expect(open, `${where}: <${tag}> balance in ${html}`).toBe(close);
  }
  expect(html, where).not.toMatch(/&(?!amp;|nbsp;|lt;|gt;)/);
  expect(html, where).not.toMatch(/<(?!\/?(b|code)>)/);
}
