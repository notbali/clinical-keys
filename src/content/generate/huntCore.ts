import { plantedErrors } from '../../lib/errorHunt';
import type { HuntError, Patient } from '../types';
import { int, shuffle, type Rng } from './rng';

/**
 * Generated error hunts: a correct note is made first (by the SOAP, phone, vitals or label generators), then three or four
 * mistakes are planted by replacing whole words. Every candidate mistake is a "plant": a run of words to swap for other
 * words, with the reason. Plants never touch or overlap, so each one is independent and findable on its own, and the list
 * of errors is kept in the order they appear in the note. The finished pair is checked with the same diff the hunt screen
 * uses (plantedErrors), so what is declared is exactly what the student will be scored against.
 */

/** A run of words [start, end) of the correct note to replace with `to` (empty `to` takes the words out). */
export interface Plant { start: number; end: number; to: string[]; error: HuntError }

export interface HuntCx {
  /** The words of the correct note, split on spaces (line breaks are kept in `lines`). */
  tokens: string[];
  /** The line each word is on, from 0. */
  lines: number[];
  rng: Rng;
  /** The banner patient, when the note is about one. */
  patient?: Patient;
  /** The scenario line shows the prescription, so a wrong dose or unit can be found by checking against it. */
  reference: boolean;
}
export type Mutator = (cx: HuntCx) => Plant[];

/** "(98.6)," -> ["(", "98.6", "),"]: the punctuation around a word stays when its body is replaced. */
export const splitTok = (t: string): [string, string, string] => {
  const m = /^([("]*)(.*?)([.,;:)]*)$/.exec(t)!;
  return [m[1], m[2], m[3]];
};
export const bodyOf = (t: string): string => splitTok(t)[1];
export const withBody = (t: string, body: string): string => { const [pre, , post] = splitTok(t); return `${pre}${body}${post}`; };

export function tokenizeNote(text: string): { tokens: string[]; lines: number[] } {
  const tokens: string[] = [];
  const lines: number[] = [];
  text.split('\n').forEach((line, i) => { for (const w of line.split(' ').filter(Boolean)) { tokens.push(w); lines.push(i); } });
  return { tokens, lines };
}

/** One word replaced by one other word, keeping the punctuation around it. */
export const swapWord = (cx: HuntCx, i: number, body: string, error: HuntError): Plant => ({ start: i, end: i + 1, to: [withBody(cx.tokens[i], body)], error });

function render(cx: HuntCx, plants: Plant[]): string {
  const out: { w: string; line: number }[] = [];
  let at = 0;
  for (const p of [...plants].sort((a, b) => a.start - b.start)) {
    for (; at < p.start; at++) out.push({ w: cx.tokens[at], line: cx.lines[at] });
    for (const w of p.to) out.push({ w, line: cx.lines[p.start] });
    at = p.end;
  }
  for (; at < cx.tokens.length; at++) out.push({ w: cx.tokens[at], line: cx.lines[at] });
  const lines: string[][] = [];
  for (const { w, line } of out) (lines[line] ??= []).push(w);
  return lines.map((l) => (l ?? []).join(' ')).join('\n');
}

/** Picks `want` compatible plants: no two touching, a different category each time where possible, never more than two of one. */
function choose(rng: Rng, candidates: Plant[], want: number): Plant[] {
  const picked: Plant[] = [];
  const fits = (p: Plant) => picked.every((q) => p.end < q.start || q.end < p.start);
  const order = shuffle(rng, candidates);
  for (const pass of [0, 1]) {
    for (const p of order) {
      if (picked.length >= want) break;
      if (picked.includes(p) || !fits(p)) continue;
      const same = picked.filter((q) => q.error.category === p.error.category).length;
      if (pass === 0 ? same > 0 : same >= 2) continue;
      picked.push(p);
    }
  }
  return picked.sort((a, b) => a.start - b.start);
}

export interface PlantedNote { flawed: string; errors: HuntError[] }

/** Plants three or four errors in `text`, or returns null when this note does not have enough room for them. */
export function plantNote(text: string, mutators: Mutator[], base: Omit<HuntCx, 'tokens' | 'lines'>): PlantedNote | null {
  const { tokens, lines } = tokenizeNote(text);
  const cx: HuntCx = { ...base, tokens, lines };
  const candidates = mutators.flatMap((m) => m(cx));
  for (let attempt = 0; attempt < 12; attempt++) {
    const want = int(base.rng, 3, 4);
    const plants = choose(base.rng, candidates, want);
    if (plants.length < 3) return null;
    const flawed = render(cx, plants);
    if (flawed === text) continue;
    // The declared errors must be exactly what the hunt screen will find, word for word.
    const found = plantedErrors(flawed, text);
    const same = found.length === plants.length && found.every((f, i) => f.flawed === plants[i].to.join(' ') && f.fixed === tokens.slice(plants[i].start, plants[i].end).join(' '));
    if (same) return { flawed, errors: plants.map((p) => p.error) };
  }
  return null;
}
