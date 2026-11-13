import type { AllergyClass } from './patient';
import { pick, type Rng } from './rng';

/**
 * The drugs the generators can put on a label, in a sig, or in a note. Every entry is checked against an independent
 * reference in src/test/rxReference.ts (real strengths and forms, usual adult daily maximums), so a wrong number in
 * either place fails a test. Double-check anything clinical before adding it, and add it to that reference too.
 * Names use the FDA's Tall Man lettering where the FDA list has the drug. No controlled substances.
 */

export type Freq = 'daily' | 'bid' | 'tid' | 'qid' | 'qhs' | 'qam' | 'qpm' | 'q6h' | 'q8h' | 'q12h';

/** How often a dose is taken: doses per day, the sig shorthand, and the words on the label. */
export const FREQ: Record<Freq, { perDay: number; sig: string; label: string }> = {
  daily: { perDay: 1, sig: 'daily', label: 'once daily' },
  bid: { perDay: 2, sig: 'BID', label: 'twice daily' },
  tid: { perDay: 3, sig: 'TID', label: 'three times daily' },
  qid: { perDay: 4, sig: 'QID', label: 'four times daily' },
  qhs: { perDay: 1, sig: 'qhs', label: 'at bedtime' },
  qam: { perDay: 1, sig: 'qAM', label: 'every morning' },
  qpm: { perDay: 1, sig: 'qPM', label: 'every evening' },
  q6h: { perDay: 4, sig: 'q6h', label: 'every 6 hours' },
  q8h: { perDay: 3, sig: 'q8h', label: 'every 8 hours' },
  q12h: { perDay: 2, sig: 'q12h', label: 'every 12 hours' },
};

/** maintenance: taken long term. course: for a set number of days. prn: as needed. fixed: an inhaler, spray or drops. */
export type OrderKind = 'maintenance' | 'course' | 'prn' | 'fixed';

export interface RxOrder {
  drugId: string;
  kind: OrderKind;
  /** The drug as printed on the label ("Lisinopril", "hydrALAZINE") and its strength ("10 mg"). Empty strength for sprays and drops. */
  name: string;
  strengthText: string;
  freq?: Freq;
  /** "Lisinopril 10 mg tablet": what the second label line shows before "Qty:". */
  productLine: string;
  /** What follows "Qty:". A plain number for tablets and capsules, "1 (18 g)" for an inhaler. */
  qty: string;
  qtyNumber?: number;
  daysSupply?: number;
  perDose?: number;
  perDay?: number;
  form?: 'tablet' | 'capsule';
  /** The label directions, as one line. */
  directions: string;
  /** The prescriber's shorthand that turns into `directions`. */
  sig: string;
  aux: string[];
  /** The refill counts a prescriber would write for this kind of prescription. */
  refillOptions: number[];
  classes: AllergyClass[];
  antibiotic: boolean;
  /** One sentence for the scenario line above a label, for the products that need their own. */
  note?: string;
}

interface Timing { sig: string; text: string; style: 'inline' | 'sentence' }
interface Reason { sig: string; text: string }
interface Regimen {
  kind: Exclude<OrderKind, 'fixed'>;
  perDose: number;
  freq: Freq;
  /** Days supply for maintenance and as-needed drugs, length of the course for a course. */
  days: readonly number[];
  /** Strengths that go with this regimen, when not every strength does. */
  strengths?: readonly number[];
  prn?: Reason;
  timing?: Timing;
  refills: readonly number[];
}
interface Drug {
  id: string;
  /** As printed on the label. */
  name: string;
  form: 'tablet' | 'capsule';
  unit: 'mg' | 'mcg';
  strengths: readonly number[];
  /** For combination products whose strength is written differently ("800 mg/160 mg"). */
  strengthText?: (s: number) => string;
  classes?: readonly AllergyClass[];
  antibiotic?: boolean;
  aux?: readonly string[];
  regimens: readonly Regimen[];
}

// Auxiliary label wording, as in the pharmacy drills.
const DROWSY = 'May cause drowsiness. Alcohol may intensify this effect.';
const SWALLOW = 'Do not chew or crush. Swallow whole.';
const WATER = 'Take with a full glass of water.';
const SUN = 'Avoid prolonged exposure to sunlight.';
const FINISH = 'Finish all of this medication unless otherwise directed by prescriber.';
const GRAPEFRUIT = 'Do not take with grapefruit juice.';

