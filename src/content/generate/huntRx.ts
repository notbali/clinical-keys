import type { ISODate } from '../../lib/dates';
import type { HuntError, Passage, Patient } from '../types';
import { bodyOf, plantNote, swapWord, withBody, type Mutator, type Plant } from './huntCore';
import { allergyLine, COMMON_MUTATORS, spellingMutator } from './huntMutators';
import { makePatient } from './patient';
import { FREQ, randomOrder, type RxOrder } from './rxCatalog';
import { makeLasaPassage } from './rxPassages';
import { int, pick, type Rng } from './rng';

const err = (category: HuntError['category'], why: string): HuntError => ({ category, why });
const isInt = (s: string) => /^\d+$/.test(s);
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

export interface Label { text: string; patient: Patient; order: RxOrder; refills: number }

/**
 * The label the label drill makes (rxPassages.makeLabelPassage), with its order kept so the scenario line can show the
 * prescription. It draws from the Rng in the same order, and a test keeps the two identical.
 */
export function buildLabel(rng: Rng, today: ISODate): Label {
  const order = randomOrder(rng);
  const patient = makePatient(rng, { today, avoid: order.classes });
  const rxNumber = `44${String(int(rng, 0, 99999)).padStart(5, '0')}`;
  const refills = pick(rng, order.refillOptions);
  const lines = [
    `Rx# ${rxNumber} ${patient.name}`,
    `${order.productLine} Qty: ${order.qty}`,
    order.directions,
    ...(order.aux.length ? [order.aux.join(' ')] : []),
    `${order.daysSupply != null ? `Days supply: ${order.daysSupply} ` : ''}Refills: ${refills} ${patient.provider}`,
  ];
  return { text: lines.join('\n'), patient, order, refills };
}

/** What the label has to match: the prescription as it came in. */
const prescriptionLine = (l: Label): string =>
  `${l.order.productLine}; Sig: ${l.order.sig}; Disp: ${l.order.qty}${l.order.daysSupply != null ? `; Days supply: ${l.order.daysSupply}` : ''}; Refills: ${l.refills}; ${l.patient.provider}`;

/** Label fields that must agree with the prescription: quantity, days supply, refills, how many, how often, for how long. */
const labelMutator = (l: Label): Mutator => (cx) => {
  const t = cx.tokens;
  const o = l.order;
  const out: Plant[] = [];
  const phrase = o.freq ? FREQ[o.freq].label.split(' ') : [];
  t.forEach((tok, i) => {
    const b = bodyOf(tok);
    const prev = i > 0 ? bodyOf(t[i - 1]) : '';
    const next = i + 1 < t.length ? t[i + 1] : '';
    if (prev === 'Qty:' && isInt(b) && !next.startsWith('(') && o.kind !== 'fixed') {
      const q = Number(b);
      const bad = q % 2 === 0 && cx.rng() < 0.5 ? q / 2 : q * 2;
      out.push(swapWord(cx, i, String(bad), err('number', `The prescription is for ${q}. The label says ${bad}, which does not match the directions and the days supply.`)));
    }
    if (prev === 'supply:' && isInt(b)) {
      const d = Number(b);
      const bad = d === 30 ? 90 : d === 90 ? 30 : d * 2;
      out.push(swapWord(cx, i, String(bad), err('number', `The prescription is a ${d}-day supply. The label says ${bad}.`)));
    }
    if (prev === 'Refills:' && isInt(b)) {
      const n = Number(b);
      const bad = pick(cx.rng, [0, 1, 2, 3, 4, 5, 6, 11].filter((x) => x !== n));
      out.push(swapWord(cx, i, String(bad), err('number', `The prescription allows ${n} ${plural(n, 'refill')}, not ${bad}. Refills have to be copied exactly.`)));
    }
    if (prev === 'Take' && isInt(b) && /^(tablet|capsule)s?$/.test(bodyOf(next)) && o.perDose != null) {
      const bad = o.perDose === 1 ? 2 : 1;
      out.push({ start: i, end: i + 2, to: [String(bad), withBody(next, `${o.form}${bad === 1 ? '' : 's'}`)], error: err('number', `The sig is ${o.perDose} ${plural(o.perDose, o.form!)} each time. The label says ${bad}.`) });
    }
    if (o.freq && phrase.every((w, k) => bodyOf(t[i + k] ?? '') === w) && cx.lines[i] === cx.lines[i + phrase.length - 1]) {
      const others = (Object.keys(FREQ) as (keyof typeof FREQ)[]).filter((f) => FREQ[f].perDay !== FREQ[o.freq!].perDay && f !== 'qhs' && f !== 'qam' && f !== 'qpm' && f !== 'daily');
      const pickF = pick(cx.rng, others.length ? others : (['bid'] as const));
      const words = FREQ[pickF].label.split(' ');
      const post = splitPost(t[i + phrase.length - 1]);
      out.push({ start: i, end: i + phrase.length, to: [...words.slice(0, -1), `${words.at(-1)}${post}`], error: err('logic', `The sig is ${FREQ[o.freq!].sig} (${FREQ[o.freq!].label}). The label says ${FREQ[pickF].label}.`) });
    }
    if (prev === 'for' && isInt(b) && bodyOf(next) === 'days' && o.kind === 'course') {
      const d = Number(b);
      const bad = d === 7 ? 10 : d === 10 ? 14 : d === 14 ? 10 : d === 3 ? 7 : d * 2;
      out.push(swapWord(cx, i, String(bad), err('number', `The sig is for ${d} days. The label says ${bad} days.`)));
    }
  });
  return out;
};
const splitPost = (tok: string): string => /[.,;:)]*$/.exec(tok)![0];

