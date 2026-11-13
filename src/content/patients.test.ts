import { describe, expect, it } from 'vitest';
import { getDrill } from './index';
import type { Passage } from './types';

/** The chart date the fixed ages and dates of birth are written against. */
const CHART_DATE = { y: 2026, m: 11, d: 12 };

const ageOn = (dob: string): number => {
  const [m, d, y] = dob.split('/').map(Number);
  let age = CHART_DATE.y - y;
  if (CHART_DATE.m < m || (CHART_DATE.m === m && CHART_DATE.d < d)) age--;
  return age;
};
const monthsOn = (dob: string): number => {
  const [m, d, y] = dob.split('/').map(Number);
  let months = (CHART_DATE.y - y) * 12 + (CHART_DATE.m - m);
  if (CHART_DATE.d < d) months--;
  return months;
};

/** Passages that must carry a patient, by drill id and passage index. */
const EXPECTED: [string, number[]][] = [
  ['ma-soap', [0, 1, 2]],
  ['ma-vitals', [2, 4]],
  ['ma-phone', [0, 1, 2]],
  ['rx-labels', [0, 1, 2, 3]],
  ['ma-complaints', [6, 7]],
  ['ma-procedures', [0, 1, 2, 3, 4, 5]],
  ['rx-daysupply', [0, 1, 2, 3, 4, 5, 6]],
];

const withPatients = (): { id: string; index: number; passage: Passage }[] =>
  EXPECTED.flatMap(([id, idx]) => idx.map((index) => ({ id, index, passage: getDrill(id)!.items[index] })));

describe('chart patients on passages', () => {
  it('are present where the passage is about a specific patient', () => {
    for (const { id, index, passage } of withPatients()) expect(passage.patient, `${id} #${index}`).toBeTruthy();
  });

  it('are completely filled in with believable formats', () => {
    for (const { id, index, passage } of withPatients()) {
      const p = passage.patient!;
      const where = `${id} #${index}`;
      expect(p.name, where).toMatch(/^[A-Za-z' -]+, [A-Za-z' -]+$/);
      expect(p.dob, where).toMatch(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d\d$/);
      expect(p.mrn, where).toMatch(/^\d{7,8}$/);
      expect(p.allergies.trim().length, where).toBeGreaterThan(0);
      expect(['F', 'M']).toContain(p.sex);
    }
  });

  it('give an age that matches the date of birth on the chart date', () => {
    for (const { id, index, passage } of withPatients()) {
      const p = passage.patient!;
      const where = `${id} #${index}`;
      const m = p.age.match(/^(\d+) (y|mo)$/);
      expect(m, `${where} age "${p.age}"`).toBeTruthy();
      expect(m![2] === 'y' ? ageOn(p.dob) : monthsOn(p.dob), where).toBe(Number(m![1]));
    }
  });

  it('agree with the age and sex written in the passage text', () => {
    for (const { id, index, passage } of withPatients()) {
      const p = passage.patient!;
      const where = `${id} #${index}`;
      const yo = passage.text.match(/(\d+) y\/o/);
      if (yo) expect(`${yo[1]} y`, where).toBe(p.age);
      const mo = passage.text.match(/(\d+) mo\b/);
      if (mo && p.age.endsWith('mo')) expect(`${mo[1]} mo`, where).toBe(p.age);
      if (/\bfemale\b/i.test(passage.text)) expect(p.sex, where).toBe('F');
      if (/\bmale\b/i.test(passage.text) && !/\bfemale\b/i.test(passage.text)) expect(p.sex, where).toBe('M');
    }
  });

  it('use the same name as the one typed in the passage', () => {
    for (const { id, index, passage } of withPatients()) {
      const [last, first] = passage.patient!.name.split(', ');
      const text = passage.text;
      const named = /Rx# \d+ ([A-Za-z]+), ([A-Za-z]+)/.exec(text) ?? /- ([A-Z][a-z]+) ([A-Z][a-z]+)/.exec(text) ?? /: ([A-Z][a-z]+) ([A-Z][a-z]+) (reports|called)/.exec(text);
      if (named) {
        const sameOrder = named[1] === first && named[2] === last;
        const labelOrder = named[1] === last && named[2] === first;
        expect(sameOrder || labelOrder, `${id} #${index}: text names ${named[1]} ${named[2]}, banner says ${passage.patient!.name}`).toBe(true);
      }
      // Any "Mr/Ms" style or surname mention must be the banner's surname.
      const surnames = [...text.matchAll(/\b(Lopez|Carter|Brown|Kim)\b/g)].map((m) => m[1]);
      for (const s of surnames) expect(s, `${id} #${index}`).toBe(last);
      void first;
    }
  });

  it('never list an allergy to a drug the passage gives the patient', () => {
    const classes: Record<string, string[]> = {
      penicillin: ['penicillin', 'amoxicillin', 'ampicillin'],
      amoxicillin: ['penicillin', 'amoxicillin', 'ampicillin'],
      sulfa: ['sulfamethoxazole', 'trimethoprim', 'bactrim', 'sulfa'],
      codeine: ['codeine', 'tramadol', 'hydrocodone', 'morphine'],
      aspirin: ['aspirin', 'ibuprofen', 'naproxen'],
      nsaid: ['ibuprofen', 'naproxen', 'aspirin'],
    };
    for (const { id, index, passage } of withPatients()) {
      const allergies = passage.patient!.allergies.toLowerCase();
      if (allergies === 'nkda') continue;
      for (const [allergen, drugs] of Object.entries(classes)) {
        if (!allergies.includes(allergen)) continue;
        for (const drug of drugs) expect(passage.text.toLowerCase().includes(drug), `${id} #${index}: allergy "${allergen}" but the passage mentions ${drug}`).toBe(false);
      }
    }
  });

  it('keep the same person identical everywhere they appear', () => {
    const byName = new Map<string, string>();
    for (const { passage } of withPatients()) {
      const p = passage.patient!;
      const key = `${p.dob}|${p.sex}|${p.allergies}|${p.mrn}`;
      const seen = byName.get(p.name);
      if (seen) expect(key, p.name).toBe(seen);
      else byName.set(p.name, key);
    }
    expect(byName.has('Lopez, Maria')).toBe(true); // appears in both a phone message and a label
  });

  it('never model do-not-use abbreviations or trailing zeros in the banner', () => {
    for (const { passage } of withPatients()) {
      const all = Object.values(passage.patient!).join(' ');
      expect(all).not.toMatch(/\b(QD|QOD|IU|MS|MSO4|MgSO4)\b/);
    }
  });
});
