import { describe, expect, it } from 'vitest';
import { makeChartPassage } from './maChart';
import { mulberry32 } from './rng';
import { CHART_DATES, ageOnDate, expectSafeNotation, expectTypeable, expectValidCtx, seeds } from '../../test/generated';

const all = () => CHART_DATES.flatMap((today) => seeds(150).map((s) => ({ today, s, p: makeChartPassage(mulberry32(s), today) })));

describe('makeChartPassage (the hidden-mode MA drill)', () => {
  it('is repeatable from its seed', () => {
    for (const s of seeds(10)) expect(makeChartPassage(mulberry32(s), CHART_DATES[0])).toEqual(makeChartPassage(mulberry32(s), CHART_DATES[0]));
  });

  it('gives the facts in the scenario and states the format rules, and the answer is typeable and safe', () => {
    for (const { s, p } of all()) {
      const where = `seed ${s}`;
      expectValidCtx(p.ctx, where);
      expect(p.ctx, where).toMatch(/Facts:/);
      expect(p.ctx, where).toMatch(/Chart it/);
      expect(p.flawed, where).toBeUndefined();
      expectTypeable(p.text, where);
      expectSafeNotation(p.text, where);
    }
  });

  it('only asks for numbers that the scenario has given', () => {
    for (const { s, p } of all()) {
      const facts = p.ctx.split('Chart it')[0];
      for (const n of p.text.match(/(?<![A-Za-z])\d+(?:[.:/]\d+)*/g) ?? []) expect(facts, `seed ${s}: ${n} in "${p.text}"`).toContain(n);
    }
  });

  it('uses the standard formats for each kind of entry', () => {
    const kinds = new Set<string>();
    for (const { s, p } of all()) {
      const t = p.text;
      const where = `seed ${s}: ${t}`;
      if (t.startsWith('Pt is a')) { kinds.add('intake'); expect(t, where).toMatch(/^Pt is a \d+ y\/o (female|male)\. CC: [a-z ]+ x \d+ (days?|weeks?)\. BP \d+\/\d+ mmHg\. Pain \d\/10\.$/); }
      else if (t.startsWith('BP ')) { kinds.add('vitals'); expect(t, where).toMatch(/^BP \d+\/\d+ mmHg, P \d+ bpm, R \d+, T \d+\.\d F \(oral\), SpO2 \d+% on room air\.$/); }
      else if (t.startsWith('Allergies:')) { kinds.add('meds'); expect(t, where).toMatch(/^Allergies: .+\. Meds: .+ \d+(\.\d)? (mcg|mg) .+\.$/); }
      else if (t.startsWith('Glucose')) { kinds.add('glucose'); expect(t, where).toMatch(/^Glucose \(fingerstick\) \d+ mg\/dL at \d{1,2}:\d\d a\.m\., fasting\.$/); }
      else throw new Error(`unknown format: ${t}`);
    }
    expect([...kinds].sort()).toEqual(['glucose', 'intake', 'meds', 'vitals']);
  });

  it('never writes QD for once a day, and writes the other frequencies as the scenario rules say', () => {
    let meds = 0;
    for (const { p } of all()) {
      if (!p.text.startsWith('Allergies:')) continue;
      meds++;
      expect(p.text).not.toMatch(/\bQD\b/);
      expect(p.text).toMatch(/\b(daily|BID|TID|every morning|every evening|at bedtime|every \d+ hours|QID)\b/);
      expect(p.ctx).toMatch(/BID/);
    }
    expect(meds).toBeGreaterThan(100);
  });

  it('carries a chart banner that agrees with the answer', () => {
    for (const { today, s, p } of all()) {
      const pt = p.patient!;
      const where = `seed ${s}`;
      expect(pt, where).toBeTruthy();
      expect(Number.parseInt(pt.age, 10), where).toBe(ageOnDate(pt.dob, today));
      const yo = p.text.match(/(\d+) y\/o (female|male)/);
      if (yo) { expect(`${yo[1]} y`, where).toBe(pt.age); expect(pt.sex, where).toBe(yo[2] === 'female' ? 'F' : 'M'); }
      if (p.text.startsWith('Allergies:')) expect(p.text, where).toContain(`Allergies: ${pt.allergies}. Meds:`);
    }
  });

  it('does not give a patient a drug in a family they are allergic to', () => {
    for (const { s, p } of all()) {
      const a = p.patient!.allergies.toLowerCase();
      const meds = p.text.split('Meds:')[1]?.toLowerCase() ?? '';
      if (a.includes('nsaid') || a.includes('aspirin')) expect(meds, `seed ${s}`).not.toMatch(/meloxicam|ibuprofen|naproxen/);
      if (a.includes('sulfa')) expect(meds, `seed ${s}`).not.toMatch(/sulfa|trimethoprim/);
      if (a.includes('penicillin')) expect(meds, `seed ${s}`).not.toMatch(/amoxicillin/);
    }
  });
});
