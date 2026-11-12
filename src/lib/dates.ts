/** Date helpers. All dates are plain YYYY-MM-DD strings so time zones never shift a school day. */
export type ISODate = string;

const DAY_MS = 86_400_000;

export const toUTC = (iso: ISODate): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fromUTC = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: ISODate, n: number): ISODate => fromUTC(toUTC(iso) + n * DAY_MS);

/** Local calendar date of `now` (what the student sees on the wall clock). */
export const todayISO = (now: Date = new Date()): ISODate => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/** A school day is Monday to Friday and not on the closed-days list. */
export function isSchoolDay(iso: ISODate, closed: ReadonlySet<ISODate> = new Set()): boolean {
  const dow = new Date(toUTC(iso)).getUTCDay();
  return dow !== 0 && dow !== 6 && !closed.has(iso);
}

/**
 * Program day number for a student who started on `start`: Day 1 is the first school day on or after
 * `start`. Returns 0 if `today` is before that. Not capped, so 11 means the student is past Day 10.
 */
export function programDay(start: ISODate, today: ISODate, closed: ReadonlySet<ISODate> = new Set()): number {
  if (toUTC(today) < toUTC(start)) return 0;
  let n = 0;
  for (let t = toUTC(start); t <= toUTC(today); t += DAY_MS) {
    if (isSchoolDay(fromUTC(t), closed)) n++;
  }
  return n;
}

/** Calendar date of program day `n` (Day 1 = first school day on or after `start`). */
export function dateOfProgramDay(start: ISODate, n: number, closed: ReadonlySet<ISODate> = new Set()): ISODate {
  let count = 0;
  let t = toUTC(start);
  for (let guard = 0; guard < 4000; guard++, t += DAY_MS) {
    if (isSchoolDay(fromUTC(t), closed) && ++count === n) return fromUTC(t);
  }
  return fromUTC(t);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Understands "today", "tomorrow", "Nov 13", "11/13", "11/13/2026" and "2026-11-13". Returns null if unclear. */
export function parseLooseDate(text: string, today: ISODate): ISODate | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  if (s === 'today') return today;
  if (s === 'tomorrow') return addDays(today, 1);
  const year = Number(today.slice(0, 4));
  const valid = (y: number, m: number, d: number): ISODate | null => {
    const iso = fromUTC(Date.UTC(y, m - 1, d));
    return Number(iso.slice(5, 7)) === m && Number(iso.slice(8, 10)) === d ? iso : null;
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) return valid(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year, +m[1], +m[2]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]);
    return mi >= 0 ? valid(m[3] ? +m[3] : year, mi + 1, +m[2]) : null;
  }
  return null;
}
