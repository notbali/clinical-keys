/**
 * The printable per-student progress report, as plain data. Instructor-private material (notes and the reason for a
 * grade override) is only ever added when `includePrivate` is true, so a report handed to a student or a parent
 * cannot leak it.
 */
import { dateOfProgramDay, type ISODate } from './dates';
import { heatmapRow, type CellStatus } from './insights';
import { programFor, resolveActivity } from './program';
import { totalSeconds } from './stats';
import type { StudentMetrics } from './metrics';
import type { Attempt, Note, Settings } from '../data/types';

export interface RunCounts { total: number; sprints: number; drills: number; finished: number; clean: number; errorsLeft: number; seconds: number }

export function runCounts(attempts: Attempt[]): RunCounts {
  return {
    total: attempts.length,
    sprints: attempts.filter((a) => a.kind === 'sprint').length,
    drills: attempts.filter((a) => a.kind === 'drill').length,
    finished: attempts.filter((a) => a.completed).length,
    clean: attempts.filter((a) => a.clean).length,
    errorsLeft: attempts.filter((a) => !a.completed).length,
    seconds: totalSeconds(attempts),
  };
}

export interface TestResult { day: number; label: string; taken: boolean; wpm: number | null; accuracy: number | null; date: ISODate | null }
export interface TestComparison {
  from: TestResult & { wpm: number; accuracy: number };
  to: TestResult & { wpm: number; accuracy: number };
  wpmChange: number;
  accuracyChange: number;
}

export interface ProgressReport {
  generatedOn: ISODate;
  student: { name: string; username: string; track: 'ma' | 'rx'; trackLabel: string; className?: string };
  dayLabel: string;
  startDate?: ISODate;
  exitDate?: ISODate;
  grade: {
    total: number | null;
    computed: number | null;
    overridden: boolean;
    accuracyAvg: number | null;
    bestWpm: number | null;
    completion: { done: number; total: number };
    parts: { name: string; weightPct: number; score: number }[];
  };
  program: { day: number; title: string; status: CellStatus; done: number; total: number; accuracy: number | null }[];
  tests: TestResult[];
  comparison: TestComparison | null;
  runs: RunCounts;
  /** Present only when the instructor turned the toggle on. */
  private?: { overrideReason?: string; notes: { at: string; text: string }[] };
}

const TRACK_LABEL = { ma: 'Medical Assistant', rx: 'Pharmacy Tech' } as const;
const round1 = (n: number) => Math.round(n * 10) / 10;
const localDate = (iso: string): ISODate => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function testResults(m: Pick<StudentMetrics, 'student' | 'attempts'>): TestResult[] {
  const out: TestResult[] = [];
  for (const d of programFor(m.student.track)) {
    d.acts.forEach((a, i) => {
      if (a.type !== 'test' || resolveActivity(a).kind === 'soon') return;
      // A retake is allowed; the best finished run (by speed) is the one reported.
      const runs = m.attempts.filter((x) => x.completed && x.day === d.n && x.act === i);
      const best = runs.reduce<Attempt | null>((b, x) => (!b || x.wpm > b.wpm ? x : b), null);
      out.push({
        day: d.n, label: a.label ?? `Day ${d.n} typing test`, taken: !!best,
        wpm: best?.wpm ?? null, accuracy: best ? best.accuracy : null, date: best ? localDate(best.createdAt) : null,
      });
    });
  }
  return out;
}

export function buildReport(args: {
  metrics: StudentMetrics;
  settings: Settings;
  className?: string;
  today: ISODate;
  includePrivate: boolean;
  notes?: Note[];
}): ProgressReport {
  const { metrics: m, settings, className, today, includePrivate, notes = [] } = args;
  const { student, grade } = m;
  const closed = new Set(settings.closedDays);
  const start = student.enrollment?.startDate;
  const w = settings.weights;
  const wsum = w.accuracy + w.speed + w.completion || 1;

  const dayLabel = m.day < 1 ? `Starts ${start ?? 'soon'}` : m.day > 10 ? 'Finished the 10 days' : `Day ${m.day} of 10`;
  const cells = heatmapRow({ track: student.track, day: m.day, attempts: m.attempts });
  const titles = programFor(student.track);

  const tests = testResults(m);
  const baseline = tests[0];
  const later = tests.slice(1).filter((t) => t.taken);
  const latest = later[later.length - 1];
  const comparison: TestComparison | null = baseline?.taken && latest
    ? {
        from: baseline as TestComparison['from'],
        to: latest as TestComparison['to'],
        wpmChange: round1(latest.wpm! - baseline.wpm!),
        accuracyChange: round1(latest.accuracy! - baseline.accuracy!),
      }
    : null;

  const report: ProgressReport = {
    generatedOn: today,
    student: { name: `${student.firstName} ${student.lastName}`, username: student.username, track: student.track, trackLabel: TRACK_LABEL[student.track], className },
    dayLabel,
    startDate: start,
    exitDate: start ? dateOfProgramDay(start, 10, closed) : undefined,
    grade: {
      total: grade.total, computed: grade.computed, overridden: !!grade.override,
      accuracyAvg: grade.accuracyAvg, bestWpm: grade.bestWpm, completion: grade.completion,
      parts: [
        { name: 'Accuracy', weightPct: Math.round((w.accuracy / wsum) * 100), score: grade.accuracyScore },
        { name: 'Speed', weightPct: Math.round((w.speed / wsum) * 100), score: grade.speedScore },
        { name: 'Activities completed', weightPct: 100 - Math.round((w.accuracy / wsum) * 100) - Math.round((w.speed / wsum) * 100), score: grade.completionScore },
      ],
    },
    program: cells.map((c) => ({ day: c.day, title: titles.find((d) => d.n === c.day)?.title ?? `Day ${c.day}`, status: c.status, done: c.done, total: c.total, accuracy: c.accuracy })),
    tests,
    comparison,
    runs: runCounts(m.attempts),
  };

  if (includePrivate) {
    report.private = {
      overrideReason: grade.override?.reason,
      notes: notes.map((n) => ({ at: n.at, text: n.text })),
    };
  }
  return report;
}
