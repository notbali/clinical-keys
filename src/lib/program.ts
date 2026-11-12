import { getDrill, PROGRAM } from '../content';
import type { Activity, Drill, ProgramDay, Track } from '../content/types';
import type { Attempt } from '../data/types';

export type ResolvedActivity =
  | { kind: 'sprint'; label: string; passages: number[] }
  | { kind: 'drill'; label: string; drill: Drill; passages: number[] }
  | { kind: 'soon'; label: string };

export function resolveActivity(a: Activity): ResolvedActivity {
  if (a.type === 'sprint') return { kind: 'sprint', label: 'Warm-up sprint', passages: [0] };
  const drill = a.id ? getDrill(a.id) : undefined;
  if (a.soon || !drill) return { kind: 'soon', label: a.label ?? 'Coming soon' };
  return {
    kind: 'drill',
    label: a.label ?? drill.title,
    drill,
    passages: a.passages ?? drill.items.map((_, i) => i),
  };
}

export const programFor = (track: Track): ProgramDay[] => PROGRAM[track];

/** How many of an activity's required passages the student has finished with no errors left. */
export function doneCount(attempts: Attempt[], day: number, act: number, passages: number[]): number {
  const done = new Set(
    attempts.filter((a) => a.completed && a.day === day && a.act === act).map((a) => a.passage),
  );
  return passages.filter((p) => done.has(p)).length;
}

export interface AssignedActivity { day: number; act: number; label: string; passages: number[] }

/** Every real (not "coming soon") activity from Day 1 through `throughDay`. */
export function assignedThrough(track: Track, throughDay: number): AssignedActivity[] {
  const out: AssignedActivity[] = [];
  for (const d of programFor(track)) {
    if (d.n > throughDay) break;
    d.acts.forEach((a, i) => {
      const r = resolveActivity(a);
      if (r.kind !== 'soon') out.push({ day: d.n, act: i, label: r.label, passages: r.passages });
    });
  }
  return out;
}