const WITH_MEALS: Timing = { sig: 'with meals', text: 'with meals', style: 'inline' };
const BEFORE_BREAKFAST: Timing = { sig: 'ac breakfast', text: 'before breakfast', style: 'inline' };
const EMPTY_STOMACH: Timing = { sig: 'on empty stomach', text: 'on an empty stomach', style: 'inline' };
const WITH_FOOD: Timing = { sig: 'with food', text: 'Take with food', style: 'sentence' };

const PAIN: Reason = { sig: 'pain', text: 'pain' };
const SPASM: Reason = { sig: 'muscle spasm', text: 'muscle spasm' };
const NAUSEA: Reason = { sig: 'N/V', text: 'nausea and vomiting' };
const COUGH: Reason = { sig: 'cough', text: 'cough' };
const ITCH: Reason = { sig: 'itching', text: 'itching' };
const SLEEP: Reason = { sig: 'sleep', text: 'sleep' };

const maintenance = (freq: Freq, timing?: Timing, strengths?: readonly number[]): Regimen =>
  ({ kind: 'maintenance', perDose: 1, freq, days: [30, 90], timing, strengths, refills: [1, 2, 3, 5] });
const course = (freq: Freq, days: readonly number[], perDose = 1, timing?: Timing): Regimen =>
  ({ kind: 'course', perDose, freq, days, timing, refills: [0] });
const prn = (freq: Freq, reason: Reason, days: readonly number[], timing?: Timing, strengths?: readonly number[]): Regimen =>
  ({ kind: 'prn', perDose: 1, freq, days, prn: reason, timing, strengths, refills: [0, 1] });

