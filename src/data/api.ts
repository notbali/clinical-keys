import type { ISODate } from '../lib/dates';
import type { Track } from '../content/types';
import type { Challenge, ChallengePassages, ChallengeResult, NewChallengeResult } from './challengeTypes';
import type { Attempt, AuditEntry, ClassGroup, Enrollment, GradeOverride, Note, Session, Settings, Student } from './types';

/** A student together with their (latest) enrollment, which drives "Day N". */
export interface StudentRecord extends Student {
  enrollment?: Enrollment;
  classId?: string;
}

export interface EnrollRow {
  firstName: string;
  lastName: string;
  track: Track;
  startDate: ISODate;
}

export interface StudentPreview {
  firstName: string;
  lastInitial: string;
  track: Track;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

export type NewAttempt = Omit<Attempt, 'id' | 'createdAt' | 'studentId'>;

/**
 * Everything the screens need from a back end. The demo adapter keeps data in this browser; a Supabase
 * adapter implements the same interface, so the screens do not change.
 */
export interface Api {
  readonly mode: 'demo' | 'supabase';

  // Sign-in
  getSession(): Promise<Session | null>;
  lookupStudent(username: string): Promise<StudentPreview | null>;
  signInStudent(username: string): Promise<Result>;
  signInInstructor(email: string, password: string): Promise<Result>;
  signOut(): Promise<void>;

  // Settings (instructor writes, everyone reads)
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  // Student: their own data
  getMe(): Promise<StudentRecord>;
  saveAttempt(attempt: NewAttempt): Promise<Attempt>;

  // Reads: a student gets only their own, an instructor gets everything
  listAttempts(studentId?: string): Promise<Attempt[]>;
  listOverrides(): Promise<GradeOverride[]>;

  // Instructor
  listClasses(): Promise<ClassGroup[]>;
  createClass(name: string): Promise<ClassGroup>;
  archiveClass(id: string): Promise<void>;
  restoreClass(id: string): Promise<void>;
  deleteClass(id: string): Promise<void>;

  listStudents(): Promise<StudentRecord[]>;
  enroll(classId: string, rows: EnrollRow[]): Promise<StudentRecord[]>;
  updateStudent(id: string, patch: Partial<Pick<Student, 'firstName' | 'lastName' | 'track' | 'externalId'>> & { startDate?: ISODate; classId?: string }): Promise<void>;
  exitStudent(id: string): Promise<void>;
  restoreStudent(id: string): Promise<void>;

  listNotes(studentId: string): Promise<Note[]>;
  addNote(studentId: string, text: string): Promise<Note>;
  setOverride(studentId: string, value: number, reason: string): Promise<void>;
  clearOverride(studentId: string): Promise<void>;
  listAudit(): Promise<AuditEntry[]>;

  // Class challenge: a live round where a class types the same generated passage and a projector shows the leaderboard.
  /** Instructor: opens a round for a class. Any round of that class that is still open is ended. */
  createChallenge(classId: string, passages: ChallengePassages): Promise<Challenge>;
  /** Instructor: ends a round (ending it again does nothing). */
  endChallenge(id: string): Promise<void>;
  /** The open round of a class, or null. An instructor names the class; a student always gets their own class's. */
  getActiveChallenge(classId?: string): Promise<Challenge | null>;
  /** One round by id, or null. A student sees only their own class's rounds. */
  getChallenge(id: string): Promise<Challenge | null>;
  /** Student: submits their one result in an open round of their class. */
  submitChallengeResult(challengeId: string, result: NewChallengeResult): Promise<ChallengeResult>;
  /** Everyone's results in a round (an instructor's, or the student's classmates'). Names are first name and last initial only. */
  listChallengeResults(challengeId: string): Promise<ChallengeResult[]>;
}
