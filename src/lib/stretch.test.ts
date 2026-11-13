import { describe, expect, it } from 'vitest';
import { STRETCH_PRESETS, STRETCH_SAFETY, STRETCH_STEPS, buildStretchPlan, locateStretch, skipToNextStep } from './stretch';

const AREAS = ['wrists and forearms', 'neck', 'shoulders', 'standing and walking', 'hands', '20-20-20'];

describe('the stretch prompts', () => {
  it('cover wrists and forearms, neck, shoulders, standing and walking, hands and the 20-20-20 eye rule, each once', () => {
    expect(STRETCH_STEPS).toHaveLength(6);
    expect(STRETCH_STEPS.map((s) => s.area).sort()).toEqual([...AREAS].sort());
    expect(new Set(STRETCH_STEPS.map((s) => s.id)).size).toBe(STRETCH_STEPS.length);
  });

  it('have a title and two or three short, plain lines each, with nothing that needs sound', () => {
    for (const s of STRETCH_STEPS) {
      expect(s.title.trim().length, s.id).toBeGreaterThan(0);
      expect(s.lines.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.lines.length, s.id).toBeLessThanOrEqual(4);
      for (const l of s.lines) { expect(l.length, `${s.id}: ${l}`).toBeGreaterThan(10); expect(l.length, `${s.id}: ${l}`).toBeLessThanOrEqual(190); }
      expect(`${s.title} ${s.lines.join(' ')}`.toLowerCase(), s.id).not.toMatch(/\b(listen|hear|beep|chime|sound|audio)\b/);
    }
  });

  it('describe the 20-20-20 rule exactly: every 20 minutes, look 20 feet away, for 20 seconds', () => {
    const eyes = STRETCH_STEPS.find((s) => s.area === '20-20-20')!;
    const text = `${eyes.title} ${eyes.lines.join(' ')}`;
    expect(eyes.title).toMatch(/20-20-20/);
    expect(text).toMatch(/20 feet/);
    expect(text).toMatch(/20 seconds/);
    expect(text).toMatch(/20 minutes/);
    expect(eyes.minSeconds).toBeGreaterThanOrEqual(20);
  });

  it('stay conservative: gentle, no forcing, no head circles, no medical claims or promises', () => {
    const all = STRETCH_STEPS.map((s) => `${s.title} ${s.lines.join(' ')}`).join(' ').toLowerCase();
    expect(all).toMatch(/gentl/);
    expect(all).not.toMatch(/\b(cure|cures|treat|treats|prevent|prevents|heal|heals|therapy|diagnos\w*|relieve|relieves|carpal|arthritis|tendon\w*|injur\w*)\b/);
    expect(all).not.toMatch(/head circles|roll your head|circle your head|crack|pop your|force|as hard as|until it hurts|no pain, no gain/);
    expect(all).not.toMatch(/pain-free|guarantee/);
    const neck = STRETCH_STEPS.find((s) => s.area === 'neck')!;
    expect(neck.lines.join(' ').toLowerCase()).toMatch(/do not pull|don.t pull|never pull/);
  });

  it('come with a safety line that says to stop if anything hurts and makes no medical claim', () => {
    expect(STRETCH_SAFETY).toMatch(/stop/i);
    expect(STRETCH_SAFETY).toMatch(/pain|hurt/i);
    expect(STRETCH_SAFETY).toMatch(/numb|tingl/i);
    expect(STRETCH_SAFETY).not.toMatch(/\b(cure|treat|prevent|heal)\w*/i);
  });
});

describe('the stretch presets', () => {
  it('are 3, 5 and 10 minutes, with 4 to 6 prompts, and more prompts for a longer break', () => {
    expect(STRETCH_PRESETS.map((p) => p.minutes)).toEqual([3, 5, 10]);
    for (const p of STRETCH_PRESETS) { expect(p.steps).toBeGreaterThanOrEqual(4); expect(p.steps).toBeLessThanOrEqual(6); expect(p.label).toContain(String(p.minutes)); }
    expect(STRETCH_PRESETS.map((p) => p.steps)).toEqual([4, 5, 6]);
  });
});