/** Shelf and sentence notes for look-alike names: Tall Man names, spelling, and a storage rule turned around. */
const lasaMutator: Mutator = (cx) => {
  const t = cx.tokens;
  const out: Plant[] = [];
  t.forEach((tok, i) => {
    if (bodyOf(tok) === 'not' && i > 0 && t[i - 1].endsWith(',')) out.push({ start: i, end: i + 1, to: [], error: err('logic', 'Leaving out the word not makes the sentence say the wrong thing: one name is the one on the prescription, and the other is the one it must not be mixed up with.') });
    if (bodyOf(tok) === 'separate' && bodyOf(t[i + 1] ?? '') === 'shelves') {
      out.push({ start: i, end: i + 2, to: ['the', 'same', `shelf${splitPost(t[i + 1])}`], error: err('logic', 'Look-alike drugs are stored apart so they are not picked by mistake. Keeping them on the same shelf does the opposite.') });
    }
  });
  return out;
};

/** A pharmacy error hunt: a label to check against the prescription shown above it, or a list of look-alike drug rules. */
export function makeRxHuntPassage(rng: Rng, today: ISODate): Passage {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (int(rng, 0, 9) < 8) {
      const label = buildLabel(rng, today);
      const text = `${label.text}\n${allergyLine(label.patient)}`;
      const planted = plantNote(text, [...COMMON_MUTATORS, labelMutator(label)], { rng, patient: label.patient, reference: true });
      if (!planted) continue;
      return {
        ctx: `<b>Pharmacist check.</b> Check the label against the prescription: <code>${prescriptionLine(label)}</code>. There are ${planted.errors.length} errors. `
          + 'Check the patient details against the chart banner above. Edit the label to fix each one, then press Check.',
        text, flawed: planted.flawed, errors: planted.errors, patient: label.patient,
      };
    }
    const base = makeLasaPassage(rng, today);
    if (base.text.includes(' / ')) continue;
    const planted = plantNote(base.text, [spellingMutator, lasaMutator], { rng, reference: false });
    if (!planted) continue;
    return {
      ctx: `<b>Pharmacist check.</b> Look-alike drug rules for the shelf and the screen. There are ${planted.errors.length} errors. Everything you need is in the note. Edit it to fix each one, then press Check.`,
      text: base.text, flawed: planted.flawed, errors: planted.errors,
    };
  }
  throw new Error('could not plant errors in a pharmacy note');
}
