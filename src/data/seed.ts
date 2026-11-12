import { addDays, dateOfProgramDay, isSchoolDay, programDay, todayISO, type ISODate } from '../lib/dates';
import { assignedThrough } from '../lib/program';
import type { Attempt, ClassGroup, Enrollment, Note, Student } from './types';
import type { Track } from '../content/types';
import { getDrill } from '../content';
import { resolveActivity, programFor } from '../lib/program';

/** Deterministic pseudo-random numbers so the demo looks the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The start date that makes `today` fall on program day `n` (walks back over school days). */
export function startForDay(n: number, today: ISODate): ISODate {
  let d = today;
  while (!isSchoolDay(d)) d = addDays(d, -1);
  let count = 1;
  while (count < n) {
    d = addDays(d, -1);
    if (isSchoolDay(d)) count++;
  }
  return d;
}

interface Profile {
  first: string; last: string; track: Track; day: number; group: string;
  wpm0: number; wpm1: number; acc0: number; acc1: number; completion: number;
}

const PROFILES: Profile[] = [
  { first: 'Tyler', last: 'Reed', track: 'rx', day: 10, group: 'Oct 26 group', wpm0: 30, wpm1: 38, acc0: 93, acc1: 97, completion: 0.95 },
  { first: 'Marcus', last: 'Johnson', track: 'rx', day: 9, group: 'Nov 2 group', wpm0: 33, wpm1: 41, acc0: 95, acc1: 98, completion: 1 },
  { first: 'Imani', last: 'Brooks', track: 'ma', day: 7, group: 'Nov 2 group', wpm0: 27, wpm1: 33, acc0: 93, acc1: 96, completion: 0.9 },
  { first: 'Priya', last: 'Raman', track: 'ma', day: 6, group: 'Nov 2 group', wpm0: 26, wpm1: 31, acc0: 94, acc1: 97, completion: 1 },
  { first: 'Maya', last: 'Santos', track: 'ma', day: 4, group: 'Nov 9 group', wpm0: 24, wpm1: 29, acc0: 93, acc1: 97, completion: 0.85 },
  { first: 'Jordan', last: 'Fischer', track: 'rx', day: 4, group: 'Nov 9 group', wpm0: 22, wpm1: 25, acc0: 87, acc1: 89, completion: 0.6 },
  { first: 'Daniel', last: 'Park', track: 'rx', day: 3, group: 'Nov 9 group', wpm0: 20, wpm1: 22, acc0: 90, acc1: 91, completion: 0.8 },
  { first: 'Elena', last: 'Vasquez', track: 'ma', day: 1, group: 'Nov 9 group', wpm0: 0, wpm1: 0, acc0: 0, acc1: 0, completion: 0 },
];

export interface SeedData {
  classes: ClassGroup[];
  students: Student[];
  enrollments: Enrollment[];
  attempts: Attempt[];
  notes: Note[];
}

const at = (date: ISODate, hour: number, minute: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
};

/** Fictional demo roster that lines up with the mockups. Every name here is made up. */
export function buildSeed(now: Date = new Date()): SeedData {
  const today = todayISO(now);
  const created = at(today, 8, 0);
  const classNames = ['Oct 26 group', 'Nov 2 group', 'Nov 9 group'];
  const classes: ClassGroup[] = classNames.map((name, i) => ({ id: `class-${i + 1}`, name, status: 'active', createdAt: created }));
  const students: Student[] = [];
  const enrollments: Enrollment[] = [];
  const attempts: Attempt[] = [];
  const notes: Note[] = [];
  let aid = 0;

  PROFILES.forEach((p, idx) => {
    const id = `student-${idx + 1}`;
    const username = (p.last + p.first).toLowerCase();
    students.push({ id, username, firstName: p.first, lastName: p.last, track: p.track, status: 'active', createdAt: created });
    const startDate = startForDay(p.day, today);
    const klass = classes.find((c) => c.name === p.group)!;
    enrollments.push({ id: `enr-${idx + 1}`, studentId: id, classId: klass.id, startDate });

    const rand = rng(idx * 7919 + 17);
    const lerp = (a: number, b: number, d: number) => a + ((b - a) * (d - 1)) / Math.max(p.day - 1, 1);
    const acts = assignedThrough(p.track, p.day);
    const nowMs = now.getTime();

    for (const act of acts) {
      const resolved = resolveActivity(programFor(p.track).find((d) => d.n === act.day)!.acts[act.act]);
      const isToday = act.day === programDay(startDate, today);
      // Past days follow the completion rate; today only the warm-up sprint is done.
      if (isToday && resolved.kind !== 'sprint') continue;
      if (!isToday && rand() > p.completion) continue;
      if (p.wpm1 === 0) continue;
      const date = dateOfProgramDay(startDate, act.day);
      act.passages.forEach((passage, k) => {
        const wpm = Math.round(lerp(p.wpm0, p.wpm1, act.day) + (rand() - 0.5) * 3);
        const accuracy = Math.round((lerp(p.acc0, p.acc1, act.day) + (rand() - 0.5) * 1.2) * 10) / 10;
        const when = at(date, resolved.kind === 'sprint' ? 12 : 13, 40 + k * 3 + (act.act % 3));
        if (new Date(when).getTime() > nowMs) return;
        attempts.push({
          id: `att-${++aid}`, studentId: id, kind: resolved.kind === 'sprint' ? 'sprint' : 'drill', track: p.track,
          drillId: resolved.kind === 'drill' ? resolved.drill.id : undefined, passage, day: act.day, act: act.act,
          wpm, accuracy, errorsLeft: 0, seconds: resolved.kind === 'sprint' ? 60 : Math.round(60 + rand() * 90),
          completed: true, clean: accuracy >= 95, revealed: false, createdAt: when,
        });
      });
    }
    void getDrill;
  });

  const maya = students.find((s) => s.username === 'santosmaya')!;
  notes.push(
    { id: 'note-1', studentId: maya.id, text: 'Struggles with the number row. Assigned extra vitals practice.', at: at(addDays(today, -2), 14, 5), by: 'Instructor' },
    { id: 'note-2', studentId: maya.id, text: 'Strong accuracy gains. Check in on speed after the midpoint test.', at: at(today, 11, 50), by: 'Instructor' },
  );
  return { classes, students, enrollments, attempts, notes };
}
