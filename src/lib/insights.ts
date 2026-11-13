/**
 * Read-only instructor insights, all pure functions: at-risk flags, the class heatmap and the rolling-start view.
 * Nothing here talks to the Api; the screens pass in what the roster already loaded.
 */
import { addDays, isSchoolDay, programDay, toUTC, todayISO, type ISODate } from './dates';
import { assignedThrough, doneCount, programFor, resolveActivity, type AssignedActivity } from './program';
import { byProgramDay } from './stats';
import type { Track } from '../content/types';
import type { Attempt } from '../data/types';

// ---- At-risk thresholds. Change a number here and every screen follows. ----

/** Flag a student who has had no activity on this many school days in a row (not counting today). */
export const AT_RISK_INACTIVE_SCHOOL_DAYS = 2;
/** Flag a student whose average accuracy over their last runs is under this percent. */
export const AT_RISK_ACCURACY_BELOW = 90;
/** How many of the latest finished runs the accuracy average looks at (and the minimum needed to flag). */
export const AT_RISK_ACCURACY_RUNS = 3;
/** Flag a student with at least this many unfinished activities from earlier days. */
export const AT_RISK_UNFINISHED_EARLIER = 2;

export type RiskKind = 'inactive' | 'accuracy' | 'unfinished';
export interface RiskFlag { kind: RiskKind; text: string }

/** The local calendar date of a saved timestamp. */
const localDate = (iso: string): ISODate => todayISO(new Date(iso));

/**
 * School days that went by with no activity: every school day after the last activity (or after the start, when there
 * has been none) and before today. Today never counts, because the student may simply not have typed yet.
 */
export function missedSchoolDays(args: { start: ISODate; lastActive: ISODate | null; today: ISODate; closed: ReadonlySet<ISODate> }): number {
  const { start, lastActive, today, closed } = args;
  const from = lastActive && toUTC(lastActive) >= toUTC(start) ? addDays(lastActive, 1) : start;
  let n = 0;
  for (let d = from; toUTC(d) < toUTC(today); d = addDays(d, 1)) if (isSchoolDay(d, closed)) n++;
  return n;
}

/** Real activities from days before the student's current day that are not finished. */
export function unfinishedEarlier(track: Track, day: number, attempts: Attempt[]): AssignedActivity[] {
  // Past Day 10 everything in the program counts as "earlier".
  const through = day > 10 ? 10 : day - 1;
  if (through < 1) return [];
  return assignedThrough(track, through).filter((a) => doneCount(attempts, a.day, a.act, a.passages) < a.passages.length);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function atRiskFlags(args: { track: Track; startDate: ISODate; attempts: Attempt[]; today: ISODate; closed: ReadonlySet<ISODate> }): RiskFlag[] {
  const { track, startDate, attempts, today, closed } = args;
  const day = programDay(startDate, today, closed);
  // Not started yet, or already through the program: nothing to chase.
  if (day < 1 || day > 10) return [];
  const flags: RiskFlag[] = [];

  const lastActive = attempts.length ? localDate(attempts.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), '')) : null;
  const missed = missedSchoolDays({ start: startDate, lastActive, today, closed });
  if (missed >= AT_RISK_INACTIVE_SCHOOL_DAYS) flags.push({ kind: 'inactive', text: `No activity in ${missed} school days` });

  const finished = attempts.filter((a) => a.completed).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-AT_RISK_ACCURACY_RUNS);
  if (finished.length >= AT_RISK_ACCURACY_RUNS) {
    const avg = finished.reduce((s, a) => s + a.accuracy, 0) / finished.length;
    if (avg < AT_RISK_ACCURACY_BELOW) flags.push({ kind: 'accuracy', text: `Accuracy averaging ${Math.round(avg)}% over the last ${AT_RISK_ACCURACY_RUNS} runs, under ${AT_RISK_ACCURACY_BELOW}%` });
  }

  const open = unfinishedEarlier(track, day, attempts);
  if (open.length >= AT_RISK_UNFINISHED_EARLIER) {
    const days = [...new Set(open.map((a) => a.day))].sort((a, b) => a - b);
    flags.push({ kind: 'unfinished', text: `${open.length} activities unfinished from earlier days (${plural(days.length, 'Day', 'Days')} ${days.join(', ')})` });
  }
  return flags;
}

