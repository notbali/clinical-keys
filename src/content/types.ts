import type { ISODate } from '../lib/dates';
import type { Rng } from './generate/rng';

export type Track = 'ma' | 'rx';
/** copy: type what you see. hidden: type the answer to a prompt. hunt: find and fix the planted errors in a note. */
export type DrillMode = 'copy' | 'hidden' | 'hunt';

/** What kind of mistake was planted in an error hunt. */
export type HuntCategory = 'number' | 'unit' | 'spelling' | 'patient' | 'allergy' | 'tall-man' | 'do-not-use' | 'logic';

/** One planted mistake: shown to the student after they check their work. */
export interface HuntError { category: HuntCategory; why: string }

/** A fictional patient, shown in the chart banner above a passage. Must agree with the passage text (see patients.test.ts). */
export interface Patient {
  /** Display name, "Last, First" like a chart banner. */
  name: string;
  sex: 'F' | 'M';
  /** Shown as written, e.g. "45 y" or "6 mo". The passage text uses the same age. */
  age: string;
  /** MM/DD/YYYY. */
  dob: string;
  /** Fictional medical record number. */
  mrn: string;
  /** "NKDA" or a list like "Sulfa drugs (hives)". Never contradicts a drug in the passage. */
  allergies: string;
  provider?: string;
}

/** One passage inside a drill. `ctx` is our own trusted HTML shown above the passage. */
export interface Passage {
  ctx: string;
  /** What the student types or, in an error hunt, the correct note. */
  text: string;
  /** Error hunt only: the same note with mistakes planted in it. This is what the student edits. */
  flawed?: string;
  /** Error hunt only: one entry per planted mistake, in the order they appear in the note. */
  errors?: HuntError[];
  patient?: Patient;
}

export interface Drill {
  id: string;
  track: Track;
  mode: DrillMode;
  title: string;
  blurb: string;
  /** Trusted HTML explaining why the skill matters. */
  why: string;
  glossary?: boolean;
  /** A program typing test. Shown only through the program, never in the practice library. */
  exam?: boolean;
  items: Passage[];
}

/**
 * A drill whose passages are made fresh from a seed instead of written by hand (src/content/generate). It lives apart from
 * `Drill` on purpose: progress and grades are keyed by drill id and passage index, and a generated passage has no index.
 * A run saves the seed in the attempt's `passage` field, so the same passage can be rebuilt later.
 */
export interface GeneratedDrill extends Omit<Drill, 'items' | 'exam' | 'mode'> {
  mode: 'copy' | 'hidden' | 'hunt';
  /** Builds one passage. The same Rng and chart date always give the same passage. */
  make: (rng: Rng, today: ISODate) => Passage;
}

export interface Activity {
  type: 'sprint' | 'drill' | 'test';
  id?: string;
  label?: string;
  /** Which passages count for this program day (0-based). Default: all. */
  passages?: number[];
  /** Planned but not built yet. */
  soon?: boolean;
}

export interface ProgramDay { n: number; title: string; blurb: string; acts: Activity[] }
