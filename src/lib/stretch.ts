/**
 * Stretch break: a guided, visual-only timer. The advice is the ordinary, conservative kind that ergonomics guides give for
 * desk work: gentle movement, no forcing, stop if anything hurts. It makes no medical claims. Everything here is pure.
 */

export type StretchId = 'eyes' | 'wrists' | 'hands' | 'neck' | 'shoulders' | 'walk';

export interface StretchStep {
  id: StretchId;
  title: string;
  /** The body area (or rule) this step covers. */
  area: string;
  lines: string[];
  /** Done on one side, then the other: the screen says when to switch, at the halfway point. */
  sides: boolean;
  /** The least time the step should get. */
  minSeconds: number;
  /** Share of the spare time a longer break gives this step. */
  weight: number;
}

export const STRETCH_SAFETY = 'Move gently and only as far as feels comfortable. Stop any move that causes pain, numbness or tingling, and tell your instructor if it keeps happening.';

/** In the order a break goes: eyes first (look away from the screen), standing up and walking last. */
export const STRETCH_STEPS: StretchStep[] = [
  { id: 'eyes', area: '20-20-20', title: 'Rest your eyes (the 20-20-20 rule)', sides: false, minSeconds: 20, weight: 1, lines: [
    'Look away from the screen at something about 20 feet (6 meters) away, and keep looking for 20 seconds.',
    'Blink slowly a few times.',
    'Repeat this every 20 minutes while you work at a screen.',
  ] },
  { id: 'wrists', area: 'wrists and forearms', title: 'Wrists and forearms', sides: true, minSeconds: 30, weight: 2, lines: [
    'Hold one arm out in front of you with the elbow straight and the palm up.',
    'With your other hand, gently draw the fingers down and back until you feel a mild stretch, then hold.',
    'Switch arms at the halfway point. Then turn the palm down and gently press the back of the hand toward you.',
  ] },
  { id: 'hands', area: 'hands', title: 'Hands and fingers', sides: false, minSeconds: 20, weight: 1.5, lines: [
    'Make a loose fist, then spread your fingers wide. Repeat slowly.',
    'Touch each fingertip to your thumb, one at a time.',
    'Shake your hands out gently and let them hang relaxed.',
  ] },
  { id: 'neck', area: 'neck', title: 'Neck', sides: true, minSeconds: 30, weight: 2, lines: [
    'Sit or stand tall with your shoulders relaxed.',
    'Slowly tip one ear toward the same shoulder and hold. Do not pull on your head with your hand.',
    'Come back to center and switch sides at the halfway point. Keep every movement slow.',
  ] },
  { id: 'shoulders', area: 'shoulders', title: 'Shoulders and upper back', sides: false, minSeconds: 30, weight: 2, lines: [
    'Roll your shoulders back and down, slowly, a few times.',
    'Lift them toward your ears, then let them drop and relax.',
    'Gently squeeze your shoulder blades together, hold for a moment, and release.',
  ] },
  { id: 'walk', area: 'standing and walking', title: 'Stand up and walk', sides: false, minSeconds: 45, weight: 3, lines: [
    'Stand up and walk around the room or the hall. Have a drink of water if you like.',
    'Stand tall and breathe easily.',
    'Before you sit back down, check your setup: feet flat, screen at eye level, forearms relaxed.',
  ] },
];

export interface StretchPreset { minutes: number; steps: number; label: string }
export const STRETCH_PRESETS: StretchPreset[] = [
  { minutes: 3, steps: 4, label: '3-minute break' },
  { minutes: 5, steps: 5, label: '5-minute break' },
  { minutes: 10, steps: 6, label: '10-minute break' },
];

/** Which steps a break of each size includes. The eyes and the walk are always there. */
const INCLUDED: Record<number, StretchId[]> = {
  4: ['eyes', 'wrists', 'shoulders', 'walk'],
  5: ['eyes', 'wrists', 'neck', 'shoulders', 'walk'],
  6: ['eyes', 'wrists', 'hands', 'neck', 'shoulders', 'walk'],
};

export interface PlanStep extends StretchStep { seconds: number; /** Seconds from the start of the break. */ start: number }
export interface StretchPlan { minutes: number; totalSeconds: number; steps: PlanStep[] }

const BLOCK = 5;

/** The schedule for a break of 3 to 10 minutes: every step gets its minimum, and the spare time is shared by weight, in 5-second blocks. */
export function buildStretchPlan(minutes: number): StretchPlan {
  const m = Number.isFinite(minutes) ? Math.min(10, Math.max(3, Math.round(minutes))) : 5;
  const count = m < 5 ? 4 : m < 10 ? 5 : 6;
  const chosen = STRETCH_STEPS.filter((s) => INCLUDED[count].includes(s.id));
  const total = m * 60;

  // Spare blocks go out by largest remainder, so the steps always add up to the total exactly.
  const spare = (total - chosen.reduce((n, s) => n + s.minSeconds, 0)) / BLOCK;
  const weightSum = chosen.reduce((n, s) => n + s.weight, 0);
  const shares = chosen.map((s) => (spare * s.weight) / weightSum);
  const blocks = shares.map(Math.floor);
  let left = Math.round(spare) - blocks.reduce((n, b) => n + b, 0);
  shares.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i).forEach(({ i }) => { if (left > 0) { blocks[i]++; left--; } });

  let start = 0;
  const steps = chosen.map((s, i) => {
    const seconds = s.minSeconds + blocks[i] * BLOCK;
    const step: PlanStep = { ...s, lines: [...s.lines], seconds, start };
    start += seconds;
    return step;
  });
  return { minutes: m, totalSeconds: total, steps };
}

export interface StretchPosition {
  /** The current step; the last one once the break is done. */
  index: number;
  done: boolean;
  /** Seconds into this step. */
  into: number;
  /** Seconds left in this step. */
  left: number;
  /** Seconds left in the whole break. */
  totalLeft: number;
  /** For two-sided steps: which side to stretch. */
  side: 'first' | 'second' | null;
}

const clampTime = (plan: StretchPlan, elapsed: number): number => (Number.isFinite(elapsed) ? Math.min(plan.totalSeconds, Math.max(0, elapsed)) : 0);

/** Where `elapsed` seconds into the break puts you. */
export function locateStretch(plan: StretchPlan, elapsed: number): StretchPosition {
  const t = clampTime(plan, elapsed);
  if (t >= plan.totalSeconds) {
    const last = plan.steps[plan.steps.length - 1];
    return { index: plan.steps.length - 1, done: true, into: last.seconds, left: 0, totalLeft: 0, side: null };
  }
  let index = plan.steps.findIndex((s) => t >= s.start && t < s.start + s.seconds);
  if (index < 0) index = 0;
  const s = plan.steps[index];
  const into = t - s.start;
  return {
    index, done: false, into, left: s.seconds - into, totalLeft: plan.totalSeconds - t,
    side: s.sides ? (into < s.seconds / 2 ? 'first' : 'second') : null,
  };
}

/** The time at which the next step starts: the end of the break after the last step. */
export function skipToNextStep(plan: StretchPlan, elapsed: number): number {
  const t = clampTime(plan, elapsed);
  if (t >= plan.totalSeconds) return plan.totalSeconds;
  const here = locateStretch(plan, t).index;
  const next = plan.steps[here + 1];
  return next ? next.start : plan.totalSeconds;
}
