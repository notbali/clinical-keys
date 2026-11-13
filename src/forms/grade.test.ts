import { describe, expect, it } from 'vitest';
import { editDistance, entryKeyAction, formAccuracy, formWpm, gradeField, gradeForm, summarizeFormRun } from './grade';
import { formAttempt } from './attempt';
import type { FormField, FormTask } from './types';

const f = (kind: FormField['kind'], answer: string, id: string = kind): FormField => ({ id, label: id, hint: '', kind, answer });

const wrong = (field: FormField, typed: string) => {
  const r = gradeField(field, typed);
  expect(r.correct, `"${typed}" should be wrong for "${field.answer}"`).toBe(false);
  expect(r.message, `a wrong entry always says why ("${typed}")`).toBeTruthy();
  return r.message!;
};
const right = (field: FormField, typed: string) => expect(gradeField(field, typed), `"${typed}"`).toMatchObject({ correct: true, message: null });

describe('trimming and the exact match', () => {
  it('accepts the exact answer and ignores spaces before and after it, and nothing else', () => {
    const name = f('name', 'Delgado, Maria');
    right(name, 'Delgado, Maria');
    right(name, '  Delgado, Maria ');
    expect(wrong(name, 'Delgado,  Maria')).toMatch(/space/i);
    expect(wrong(name, 'Delgado,Maria')).toMatch(/space/i);
    expect(wrong(f('text', 'Sore throat x 3 days'), 'Sore throat x 3days')).toMatch(/space/i);
  });

  it('says a blank box is blank', () => {
    const r = gradeField(f('number', '72'), '   ');
    expect(r).toMatchObject({ correct: false, blank: true });
    expect(r.message).toMatch(/blank|nothing/i);
  });

  it('points to where an entry first goes wrong, or that it ends early or runs on', () => {
    const t = f('text', 'Sore throat and fever x 3 days');
    expect(wrong(t, 'Sore throat and fever x 3 d')).toMatch(/early|unfinished|incomplete/i);
    expect(wrong(t, 'Sore throat and fever x 3 days.')).toMatch(/extra/i);
    expect(wrong(t, 'Sore threat and fever x 3 days')).toMatch(/character 9\b/);
  });
});

describe('names are Last, First and exact', () => {
  const name = f('name', 'Delgado, Maria');
  it('catches first and last swapped, in every common way', () => {
    for (const typed of ['Maria Delgado', 'Maria, Delgado', 'Maria Delgado,', 'Delgado Maria', 'Maria  Delgado']) {
      expect(wrong(name, typed), typed).toMatch(/last, first/i);
    }
  });
  it('catches capitalization', () => {
    expect(wrong(name, 'delgado, maria')).toMatch(/capital/i);
    expect(wrong(name, 'DELGADO, MARIA')).toMatch(/capital/i);
  });
  it('catches a misspelling', () => {
    expect(wrong(name, 'Delgado, Mara')).toMatch(/character 13\b/);
    expect(wrong(name, 'Delgadu, Maria')).toMatch(/character 7/);
  });
});

describe('drug names keep their capital letters, Tall Man included', () => {
  it('flags a missing Tall Man capital as a capital-letter error', () => {
    const msg = wrong(f('drug', 'hydrALAZINE'), 'hydralazine');
    expect(msg).toMatch(/tall man/i);
    expect(wrong(f('drug', 'hydrALAZINE'), 'Hydralazine')).toMatch(/tall man/i);
    expect(wrong(f('drug', 'hydrALAZINE'), 'HYDRALAZINE')).toMatch(/tall man/i);
    expect(wrong(f('drug', 'predniSONE'), 'prednisone')).toMatch(/tall man/i);
    expect(wrong(f('drug', 'buPROPion XL'), 'bupropion XL')).toMatch(/tall man/i);
  });
  it('flags the wrong capitals even when they are in the wrong place', () => {
    expect(wrong(f('drug', 'hydrALAZINE'), 'hydRALAZINE')).toMatch(/tall man/i);
    expect(wrong(f('drug', 'hydrOXYzine'), 'hydrALAZINE')).not.toMatch(/tall man/i);
  });
  it('treats a plain drug name as a capitalization error, not Tall Man', () => {
    const msg = wrong(f('drug', 'Lisinopril'), 'lisinopril');
    expect(msg).toMatch(/capital/i);
    expect(msg).not.toMatch(/tall man/i);
  });
  it('accepts the exact Tall Man spelling', () => {
    right(f('drug', 'hydrALAZINE'), 'hydrALAZINE');
    right(f('drug', 'Sulfamethoxazole-trimethoprim DS'), 'Sulfamethoxazole-trimethoprim DS');
  });
  it('catches a different drug with a similar name', () => {
    expect(wrong(f('drug', 'hydrALAZINE'), 'hydrOXYzine')).toMatch(/character 5/);
  });
});

