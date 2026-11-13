import { describe, expect, it } from 'vitest';
import { DRILLS } from '../index';
import { ALLERGY_DRUGS } from '../../test/rxReference';
import { CHART_DATES, ageOnDate, seeds } from '../../test/generated';
import { mulberry32 } from './rng';
import { FIRST_NAMES, LAST_NAMES, PROVIDERS, makePatient, providerSurname } from './patient';

const patients = (opts: Parameters<typeof makePatient>[1] = { today: CHART_DATES[0] }, n = 300) =>
  seeds(n).map((s) => makePatient(mulberry32(s), opts));

describe('name pools', () => {
  it('are plain single words with no repeats, and women’s and men’s first names do not overlap', () => {
    for (const pool of [FIRST_NAMES.F, FIRST_NAMES.M, LAST_NAMES]) {
      expect(new Set(pool).size).toBe(pool.length);
      for (const n of pool) expect(n, n).toMatch(/^[A-Z][a-z]+$/);
    }
    for (const n of FIRST_NAMES.F) expect(FIRST_NAMES.M, n).not.toContain(n);
    expect(FIRST_NAMES.F.length).toBeGreaterThanOrEqual(35);
    expect(FIRST_NAMES.M.length).toBeGreaterThanOrEqual(35);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(55);
  });

  it('never use a surname already used by a patient in the written drills, so nobody meets a second "Lopez, Maria"', () => {
    const used = new Set(DRILLS.flatMap((d) => d.items).flatMap((p) => (p.patient ? [p.patient.name.split(', ')[0]] : [])));
    expect(used.size).toBeGreaterThan(10);
    for (const s of LAST_NAMES) expect(used.has(s), s).toBe(false);
  });

  it('never repeat a name typed in the program typing tests, which must stay unseen until the test', () => {
    const exam = DRILLS.filter((d) => d.exam).flatMap((d) => d.items.map((p) => p.text)).join(' ');
    for (const s of LAST_NAMES) expect(exam, s).not.toMatch(new RegExp(`\\b${s}\\b`));
    for (const f of [...FIRST_NAMES.F, ...FIRST_NAMES.M]) expect(exam, f).not.toMatch(new RegExp(`\\b${f}\\b`));
  });

  it('never use a provider’s surname for a patient', () => {
    for (const p of PROVIDERS) expect(LAST_NAMES, p).not.toContain(providerSurname(p));
    expect(PROVIDERS.every((p) => /^Dr\. [A-Z]\. [A-Z][a-z]+$/.test(p))).toBe(true);
  });
});

