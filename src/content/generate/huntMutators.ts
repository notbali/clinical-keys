import type { HuntError, Patient } from '../types';
import { bodyOf, swapWord, withBody, type Mutator, type Plant } from './huntCore';
import { FIRST_NAMES, LAST_NAMES, PROVIDERS, providerSurname } from './patient';
import { pick, type Rng } from './rng';
import { LASA_GROUPS } from './rxPassages';
import { allOrders } from './rxCatalog';

/** Mistakes that can be planted in any note. Each one looks for the words it needs and offers every place it could go. */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const err = (category: HuntError['category'], why: string): HuntError => ({ category, why });
const isInt = (s: string) => /^\d+$/.test(s);

/** Words with capital letters inside: the Tall Man names the generators can print. */
const hasInnerCaps = (w: string) => /^[A-Za-z]+$/.test(w) && w.slice(1) !== w.slice(1).toLowerCase() && w !== w.toUpperCase();
let tallMan: Set<string> | undefined;
const tallManNames = (): Set<string> => {
  if (!tallMan) {
    tallMan = new Set(LASA_GROUPS.flat());
    for (const o of allOrders()) for (const w of o.name.split(' ')) if (w.length >= 6 && hasInnerCaps(w)) tallMan.add(w);
  }
  return tallMan;
};

const CLINICAL_WORDS = [
  'pharyngitis', 'hypertension', 'diabetes', 'gastroenteritis', 'abdominal', 'tenderness', 'infection', 'nausea', 'vomiting', 'diarrhea',
  'urination', 'swallowing', 'congestion', 'breathing', 'tonsils', 'swollen', 'swelling', 'symptoms', 'appointment', 'reschedule',
  'pharmacy', 'medication', 'requesting', 'approval', 'preferred', 'provider', 'notified', 'fingerstick', 'follow-up', 'prescription',
  'separate', 'shelves', 'dizziness', 'lumbar', 'bilaterally', 'auscultation', 'compression', 'elevation', 'numbness', 'tingling',
  'headache', 'cardiac', 'insulin', 'hemoglobin', 'sensation', 'allergic', 'irritation', 'discharge', 'deformity', 'frequent',
];
let vocab: Set<string> | undefined;
const vocabulary = (): Set<string> => {
  if (!vocab) {
    vocab = new Set(CLINICAL_WORDS.filter((w) => /^[a-z]+$/.test(w)));
    for (const o of allOrders()) for (const w of o.name.split(' ')) if (w.length >= 7 && /^[A-Za-z]+$/.test(w) && !hasInnerCaps(w)) vocab.add(w.toLowerCase());
  }
  return vocab;
};

/** A real misspelling of `word`: two inner letters swapped, or one inner letter left out. Never a word in the vocabulary. */
function misspell(rng: Rng, word: string): string | null {
  const known = vocabulary();
  const options: string[] = [];
  for (let k = 2; k < word.length - 2; k++) {
    if (word[k] !== word[k + 1]) options.push(word.slice(0, k) + word[k + 1] + word[k] + word.slice(k + 2));
    options.push(word.slice(0, k) + word.slice(k + 1));
  }
  const ok = options.filter((o) => o !== word && !known.has(o.toLowerCase()));
  return ok.length ? pick(rng, ok) : null;
}

