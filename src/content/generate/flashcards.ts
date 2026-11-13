import type { ISODate } from '../../lib/dates';
import type { Patient, Track } from '../types';
import { makePatient, type AllergyClass } from './patient';
import { chance, hashSeed, int, mulberry32, pick, shuffle, type Rng } from './rng';
import { allOrders, FREQ, type RxOrder } from './rxCatalog';
import { LASA_GROUPS } from './rxPassages';
import { makeVitals, vitalsLine } from './vitals';

/**
 * Flash cards for the "Is this correct?" game. A card shows a label, a sig translation, a chart entry or a drug name.
 * It is either correct or has exactly one planted error. Cards are built from the same drug catalog as the generated
 * labels (rxCatalog.ts) and are repeatable from a seed. flashcards.test.ts checks every card with a separate auditor
 * written from the FDA Tall Man list, the Joint Commission do-not-use list and the drug reference in src/test.
 */

export type FlashKind = 'label' | 'sig' | 'chart' | 'drug';
export type FlashCategory = 'tall-man' | 'do-not-use' | 'trailing-zero' | 'quantity' | 'allergy' | 'unit' | 'translation';

/** One planted mistake. `wrong` is the text as it appears on the card, so the screen can point at it. */
export interface FlashError { category: FlashCategory; wrong: string; right: string; why: string }

export interface FlashCard {
  kind: FlashKind;
  /** What the card is, e.g. "Prescription label". */
  title: string;
  /** The text to check, one line each. */
  lines: string[];
  /** The chart banner, for cards that belong to a patient. */
  patient?: Patient;
  error: FlashError | null;
  /** Shown after the answer, for correct and flawed cards alike. Starts "Correct." or "Not correct.". */
  explanation: string;
  /** The drug (or pair, or vitals entry) the card is about, so a round does not repeat one. */
  subject: string;
}

export const ROUND_SIZE = 10;

export const FLASH_CATEGORIES: readonly FlashCategory[] = ['tall-man', 'do-not-use', 'trailing-zero', 'quantity', 'allergy', 'unit', 'translation'];

export const CATEGORY_LABELS: Record<FlashCategory, string> = {
  'tall-man': 'Tall Man lettering',
  'do-not-use': 'Do-not-use abbreviation',
  'trailing-zero': 'Trailing zero',
  quantity: 'Quantity',
  allergy: 'Allergy conflict',
  unit: 'Wrong unit',
  translation: 'Sig translation',
};

/** Which kinds of card each mistake can be planted on. */
export const KINDS_FOR: Record<FlashCategory, readonly FlashKind[]> = {
  'tall-man': ['label', 'sig', 'chart', 'drug'],
  'do-not-use': ['label', 'sig', 'chart'],
  'trailing-zero': ['label', 'sig', 'chart'],
  quantity: ['label'],
  allergy: ['label', 'chart'],
  unit: ['label', 'sig', 'chart'],
  translation: ['sig'],
};

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers

const SOLID = /^(.+?) (\d+(?:\.\d+)?) (mg|mcg)((?:\/\d+(?:\.\d+)? mg)?) (tablet|capsule)$/;
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** A drug name written with Tall Man capitals: not all lower case, and not just a capital first letter. */
const isTallMan = (w: string): boolean => w.length >= 5 && /^[A-Za-z]+$/.test(w) && w !== w.toLowerCase() && w !== capitalize(w.toLowerCase());
const tallManWord = (o: RxOrder): string | undefined => o.name.split(' ').find(isTallMan);

/** Allergy wording as a chart writes it, and how to describe the drug family in a sentence. */
const ALLERGY_TEXT: Record<AllergyClass, { entries: string[]; family: string }> = {
  penicillin: { entries: ['Penicillin (rash)', 'Penicillin (hives)'], family: 'a penicillin' },
  sulfa: { entries: ['Sulfa drugs (hives)', 'Sulfa drugs (rash)'], family: 'a sulfa drug' },
  nsaid: { entries: ['NSAIDs (stomach pain)', 'Aspirin (hives)'], family: 'an NSAID' },
  codeine: { entries: ['Codeine (nausea)'], family: 'a codeine-type drug' },
};

/** Families a patient must not have on the banner when this drug is shown as correct. A cephalosporin is kept away from penicillin allergies too. */
const avoidFor = (o: RxOrder): AllergyClass[] => (o.drugId === 'cephalexin' ? [...o.classes, 'penicillin'] : [...o.classes]);

