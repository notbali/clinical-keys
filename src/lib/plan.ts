/**
 * Per-class day plan.
 *
 * A student's school-day count N (Day 1 is the first school day on or after their start date, see `programDay`)
 * is mapped through the class plan to an ORIGINAL program day. The plan lists, in teaching order, the original
 * days the class is taught; a day that is not listed is skipped (not shown as the day's work, not assigned and not
 * graded). Attempts and grades stay keyed by the original day number and activity index, so nothing already
 * saved moves. The default plan is Day 1 to Day 10 in order, which behaves exactly as before plans existed.
 */
export const PROGRAM_DAYS = 10;

export interface ClassPlan {
  /** Original program days (1 to 10) in the order they are taught. Days left out are skipped. */
  days: number[];
}

/** Anything that carries a plan, such as the student's settings in the student screens. */
export interface WithPlan { classPlan?: ClassPlan }

const ALL_DAYS = Array.from({ length: PROGRAM_DAYS }, (_, i) => i + 1);

export const defaultPlan = (): ClassPlan => ({ days: [...ALL_DAYS] });

export function isDefaultPlan(plan: ClassPlan | null | undefined): boolean {
  if (!plan) return true;
  return plan.days.length === PROGRAM_DAYS && plan.days.every((d, i) => d === i + 1);
}

/** Returns a message describing what is wrong with `plan`, or null when it is a valid plan. */
export function validatePlan(plan: unknown): string | null {
  if (typeof plan !== 'object' || plan === null || !Array.isArray((plan as { days?: unknown }).days)) {
    return 'A plan needs a list of days.';
  }
  const days = (plan as { days: unknown[] }).days;
  if (days.length === 0) return 'Teach at least one day.';
  if (days.length > PROGRAM_DAYS) return `A plan can have at most ${PROGRAM_DAYS} days.`;
  const seen = new Set<number>();
  for (const d of days) {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > PROGRAM_DAYS) return `Days must be whole numbers from 1 to ${PROGRAM_DAYS}.`;
    if (seen.has(d)) return `Day ${d} can only be listed once.`;
    seen.add(d);
  }
  return null;
}

/** Saved or loaded data that is missing or damaged becomes the default plan. Always returns a copy. */
export function normalizePlan(raw: unknown): ClassPlan {
  return validatePlan(raw) === null ? { days: [...(raw as ClassPlan).days] } : defaultPlan();
}

/** Days taught, in teaching order. */
export const taughtDays = (plan?: ClassPlan | null): number[] => (plan ? plan.days : ALL_DAYS);
/** Days skipped, ascending. */
export const skippedDays = (plan?: ClassPlan | null): number[] => {
  const taught = new Set(taughtDays(plan));
  return ALL_DAYS.filter((d) => !taught.has(d));
};
export const programLength = (plan?: ClassPlan | null): number => taughtDays(plan).length;
/** 1-based position of an original day in the teaching order, or 0 if it is skipped. */
export const positionOfDay = (plan: ClassPlan | null | undefined, day: number): number => taughtDays(plan).indexOf(day) + 1;
export const isAssigned = (plan: ClassPlan | null | undefined, day: number): boolean => positionOfDay(plan, day) > 0;

/**
 * The original program day a student sees on their `position`-th school day (`programDay` of the dates).
 * 0 before they start. Past the end of the plan it counts up from 11, so "above 10" still means finished
 * (with the default plan this is just `position`).
 */
export function effectiveDay(plan: ClassPlan | null | undefined, position: number): number {
  if (position <= 0) return 0;
  const days = taughtDays(plan);
  return position <= days.length ? days[position - 1] : PROGRAM_DAYS + (position - days.length);
}

/**
 * The original days that count as assigned for a student whose current (effective) day is `throughDay`:
 * everything taught up to and including it, in teaching order. Above 10 (finished) it is everything taught.
 * A skipped day number means "the taught days numbered no higher than it".
 */
export function assignedDays(plan: ClassPlan | null | undefined, throughDay: number): number[] {
  const days = taughtDays(plan);
  if (throughDay < 1) return [];
  if (throughDay > PROGRAM_DAYS) return [...days];
  const at = days.indexOf(throughDay);
  return at >= 0 ? days.slice(0, at + 1) : days.filter((d) => d <= throughDay);
}

/* ---- Editing helpers (pure; the instructor screen and tests use these) ---- */

/** Moves a taught day one place earlier (-1) or later (1). No change at the ends or for a skipped day. */
export function moveDay(plan: ClassPlan, day: number, dir: -1 | 1): ClassPlan {
  const days = [...plan.days];
  const i = days.indexOf(day);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= days.length) return { days };
  [days[i], days[j]] = [days[j], days[i]];
  return { days };
}

/** Skips a day. The last remaining day cannot be skipped. */
export function skipDay(plan: ClassPlan, day: number): ClassPlan {
  if (plan.days.length <= 1 || !plan.days.includes(day)) return { days: [...plan.days] };
  return { days: plan.days.filter((d) => d !== day) };
}

/** Puts a skipped day back before the first taught day with a higher number, or at the end. */
export function restoreDay(plan: ClassPlan, day: number): ClassPlan {
  if (plan.days.includes(day)) return { days: [...plan.days] };
  const at = plan.days.findIndex((d) => d > day);
  const days = [...plan.days];
  days.splice(at < 0 ? days.length : at, 0, day);
  return { days };
}
