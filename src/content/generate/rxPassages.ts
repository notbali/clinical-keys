import type { ISODate } from '../../lib/dates';
import type { Passage } from '../types';
import { makePatient } from './patient';
import { randomOrder, type RxOrder } from './rxCatalog';
import { int, pick, shuffle, type Rng } from './rng';

const COUNT_WORD = ['', 'Once', 'Twice', 'Three times', 'Four times'];
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** The scenario line over a label: the arithmetic a tech does before typing it. */
function labelContext(o: RxOrder): string {
  const enter = 'Press <b>Enter</b> at each line break.';
  if (o.kind === 'fixed') return `${o.note} ${enter}`;
  const unit = o.form!;
  const each = o.perDose! > 1 ? `, ${o.perDose} ${unit}s each time` : '';
  const lead = o.kind === 'prn' ? 'As needed: the days supply counts the most doses allowed. ' : '';
  return `${lead}${COUNT_WORD[o.perDay!]} a day for ${o.daysSupply} days${each}: ${o.qty} ${plural(o.qtyNumber!, unit)}. ${enter}`;
}

/** A multi-line prescription label for a fictional patient, like the written Prescription Labels drills. */
export function makeLabelPassage(rng: Rng, today: ISODate): Passage {
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
  return { ctx: labelContext(order), text: lines.join('\n'), patient };
}

/** Prescriber shorthand to turn into label directions, like the written Sig Code Translator drills. */
export function makeSigPassage(rng: Rng, _today: ISODate): Passage {
  const o = randomOrder(rng);
  return { ctx: `<b>${o.productLine}</b> &nbsp; Sig: <code>${o.sig}</code>`, text: o.directions };
}

/**
 * Groups of look-alike, sound-alike names with the FDA's Tall Man lettering. Every name is on the FDA list
 * (the tests check each one against src/test/tallman.ts), and no name is in two groups.
 */
export const LASA_GROUPS: readonly (readonly string[])[] = [
  ['hydrOXYzine', 'hydrALAZINE'], ['glipiZIDE', 'glyBURIDE'], ['traMADol', 'traZODone'], ['risperiDONE', 'rOPINIRole'],
  ['predniSONE', 'prednisoLONE'], ['NIFEdipine', 'niCARdipine'], ['busPIRone', 'buPROPion'], ['chlorproMAZINE', 'chlorproPAMIDE'],
  ['DOBUTamine', 'DOPamine'], ['TOLAZamide', 'TOLBUTamide'], ['acetaZOLAMIDE', 'acetoHEXAMIDE'], ['clomiPHENE', 'clomiPRAMINE'],
  ['sulfADIAZINE', 'sulfiSOXAZOLE'], ['dimenhyDRINATE', 'diphenhydrAMINE'], ['medroxyPROGESTERone', 'methylPREDNISolone', 'methylTESTOSTERone'],
  ['DAUNOrubicin', 'DOXOrubicin'], ['vinBLAStine', 'vinCRIStine'], ['CISplatin', 'CARBOplatin'], ['cycloSPORINE', 'cycloSERINE'],
];

const joinNames = (names: readonly string[]): string => (names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Look-alike names to type exactly, in three layouts: a list of pairs, names in sentences, and shelf labels. */
export function makeLasaPassage(rng: Rng, _today: ISODate): Passage {
  const layout = int(rng, 0, 2);
  if (layout === 0) {
    const groups = shuffle(rng, LASA_GROUPS).slice(0, 3);
    return { ctx: 'Type each group exactly. The capital letters are the part that differs.', text: groups.map((g) => shuffle(rng, g).join(' / ')).join(', ') };
  }
  if (layout === 1) {
    const [a, b] = shuffle(rng, LASA_GROUPS.filter((g) => g.length === 2)).slice(0, 2).map((g) => shuffle(rng, g));
    return {
      ctx: 'Tall Man names inside a sentence. Check the name, not just the first letters.',
      text: `The prescription says ${a[0]}, not ${a[1]}. The next one says ${b[0]}, not ${b[1]}.`,
    };
  }
  const groups = shuffle(rng, LASA_GROUPS).slice(0, 3);
  return {
    ctx: 'Shelf labels for look-alike drugs, one per line. Press <b>Enter</b> at the end of each line.',
    text: groups.map((g) => `Keep ${joinNames(shuffle(rng, g))} on separate shelves.`).join('\n'),
  };
}