const DRUGS: readonly Drug[] = [
  { id: 'lisinopril', name: 'Lisinopril', form: 'tablet', unit: 'mg', strengths: [5, 10, 20, 40], regimens: [maintenance('daily')] },
  { id: 'amlodipine', name: 'Amlodipine', form: 'tablet', unit: 'mg', strengths: [2.5, 5, 10], regimens: [maintenance('daily')] },
  { id: 'atorvastatin', name: 'Atorvastatin', form: 'tablet', unit: 'mg', strengths: [10, 20, 40, 80], regimens: [maintenance('daily')] },
  { id: 'simvastatin', name: 'Simvastatin', form: 'tablet', unit: 'mg', strengths: [10, 20, 40], aux: [GRAPEFRUIT], regimens: [maintenance('qpm')] },
  { id: 'metformin', name: 'Metformin', form: 'tablet', unit: 'mg', strengths: [500, 850, 1000], regimens: [maintenance('bid', WITH_MEALS)] },
  { id: 'levothyroxine', name: 'Levothyroxine', form: 'tablet', unit: 'mcg', strengths: [25, 50, 75, 88, 100, 112, 125], regimens: [maintenance('qam', EMPTY_STOMACH)] },
  { id: 'losartan', name: 'Losartan', form: 'tablet', unit: 'mg', strengths: [25, 50, 100], regimens: [maintenance('daily')] },
  { id: 'metoprolol-tartrate', name: 'Metoprolol tartrate', form: 'tablet', unit: 'mg', strengths: [25, 50], regimens: [maintenance('bid')] },
  { id: 'metoprolol-succinate', name: 'Metoprolol succinate ER', form: 'tablet', unit: 'mg', strengths: [25, 50, 100], aux: [SWALLOW], regimens: [maintenance('daily')] },
  { id: 'sertraline', name: 'Sertraline', form: 'tablet', unit: 'mg', strengths: [25, 50, 100], regimens: [maintenance('daily')] },
  { id: 'escitalopram', name: 'Escitalopram', form: 'tablet', unit: 'mg', strengths: [5, 10, 20], regimens: [maintenance('daily')] },
  { id: 'omeprazole', name: 'Omeprazole', form: 'capsule', unit: 'mg', strengths: [20, 40], aux: [SWALLOW], regimens: [maintenance('qam', BEFORE_BREAKFAST)] },
  { id: 'hydrochlorothiazide', name: 'Hydrochlorothiazide', form: 'tablet', unit: 'mg', strengths: [25, 50], regimens: [maintenance('qam')] },
  { id: 'montelukast', name: 'Montelukast', form: 'tablet', unit: 'mg', strengths: [10], regimens: [maintenance('qpm')] },
  { id: 'glipizide', name: 'glipiZIDE', form: 'tablet', unit: 'mg', strengths: [5, 10], regimens: [maintenance('qam', BEFORE_BREAKFAST)] },
  { id: 'hydralazine', name: 'hydrALAZINE', form: 'tablet', unit: 'mg', strengths: [10, 25, 50], regimens: [maintenance('tid')] },
  { id: 'hydroxyzine', name: 'hydrOXYzine', form: 'tablet', unit: 'mg', strengths: [10, 25, 50], aux: [DROWSY], regimens: [prn('tid', ITCH, [10, 15])] },
  { id: 'trazodone', name: 'traZODone', form: 'tablet', unit: 'mg', strengths: [50, 100], aux: [DROWSY], regimens: [prn('qhs', SLEEP, [30])] },
  { id: 'bupropion', name: 'buPROPion XL', form: 'tablet', unit: 'mg', strengths: [150, 300], aux: [SWALLOW], regimens: [maintenance('qam')] },
  { id: 'buspirone', name: 'busPIRone', form: 'tablet', unit: 'mg', strengths: [5, 10, 15], regimens: [maintenance('bid')] },
  { id: 'nifedipine', name: 'NIFEdipine ER', form: 'tablet', unit: 'mg', strengths: [30, 60, 90], aux: [SWALLOW, GRAPEFRUIT], regimens: [maintenance('daily')] },
  { id: 'prednisone', name: 'predniSONE', form: 'tablet', unit: 'mg', strengths: [20], regimens: [course('daily', [5], 2, WITH_FOOD)] },
  { id: 'amoxicillin-capsule', name: 'Amoxicillin', form: 'capsule', unit: 'mg', strengths: [500], classes: ['penicillin'], antibiotic: true, aux: [FINISH], regimens: [course('tid', [7, 10])] },
  { id: 'amoxicillin-tablet', name: 'Amoxicillin', form: 'tablet', unit: 'mg', strengths: [875], classes: ['penicillin'], antibiotic: true, aux: [FINISH], regimens: [course('bid', [7, 10])] },
  { id: 'cephalexin', name: 'Cephalexin', form: 'capsule', unit: 'mg', strengths: [500], antibiotic: true, aux: [FINISH], regimens: [course('q12h', [7, 10, 14])] },
  { id: 'ciprofloxacin', name: 'Ciprofloxacin', form: 'tablet', unit: 'mg', strengths: [500], antibiotic: true, aux: [WATER, SUN, FINISH], regimens: [course('bid', [7])] },
  { id: 'doxycycline', name: 'Doxycycline', form: 'capsule', unit: 'mg', strengths: [100], antibiotic: true, aux: [WATER, SUN, FINISH], regimens: [course('bid', [7, 10, 14])] },
  {
    id: 'sulfamethoxazole-trimethoprim', name: 'Sulfamethoxazole-trimethoprim DS', form: 'tablet', unit: 'mg', strengths: [800],
    strengthText: () => '800 mg/160 mg', classes: ['sulfa'], antibiotic: true, aux: [WATER, FINISH], regimens: [course('bid', [3, 7, 10])],
  },
  {
    id: 'ibuprofen', name: 'Ibuprofen', form: 'tablet', unit: 'mg', strengths: [400, 600, 800], classes: ['nsaid'],
    regimens: [prn('q8h', PAIN, [5, 10], WITH_FOOD), prn('q6h', PAIN, [5, 10], WITH_FOOD, [400, 600])],
  },
  { id: 'naproxen', name: 'Naproxen', form: 'tablet', unit: 'mg', strengths: [250, 500], classes: ['nsaid'], regimens: [prn('bid', PAIN, [10, 15], WITH_FOOD)] },
  { id: 'meloxicam', name: 'Meloxicam', form: 'tablet', unit: 'mg', strengths: [7.5, 15], classes: ['nsaid'], regimens: [maintenance('daily', WITH_FOOD)] },
  { id: 'cyclobenzaprine', name: 'Cyclobenzaprine', form: 'tablet', unit: 'mg', strengths: [5, 10], aux: [DROWSY], regimens: [prn('tid', SPASM, [7, 10])] },
  { id: 'ondansetron', name: 'Ondansetron', form: 'tablet', unit: 'mg', strengths: [4, 8], regimens: [prn('q8h', NAUSEA, [2, 4])] },
  { id: 'benzonatate', name: 'Benzonatate', form: 'capsule', unit: 'mg', strengths: [100, 200], aux: [SWALLOW], regimens: [prn('tid', COUGH, [7, 10])] },
];

interface Fixed {
  id: string;
  productLine: string;
  qty: string;
  sig: string;
  directions: string;
  aux: string[];
  refillOptions: number[];
  daysSupply?: number;
  note: string;
}

