import { addDays, isSchoolDay, todayISO, type ISODate } from './dates';
import type { Attempt } from '../data/types';

const localDate = (iso: string): ISODate => todayISO(new Date(iso));

/** Consecutive school days (ending today or the last school day) with at least one finished run. */
export function streak(attempts: Attempt[], today: ISODate, closed: ReadonlySet<ISODate>): number {
  const days = new Set(attempts.filter((a) => a.completed).map((a) => localDate(a.createdAt)));
  let d = today;
  // Today without a run yet does not break the streak.
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  for (let guard = 0; guard < 400; guard++, d = addDays(d, -1)) {
    if (!isSchoolDay(d, closed)) continue;
    if (!days.has(d)) break;
    n++;
  }
  return n;
}

export interface DayPoint { day: number; wpm: number | null; accuracy: number | null }

/** Best WPM and average accuracy per program day (only runs started from the program count). */
export function byProgramDay(attempts: Attempt[]): DayPoint[] {
  const days = new Map<number, Attempt[]>();
  for (const a of attempts) if (a.day != null && a.completed) days.set(a.day, [...(days.get(a.day) ?? []), a]);
  return [...days.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, list]) => ({
      day,
      wpm: Math.max(...list.map((a) => a.wpm)),
      accuracy: Math.round((list.reduce((s, a) => s + a.accuracy, 0) / list.length) * 10) / 10,
    }));
}

/** Most recent local date with a finished run, with that day's best WPM and average accuracy. */
export function latestDay(attempts: Attempt[]): { date: ISODate; wpm: number; accuracy: number } | null {
  const done = attempts.filter((a) => a.completed);
  if (!done.length) return null;
  const last = localDate(done.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), ''));
  const list = done.filter((a) => localDate(a.createdAt) === last);
  return {
    date: last,
    wpm: Math.max(...list.map((a) => a.wpm)),
    accuracy: Math.round((list.reduce((s, a) => s + a.accuracy, 0) / list.length) * 10) / 10,
  };
}

export const lastActiveAt = (attempts: Attempt[]): string | null =>
  attempts.length ? attempts.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), '') : null;

export const totalSeconds = (attempts: Attempt[]): number => attempts.reduce((s, a) => s + a.seconds, 0);