let pool: RxOrder[] | undefined;
const orders = (): RxOrder[] => (pool ??= allOrders());

type OrderKind = 'label' | 'sig' | 'chart';

/** Can this mistake be planted in this order on this kind of card? */
export function canPlant(order: RxOrder, kind: FlashKind, category: FlashCategory): boolean {
  if (!KINDS_FOR[category].includes(kind) || kind === 'drug') return false;
  const solid = order.kind !== 'fixed';
  switch (category) {
    case 'tall-man': return !!tallManWord(order);
    case 'do-not-use': return order.directions.includes('once daily');
    case 'trailing-zero': return SOLID.test(order.productLine);
    case 'quantity': return solid && order.qtyNumber != null;
    case 'allergy': return order.classes.length > 0;
    case 'unit': return SOLID.test(order.productLine) || order.productLine.includes(' mcg/actuation');
    case 'translation': return solid;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Planting one mistake

interface Shown { productLine: string; qty: string; directions: string; sig: string }
interface Flaw { error: FlashError; shown: Shown; patient?: Patient }

function plantTallMan(rng: Rng, o: RxOrder, shown: Shown): Flaw {
  const right = tallManWord(o)!;
  const lower = right.toLowerCase();
  const wrong = pick(rng, [lower, capitalize(lower), right.toUpperCase()]);
  return {
    shown: { ...shown, productLine: shown.productLine.replace(right, wrong) },
    error: {
      category: 'tall-man', wrong, right,
      why: `Look-alike drug names are written with Tall Man capital letters, so the part that differs stands out. The FDA spelling is ${right}, not ${wrong}.`,
    },
  };
}

function plantDoNotUse(rng: Rng, shown: Shown): Flaw {
  const wrong = pick(rng, ['QD', 'qd']);
  return {
    shown: { ...shown, directions: shown.directions.replace('once daily', wrong) },
    error: {
      category: 'do-not-use', wrong, right: 'once daily',
      why: `${wrong} is on the Joint Commission’s do-not-use list: it can be mistaken for QID (four times daily). Write “once daily” in words, and send a prescriber’s ${wrong} back for clarification.`,
    },
  };
}

function plantTrailingZero(o: RxOrder, shown: Shown): Flaw {
  const m = SOLID.exec(o.productLine)!;
  const strength = m[2];
  const zeroed = strength.includes('.') ? `${strength}0` : `${strength}.0`;
  const productLine = o.productLine.replace(`${strength} ${m[3]}`, `${zeroed} ${m[3]}`);
  return {
    shown: { ...shown, productLine },
    error: {
      category: 'trailing-zero', wrong: productLine, right: o.productLine,
      why: `A trailing zero can be misread as a larger dose: ${zeroed} ${m[3]} can look like ${zeroed.replace('.', '')} ${m[3]}. Write ${strength} ${m[3]}, with no zero after the decimal point.`,
    },
  };
}

function plantQuantity(rng: Rng, o: RxOrder, shown: Shown): Flaw {
  const perDose = o.perDose!, perDay = o.perDay!, days = o.daysSupply!, correct = o.qtyNumber!;
  const candidates = new Set<number>([perDose * (perDay + 1) * days]);
  if (perDay > 1) candidates.add(perDose * (perDay - 1) * days);
  if (perDose > 1) candidates.add(perDay * days);
  candidates.delete(correct);
  const wrong = pick(rng, [...candidates].filter((n) => n > 0));
  return {
    shown: { ...shown, qty: String(wrong) },
    error: {
      category: 'quantity', wrong: `Qty: ${wrong}`, right: `Qty: ${correct}`,
      why: `The directions and the days supply work out to ${perDose} x ${perDay} a day x ${days} days = ${correct}, not ${wrong}. Check the quantity against the directions and the days supply before it goes out.`,
    },
  };
}

function plantAllergy(rng: Rng, o: RxOrder, shown: Shown, patient: Patient): Flaw {
  const family = o.classes[0];
  const allergy = pick(rng, ALLERGY_TEXT[family].entries);
  return {
    shown,
    patient: { ...patient, allergies: allergy },
    error: {
      category: 'allergy', wrong: o.productLine, right: 'Hold it and ask the pharmacist or provider',
      why: `The banner lists ${allergy}, and ${o.name} is ${ALLERGY_TEXT[family].family}. Stop and tell the pharmacist or provider. Checking an allergy is not a tech’s or MA’s decision, and it does not go out until they decide.`,
    },
  };
}

function plantUnit(o: RxOrder, shown: Shown): Flaw {
  const m = SOLID.exec(o.productLine);
  if (!m) {
    const productLine = o.productLine.replace(' mcg/actuation', ' mg/actuation');
    return {
      shown: { ...shown, productLine },
      error: {
        category: 'unit', wrong: productLine, right: o.productLine,
        why: `${o.name} is measured in mcg for each puff or spray, not mg. A mg is 1,000 times a mcg, so the wrong unit is a dose 1,000 times off.`,
      },
    };
  }
  const unit = m[3];
  const wrongUnit = unit === 'mg' ? 'mcg' : 'mg';
  const productLine = o.productLine.replace(`${m[2]} ${unit}`, `${m[2]} ${wrongUnit}`);
  return {
    shown: { ...shown, productLine },
    error: {
      category: 'unit', wrong: productLine, right: o.productLine,
      why: `${o.name} comes in ${unit}, not ${wrongUnit}. A mg is 1,000 times a mcg, so the wrong unit is a dose 1,000 times off.`,
    },
  };
}

function plantTranslation(rng: Rng, o: RxOrder, shown: Shown): Flaw {
  const perDose = o.perDose!, form = o.form!;
  const label = FREQ[o.freq!].label;
  const options: (() => Flaw)[] = [
    () => {
      const other = pick(rng, Object.values(FREQ).filter((f) => f.perDay !== FREQ[o.freq!].perDay).map((f) => f.label));
      return {
        shown: { ...shown, directions: shown.directions.replace(label, other) },
        error: { category: 'translation', wrong: other, right: label, why: `The sig says ${FREQ[o.freq!].sig}, which means ${label}. The label says ${other}.` },
      };
    },
    () => {
      const n = perDose === 1 ? 2 : 1;
      const wrong = `Take ${n} ${plural(n, form)}`;
      const right = `Take ${perDose} ${plural(perDose, form)}`;
      return {
        shown: { ...shown, directions: shown.directions.replace(right, wrong) },
        error: { category: 'translation', wrong, right, why: `The sig says ${perDose} ${perDose === 1 ? 'tab' : 'tabs'}, so the label must say ${right.toLowerCase()}, not ${n}.` },
      };
    },
  ];
  if (o.kind === 'prn') {
    options.push(() => {
      const reason = /\s+as needed for ([^.]+)/.exec(o.directions)![1];
      const directions = o.directions.replace(/\s+as needed for [^.]+/, '');
      return {
        shown: { ...shown, directions },
        error: {
          category: 'translation', wrong: directions, right: o.directions,
          why: `The sig has prn, which means “as needed”, so the label must say “as needed for ${reason}”. Without it the label tells the patient to take it on a schedule.`,
        },
      };
    });
  }
  if (o.kind === 'course') {
    options.push(() => {
      const other = pick(rng, [3, 5, 7, 10, 14].filter((d) => d !== o.daysSupply));
      return {
        shown: { ...shown, directions: shown.directions.replace(`for ${o.daysSupply} days`, `for ${other} days`) },
        error: { category: 'translation', wrong: `for ${other} days`, right: `for ${o.daysSupply} days`, why: `The sig says x ${o.daysSupply} days, but the label says ${other} days. The length of the course has to match.` },
      };
    });
  }
  return pick(rng, options)();
}

function plant(rng: Rng, category: FlashCategory, o: RxOrder, shown: Shown, patient?: Patient): Flaw {
  switch (category) {
    case 'tall-man': return plantTallMan(rng, o, shown);
    case 'do-not-use': return plantDoNotUse(rng, shown);
    case 'trailing-zero': return plantTrailingZero(o, shown);
    case 'quantity': return plantQuantity(rng, o, shown);
    case 'allergy': return plantAllergy(rng, o, shown, patient!);
    case 'unit': return plantUnit(o, shown);
    case 'translation': return plantTranslation(rng, o, shown);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Cards

function explainCorrect(kind: OrderKind, o: RxOrder, patient?: Patient): string {
  const tm = tallManWord(o);
  const tmNote = tm ? ` ${tm} is spelled the way the FDA’s Tall Man list has it.` : '';
  if (kind === 'sig') return `Correct. “${o.sig}” is written out in plain words as “${o.directions}”.${tmNote} Nothing on the card is a do-not-use abbreviation.`;
  const allergy = patient && patient.allergies !== 'NKDA' ? `${patient.allergies} on the banner does not conflict with this drug` : 'the patient has no known drug allergies';
  if (kind === 'chart') return `Correct. The name, strength and unit are real, the directions are in words, and ${allergy}.${tmNote}`;
  const arithmetic = o.kind === 'fixed'
    ? 'The quantity is the number of containers and their size'
    : `${o.perDose} x ${o.perDay} a day x ${o.daysSupply} days = ${o.qty}, so the quantity matches the directions and the days supply`;
  return `Correct. ${arithmetic}. The name, strength and unit are real, the directions are in words, and ${allergy}.${tmNote}`;
}

/** A card for one catalog order. With a category, that one mistake is planted (null if it cannot be planted in this order). */
export function makeCardFromOrder(rng: Rng, today: ISODate, kind: OrderKind, order: RxOrder, category: FlashCategory | null): FlashCard | null {
  if (category && !canPlant(order, kind, category)) return null;
  const refills = pick(rng, order.refillOptions);
  const patient = kind === 'sig' ? undefined : makePatient(rng, { today, avoid: avoidFor(order) });
  const rxNumber = `44${String(int(rng, 0, 99999)).padStart(5, '0')}`;
  const base: Shown = { productLine: order.productLine, qty: order.qty, directions: order.directions, sig: order.sig };
  const flaw = category ? plant(rng, category, order, base, patient) : null;
  const shown = flaw?.shown ?? base;
  const banner = flaw?.patient ?? patient;

  const lines =
    kind === 'sig'
      ? [`Rx: ${shown.productLine}`, `Sig: ${shown.sig}`, `Label: ${shown.directions}`]
      : kind === 'chart'
        ? [`Current medication: ${shown.productLine}`, `Directions: ${shown.directions}`]
        : [
          `Rx# ${rxNumber} ${banner!.name}`,
          `${shown.productLine} Qty: ${shown.qty}`,
          shown.directions,
          ...(order.aux.length ? [order.aux.join(' ')] : []),
          `${order.daysSupply != null ? `Days supply: ${order.daysSupply} ` : ''}Refills: ${refills} ${banner!.provider}`,
        ];
  return {
    kind,
    title: kind === 'sig' ? 'Sig translation' : kind === 'chart' ? 'Medication list entry' : 'Prescription label',
    lines,
    patient: banner,
    error: flaw?.error ?? null,
    explanation: flaw ? `Not correct. ${flaw.error.why}` : explainCorrect(kind, order, banner),
    subject: order.drugId,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A vitals flowsheet entry for a banner patient. The one mistake it can have is a wrong unit (a temperature in C, a glucose in mmol/L). */
export function makeVitalsCard(rng: Rng, today: ISODate, category: 'unit' | null): FlashCard {
  const patient = makePatient(rng, { today });
  let line: string;
  let error: FlashError | null = null;
  if (chance(rng, 0.5)) {
    const v = makeVitals(rng, 'routine');
    line = vitalsLine(v);
    if (category) {
      const t = v.tempF.toFixed(1);
      line = line.replace(`T ${t} F`, `T ${t} C`);
      error = {
        category: 'unit', wrong: `T ${t} C`, right: `T ${t} F`,
        why: `${t} is a Fahrenheit reading. ${t} degrees Celsius is not possible for a living person, so the unit on this temperature must be F.`,
      };
    }
  } else {
    const glucose = int(rng, 70, 125);
    const mins = 6 * 60 + 30 + 5 * int(rng, 0, 36);
    const when = `${Math.floor(mins / 60)}:${pad(mins % 60)} a.m.`;
    line = `Glucose (fingerstick) ${glucose} mg/dL at ${when}, fasting.`;
    if (category) {
      line = line.replace(`${glucose} mg/dL`, `${glucose} mmol/L`);
      error = {
        category: 'unit', wrong: `${glucose} mmol/L`, right: `${glucose} mg/dL`,
        why: `A fingerstick glucose is charted in mg/dL. ${glucose} mmol/L is not possible (a normal fasting glucose is about 4 to 6 mmol/L), so the unit is wrong.`,
      };
    }
  }
  return {
    kind: 'chart',
    title: 'Vitals flowsheet entry',
    lines: [line],
    patient,
    error,
    explanation: error ? `Not correct. ${error.why}` : 'Correct. Every number has the unit that goes with it: temperature in F, glucose in mg/dL, blood pressure in mmHg.',
    subject: `vitals:${patient.mrn}`,
  };
}

const joinNames = (names: readonly string[]): string => (names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** A shelf label naming look-alike drugs. The one mistake it can have is a name without its Tall Man capitals. */
export function makeDrugCard(rng: Rng, category: 'tall-man' | null): FlashCard {
  const group = pick(rng, LASA_GROUPS);
  const names = shuffle(rng, group);
  let line = `Keep ${joinNames(names)} on separate shelves.`;
  let error: FlashError | null = null;
  if (category) {
    const right = pick(rng, names);
    const lower = right.toLowerCase();
    const wrong = pick(rng, [lower, capitalize(lower), right.toUpperCase()]);
    line = line.replace(right, wrong);
    const others = names.filter((n) => n !== right);
    error = {
      category: 'tall-man', wrong, right,
      why: `The FDA’s Tall Man spelling is ${right}. The capital letters pull the eye to the letters that differ from ${joinNames(others)}, so ${wrong} is not enough.`,
    };
  }
  return {
    kind: 'drug',
    title: 'Pharmacy shelf label',
    lines: [line],
    error,
    explanation: error ? `Not correct. ${error.why}` : `Correct. ${joinNames(names)} are spelled just as the FDA’s Tall Man list has them.`,
    subject: `lasa:${group.join('/')}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Choosing cards and building a round

/** How often each kind of card turns up, by track. Chart entries lead for MAs; labels and sigs lead for pharmacy techs. */
const WEIGHTS: Record<Track, Record<FlashKind, number>> = {
  ma: { chart: 4, label: 2, sig: 2, drug: 1 },
  rx: { label: 4, sig: 3, drug: 2, chart: 1 },
};
/** The share of chart cards that are vitals entries, by track. */
const VITALS_SHARE: Record<Track, number> = { ma: 0.5, rx: 0.25 };

function pickKind(rng: Rng, track: Track, allowed: readonly FlashKind[]): FlashKind {
  const total = allowed.reduce((n, k) => n + WEIGHTS[track][k], 0);
  let r = rng() * total;
  for (const k of allowed) {
    r -= WEIGHTS[track][k];
    if (r < 0) return k;
  }
  return allowed[allowed.length - 1];
}

const ALL_KINDS: readonly FlashKind[] = ['label', 'sig', 'chart', 'drug'];

/**
 * One card. With no spec the kind and the mistake are random. `category: null` asks for a correct card, a category asks
 * for that mistake, and `kind` pins the kind of card (it must be one the category can appear on).
 */
export function makeCard(rng: Rng, today: ISODate, track: Track, spec: { kind?: FlashKind; category?: FlashCategory | null } = {}): FlashCard {
  const { category } = spec;
  const allowed = category ? KINDS_FOR[category] : ALL_KINDS;
  const kind = spec.kind ?? pickKind(rng, track, allowed);
  if (category && !KINDS_FOR[category].includes(kind)) throw new Error(`${category} cannot be planted on a ${kind} card`);
  const chosen = category === undefined
    ? (chance(rng, 0.5) ? pick(rng, FLASH_CATEGORIES.filter((c) => KINDS_FOR[c].includes(kind))) : null)
    : category;

  if (kind === 'drug') return makeDrugCard(rng, chosen === 'tall-man' ? 'tall-man' : null);
  if (kind === 'chart' && (chosen === null || chosen === 'unit') && chance(rng, VITALS_SHARE[track])) return makeVitalsCard(rng, today, chosen);
  const candidates = orders().filter((o) => (chosen ? canPlant(o, kind, chosen) : true));
  return makeCardFromOrder(rng, today, kind, pick(rng, candidates), chosen)!;
}

/**
 * A round of cards, the same for the same seed and track. Between four and six have a mistake, each a different kind of
 * mistake, in a shuffled order. No drug is on two cards.
 */
export function makeRound(seed: number, track: Track, today: ISODate, size: number = ROUND_SIZE): FlashCard[] {
  const rng = mulberry32(hashSeed('flashcards', seed, track));
  const flawed = Math.min(int(rng, 4, 6), Math.max(size - 1, 0));
  const categories = shuffle(rng, FLASH_CATEGORIES);
  const slots = shuffle<FlashCategory | null>(rng, Array.from({ length: size }, (_, i) => (i < flawed ? categories[i % categories.length] : null)));
  const used = new Set<string>();
  return slots.map((category) => {
    let card = makeCard(rng, today, track, { category });
    for (let tries = 0; used.has(card.subject) && tries < 25; tries++) card = makeCard(rng, today, track, { category });
    used.add(card.subject);
    return card;
  });
}
