import { getDrill, getGeneratedDrill } from '../content';
import type { Attempt } from '../data/types';

/** Which personal-best line a run belongs to: its drill, the warm-up sprint, or the weak-word sprint. */
export function drillKey(a: Pick<Attempt, 'kind' | 'drillId'>): string {
  if (a.kind === 'sprint') return a.drillId === 'weak-words' ? 'weak-words' : 'sprint';
  return a.drillId ?? '';
}

/** Student-facing name for a drillKey. */
export function activityLabel(key: string): string {
  if (key === 'sprint') return 'Warm-up sprint';
  if (key === 'weak-words') return 'Weak-word sprint';
  return getDrill(key)?.title ?? getGeneratedDrill(key)?.title ?? key;
}

const round1 =(n: number) => Math.round(n * 10) / 10;
const byTime = (a: Attempt, b: Attempt) => a.createdAt.localeCompare(b.createdAt);

export interface BestPoint { at: string; wpm: number; accuracy: number }
export interface BestLine {
  key: string;
  /** Highest clean WPM so far. */
  best: number;
  /** Each time a clean run beat every earlier clean run of this drill, oldest first. */
  points: BestPoint[];
}

/** Personal-best timeline per drill: only clean runs, only the runs that set a new best WPM. Error hunts (no speed) are left out. */
export function bestTimeline(attempts: Attempt[]): BestLine[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!a.clean || !(a.wpm > 0)) continue;
    const k = drillKey(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return [...groups.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([key, list]) => {
      const points: BestPoint[] = [];
      let best = 0;
      for (const a of [...list].sort(byTime)) {
        if (a.wpm > best) { best = a.wpm; points.push({ at: a.createdAt, wpm: a.wpm, accuracy: a.accuracy }); }
      }
      return { key, best, points };
    });
}

export interface TestResult { wpm: number; accuracy: number; day: number; at: string }
export interface Improvement {
  /** The Day 1 baseline test, or null if the student has not finished it. */
  baseline: TestResult | null;
  /** The latest program test (Day 5 or Day 10) or, failing that, the best clean run since. */
  latest: (TestResult & { source: 'test' | 'best' }) | null;
  /** latest minus baseline, null until both exist. */
  wpmGain: number | null;
  accuracyGain: number | null;
}

const isTest = (a: Attempt) => !!a.drillId && !!getDrill(a.drillId)?.exam;

/** One result for a test day: average of its passages, taking either the first or the newest finish of each. */
function dayResult(list: Attempt[], day: number, which: 'first' | 'newest'): TestResult {
  const sorted = [...list].sort(byTime);
  const per = new Map<number, Attempt>();
  for (const a of sorted) if (which === 'newest' || !per.has(a.passage)) per.set(a.passage, a);
  const picked = [...per.values()];
  return {
    wpm: Math.round(picked.reduce((s, a) => s + a.wpm, 0) / picked.length),
    accuracy: round1(picked.reduce((s, a) => s + a.accuracy, 0) / picked.length),
    day,
    at: picked.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), ''),
  };
}

/** Day 1 baseline test against the latest test, or the best clean run when no later test is done yet. */
export function improvement(attempts: Attempt[]): Improvement {
  const tests = attempts.filter((a) => a.completed && a.day != null && isTest(a));
  const onDay = (d: number) => tests.filter((a) => a.day === d);
  const baseline = onDay(1).length ? dayResult(onDay(1), 1, 'first') : null;

  const laterDays = [...new Set(tests.filter((a) => a.day! > 1).map((a) => a.day!))].sort((a, b) => b - a);
  let latest: Improvement['latest'] = laterDays.length ? { ...dayResult(onDay(laterDays[0]), laterDays[0], 'newest'), source: 'test' } : null;
  if (!latest) {
    const pool = attempts.filter((a) => a.clean && a.wpm > 0 && !(isTest(a) && a.day === 1));
    const best = pool.reduce<Attempt | null>((m, a) => (!m || a.wpm > m.wpm || (a.wpm === m.wpm && a.createdAt > m.createdAt) ? a : m), null);
    if (best) latest = { wpm: best.wpm, accuracy: best.accuracy, day: best.day ?? 0, at: best.createdAt, source: 'best' };
  }
  return {
    baseline,
    latest,
    wpmGain: baseline && latest ? latest.wpm - baseline.wpm : null,
    accuracyGain: baseline && latest ? round1(latest.accuracy - baseline.accuracy) : null,
  };
}

/** "Up 8 WPM and 2.1 accuracy points since Day 1", or null until there is a baseline and something to compare it with. */
export function improvementPhrase(imp: Pick<Improvement, 'wpmGain' | 'accuracyGain'> & Partial<Improvement>): string | null {
  const { wpmGain: w, accuracyGain: a } = imp;
  if (w == null || a == null) return null;
  const dir = (g: number) => (g > 0 ? 'up' : g < 0 ? 'down' : 'same');
  const unit = (g: number) => (Math.abs(g) === 1 ? 'accuracy point' : 'accuracy points');
  let text: string;
  if (w === 0 && a === 0) text = 'same WPM and same accuracy';
  else if (w !== 0 && a !== 0 && Math.sign(w) === Math.sign(a)) text = `${dir(w)} ${Math.abs(w)} WPM and ${Math.abs(a)} ${unit(a)}`;
  else {
    const wp = w === 0 ? 'same WPM' : `${dir(w)} ${Math.abs(w)} WPM`;
    const ap = a === 0 ? 'same accuracy' : `${dir(a)} ${Math.abs(a)} ${unit(a)}`;
    text = `${wp}, ${ap}`;
  }
  return `${text[0].toUpperCase()}${text.slice(1)} since Day 1`;
}
