import { programDay, todayISO, type ISODate } from './dates';
import { computeTypingGrade, type TypingGrade } from './grades';
import { assignedThrough, doneCount, programFor, resolveActivity } from './program';
import { lastActiveAt, latestDay } from './stats';
import type { StudentRecord } from '../data/api';
import type { Attempt, GradeOverride, Settings } from '../data/types';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
export interface Flag { kind: 'accuracy' | 'behind' | 'exit' | 'new'; text: string; tone: Tone }

export interface StudentMetrics {
  student: StudentRecord;
  /** Raw program day (can be above 10). */
  day: number;
  grade: TypingGrade;
  todayDone: number;
  todayTotal: number;
  latestWpm: number | null;
  latestAccuracy: number | null;
  lastActive: string | null;
  flags: Flag[];
  attempts: Attempt[];
}

export function buildMetrics(args: {
  students: StudentRecord[];
  attempts: Attempt[];
  overrides: GradeOverride[];
  settings: Settings;
  today?: ISODate;
}): StudentMetrics[] {
  const { students, attempts, overrides, settings } = args;
  const today = args.today ?? todayISO();
  const closed = new Set(settings.closedDays);

  return students.map((student) => {
    const mine = attempts.filter((a) => a.studentId === student.id);
    const start = student.enrollment?.startDate ?? today;
    const day = programDay(start, today, closed);
    const shown = Math.max(1, day);
    const override = overrides.find((o) => o.studentId === student.id);
    const grade = computeTypingGrade({ attempts: mine, track: student.track, day: shown, settings, override });

    const todays = programFor(student.track).find((d) => d.n === Math.min(shown, 10));
    let todayTotal = 0;
    let todayDone = 0;
    todays?.acts.forEach((a, i) => {
      const r = resolveActivity(a);
      if (r.kind === 'soon') return;
      todayTotal++;
      if (doneCount(mine, todays.n, i, r.passages) >= r.passages.length) todayDone++;
    });

    const latest = latestDay(mine);
    const flags: Flag[] = [];
    const target = settings.targets[student.track];
    const recent = mine.filter((a) => a.completed).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-6);
    const recentAcc = recent.length >= 3 ? recent.reduce((s, a) => s + a.accuracy, 0) / recent.length : null;

    if (day > 10) flags.push({ kind: 'exit', text: 'Past Day 10, ready to exit', tone: 'info' });
    else if (day === 10) flags.push({ kind: 'exit', text: 'Final day, prepare exit', tone: 'info' });
    if (recentAcc != null && recentAcc < target.accuracy) {
      flags.push({ kind: 'accuracy', text: `Accuracy ${Math.round(recentAcc)}%, under ${target.accuracy}%`, tone: recentAcc < target.accuracy - 4 ? 'bad' : 'warn' });
    }
    const assigned = assignedThrough(student.track, Math.min(shown, 10)).length;
    if (shown > 1 && assigned - grade.completion.done >= 3) flags.push({ kind: 'behind', text: `Behind: ${assigned - grade.completion.done} activities unfinished`, tone: 'bad' });
    if (day === 1 && mine.length === 0) flags.push({ kind: 'new', text: 'New today', tone: 'info' });

    return {
      student, day, grade, todayDone, todayTotal,
      latestWpm: latest?.wpm ?? null, latestAccuracy: latest?.accuracy ?? null,
      lastActive: lastActiveAt(mine), flags, attempts: mine,
    };
  });
}
