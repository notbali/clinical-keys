import type { StudentRecord } from '../data/api';
import type { Attempt } from '../data/types';
import type { Track } from '../content/types';
import { assignedThrough } from '../lib/program';

/** A local-time timestamp, so a test about "Wednesday" means Wednesday wherever the tests run. */
export const at = (date: string, hour = 13, minute = 0): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
};

let n = 0;
export const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: `a${++n}`, studentId: 's1', kind: 'sprint', track: 'ma', passage: 0,
  wpm: 30, accuracy: 97, errorsLeft: 0, seconds: 60, completed: true, clean: true, revealed: false,
  createdAt: at('2026-11-12'), ...over,
});

export const student = (over: Partial<StudentRecord> & { startDate?: string } = {}): StudentRecord => {
  const { startDate = '2026-11-09', ...rest } = over;
  const id = rest.id ?? 's1';
  return {
    id, username: 'santosmaya', firstName: 'Maya', lastName: 'Santos', track: 'ma', status: 'active', createdAt: at('2026-11-09', 8),
    enrollment: { id: `e-${id}`, studentId: id, classId: 'c1', startDate }, classId: 'c1', ...rest,
  };
};

/** Clean runs for the first `count` real activities through `throughDay` (every passage of each). */
export function completeActivities(studentId: string, track: Track, throughDay: number, count: number, over: Partial<Attempt> = {}): Attempt[] {
  const out: Attempt[] = [];
  assignedThrough(track, throughDay).slice(0, count).forEach((a) => {
    a.passages.forEach((p) => out.push(attempt({ studentId, track, day: a.day, act: a.act, passage: p, ...over })));
  });
  return out;
}
