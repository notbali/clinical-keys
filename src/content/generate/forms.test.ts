import { describe, expect, it } from 'vitest';
import { ALLERGY_DRUGS } from '../../test/rxReference';
import { CHART_DATES, ageOnDate, expectSafeNotation, expectTallManNames, expectTypeable, seeds } from '../../test/generated';
import { gradeField, gradeForm } from '../../forms/grade';
import type { FormField, FormTask } from '../../forms/types';
import { windowTitle } from '../../lib/ehrLabels';
import { FORM_DRILL_IDS, makeFormTask } from './forms';
import { FIRST_NAMES, LAST_NAMES, PROVIDERS } from './patient';
import { allOrders } from './rxCatalog';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const tasks = (track: 'ma' | 'rx', date: string = CHART_DATES[0], n = 150): FormTask[] => seeds(n).map((s) => makeFormTask(track, s, date));
const field = (t: FormTask, id: string): FormField => {
  const x = t.fields.find((f) => f.id === id);
  expect(x, `${t.drillId} field ${id}`).toBeTruthy();
  return x!;
};
const row = (t: FormTask, label: string): string => {
  const r = t.source.rows.find((x) => x.label === label);
  expect(r, `${t.drillId} source row ${label}`).toBeTruthy();
  return r!.value;
};
const pad = (n: number) => String(n).padStart(2, '0');

describe('form ids', () => {
  it('are ma-form and rx-form, one per track', () => {
    expect(FORM_DRILL_IDS).toEqual({ ma: 'ma-form', rx: 'rx-form' });
    expect(makeFormTask('ma', 5, CHART_DATES[0])).toMatchObject({ drillId: 'ma-form', track: 'ma', seed: 5 });
    expect(makeFormTask('rx', 5, CHART_DATES[0])).toMatchObject({ drillId: 'rx-form', track: 'rx', seed: 5 });
  });
  it('have a chart window title', () => {
    for (const id of Object.values(FORM_DRILL_IDS)) expect(windowTitle('drill', id), id).not.toBe('Note');
  });
});

