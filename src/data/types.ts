import type { ISODate } from '../lib/dates';
import type { Track } from '../content/types';

export interface Student {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  track: Track;
  /** The student's Blackboard username, used to line up the CSV export. Optional. */
  externalId?: string;
  status: 'active' | 'archived';
  createdAt: string;
  archivedAt?: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  status: 'active' | 'archived';
  createdAt: string;
  archivedAt?: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  /** Day 1 is the first school day on or after this date. */
  startDate: ISODate;
  /** Set when the student is exited early or archived. */
  exitDate?: ISODate;
}

export interface Attempt {
  id: string;
  studentId: string;
  kind: 'drill' | 'sprint';
  track: Track;
  drillId?: string;
  passage: number;
  /** Program day and activity index when the run came from the program view. */
  day?: number;
  act?: number;
  wpm: number;
  accuracy: number;
  errorsLeft: number;
  seconds: number;
  /** Finished with no errors left and the answer not shown. */
  completed: boolean;
  /** Completed with 95% accuracy or better. Only clean runs count toward personal bests. */
  clean: boolean;
  revealed: boolean;
  createdAt: string;
}

export interface GradeOverride { studentId: string; value: number; reason: string; by: string; at: string }
export interface Note { id: string; studentId: string; text: string; at: string; by: string }
export interface AuditEntry { id: string; at: string; actor: string; action: string; subject: string; detail: string }

export interface Settings {
  targets: Record<Track, { wpm: number; accuracy: number }>;
  weights: { accuracy: number; speed: number; completion: number };
  closedDays: ISODate[];
  /** Optional link shown to students for their Blackboard course. */
  blackboardUrl?: string;
  /** How the student screens look: a training EHR (chart) style, or the standard look. */
  uiStyle?: 'ehr' | 'standard';
}

export type Session =
  | { role: 'student'; studentId: string }
  | { role: 'instructor'; name: string; email: string };

export const DEFAULT_SETTINGS: Settings = {
  targets: { ma: { wpm: 35, accuracy: 95 }, rx: { wpm: 35, accuracy: 95 } },
  weights: { accuracy: 40, speed: 30, completion: 30 },
  closedDays: [],
  uiStyle: 'ehr',
};
