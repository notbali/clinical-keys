import type { ISODate } from '../../lib/dates';
import type { Passage } from '../types';
import { makePatient } from './patient';
import { allOrders, type Freq, type RxOrder } from './rxCatalog';
import { chance, int, pick, type Rng } from './rng';
import { makeVitals, vitalsLine } from './vitals';

/**
 * The hidden-mode MA drill: the scenario line gives the facts in plain words and the student types the chart entry from
 * memory, in the standard format. The format rules are written in the scenario, so the skill being practiced is charting
 * (order, abbreviations, units, punctuation), not guessing.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const clock = (mins: number): string => `${Math.floor(mins / 60) % 12 || 12}:${pad(mins % 60)} ${mins >= 12 * 60 ? 'p' : 'a'}.m.`;
const lowerFirst = (name: string): string => name.replace(/^([A-Z])([a-z]+)\b/, (_, a: string, b: string) => `${a.toLowerCase()}${b}`);
const sexWord = (sex: 'F' | 'M') => (sex === 'F' ? 'female' : 'male');

/** Complaints that go with a pain score. */
const PAIN_COMPLAINTS = ['headache', 'low back pain', 'right knee pain', 'left knee pain', 'right shoulder pain', 'left ankle pain', 'neck pain', 'ear pain', 'abdominal pain', 'right wrist pain'];

/** How a frequency is said, and how the chart writes it. Once a day is "daily": QD is on the do-not-use list. */
const SAID: Partial<Record<Freq, string>> = { daily: 'once a day', bid: 'twice a day', tid: 'three times a day', qid: 'four times a day', qhs: 'at bedtime', qam: 'every morning', qpm: 'every evening' };
const WRITTEN: Partial<Record<Freq, string>> = { daily: 'daily', bid: 'BID', tid: 'TID', qid: 'QID', qhs: 'at bedtime', qam: 'every morning', qpm: 'every evening' };

let maintenance: RxOrder[] | undefined;
const maintenanceOrders = (): RxOrder[] => (maintenance ??= allOrders().filter((o) => o.kind === 'maintenance' && o.perDose === 1 && o.freq && SAID[o.freq]));

export function makeChartPassage(rng: Rng, today: ISODate): Passage {
  const kind = int(rng, 0, 3);

  if (kind === 0) { // Rooming a patient with a pain complaint.
    const patient = makePatient(rng, { today });
    const age = Number.parseInt(patient.age, 10);
    const sex = sexWord(patient.sex);
    const v = makeVitals(rng, chance(rng, 0.5) ? 'elevated' : 'routine');
    const complaint = pick(rng, PAIN_COMPLAINTS);
    const days = int(rng, 1, 14);
    const pain = int(rng, 2, 9);
    const duration = `${days} ${plural(days, 'day')}`;
    return {
      ctx: `Rooming a patient. Facts: ${age} y/o ${sex}, BP ${v.sys}/${v.dia}, c/o ${complaint} x ${duration}, pain ${pain}/10. `
        + 'Chart it in one line, in this order: <b>Pt is a [age] y/o [sex].</b> <b>CC:</b> [complaint] <b>x</b> [duration]. <b>BP</b> [top]/[bottom] <b>mmHg</b>. <b>Pain</b> [score]/10. Every sentence ends with a period.',
      text: `Pt is a ${age} y/o ${sex}. CC: ${complaint} x ${duration}. BP ${v.sys}/${v.dia} mmHg. Pain ${pain}/10.`,
      patient,
    };
  }

  if (kind === 1) { // A set of vitals taken in words.
    const patient = makePatient(rng, { today });
    const v = makeVitals(rng, pick(rng, ['routine', 'elevated', 'febrile'] as const));
    return {
      ctx: `Triage vitals. Facts: BP ${v.sys}/${v.dia}, pulse ${v.pulse}, resp ${v.resp}, temp ${v.tempF.toFixed(1)} F by mouth, SpO2 ${v.spo2}% on room air. `
        + 'Chart it in this order: <b>BP</b> [top]/[bottom] <b>mmHg</b>, <b>P</b> [n] <b>bpm</b>, <b>R</b> [n], <b>T</b> [n.n] <b>F (oral)</b>, <b>SpO2</b> [n]<b>% on room air</b>. Commas between, a period at the end.',
      text: vitalsLine(v),
      patient,
    };
  }

  if (kind === 2) { // Allergies and one current medication.
    const order = pick(rng, maintenanceOrders());
    const patient = makePatient(rng, { today, avoid: order.classes });
    const med = `${lowerFirst(order.name)} ${order.strengthText}`;
    const allergyFact = patient.allergies === 'NKDA' ? 'no known drug allergies' : `allergy list: ${patient.allergies}`;
    return {
      ctx: `Medication history. Facts: ${allergyFact}; takes ${med} ${SAID[order.freq!]}. `
        + 'Chart it as: <b>Allergies:</b> [list, or <b>NKDA</b> if none]. <b>Meds:</b> [drug] [strength] [how often]. '
        + 'Write once a day as <b>daily</b> (never QD), twice a day as <b>BID</b> and three times a day as <b>TID</b>; other times in words.',
      text: `Allergies: ${patient.allergies}. Meds: ${med} ${WRITTEN[order.freq!]}.`,
      patient,
    };
  }

  // A fasting glucose with its time.
  const patient = makePatient(rng, { today });
  const test = 6 * 60 + 30 + 5 * int(rng, 0, 36);
  const value = int(rng, 70, 125);
  return {
    ctx: `Point-of-care glucose. Facts: fingerstick glucose ${value} mg/dL at ${clock(test)}, patient is fasting. `
      + 'Chart it as: <b>Glucose (fingerstick)</b> [n] <b>mg/dL at</b> [time], <b>fasting.</b> Use a.m. or p.m. with the time.',
    text: `Glucose (fingerstick) ${value} mg/dL at ${clock(test)}, fasting.`,
    patient,
  };
}