describe('makePatient', () => {
  it('is fully filled in, in the formats the chart banner shows', () => {
    for (const today of CHART_DATES) for (const p of patients({ today })) {
      expect(p.name).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+$/);
      expect(p.dob).toMatch(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d\d$/);
      expect(p.mrn).toMatch(/^\d{7}$/);
      expect(p.allergies.trim().length).toBeGreaterThan(0);
      expect(['F', 'M']).toContain(p.sex);
      expect(PROVIDERS).toContain(p.provider);
    }
  });

  it('gives a real calendar date of birth', () => {
    for (const p of patients()) {
      const [m, d, y] = p.dob.split('/').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      expect([date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]).toEqual([y, m, d]);
    }
  });

  it('writes an age that matches the date of birth on the chart date, including on a leap day', () => {
    for (const today of CHART_DATES) for (const p of patients({ today })) {
      expect(p.age, p.dob).toMatch(/^\d+ y$/);
      expect(Number.parseInt(p.age, 10), `${p.dob} on ${today}`).toBe(ageOnDate(p.dob, today));
    }
  });

  it('keeps the age inside the requested range, adults by default', () => {
    for (const p of patients()) { const a = Number.parseInt(p.age, 10); expect(a).toBeGreaterThanOrEqual(18); expect(a).toBeLessThanOrEqual(89); }
    for (const p of patients({ today: CHART_DATES[0], minAge: 60, maxAge: 70 })) { const a = Number.parseInt(p.age, 10); expect(a).toBeGreaterThanOrEqual(60); expect(a).toBeLessThanOrEqual(70); }
    for (const p of patients({ today: CHART_DATES[0], minAge: 5, maxAge: 12 })) { const a = Number.parseInt(p.age, 10); expect(a).toBeGreaterThanOrEqual(5); expect(a).toBeLessThanOrEqual(12); }
  });

  it('honours the requested sex, and uses a first name from that sex’s pool', () => {
    for (const sex of ['F', 'M'] as const) for (const p of patients({ today: CHART_DATES[0], sex })) {
      expect(p.sex).toBe(sex);
      expect(FIRST_NAMES[sex], p.name).toContain(p.name.split(', ')[1]);
    }
    const both = new Set(patients().map((p) => p.sex));
    expect(both.size).toBe(2);
  });

  it('is repeatable: the same seed and date give the same patient', () => {
    for (const s of seeds(20)) expect(makePatient(mulberry32(s), { today: CHART_DATES[0] })).toEqual(makePatient(mulberry32(s), { today: CHART_DATES[0] }));
  });

  it('varies: many different names, dates of birth and allergy lists, and about half have no known allergies', () => {
    const ps = patients();
    expect(new Set(ps.map((p) => p.name)).size).toBeGreaterThan(200);
    expect(new Set(ps.map((p) => p.dob)).size).toBeGreaterThan(200);
    expect(new Set(ps.map((p) => p.allergies)).size).toBeGreaterThanOrEqual(8);
    const nkda = ps.filter((p) => p.allergies === 'NKDA').length / ps.length;
    expect(nkda).toBeGreaterThan(0.3);
    expect(nkda).toBeLessThan(0.7);
  });

  it('writes allergies as "Substance (reaction)" separated by commas, or exactly NKDA', () => {
    for (const p of patients()) {
      if (p.allergies === 'NKDA') continue;
      for (const a of p.allergies.split(', ')) expect(a, p.allergies).toMatch(/^[A-Z][A-Za-z ]+ \([a-z ]+\)$/);
    }
  });

  it('keeps away from the allergies it is told to avoid, in every wording', () => {
    for (const avoid of [['penicillin'], ['sulfa'], ['nsaid'], ['penicillin', 'sulfa', 'nsaid']] as const) {
      for (const p of patients({ today: CHART_DATES[0], avoid })) {
        const text = p.allergies.toLowerCase();
        for (const key of avoid) {
          const words = key === 'nsaid' ? ['aspirin', 'nsaid', 'ibuprofen', 'naproxen'] : key === 'sulfa' ? ['sulfa'] : ['penicillin', 'amoxicillin'];
          for (const w of words) expect(text, `${key}: ${p.allergies}`).not.toContain(w);
        }
      }
    }
  });

  it('can still have the other allergies when it avoids one', () => {
    const ps = patients({ today: CHART_DATES[0], avoid: ['penicillin'] });
    expect(ps.some((p) => p.allergies !== 'NKDA')).toBe(true);
  });

  it('lists only allergies whose drugs the tests know about, so the conflict checks cover them all', () => {
    const known = Object.keys(ALLERGY_DRUGS);
    for (const p of patients()) {
      if (p.allergies === 'NKDA') continue;
      for (const a of p.allergies.split(', ')) {
        const drugLike = /penicillin|sulfa|codeine|aspirin|nsaid/i.test(a);
        if (drugLike) expect(known.some((k) => a.toLowerCase().includes(k)), a).toBe(true);
      }
    }
  });

  it('never puts do-not-use abbreviations in the banner', () => {
    for (const p of patients()) expect(Object.values(p).join(' ')).not.toMatch(/\b(QD|QOD|IU|MS|MSO4|MgSO4)\b/);
  });
});
