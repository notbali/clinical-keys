export type Track = 'ma' | 'rx';
export type DrillMode = 'copy' | 'hidden';

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
export interface Passage { ctx: string; text: string; patient?: Patient }

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