describe('numbers and units are exact', () => {
  const bp = f('measure', '128/84 mmHg', 'bp');
  const weight = f('measure', '154 lb', 'weight');
  const temp = f('measure', '98.6 F', 'temp');
  const spo2 = f('measure', '98%', 'spo2');
  const pulse = f('measure', '76 bpm', 'pulse');

  it('accepts the exact entry', () => {
    for (const [field, typed] of [[bp, '128/84 mmHg'], [weight, '154 lb'], [temp, '98.6 F'], [spo2, '98%'], [pulse, '76 bpm']] as const) right(field, typed);
  });
  it('catches transposed digits', () => {
    expect(wrong(bp, '182/84 mmHg')).toMatch(/swapped|order/i);
    expect(wrong(bp, '128/48 mmHg')).toMatch(/swapped|order/i);
    expect(wrong(weight, '145 lb')).toMatch(/swapped|order/i);
    expect(wrong(pulse, '67 bpm')).toMatch(/swapped|order/i);
  });
  it('catches a digit that is simply wrong', () => {
    expect(wrong(weight, '155 lb')).toMatch(/number/i);
    expect(wrong(bp, '128/86 mmHg')).toMatch(/number/i);
  });
  it('catches a wrong unit even when the number is right', () => {
    expect(wrong(weight, '154 kg')).toMatch(/unit/i);
    expect(wrong(temp, '98.6 C')).toMatch(/unit/i);
    expect(wrong(bp, '128/84 mmhg')).toMatch(/capital|unit/i);
    expect(wrong(pulse, '76 bps')).toMatch(/unit/i);
  });
  it('catches a missing unit', () => {
    expect(wrong(weight, '154')).toMatch(/unit.*missing|missing.*unit/i);
    expect(wrong(spo2, '98')).toMatch(/unit.*missing|missing.*unit/i);
    expect(wrong(temp, '98.6')).toMatch(/unit.*missing|missing.*unit/i);
  });
  it('catches a misplaced decimal point', () => {
    expect(wrong(temp, '986 F')).toMatch(/decimal/i);
    expect(wrong(temp, '9.86 F')).toMatch(/decimal/i);
  });
  it('treats a unit run into the number as a spacing error', () => {
    expect(wrong(weight, '154lb')).toMatch(/space/i);
  });
  it('wants a plain number for number fields, and says so when words are added', () => {
    const qty = f('number', '30', 'qty');
    right(qty, '30');
    expect(wrong(qty, '30 tablets')).toMatch(/number only/i);
    expect(wrong(qty, '03')).toMatch(/swapped|order/i);
    expect(wrong(qty, '60')).toMatch(/number/i);
  });
});

describe('dates are MM/DD/YYYY', () => {
  const dob = f('date', '03/04/1981');
  it('accepts the exact date', () => right(dob, '03/04/1981'));
  it('rejects other formats and says which format to use', () => {
    for (const typed of ['3/4/1981', '03/04/81', '1981-03-04', 'March 4, 1981', '3-4-1981', '03-04-1981', '030481']) {
      expect(wrong(dob, typed), typed).toMatch(/MM\/DD\/YYYY/);
    }
  });
  it('catches month and day swapped', () => {
    expect(wrong(dob, '04/03/1981')).toMatch(/month and day/i);
    expect(wrong(f('date', '11/17/1990'), '17/11/1990')).toMatch(/MM\/DD\/YYYY|month and day/i);
  });
  it('catches a transposed year and a wrong year', () => {
    expect(wrong(dob, '03/04/1891')).toMatch(/swapped|order/i);
    expect(wrong(dob, '03/04/1982')).toBeTruthy();
  });
});