describe.each(['ma', 'rx'] as const)('every %s form', (track) => {
  it('is the same for the same seed and chart date, and different for different seeds', () => {
    const a = makeFormTask(track, 777, CHART_DATES[0]);
    expect(makeFormTask(track, 777, CHART_DATES[0])).toEqual(a);
    expect(tasks(track).map((t) => JSON.stringify(t.fields)).filter((v, i, all) => all.indexOf(v) === i).length).toBeGreaterThan(140);
  });

  it('has unique field ids, labels and hints, and answers the student can type', () => {
    for (const t of tasks(track)) {
      const ids = t.fields.map((f) => f.id);
      expect(new Set(ids).size, t.drillId).toBe(ids.length);
      for (const f of t.fields) {
        expect(f.label.length, f.id).toBeGreaterThan(0);
        expect(f.hint.length, f.id).toBeGreaterThan(0);
        expect(f.answer, f.id).toBe(f.answer.trim());
        expect(f.answer, f.id).toMatch(/^[\x20-\x7E]+$/);
        expect(f.answer, `${f.id}: double space`).not.toMatch(/ {2}/);
        expectSafeNotation(f.answer, `${t.seed} ${f.id}`);
        expectTallManNames(f.answer, `${t.seed} ${f.id}`);
      }
      expect(t.ctx.length).toBeGreaterThan(0);
      expectTypeable(t.source.rows.map((r) => `${r.label} ${r.value}`).join('\n'), `source ${t.seed}`);
    }
  });

  it('grades its own answers correct and any one-character change wrong', () => {
    for (const t of tasks(track, CHART_DATES[0], 40)) {
      const values = Object.fromEntries(t.fields.map((f) => [f.id, f.answer]));
      expect(gradeForm(t.fields, values).allCorrect).toBe(true);
      for (const f of t.fields) {
        const typed = f.answer.slice(0, -1) + (f.answer.endsWith('x') ? 'y' : 'x');
        expect(gradeField(f, typed).correct, `${f.id}: ${typed}`).toBe(false);
      }
    }
  });

  it('has a fictional patient that agrees with the form on every chart date, including a leap day and New Year', () => {
    for (const date of CHART_DATES) for (const t of tasks(track, date, 80)) {
      const p = t.patient;
      expect(ageOnDate(p.dob, date), `${t.seed} ${date}`).toBe(Number.parseInt(p.age, 10));
      expect(LAST_NAMES).toContain(p.name.split(', ')[0]);
      expect([...FIRST_NAMES.F, ...FIRST_NAMES.M]).toContain(p.name.split(', ')[1]);
      expect(field(t, 'name').answer).toBe(p.name);
      expect(field(t, 'dob').answer).toBe(p.dob);
      expect(field(t, 'allergies').answer).toBe(p.allergies);
      expect(p.dob).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
  });

  it('uses patient and clinic names that are made up: phone numbers are 555-01xx', () => {
    for (const t of tasks(track, CHART_DATES[0], 40)) {
      const text = t.source.rows.map((r) => r.value).join(' ') + t.source.title + t.source.subtitle;
      for (const m of text.matchAll(/\d{3}-\d{4}/g)) expect(m[0], text).toMatch(/^555-01\d\d$/);
    }
  });
});

describe('the MA intake form', () => {
  const all = tasks('ma');
  it('has the fourteen fields in order', () => {
    expect(all[0].fields.map((f) => f.id)).toEqual(['name', 'dob', 'sex', 'allergies', 'complaint', 'bp', 'pulse', 'resp', 'temp', 'spo2', 'height', 'weight', 'pain', 'medication']);
    expect(all[0].fields.map((f) => f.kind)).toEqual(['name', 'date', 'code', 'text', 'text', 'measure', 'measure', 'number', 'measure', 'measure', 'measure', 'measure', 'measure', 'text']);
  });

  it('turns the name on the paper (First Last) into Last, First', () => {
    for (const t of all) {
      const [first, ...rest] = row(t, 'Patient name').split(' ');
      expect(rest.length, row(t, 'Patient name')).toBe(1);
      expect(field(t, 'name').answer).toBe(`${rest[0]}, ${first}`);
    }
  });

  it('writes the date of birth on the paper in words and asks for MM/DD/YYYY', () => {
    for (const t of all) {
      const m = /^(\w+) (\d{1,2}), (\d{4})$/.exec(row(t, 'Date of birth'));
      expect(m, row(t, 'Date of birth')).toBeTruthy();
      expect(field(t, 'dob').answer).toBe(`${pad(MONTHS.indexOf(m![1]) + 1)}/${pad(Number(m![2]))}/${m![3]}`);
    }
  });

  it('turns Female or Male on the paper into F or M, matching the name list', () => {
    for (const t of all) {
      const word = row(t, 'Sex');
      expect(['Female', 'Male']).toContain(word);
      expect(field(t, 'sex').answer).toBe(word[0]);
      expect(t.patient.sex).toBe(word[0]);
      expect((t.patient.sex === 'F' ? FIRST_NAMES.F : FIRST_NAMES.M) as readonly string[]).toContain(t.patient.name.split(', ')[1]);
    }
  });

  it('copies allergies, complaint and medication from the paper exactly', () => {
    for (const t of all) {
      expect(field(t, 'allergies').answer).toBe(row(t, 'Allergies'));
      expect(field(t, 'complaint').answer).toBe(row(t, 'Reason for visit'));
      expect(field(t, 'medication').answer).toBe(row(t, 'Current medications'));
    }
  });

  it('copies each vital with its unit, in ranges a clinic would see', () => {
    for (const t of all) {
      expect(field(t, 'bp').answer).toBe(row(t, 'Blood pressure'));
      expect(field(t, 'pulse').answer).toBe(row(t, 'Pulse'));
      expect(field(t, 'resp').answer).toBe(row(t, 'Respirations'));
      expect(field(t, 'temp').answer).toBe(row(t, 'Temperature'));
      expect(field(t, 'spo2').answer).toBe(row(t, 'Oxygen saturation'));
      expect(field(t, 'weight').answer).toBe(row(t, 'Weight'));
      expect(field(t, 'pain').answer).toBe(row(t, 'Pain (0 to 10)'));
      const bp = /^(\d{2,3})\/(\d{2,3}) mmHg$/.exec(field(t, 'bp').answer);
      expect(bp, field(t, 'bp').answer).toBeTruthy();
      const [sys, dia] = [Number(bp![1]), Number(bp![2])];
      expect(sys).toBeGreaterThanOrEqual(100); expect(sys).toBeLessThanOrEqual(170);
      expect(dia).toBeGreaterThanOrEqual(60); expect(dia).toBeLessThanOrEqual(100);
      expect(sys - dia).toBeGreaterThanOrEqual(30);
      const pulse = Number(/^(\d+) bpm$/.exec(field(t, 'pulse').answer)?.[1]);
      expect(pulse).toBeGreaterThanOrEqual(55); expect(pulse).toBeLessThanOrEqual(110);
      const resp = Number(field(t, 'resp').answer);
      expect(resp).toBeGreaterThanOrEqual(12); expect(resp).toBeLessThanOrEqual(22);
      const temp = Number(/^(\d{2,3}\.\d) F$/.exec(field(t, 'temp').answer)?.[1]);
      expect(temp).toBeGreaterThanOrEqual(97); expect(temp).toBeLessThanOrEqual(103);
      const spo2 = Number(/^(\d{2,3})%$/.exec(field(t, 'spo2').answer)?.[1]);
      expect(spo2).toBeGreaterThanOrEqual(95); expect(spo2).toBeLessThanOrEqual(100);
      const wt = Number(/^(\d{2,3}) lb$/.exec(field(t, 'weight').answer)?.[1]);
      expect(wt).toBeGreaterThanOrEqual(90); expect(wt).toBeLessThanOrEqual(300);
      const pain = /^(\d{1,2})\/10$/.exec(field(t, 'pain').answer);
      expect(pain, field(t, 'pain').answer).toBeTruthy();
      expect(Number(pain![1])).toBeLessThanOrEqual(10);
    }
  });

  it('writes the height on the paper in feet and inches and asks for total inches', () => {
    for (const t of all) {
      const m = /^(\d) ft (\d{1,2}) in$/.exec(row(t, 'Height'));
      expect(m, row(t, 'Height')).toBeTruthy();
      const inches = Number(m![1]) * 12 + Number(m![2]);
      expect(Number(m![2])).toBeLessThan(12);
      expect(inches).toBeGreaterThanOrEqual(60); expect(inches).toBeLessThanOrEqual(76);
      expect(field(t, 'height').answer).toBe(`${inches} in`);
    }
  });

  it('never lists, as a current medication, a drug the patient is allergic to', () => {
    for (const t of all) {
      const med = field(t, 'medication').answer.toLowerCase();
      for (const [key, words] of Object.entries(ALLERGY_DRUGS)) {
        if (t.patient.allergies.toLowerCase().includes(key === 'nsaid' ? 'nsaid' : key)) for (const w of words) expect(med, `${t.patient.allergies} / ${med}`).not.toContain(w);
      }
      if (t.patient.allergies.includes('Aspirin')) for (const w of ALLERGY_DRUGS.aspirin) expect(med).not.toContain(w);
    }
  });

  it('writes a current medication as name, strength and frequency in words, from the real catalog', () => {
    const prods = new Set(allOrders().map((o) => `${o.name} ${o.strengthText}`));
    let none = 0;
    for (const t of all) {
      const med = field(t, 'medication').answer;
      if (med === 'None') { none++; continue; }
      const m = /^(.+? \d+(?:\.\d+)? (?:mg|mcg)(?:\/\d+ mg)?) (once daily|twice daily|three times daily|every morning|every evening|at bedtime|every 12 hours|every 8 hours|every 6 hours|four times daily)$/.exec(med);
      expect(m, med).toBeTruthy();
      expect(prods.has(m![1]), m![1]).toBe(true);
    }
    expect(none).toBeLessThan(all.length / 3);
  });
});

describe('the PT prescription form', () => {
  const all = tasks('rx');
  const orders = allOrders();
  it('has the eleven fields in order', () => {
    expect(all[0].fields.map((f) => f.id)).toEqual(['name', 'dob', 'allergies', 'drug', 'strength', 'form', 'quantity', 'directions', 'days', 'refills', 'prescriber']);
    expect(all[0].fields.map((f) => f.kind)).toEqual(['name', 'date', 'text', 'drug', 'dose', 'text', 'number', 'directions', 'number', 'number', 'text']);
  });

  it('turns the patient on the prescription into Last, First, and a date written M/D/YYYY into MM/DD/YYYY', () => {
    for (const t of all) {
      const [first, last] = row(t, 'Patient').split(' ');
      expect(field(t, 'name').answer).toBe(`${last}, ${first}`);
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(row(t, 'DOB'));
      expect(m, row(t, 'DOB')).toBeTruthy();
      expect(field(t, 'dob').answer).toBe(`${pad(Number(m![1]))}/${pad(Number(m![2]))}/${m![3]}`);
    }
    expect(all.some((t) => row(t, 'DOB') !== field(t, 'dob').answer)).toBe(true);
  });

  it('reads the drug, strength and form from a real catalog product', () => {
    for (const t of all) {
      const drug = field(t, 'drug').answer, strength = field(t, 'strength').answer, form = field(t, 'form').answer;
      expect(['tablet', 'capsule']).toContain(form);
      expect(orders.some((o) => o.productLine === `${drug} ${strength} ${form}`), `${drug} ${strength} ${form}`).toBe(true);
      expect(row(t, 'Rx')).toBe(`${drug} ${strength} ${form === 'tablet' ? 'tab' : 'cap'}`);
    }
  });

  it('uses exact Tall Man spelling for the drugs that have it', () => {
    const names = new Set(all.map((t) => field(t, 'drug').answer));
    expect([...names].some((n) => /[a-z][A-Z]/.test(n))).toBe(true);
  });

  it('turns the sig into label directions, with the quantity and days supply working out', () => {
    for (const t of all) {
      const sig = row(t, 'Sig');
      const order = orders.find((o) => o.productLine === `${field(t, 'drug').answer} ${field(t, 'strength').answer} ${field(t, 'form').answer}` && o.sig === sig && o.directions === field(t, 'directions').answer && o.qty === field(t, 'quantity').answer);
      expect(order, `${sig} -> ${field(t, 'directions').answer}`).toBeTruthy();
      expect(order!.kind).not.toBe('fixed');
      expect(row(t, 'Disp')).toBe(`#${field(t, 'quantity').answer}`);
      expect(field(t, 'quantity').answer).toBe(order!.qty);
      expect(Number(field(t, 'days').answer)).toBe(order!.daysSupply);
      expect(Number(field(t, 'quantity').answer)).toBe(order!.perDose! * order!.perDay! * Number(field(t, 'days').answer));
      expect(order!.refillOptions).toContain(Number(field(t, 'refills').answer));
      expect(row(t, 'Refills')).toBe(field(t, 'refills').answer);
      expect(field(t, 'directions').answer).toMatch(/^Take \d+ (tablets?|capsules?) by mouth .+\.( .+\.)?$/);
      expect(sig).not.toMatch(/\bqd\b/i);
    }
  });

  it('takes the prescriber from the fictional list and never gives a patient a drug in an allergy class', () => {
    for (const t of all) {
      expect(PROVIDERS).toContain(field(t, 'prescriber').answer);
      expect(field(t, 'prescriber').answer).toBe(t.patient.provider);
      const text = `${field(t, 'drug').answer} ${field(t, 'directions').answer}`.toLowerCase();
      for (const [key, words] of Object.entries(ALLERGY_DRUGS)) {
        if (t.patient.allergies.toLowerCase().includes(key)) for (const w of words) expect(text, `${t.patient.allergies} / ${text}`).not.toContain(w);
      }
    }
  });

  it('turns QD into the wrong answer for every once-a-day prescription', () => {
    const daily = all.find((t) => /once daily/.test(field(t, 'directions').answer))!;
    expect(daily).toBeTruthy();
    const dir = field(daily, 'directions');
    const r = gradeField(dir, dir.answer.replace('once daily', 'QD'));
    expect(r.correct).toBe(false);
    expect(r.message).toMatch(/do-not-use/i);
  });

  it('uses a variety of drugs', () => {
    expect(new Set(all.map((t) => field(t, 'drug').answer)).size).toBeGreaterThan(20);
  });
});