/** Vital signs and measurements that cannot be right: the unit or the digits give them away. */
export const vitalsMutator: Mutator = (cx) => {
  const t = cx.tokens;
  const out: Plant[] = [];
  const hasBmi = t.some((w) => bodyOf(w) === 'BMI');
  t.forEach((tok, i) => {
    const b = bodyOf(tok);
    const prev = i > 0 ? bodyOf(t[i - 1]) : '';
    let m: RegExpExecArray | null;
    if ((prev === 'BP' || prev === 'repeat') && (m = /^(\d+)\/(\d+)$/.exec(b))) {
      out.push(swapWord(cx, i, `${m[2]}/${m[1]}`, err('logic', `The top number (systolic) is always higher than the bottom number (diastolic). ${m[2]}/${m[1]} is written backward.`)));
    }
    if (prev === 'T' && /^\d{2,3}\.\d$/.test(b)) {
      out.push(swapWord(cx, i, b.replace('.', ''), err('number', `A temperature of ${b.replace('.', '')} is not possible. The decimal point is missing from ${b}.`)));
    }
    if (b === 'F' && i >= 2 && bodyOf(t[i - 2]) === 'T') {
      out.push(swapWord(cx, i, 'C', err('unit', `${bodyOf(t[i - 1])} is a Fahrenheit reading. In Celsius it would be a deadly fever. The unit has to be F.`)));
    }
    if (prev === 'SpO2' && (m = /^(\d+)%$/.exec(b))) {
      out.push(swapWord(cx, i, `${Number(m[1]) + 10}%`, err('number', 'Oxygen saturation is a percent, so it cannot be over 100.')));
    }
    if ((prev === 'P' || prev === 'R') && isInt(b)) {
      const what = prev === 'P' ? 'pulse' : 'breathing rate';
      out.push(swapWord(cx, i, `${b}0`, err('number', `A ${what} of ${b}0 is not possible. An extra zero was added to ${b}.`)));
    }
    if (prev === 'Pain' && (m = /^([1-9])\/10$/.exec(b))) {
      out.push(swapWord(cx, i, `1${m[1]}/10`, err('number', `The pain scale runs from 0 to 10, so 1${m[1]}/10 is not possible.`)));
    }
    if (hasBmi && b === 'lb' && i >= 2 && bodyOf(t[i - 2]) === 'Wt' && isInt(bodyOf(t[i - 1]))) {
      const w = Number(bodyOf(t[i - 1]));
      out.push(swapWord(cx, i, 'kg', err('unit', `${w} kg is about ${Math.round(w * 2.2046)} lb, which does not fit the BMI in this note. The weight is in pounds (lb).`)));
    }
    if (prev === 'BMI' && /^\d{2}\.\d$/.test(b)) {
      out.push(swapWord(cx, i, b.replace('.', ''), err('number', `A BMI of ${b.replace('.', '')} is not possible. The decimal point is missing from ${b}.`)));
    }
    if (b === 'mg/dL' && isInt(prev)) {
      out.push(swapWord(cx, i, 'mg/L', err('unit', 'Blood glucose is reported in mg/dL. mg/L is a different unit, and the same number would be ten times too low.')));
    }
    if (isInt(b) && i + 1 < t.length && bodyOf(t[i + 1]) === 'mg/dL') {
      out.push(swapWord(cx, i, `${b}0`, err('number', `A fingerstick glucose of ${b}0 mg/dL is not possible. An extra zero was added to ${b}.`)));
    }
    if (b === '911') out.push(swapWord(cx, i, '411', err('number', 'The emergency number is 911.')));
    if (/^555-\d{4}$/.test(b)) out.push(swapWord(cx, i, b.slice(0, -1), err('number', 'Phone numbers here have 7 digits, like 555-0173. This one is missing a digit.')));
  });
  return out;
};

/** Times, weekdays, sides and results that contradict something else in the same note. */
export const logicMutator: Mutator = (cx) => {
  const t = cx.tokens;
  const out: Plant[] = [];
  const sides = t.map((w, i) => ({ i, b: bodyOf(w) })).filter((x) => x.b === 'right' || x.b === 'left');
  t.forEach((tok, i) => {
    const b = bodyOf(tok);
    const next = i + 1 < t.length ? bodyOf(t[i + 1]) : '';
    const prev = i > 0 ? bodyOf(t[i - 1]) : '';
    let m: RegExpExecArray | null;
    if ((m = /^(\d{1,2}):(\d\d)$/.exec(b)) && /^[ap]\.m$/.test(next) && Number(m[1]) <= 11) {
      out.push(swapWord(cx, i, `${Number(m[1]) + 12}:${m[2]}`, err('logic', `${Number(m[1]) + 12}:${m[2]} is 24-hour time. With ${next}. it has to be a 12-hour time: ${b} ${next}.`)));
    }
    if (WEEKDAYS.includes(b) && /^\d{1,2}\/\d{1,2}$/.test(next)) {
      const wrong = pick(cx.rng, WEEKDAYS.filter((d) => d !== b));
      out.push(swapWord(cx, i, wrong, err('logic', `${next} falls on a ${b}, not a ${wrong}. The weekday and the date have to agree.`)));
    }
    if (b === 'positive') out.push(swapWord(cx, i, 'negative', err('logic', 'The assessment is based on this test, so the result has to be positive. A negative test does not support the diagnosis.')));
    if (b === 'above' && prev === 'BP') out.push(swapWord(cx, i, 'below', err('logic', 'The blood pressure readings in the note are high, so the assessment has to say above goal, not below.')));
    if (b === 'not' && prev === 'Do') out.push({ start: i, end: i + 1, to: [], error: err('logic', 'Leaving out the word not turns the warning into the opposite instruction.') });
  });
  if (sides.length >= 2 && sides.every((s) => s.b === sides[0].b)) {
    const last = sides[sides.length - 1];
    const other = last.b === 'right' ? 'left' : 'right';
    out.push(swapWord(cx, last.i, other, err('logic', `The history says ${last.b}, so the exam has to be on the ${last.b} side too. The note switches to ${other}.`)));
  }
  return out;
};

