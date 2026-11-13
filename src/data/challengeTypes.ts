import type { ISODate } from '../lib/dates';
import type { Track } from '../content/types';

/**
 * One passage of a class challenge: a generated drill, the seed it is built from, and the chart date, so that every
 * student (and every device) gets exactly the same text.
 */
export interface ChallengePassage {
  drillId: string;
  seed: number;
  chartDate: ISODate;
}

/** A track can be left out of a round; its students then wait for the next one. */
export type ChallengePassages = Partial<Record<Track, ChallengePassage>>;

/** A live round of the class challenge. A class has at most one open round at a time. */
export interface Challenge {
  id: string;
  classId: string;
  status: 'open' | 'ended';
  passages: ChallengePassages;
  createdAt: string;
  endedAt?: string;
}

/** What a student sends when they finish. Everything else is stamped by the back end. */
export interface NewChallengeResult {
  wpm: number;
  accuracy: number;
  errorsLeft: number;
  seconds: number;
  /** The answer was shown during the run. Such a run never counts as clean. */
  revealed: boolean;
}

/**
 * A student's one result in a round. `displayName` is first name and last initial only ("Maya S."): this record is
 * what a classroom projector shows, so it never carries a full last name.
 */
export interface ChallengeResult extends NewChallengeResult {
  id: string;
  challengeId: string;
  studentId: string;
  displayName: string;
  track: Track;
  /** Zero errors left, 95% accuracy or better, answer not shown. */
  clean: boolean;
  submittedAt: string;
}
