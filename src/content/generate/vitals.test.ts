import { describe, expect, it } from 'vitest';
import { seeds } from '../../test/generated';
import { mulberry32 } from './rng';
import { bodyLine, makeBody, makeVitals, vitalsLine, type VitalsProfile } from './vitals';

const PROFILES: VitalsProfile[] = ['routine', 'elevated', 'febrile'];
const vitals = (profile: VitalsProfile) => seeds(400).map((s) => makeVitals(mulberry32(s), profile));

describe('makeVitals: believable numbers for an adult', () => {
  it('stays inside a plausible range for every profile', () => {
    for (const profile of PROFILES) for (const v of vitals(profile)) {
      const where = `${profile}: ${JSON.stringify(v)}`;
      expect(v.sys, where).toBeGreaterThanOrEqual(100); expect(v.sys, where).toBeLessThanOrEqual(170);
      expect(v.dia, where).toBeGreaterThanOrEqual(60); expect(v.dia, where).toBeLessThanOrEqual(100);
      expect(v.sys - v.dia, `${where}: pulse pressure`).toBeGreaterThanOrEqual(30);
      expect(v.sys - v.dia, `${where}: pulse pressure`).toBeLessThanOrEqual(80);
      expect(v.pulse, where).toBeGreaterThanOrEqual(56); expect(v.pulse, where).toBeLessThanOrEqual(112);
      expect(v.resp, where).toBeGreaterThanOrEqual(12); expect(v.resp, where).toBeLessThanOrEqual(22);
      expect(v.spo2, where).toBeGreaterThanOrEqual(95); expect(v.spo2, where).toBeLessThanOrEqual(100);
      expect(v.tempF, where).toBeGreaterThanOrEqual(97); expect(v.tempF, where).toBeLessThanOrEqual(103);
    }
  });

  it('keeps a routine set normal, an elevated set high, and a febrile set feverish', () => {
    for (const v of vitals('routine')) { expect(v.sys).toBeLessThanOrEqual(134); expect(v.dia).toBeLessThanOrEqual(84); expect(v.tempF).toBeLessThanOrEqual(99.2); expect(v.pulse).toBeLessThanOrEqual(96); }
    for (const v of vitals('elevated')) { expect(v.sys).toBeGreaterThanOrEqual(138); expect(v.dia).toBeGreaterThanOrEqual(86); expect(v.tempF).toBeLessThanOrEqual(99.2); }
    for (const v of vitals('febrile')) { expect(v.tempF).toBeGreaterThanOrEqual(100.4); expect(v.tempF).toBeLessThanOrEqual(102.8); expect(v.pulse).toBeGreaterThanOrEqual(88); }
  });

  it('gives a temperature with one decimal place, and whole numbers for everything else', () => {
    for (const v of vitals('routine')) {
      expect(Math.round(v.tempF * 10) / 10).toBe(v.tempF);
      for (const n of [v.sys, v.dia, v.pulse, v.resp, v.spo2]) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('is repeatable', () => {
    for (const s of seeds(10)) expect(makeVitals(mulberry32(s), 'routine')).toEqual(makeVitals(mulberry32(s), 'routine'));
  });

  it('varies from run to run', () => {
    expect(new Set(vitals('routine').map((v) => `${v.sys}/${v.dia}`)).size).toBeGreaterThan(60);
  });
});

describe('vitalsLine', () => {
  it('uses the chart format of the written drills', () => {
    for (const v of vitals('routine').slice(0, 50)) {
      expect(vitalsLine(v)).toMatch(/^BP \d{2,3}\/\d{2,3} mmHg, P \d{2,3} bpm, R \d{2}, T \d{2,3}\.\d F \(oral\), SpO2 \d{2,3}% on room air\.$/);
    }
  });

  it('writes the numbers it was given', () => {
    expect(vitalsLine({ sys: 128, dia: 84, pulse: 76, resp: 16, tempF: 98.6, spo2: 98 })).toBe('BP 128/84 mmHg, P 76 bpm, R 16, T 98.6 F (oral), SpO2 98% on room air.');
  });
});

describe('makeBody and bodyLine: height, weight and BMI that agree', () => {
  const bodies = (sex: 'F' | 'M') => seeds(400).map((s) => makeBody(mulberry32(s), sex));

  it('gives a plausible height for each sex and a BMI between underweight-free and obese class 1', () => {
    for (const b of bodies('F')) { expect(b.heightIn).toBeGreaterThanOrEqual(60); expect(b.heightIn).toBeLessThanOrEqual(69); }
    for (const b of bodies('M')) { expect(b.heightIn).toBeGreaterThanOrEqual(64); expect(b.heightIn).toBeLessThanOrEqual(76); }
    for (const sex of ['F', 'M'] as const) for (const b of bodies(sex)) { expect(b.bmi).toBeGreaterThanOrEqual(19); expect(b.bmi).toBeLessThanOrEqual(35); }
  });

  it('computes BMI from the printed height and weight (703 x lb / in squared)', () => {
    for (const sex of ['F', 'M'] as const) for (const b of bodies(sex)) {
      expect(Number.isInteger(b.weightLb)).toBe(true);
      expect(Math.abs(b.bmi - (703 * b.weightLb) / (b.heightIn * b.heightIn)), JSON.stringify(b)).toBeLessThanOrEqual(0.051);
      expect(Math.round(b.bmi * 10) / 10).toBe(b.bmi);
    }
  });

  it('writes feet and inches the way the written drills do, and a BMI that matches the numbers', () => {
    expect(bodyLine({ heightIn: 66, weightLb: 154, bmi: 24.9 })).toBe('Ht 5 ft 6 in, Wt 154 lb, BMI 24.9.');
    expect(bodyLine({ heightIn: 72, weightLb: 182, bmi: 24.7 })).toBe('Ht 6 ft 0 in, Wt 182 lb, BMI 24.7.');
    for (const b of bodies('M').slice(0, 40)) {
      const m = /^Ht (\d) ft (\d{1,2}) in, Wt (\d+) lb, BMI (\d+\.\d)\.$/.exec(bodyLine(b));
      expect(m).toBeTruthy();
      expect(Number(m![1]) * 12 + Number(m![2])).toBe(b.heightIn);
    }
  });
});