describe('directions are written the label way', () => {
  const dir = f('directions', 'Take 1 tablet by mouth once daily.');
  it('accepts the exact directions', () => right(dir, 'Take 1 tablet by mouth once daily.'));
  it('catches QD typed instead of once daily, and says QD is on the do-not-use list', () => {
    for (const typed of ['Take 1 tablet by mouth QD.', 'Take 1 tablet by mouth qd.', 'Take 1 tablet by mouth Q.D.']) {
      const msg = wrong(dir, typed);
      expect(msg, typed).toMatch(/do-not-use/i);
      expect(msg, typed).toMatch(/once daily/i);
    }
    expect(wrong(f('directions', 'Take 1 tablet by mouth every other day.'), 'Take 1 tablet by mouth QOD.')).toMatch(/every other day/i);
  });
  it('catches sig shorthand left in the directions', () => {
    expect(wrong(f('directions', 'Take 1 tablet by mouth twice daily.'), '1 tab PO BID')).toMatch(/spell|shorthand|abbreviation/i);
    expect(wrong(f('directions', 'Take 1 tablet by mouth twice daily.'), 'Take 1 tab by mouth twice daily.')).toMatch(/spell|shorthand|abbreviation/i);
    expect(wrong(f('directions', 'Take 1 capsule by mouth three times daily.'), 'Take 1 capsule by mouth TID.')).toMatch(/spell|shorthand|abbreviation/i);
  });
  it('catches a wrong frequency, count or unit of time', () => {
    expect(wrong(dir, 'Take 1 tablet by mouth twice daily.')).toBeTruthy();
    expect(wrong(dir, 'Take 2 tablets by mouth once daily.')).toBeTruthy();
  });
  it('catches a missing final period', () => {
    expect(wrong(dir, 'Take 1 tablet by mouth once daily')).toMatch(/period/i);
  });
});

describe('dose strengths, with the do-not-use number rules', () => {
  it('catches a trailing zero and a missing leading zero', () => {
    expect(wrong(f('dose', '5 mg'), '5.0 mg')).toMatch(/trailing zero|do-not-use/i);
    expect(wrong(f('dose', '0.005%'), '.005%')).toMatch(/leading zero|do-not-use/i);
    right(f('dose', '2.5 mg'), '2.5 mg ');
  });
  it('catches a wrong unit on a combination strength', () => {
    expect(wrong(f('dose', '800 mg/160 mg'), '800 mg/160 mcg')).toMatch(/unit/i);
    expect(wrong(f('dose', '25 mcg'), '25 mg')).toMatch(/unit/i);
  });
  it('catches the U and IU do-not-use abbreviations', () => {
    expect(wrong(f('text', '10 units'), '10 U')).toMatch(/do-not-use/i);
    expect(wrong(f('text', '10 units'), '10 IU')).toMatch(/do-not-use/i);
  });
});

describe('codes', () => {
  it('want the exact letter in capitals', () => {
    right(f('code', 'F'), 'F');
    expect(wrong(f('code', 'F'), 'f')).toMatch(/capital/i);
    expect(wrong(f('code', 'F'), 'M')).toBeTruthy();
    expect(wrong(f('code', 'F'), 'Female')).toBeTruthy();
  });
});

