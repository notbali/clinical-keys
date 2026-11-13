import { displayName, isCleanResult, validateNewChallenge, validateResult } from '../lib/challenge';
import type { Challenge, ChallengePassages, ChallengeResult, NewChallengeResult } from './challengeTypes';
import type { ClassGroup, Enrollment, Session, Student } from './types';

/**
 * The class challenge for the demo adapter, as plain functions over the saved demo state. They live apart from
 * demoApi.ts so that file only wires them in. Saved state from before the challenge existed has neither list, so
 * every read tolerates a missing one.
 */
export interface ChallengeStore {
  classes: ClassGroup[];
  students: Student[];
  enrollments: Enrollment[];
  session: Session | null;
  challenges?: Challenge[];
  challengeResults?: ChallengeResult[];
}

const rounds = (s: ChallengeStore): Challenge[] => (s.challenges ??= []);
const results = (s: ChallengeStore): ChallengeResult[] => (s.challengeResults ??= []);

function requireInstructor(s: ChallengeStore): void {
  if (s.session?.role !== 'instructor') throw new Error('Instructor sign-in required.');
}

function requireStudent(s: ChallengeStore): { student: Student; classId: string | undefined } {
  if (s.session?.role !== 'student') throw new Error('Student sign-in required.');
  const id = s.session.studentId;
  const student = s.students.find((x) => x.id === id);
  if (!student) throw new Error('Student sign-in required.');
  const enr = s.enrollments.filter((e) => e.studentId === id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return { student, classId: enr?.classId };
}

/** Whoever is signed in, and the one class they may read: an instructor reads any, a student only their own. */
function reader(s: ChallengeStore): { classOf: (c: Challenge) => boolean; ownClass?: string } {
  if (!s.session) throw new Error('Please sign in.');
  if (s.session.role === 'instructor') return { classOf: () => true };
  const { classId } = requireStudent(s);
  return { classOf: (c) => c.classId === classId, ownClass: classId };
}

export function createChallenge(s: ChallengeStore, classId: string, passages: ChallengePassages, id: string, nowIso: string): Challenge {
  requireInstructor(s);
  if (!s.classes.some((c) => c.id === classId && c.status === 'active')) throw new Error('Class not found.');
  const bad = validateNewChallenge(passages);
  if (bad) throw new Error(bad);
  for (const c of rounds(s)) if (c.classId === classId && c.status === 'open') { c.status = 'ended'; c.endedAt = nowIso; }
  const round: Challenge = { id, classId, status: 'open', passages: { ...passages }, createdAt: nowIso };
  rounds(s).push(round);
  return round;
}

export function endChallenge(s: ChallengeStore, id: string, nowIso: string): void {
  requireInstructor(s);
  const c = rounds(s).find((x) => x.id === id);
  if (!c) throw new Error('That round was not found.');
  if (c.status === 'ended') return;
  c.status = 'ended';
  c.endedAt = nowIso;
}

export function getActiveChallenge(s: ChallengeStore, classId?: string): Challenge | null {
  const who = reader(s);
  const want = who.ownClass ?? classId;
  if (!want) return null;
  return rounds(s).filter((c) => c.classId === want && c.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function getChallenge(s: ChallengeStore, id: string): Challenge | null {
  const who = reader(s);
  const c = rounds(s).find((x) => x.id === id);
  return c && who.classOf(c) ? c : null;
}

export function submitChallengeResult(s: ChallengeStore, challengeId: string, input: NewChallengeResult, id: string, nowIso: string): ChallengeResult {
  const { student, classId } = requireStudent(s);
  const round = rounds(s).find((x) => x.id === challengeId);
  if (!round || round.classId !== classId) throw new Error('That round was not found.');
  if (round.status !== 'open') throw new Error('This round is closed.');
  if (!round.passages[student.track]) throw new Error('This round has no passage for your track.');
  if (results(s).some((r) => r.challengeId === challengeId && r.studentId === student.id)) throw new Error('You already submitted a result for this round.');
  const bad = validateResult(input);
  if (bad) throw new Error(bad);
  // Only the five measured numbers are kept: anything else the caller sent (such as a "clean" flag) is ignored.
  const { wpm, accuracy, errorsLeft, seconds, revealed } = input;
  const result: ChallengeResult = {
    id, challengeId, studentId: student.id, displayName: displayName(student.firstName, student.lastName), track: student.track,
    wpm, accuracy, errorsLeft, seconds, revealed, clean: isCleanResult({ errorsLeft, accuracy, revealed }), submittedAt: nowIso,
  };
  results(s).push(result);
  return result;
}

export function listChallengeResults(s: ChallengeStore, challengeId: string): ChallengeResult[] {
  const who = reader(s);
  const round = rounds(s).find((x) => x.id === challengeId);
  if (!round) return [];
  if (!who.classOf(round)) throw new Error('That round was not found.');
  return results(s).filter((r) => r.challengeId === challengeId).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** Removes a class's rounds and results (the class is being deleted). */
export function dropClassChallenges(s: ChallengeStore, classId: string): void {
  const gone = new Set(rounds(s).filter((c) => c.classId === classId).map((c) => c.id));
  s.challenges = rounds(s).filter((c) => c.classId !== classId);
  s.challengeResults = results(s).filter((r) => !gone.has(r.challengeId));
}
