export type Track = 'ma' | 'rx';
export type DrillMode = 'copy' | 'hidden';

/** One passage inside a drill. `ctx` is our own trusted HTML shown above the passage. */
export interface Passage { ctx: string; text: string }

export interface Drill {
  id: string;
  track: Track;
  mode: DrillMode;
  title: string;
  blurb: string;
  /** Trusted HTML explaining why the skill matters. */
  why: string;
  glossary?: boolean;
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