describe('the step schedule', () => {
  it('lasts exactly the minutes asked for, with every step in order and back to back', () => {
    for (const p of STRETCH_PRESETS) {
      const plan = buildStretchPlan(p.minutes);
      expect(plan.totalSeconds).toBe(p.minutes * 60);
      expect(plan.steps).toHaveLength(p.steps);
      expect(plan.steps[0].start).toBe(0);
      plan.steps.forEach((s, i) => { if (i > 0) expect(s.start, `${p.minutes} min step ${i}`).toBe(plan.steps[i - 1].start + plan.steps[i - 1].seconds); });
      const last = plan.steps[plan.steps.length - 1];
      expect(last.start + last.seconds).toBe(plan.totalSeconds);
      expect(plan.steps.reduce((n, s) => n + s.seconds, 0)).toBe(plan.totalSeconds);
    }
  });

  it('gives every step at least its minimum, in whole 5-second blocks, and always includes the eyes and the walk', () => {
    for (let m = 3; m <= 10; m++) {
      const plan = buildStretchPlan(m);
      for (const s of plan.steps) { expect(s.seconds, `${m} min ${s.id}`).toBeGreaterThanOrEqual(s.minSeconds); expect(s.seconds % 5).toBe(0); expect(Number.isInteger(s.seconds)).toBe(true); }
      const eyes = plan.steps.find((s) => s.area === '20-20-20')!;
      expect(eyes.seconds).toBeGreaterThanOrEqual(20);
      expect(plan.steps.some((s) => s.area === 'standing and walking')).toBe(true);
      expect(plan.steps.some((s) => s.area === 'wrists and forearms')).toBe(true);
    }
  });

  it('has 4 prompts for under 5 minutes, 5 for 5 to 9, and all 6 for 10, each a different step from the bank, in the bank’s order', () => {
    const order = STRETCH_STEPS.map((s) => s.id);
    for (const [m, n] of [[3, 4], [4, 4], [5, 5], [7, 5], [9, 5], [10, 6]] as const) {
      const ids = buildStretchPlan(m).steps.map((s) => s.id);
      expect(ids, `${m} min`).toHaveLength(n);
      expect(new Set(ids).size).toBe(n);
      expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    }
  });

  it('starts by resting the eyes and ends on standing up and walking', () => {
    for (const m of [3, 5, 10]) {
      const ids = buildStretchPlan(m).steps.map((s) => s.area);
      expect(ids[0]).toBe('20-20-20');
      expect(ids[ids.length - 1]).toBe('standing and walking');
    }
  });

  it('is the same plan every time, gives the longer break more time for each step, and keeps out-of-range minutes inside 3 to 10', () => {
    expect(buildStretchPlan(5)).toEqual(buildStretchPlan(5));
    const walk = (m: number) => buildStretchPlan(m).steps.find((s) => s.area === 'standing and walking')!.seconds;
    expect(walk(10)).toBeGreaterThan(walk(5));
    expect(walk(5)).toBeGreaterThanOrEqual(walk(3));
    expect(buildStretchPlan(1).totalSeconds).toBe(180);
    expect(buildStretchPlan(99).totalSeconds).toBe(600);
    expect(buildStretchPlan(Number.NaN).totalSeconds).toBe(300);
    expect(buildStretchPlan(4.4).totalSeconds).toBe(240);
  });
});

describe('finding where you are in the plan', () => {
  const plan = buildStretchPlan(5);

  it('starts on the first step and reports the time left in the step and in the break', () => {
    const at = locateStretch(plan, 0);
    expect(at).toMatchObject({ index: 0, done: false, into: 0, left: plan.steps[0].seconds, totalLeft: 300 });
  });

  it('moves to the next step exactly when the last one ends', () => {
    plan.steps.forEach((s, i) => {
      expect(locateStretch(plan, s.start).index).toBe(i);
      expect(locateStretch(plan, s.start + s.seconds - 0.001).index).toBe(i);
    });
    const second = plan.steps[1];
    expect(locateStretch(plan, second.start + 3)).toMatchObject({ index: 1, into: 3, left: second.seconds - 3, totalLeft: 300 - second.start - 3 });
  });

  it('is done at the end, and stays done past it; negative time counts as the start', () => {
    expect(locateStretch(plan, 300)).toMatchObject({ done: true, totalLeft: 0 });
    expect(locateStretch(plan, 9999)).toMatchObject({ done: true, totalLeft: 0 });
    expect(locateStretch(plan, -5)).toMatchObject({ index: 0, done: false, into: 0 });
    expect(locateStretch(plan, Number.NaN)).toMatchObject({ index: 0, done: false });
  });

  it('says which side to stretch, and switches at the halfway point, only for steps with two sides', () => {
    for (const s of plan.steps) {
      const first = locateStretch(plan, s.start + 1);
      const second = locateStretch(plan, s.start + s.seconds - 1);
      if (s.sides) { expect(first.side, s.id).toBe('first'); expect(second.side, s.id).toBe('second'); expect(locateStretch(plan, s.start + s.seconds / 2).side).toBe('second'); }
      else { expect(first.side, s.id).toBeNull(); expect(second.side, s.id).toBeNull(); }
    }
    expect(plan.steps.some((s) => s.sides)).toBe(true);
    expect(plan.steps.some((s) => !s.sides)).toBe(true);
  });
});

describe('skipping a step', () => {
  const plan = buildStretchPlan(10);

  it('jumps to the start of the next step from anywhere inside a step', () => {
    plan.steps.slice(0, -1).forEach((s, i) => {
      for (const into of [0, 1, s.seconds / 2, s.seconds - 0.5]) expect(skipToNextStep(plan, s.start + into), `step ${i} +${into}`).toBe(plan.steps[i + 1].start);
    });
  });

  it('ends the break when you skip the last step, and never moves backwards', () => {
    const last = plan.steps[plan.steps.length - 1];
    expect(skipToNextStep(plan, last.start + 2)).toBe(plan.totalSeconds);
    expect(skipToNextStep(plan, plan.totalSeconds)).toBe(plan.totalSeconds);
    expect(skipToNextStep(plan, 99999)).toBe(plan.totalSeconds);
    for (let t = 0; t <= plan.totalSeconds; t += 7) expect(skipToNextStep(plan, t)).toBeGreaterThan(Math.min(t, plan.totalSeconds - 1));
    expect(skipToNextStep(plan, -10)).toBe(plan.steps[1].start);
  });

  it('lands on a new step every time, so skipping through goes step by step to done', () => {
    let t = 0;
    const seen: number[] = [];
    for (let guard = 0; guard < 20 && !locateStretch(plan, t).done; guard++) { seen.push(locateStretch(plan, t).index); t = skipToNextStep(plan, t); }
    expect(seen).toEqual(plan.steps.map((_, i) => i));
    expect(locateStretch(plan, t).done).toBe(true);
  });
});