const FIXED: readonly Fixed[] = [
  {
    id: 'albuterol-hfa', productLine: 'Albuterol HFA 90 mcg/actuation inhaler', qty: '1 (18 g)', sig: '2 puffs inh q4-6h prn SOB',
    directions: 'Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath.', aux: ['Shake well before each use.'], refillOptions: [0, 1, 2, 3],
    note: 'A rescue inhaler. The quantity is written as 1 inhaler and its size.',
  },
  {
    id: 'fluticasone-nasal', productLine: 'Fluticasone 50 mcg/actuation nasal spray', qty: '1 (16 g)', sig: '2 sprays ea nostril daily',
    directions: 'Use 2 sprays in each nostril once daily.', aux: [], refillOptions: [1, 2, 3, 5], daysSupply: 30,
    note: 'A nasal spray. The quantity is written as 1 bottle and its size.',
  },
  {
    id: 'latanoprost', productLine: 'Latanoprost 0.005% eye drops', qty: '1 (2.5 mL)', sig: '1 gtt OU qhs',
    directions: 'Instill 1 drop in both eyes at bedtime.', aux: ['Refrigerate. Do not freeze.'], refillOptions: [3, 5],
    note: 'Eye drops. The quantity is written as 1 bottle and its size.',
  },
];

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const strengthOf = (d: Drug, s: number) => (d.strengthText ? d.strengthText(s) : `${s} ${d.unit}`);

/** One drug, regimen, strength and number of days, turned into everything a label or a sig needs. */
function buildOrder(d: Drug, r: Regimen, strength: number, days: number): RxOrder {
  const f = FREQ[r.freq];
  const inline = r.timing?.style === 'inline' ? ` ${r.timing.text}` : '';
  const sentence = r.timing?.style === 'sentence' ? ` ${r.timing.text}.` : '';
  const directions =
    `Take ${r.perDose} ${plural(r.perDose, d.form)} by mouth ${f.label}` +
    (r.kind === 'course' ? ` for ${days} days` : '') +
    (r.prn ? ` as needed for ${r.prn.text}` : '') +
    `${inline}.${sentence}`;
  const sig =
    `${r.perDose} ${r.perDose === 1 ? (d.form === 'tablet' ? 'tab' : 'cap') : d.form === 'tablet' ? 'tabs' : 'caps'} PO ${f.sig}` +
    (r.kind === 'course' ? ` x ${days} days` : '') +
    (r.prn ? ` prn ${r.prn.sig}` : '') +
    (r.timing ? ` ${r.timing.sig}` : '');
  const qtyNumber = r.perDose * f.perDay * days;
  return {
    drugId: d.id,
    kind: r.kind,
    name: d.name,
    strengthText: strengthOf(d, strength),
    freq: r.freq,
    productLine: `${d.name} ${strengthOf(d, strength)} ${d.form}`,
    qty: String(qtyNumber),
    qtyNumber,
    daysSupply: days,
    perDose: r.perDose,
    perDay: f.perDay,
    form: d.form,
    directions,
    sig,
    aux: [...(d.aux ?? [])],
    refillOptions: [...r.refills],
    classes: [...(d.classes ?? [])],
    antibiotic: d.antibiotic ?? false,
  };
}

function fixedOrder(x: Fixed): RxOrder {
  return {
    drugId: x.id, kind: 'fixed', name: x.productLine.split(' ')[0], strengthText: '', productLine: x.productLine, qty: x.qty, daysSupply: x.daysSupply, directions: x.directions, sig: x.sig,
    aux: [...x.aux], refillOptions: [...x.refillOptions], classes: [], antibiotic: false, note: x.note,
  };
}

/** Every order the catalog can make. The tests check all of them, not a sample. */
export function allOrders(): RxOrder[] {
  const out: RxOrder[] = [];
  for (const d of DRUGS) for (const r of d.regimens) for (const s of r.strengths ?? d.strengths) for (const days of r.days) out.push(buildOrder(d, r, s, days));
  for (const x of FIXED) out.push(fixedOrder(x));
  return out;
}

/** One random order. `avoid` lists drug families the patient is allergic to, and no order from those families is returned. */
export function randomOrder(rng: Rng, opts: { avoid?: readonly AllergyClass[] } = {}): RxOrder {
  const avoid = opts.avoid ?? [];
  const entries: (Drug | Fixed)[] = [...DRUGS.filter((d) => !(d.classes ?? []).some((c) => avoid.includes(c))), ...FIXED];
  const e = pick(rng, entries);
  if ('regimens' in e) {
    const r = pick(rng, e.regimens);
    return buildOrder(e, r, pick(rng, r.strengths ?? e.strengths), pick(rng, r.days));
  }
  return fixedOrder(e);
}
