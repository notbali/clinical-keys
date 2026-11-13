import { programDay, todayISO, type ISODate } from './dates';
import { computeTypingGrade, type TypingGrade } from './grades';
import { assignedThrough, doneCount, programFor, resolveActivity } from './program';
import { atRiskFlags, unfinishedEarlier, type RiskFlag } from './insights';
import { effectiveDay, programLength, taughtDays, type ClassPlan } from './plan';
import { lastActiveAt, latestDay } from './stats';
import type { StudentRecord } from '../data/api';
import type { Attempt, GradeOverride, Settings } from '../data/types';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
export interface Flag { kind: 'accuracy' | 'behind' | 'exit' | 'new'; text: string; tone: Tone }

export interface StudentMetrics {
  student: StudentRecord;
  /**
   * The original program day the student is on (0 before they start; above 10 once they have finished). With no class
   * plan this is simply the school-day count. With a plan it is the day the plan puts on their school day.
   */
  day: number;
  /** School days since they started (0 before the start). Equals `day` when the class has no plan. */
  position: number;
  /** How many days the class is taught: 10, or fewer when the plan skips days. */
  programLength: number;
  grade: TypingGrade;
  todayDone: number;
  todayTotal: number;
  latestWpm: number | null;
  latestAccuracy: number | null;
  lastActive: string | null;
  flags: Flag[];
  /** At-risk flags (src/lib/insights.ts): inactive, low accuracy, unfinished earlier work. Each has its reason in words. */
  risk: RiskFlag[];
  /** Activities from earlier days that are still unfinished. */
  behindBy: number;
  attempts: Attempt[];
}

export function buildMetrics(args: {
  students: StudentRecord[];
  attempts: Attempt[];
  overrides: GradeOverride[];
  settings: Settings;
  today?: ISODate;
  /** Day plans by class id. A class with no entry follows the default Day 1 to Day 10. */
  plans?: Record<string, ClassPlan>;
}): StudentMetrics[] {
  const { students, attempts, overrides, settings } = args;
  const today = args.today ?? todayISO();
  const closed = new Set(settings.closedDays);

  return students.map((student) => {
    const mine = attempts.filter((a) => a.studentId === student.id);
    const start = student.enrollment?.startDate ?? today;
    const plan = args.plans?.[student.classId ?? student.enrollment?.classId ?? ''];
    const position = programDay(start, today, closed);
    const length = programLength(plan);
    const day = effectiveDay(plan, position);
    const shown = Math.max(1, day);
    const override = overrides.find((o) => o.studentId === student.id);
    const grade = computeTypingGrade({ attempts: mine, track: student.track, day: shown, settings: plan ? { ...settings, classPlan: plan } : settings, override });

    // Before the start, show the first day taught; after the end, the last one.
    const taught = taughtDays(plan);
    const todayNo = position <= 0 ? taught[0] : position > length ? taught[length - 1] : day;
    const todays = programFor(student.track).find((d) => d.n === todayNo);
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

    if (position > length) flags.push({ kind: 'exit', text: length === 10 ? 'Past Day 10, ready to exit' : 'Past the last day, ready to exit', tone: 'info' });
    else if (position === length) flags.push({ kind: 'exit', text: 'Final day, prepare exit', tone: 'info' });
    if (recentAcc != null && recentAcc < target.accuracy) {
      flags.push({ kind: 'accuracy', text: `Accuracy ${Math.round(recentAcc)}%, under ${target.accuracy}%`, tone: recentAcc < target.accuracy - 4 ? 'bad' : 'warn' });
    }
    const assigned = assignedThrough(student.track, shown, plan).length;
    if (shown > 1 && assigned - grade.completion.done >= 3) flags.push({ kind: 'behind', text: `Behind: ${assigned - grade.completion.done} activities unfinished`, tone: 'bad' });
    if (position === 1 && mine.length === 0) flags.push({ kind: 'new', text: 'New today', tone: 'info' });

    return {
      student, day, position, programLength: length, grade, todayDone, todayTotal,
      latestWpm: latest?.wpm ?? null, latestAccuracy: latest?.accuracy ?? null,
      lastActive: lastActiveAt(mine), flags, attempts: mine,
      risk: atRiskFlags({ track: student.track, startDate: start, attempts: mine, today, closed }),
      behindBy: unfinishedEarlier(student.track, day, mine).length,
    };
  });
}

/** The older flag kinds that an at-risk flag of the same subject replaces, so a reason is never listed twice. */
const SUPERSEDED_BY: Partial<Record<Flag['kind'], RiskFlag['kind']>> = { accuracy: 'accuracy', behind: 'unfinished' };

/** The older flags (exit, new, accuracy, behind) minus the ones an at-risk flag already says. */
export function uncoveredFlags(m: Pick<StudentMetrics, 'risk' | 'flags'>): Flag[] {
  const covered = new Set(m.risk.map((r) => r.kind));
  return m.flags.filter((f) => {
    const replacedBy = SUPERSEDED_BY[f.kind];
    return replacedBy === undefined || !covered.has(replacedBy);
  });
}

/** Why a student needs attention, in words: the at-risk reasons first, then older accuracy/behind flags they do not cover. */
export function attentionReasons(m: Pick<StudentMetrics, 'risk' | 'flags'>): string[] {
  return [...m.risk.map((r) => r.text), ...uncoveredFlags(m).filter((f) => f.kind === 'accuracy' || f.kind === 'behind').map((f) => f.text)];
}

export const needsAttention = (m: Pick<StudentMetrics, 'risk' | 'flags'>): boolean => attentionReasons(m).length > 0;