/** Doses and unsafe notation: trailing zeros, QD, tenfold doses and the wrong unit. */
export const doseMutator: Mutator = (cx) => {
  const t = cx.tokens;
  const out: Plant[] = [];
  const triple = (i: number) => `${bodyOf(t[i - 1] ?? '')}|${bodyOf(t[i])}|${bodyOf(t[i + 1] ?? '')}`;
  t.forEach((tok, i) => {
    const b = bodyOf(tok);
    const next = i + 1 < t.length ? bodyOf(t[i + 1]) : '';
    const prev = i > 0 ? bodyOf(t[i - 1]) : '';
    const dose = isInt(b) && (next === 'mg' || next === 'mcg');
    if (dose) {
      out.push(swapWord(cx, i, `${b}.0`, err('do-not-use', `A trailing zero (${b}.0 ${next}) can be misread as ${b}0 ${next}. Write ${b} ${next}.`)));
      const n = Number(b);
      if (n >= 100 || cx.reference) out.push(swapWord(cx, i, `${n * 10}`, err('number', `${n * 10} ${next} is ten times ${n} ${next}. One extra zero is a tenfold overdose.`)));
      if (cx.reference) {
        const wrong = next === 'mg' ? 'mcg' : 'mg';
        out.push({ start: i + 1, end: i + 2, to: [withBody(t[i + 1], wrong)], error: err('unit', next === 'mg' ? `${b} mcg is one thousandth of ${b} mg. The prescription is in mg.` : `${b} mg is a thousand times ${b} mcg. The prescription is in mcg.`) });
      }
      // The same drug and strength written twice in a note: change the later one, so the two disagree.
      const later = t.findIndex((_, j) => j > i && triple(j) === triple(i));
      if (later < 0 && t.some((_, j) => j < i && triple(j) === triple(i))) {
        out.push(swapWord(cx, i, String(n * 2), err('number', `The history says ${prev} ${b} ${next}, so the plan has to say ${b} ${next} too, not ${n * 2} ${next}.`)));
      }
    }
    if (b === 'daily' && prev === 'mg') out.push(swapWord(cx, i, 'QD', err('do-not-use', 'QD is on The Joint Commission do-not-use list because it can be mistaken for QID. Write daily.')));
    if (b === 'daily' && prev === 'once') out.push({ start: i - 1, end: i + 1, to: [withBody(tok, 'QD')], error: err('do-not-use', 'QD is on The Joint Commission do-not-use list because it can be mistaken for QID. Write once daily.') });
  });
  return out;
};

/** Drug names and clinical words with a letter swapped or left out, and Tall Man names written in lowercase. */
export const spellingMutator: Mutator = (cx) => {
  const out: Plant[] = [];
  cx.tokens.forEach((tok, i) => {
    const b = bodyOf(tok);
    if (tallManNames().has(b)) {
      out.push(swapWord(cx, i, b.toLowerCase(), err('tall-man', `${b} is written with Tall Man (capital) letters so it stands out from look-alike names. In all lowercase it can be mistaken for its look-alike.`)));
      return;
    }
    if (!/^[A-Za-z]+$/.test(b) || !vocabulary().has(b.toLowerCase())) return;
    const bad = misspell(cx.rng, b);
    if (bad) out.push(swapWord(cx, i, bad, err('spelling', `"${bad}" is misspelled. The correct spelling is "${b}". A misspelled word in a chart is easy to misread and hard to search for.`)));
  });
  return out;
};

const OTHER_ALLERGIES = ['Penicillin (rash)', 'Sulfa drugs (hives)', 'Latex (rash)', 'Codeine (nausea)', 'Shellfish (hives)', 'Iodine (rash)'];