describe('edit distance', () => {
  it('counts single-character edits', () => {
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('abc', 'ab')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('128/84', '182/84')).toBe(2);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

const FIELDS: FormField[] = [
  f('name', 'Delgado, Maria', 'name'),
  f('date', '03/04/1981', 'dob'),
  f('measure', '154 lb', 'weight'),
  f('number', '16', 'resp'),
];
const ALL: Record<string, string> = { name: 'Delgado, Maria', dob: '03/04/1981', weight: '154 lb', resp: '16' };

describe('grading a whole form', () => {
  it('counts the fields that are correct and says whether every one is', () => {
    const g = gradeForm(FIELDS, ALL);
    expect(g).toMatchObject({ correctCount: 4, total: 4, allCorrect: true });
    expect(g.results.map((r) => r.id)).toEqual(['name', 'dob', 'weight', 'resp']);
    const g2 = gradeForm(FIELDS, { ...ALL, weight: '145 lb', resp: '' });
    expect(g2).toMatchObject({ correctCount: 2, total: 4, allCorrect: false });
    expect(g2.results.filter((r) => !r.correct).map((r) => r.id)).toEqual(['weight', 'resp']);
  });
  it('treats a field the student never touched as blank', () => {
    const g = gradeForm(FIELDS, { name: 'Delgado, Maria' });
    expect(g.correctCount).toBe(1);
    expect(g.results[1]).toMatchObject({ blank: true, correct: false });
  });
  it('counts characters right as the expected length minus the edits needed, never below zero', () => {
    const g = gradeForm(FIELDS, ALL);
    expect(g.charsTotal).toBe('Delgado, Maria'.length + '03/04/1981'.length + '154 lb'.length + '16'.length);
    expect(g.charsCorrect).toBe(g.charsTotal);
    const bad = gradeForm([f('number', '16')], { number: 'xxxxxxxxxxxxxxx' });
    expect(bad.charsCorrect).toBe(0);
    expect(gradeForm([f('measure', '128/84 mmHg')], { measure: '182/84 mmHg' }).charsCorrect).toBe('128/84 mmHg'.length - 2);
  });
  it('turns the character share into an accuracy percentage with one decimal', () => {
    expect(formAccuracy(gradeForm(FIELDS, ALL))).toBe(100);
    const g = gradeForm(FIELDS, { ...ALL, weight: '145 lb' });
    expect(formAccuracy(g)).toBe(Math.round((1000 * (g.charsTotal - 2)) / g.charsTotal) / 10);
    expect(formAccuracy(gradeForm([], {}))).toBe(100);
  });
});

describe('speed', () => {
  it('works out words per minute from characters, five to a word', () => {
    expect(formWpm(300, 60)).toBe(60);
    expect(formWpm(150, 120)).toBe(15);
  });
  it('reports zero for a run too short to measure', () => {
    expect(formWpm(300, 0)).toBe(0);
    expect(formWpm(300, 1)).toBe(0);
  });
});

describe('summarizing a run', () => {
  it('is complete and clean when every field ends up right and the first check was nearly perfect', () => {
    const r = summarizeFormRun(FIELDS, ALL, ALL, 60);
    expect(r).toMatchObject({ completed: true, clean: true, accuracy: 100, errorsLeft: 0, fieldsCorrect: 4, fieldsTotal: 4, seconds: 60 });
    expect(r.wpm).toBe(formWpm(ALL.name.length + ALL.dob.length + ALL.weight.length + ALL.resp.length, 60));
  });
  it('is complete but not clean when a field was wrong on the first check and fixed afterwards', () => {
    const first = { ...ALL, name: 'Maria Delgado' };
    const r = summarizeFormRun(FIELDS, first, ALL, 90);
    expect(r.completed).toBe(true);
    expect(r.errorsLeft).toBe(0);
    expect(r.accuracy).toBeLessThan(95);
    expect(r.clean).toBe(false);
  });
  it('stays clean when the only slip on the first check was a character or two in a long form', () => {
    const fields = Array.from({ length: 12 }, (_, i) => f('text', 'Sore throat and fever x 3 days', `t${i}`));
    const final = Object.fromEntries(fields.map((x) => [x.id, x.answer]));
    const first = { ...final, t3: 'Sore throat and fever x 3 dayz' };
    const r = summarizeFormRun(fields, first, final, 120);
    expect(r).toMatchObject({ completed: true, clean: true });
    expect(r.accuracy).toBeGreaterThanOrEqual(95);
    expect(r.accuracy).toBeLessThan(100);
  });
  it('is not complete when any field is still wrong, and says how many', () => {
    const r = summarizeFormRun(FIELDS, ALL, { ...ALL, weight: '154 kg', resp: '' }, 45);
    expect(r).toMatchObject({ completed: false, clean: false, errorsLeft: 2, fieldsCorrect: 2, fieldsTotal: 4 });
  });
  it('only counts characters in correct fields toward speed', () => {
    const r = summarizeFormRun(FIELDS, ALL, { ...ALL, weight: '154 kg' }, 60);
    expect(r.wpm).toBe(formWpm(ALL.name.length + ALL.dob.length + ALL.resp.length, 60));
  });
  it('rounds the time to whole seconds', () => {
    expect(summarizeFormRun(FIELDS, ALL, ALL, 61.6).seconds).toBe(62);
  });
});

describe('keys on the entry form', () => {
  it('blocks Enter so it can never submit the form by accident, and lets Tab and typing through', () => {
    expect(entryKeyAction('Enter')).toBe('block');
    for (const key of ['Tab', 'a', '5', '/', ' ', 'Backspace', 'Escape', 'ArrowLeft']) expect(entryKeyAction(key), key).toBe('allow');
  });
});

describe('saving a run as an attempt', () => {
  const task: FormTask = {
    drillId: 'rx-form', track: 'rx', seed: 424242, ctx: '', fields: FIELDS,
    patient: { name: 'Delgado, Maria', sex: 'F', age: '45 y', dob: '03/04/1981', mrn: '1234567', allergies: 'NKDA', provider: 'Dr. A. Patel' },
    source: { title: 'x', subtitle: 'y', rows: [] },
  };
  it('keeps the seed in the passage field and the form id as the drill id', () => {
    const a = formAttempt(task, summarizeFormRun(FIELDS, ALL, ALL, 80));
    expect(a).toMatchObject({ kind: 'drill', track: 'rx', drillId: 'rx-form', passage: 424242, errorsLeft: 0, completed: true, clean: true, revealed: false, seconds: 80 });
    expect(a.accuracy).toBe(100);
  });
  it('records an unfinished form honestly', () => {
    const a = formAttempt(task, summarizeFormRun(FIELDS, ALL, { ...ALL, dob: '3/4/1981' }, 80));
    expect(a).toMatchObject({ completed: false, clean: false, errorsLeft: 1 });
  });
});