// ---- Heatmap ----

export type CellStatus = 'done' | 'partial' | 'behind' | 'today' | 'upcoming';

/** Every status has its own symbol and word, so the grid never relies on colour alone. */
export const CELL_INFO: Record<CellStatus, { symbol: string; label: string; help: string }> = {
  done: { symbol: '✓', label: 'Done', help: 'Every activity finished' },
  partial: { symbol: '◐', label: 'Partly done', help: 'Some activities finished, today or ahead of schedule' },
  behind: { symbol: '!', label: 'Behind', help: 'The day has passed and not everything is finished' },
  today: { symbol: '●', label: 'Today', help: 'Today’s day, not started' },
  upcoming: { symbol: '–', label: 'Upcoming', help: 'Not reached yet' },
};

export interface HeatCell {
  day: number;
  status: CellStatus;
  /** Activities finished (every passage) out of the day’s real activities. */
  done: number;
  total: number;
  /** Average accuracy of finished runs for that day, or null with none. */
  accuracy: number | null;
}

/** One cell per program day. `day` is the student's raw current program day (0 before the start date). */
export function heatmapRow(args: { track: Track; day: number; attempts: Attempt[] }): HeatCell[] {
  const { track, day, attempts } = args;
  const acc = new Map(byProgramDay(attempts).map((p) => [p.day, p.accuracy]));
  return programFor(track).map((d) => {
    let done = 0;
    let total = 0;
    d.acts.forEach((a, i) => {
      const r = resolveActivity(a);
      if (r.kind === 'soon') return;
      total++;
      if (doneCount(attempts, d.n, i, r.passages) >= r.passages.length) done++;
    });
    let status: CellStatus;
    if (total > 0 && done === total) status = 'done';
    else if (d.n < day) status = 'behind';
    else if (done > 0) status = 'partial';
    else status = d.n === day ? 'today' : 'upcoming';
    return { day: d.n, status, done, total, accuracy: acc.get(d.n) ?? null };
  });
}

// ---- Rolling start ----

export interface RollingInput {
  student: { id: string; firstName: string; lastName: string; track: Track; classId?: string; status: 'active' | 'archived' };
  day: number;
  /** Activities left unfinished from earlier days. */
  behindBy: number;
  riskCount: number;
}
export interface RollingGroup<T extends RollingInput> { classId: string; className: string; track: Track; rows: T[]; behindCount: number }

const NO_CLASS = '__none__';

/**
 * Active students grouped by class then track (MA first). Inside a group the students who are furthest behind come
 * first, then the ones with more at-risk flags, then the later program day, then last name.
 */
export function rollingGroups<T extends RollingInput>(items: T[], classes: { id: string; name: string }[]): RollingGroup<T>[] {
  const order = [...classes.map((c) => c.id), NO_CLASS];
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const groups: RollingGroup<T>[] = [];
  for (const classId of order) {
    for (const track of ['ma', 'rx'] as const) {
      const rows = items
        .filter((m) => m.student.status === 'active' && m.student.track === track)
        .filter((m) => (m.student.classId && names.has(m.student.classId) ? m.student.classId : NO_CLASS) === classId)
        .sort((a, b) =>
          b.behindBy - a.behindBy || b.riskCount - a.riskCount || b.day - a.day ||
          a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName));
      if (!rows.length) continue;
      groups.push({ classId, className: names.get(classId) ?? 'No class', track, rows, behindCount: rows.filter((r) => r.behindBy > 0).length });
    }
  }
  return groups;
}