/** The allergy line against the chart banner, and everything else that has to match the banner. */
export const patientMutator: Mutator = (cx) => {
  const p = cx.patient;
  if (!p) return [];
  const t = cx.tokens;
  const out: Plant[] = [];
  const [last, first] = p.name.split(', ');
  const surname = providerSurname(p.provider ?? '');
  t.forEach((tok, i) => {
    const b = bodyOf(tok);
    const next = i + 1 < t.length ? t[i + 1] : '';
    if (b === 'Allergies' && tok.endsWith(':')) {
      let end = i + 1;
      while (end < t.length && cx.lines[end] === cx.lines[i]) end++;
      const shown = t.slice(i + 1, end).join(' ').replace(/\.$/, '');
      if (p.allergies === 'NKDA') {
        const wrong = pick(cx.rng, OTHER_ALLERGIES);
        out.push({ start: i + 1, end, to: `${wrong}.`.split(' '), error: err('allergy', `The chart banner says NKDA (no known drug allergies). This note lists an allergy the patient does not have: ${wrong}.`) });
      } else if (cx.rng() < 0.6) {
        out.push({ start: i + 1, end, to: ['NKDA.'], error: err('allergy', `The chart banner lists an allergy: ${shown}. Writing NKDA hides it from the next person who reads the note.`) });
      } else {
        const wrong = pick(cx.rng, OTHER_ALLERGIES.filter((a) => !p.allergies.includes(a)));
        out.push({ start: i + 1, end, to: `${wrong}.`.split(' '), error: err('allergy', `The chart banner lists ${shown}, not ${wrong}. An allergy has to be copied exactly.`) });
      }
    }
    if (b === last && tok.endsWith(',') && bodyOf(next) === first) {
      const other = pick(cx.rng, LAST_NAMES.filter((n) => n !== last));
      out.push(swapWord(cx, i, other, err('patient', `The chart banner says the last name is ${last}, not ${other}.`)));
      const f2 = pick(cx.rng, FIRST_NAMES[p.sex].filter((n) => n !== first));
      out.push(swapWord(cx, i + 1, f2, err('patient', `The chart banner says the first name is ${first}, not ${f2}.`)));
    }
    if (b === first && bodyOf(next) === last) {
      const other = pick(cx.rng, LAST_NAMES.filter((n) => n !== last));
      out.push(swapWord(cx, i + 1, other, err('patient', `The chart banner says the last name is ${last}, not ${other}.`)));
    }
    if (b === p.dob) {
      const [mm, dd, yy] = p.dob.split('/');
      const bad = `${mm}/${dd}/${Number(yy) + (cx.rng() < 0.5 ? -1 : 1) * (1 + Math.floor(cx.rng() * 9))}`;
      out.push(swapWord(cx, i, bad, err('patient', `The chart banner gives the date of birth as ${p.dob}, not ${bad}.`)));
    }
    if (b === surname && (t[i - 1] === 'Dr.' || t[i - 2] === 'Dr.')) {
      const other = providerSurname(pick(cx.rng, PROVIDERS.filter((x) => providerSurname(x) !== surname)));
      out.push(swapWord(cx, i, other, err('patient', `The chart banner lists ${p.provider} as the provider, not Dr. ${other}.`)));
    }
    if (isInt(b) && next === 'y/o') {
      const age = Number(b);
      const bad = Math.max(1, age + (cx.rng() < 0.5 ? -1 : 1) * (2 + Math.floor(cx.rng() * 8)));
      if (bad !== age) out.push(swapWord(cx, i, String(bad), err('patient', `The chart banner says the patient is ${age} years old, not ${bad}.`)));
    }
    if ((b === 'female' || b === 'male') && i > 0 && t[i - 1] === 'y/o') {
      const other = b === 'female' ? 'male' : 'female';
      out.push(swapWord(cx, i, other, err('patient', `The chart banner says the patient is ${b}, not ${other}.`)));
    }
  });
  return out;
};

export const COMMON_MUTATORS: Mutator[] = [vitalsMutator, logicMutator, doseMutator, spellingMutator, patientMutator];

/** Adds the allergy line a chart note ends with, taken from the banner patient. */
export const allergyLine = (p: Patient): string => `Allergies: ${p.allergies}.`;
