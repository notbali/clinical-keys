import { toUTC, type ISODate } from '../../lib/dates';
import type { Patient } from '../types';
import { chance, int, pick, type Rng } from './rng';

/** Drug families a patient can be allergic to. A generated drug lists the families it belongs to, and is never given to a patient allergic to one. */
export type AllergyClass = 'penicillin' | 'sulfa' | 'codeine' | 'nsaid';

/**
 * Fictional names. None of these surnames is used by a patient in the written drills, in a program typing test, or by a
 * provider, so a student never meets a second "Lopez, Maria" or reads a typing-test name early (patient.test.ts checks).
 */
export const FIRST_NAMES = {
  F: ['Amara', 'Beatriz', 'Chloe', 'Elena', 'Fatima', 'Gloria', 'Imani', 'Jasmine', 'Keiko', 'Leah', 'Marisol', 'Nadia', 'Olivia', 'Priya',
    'Rosa', 'Sofia', 'Tamara', 'Uma', 'Valerie', 'Willa', 'Ximena', 'Yara', 'Zoe', 'Abigail', 'Bianca', 'Camila', 'Deborah', 'Eleanor',
    'Frances', 'Helen', 'Irene', 'Joanna', 'Katherine', 'Lucia', 'Monica', 'Naomi', 'Patricia', 'Renata', 'Simone', 'Theresa'],
  M: ['Adrian', 'Benjamin', 'Caleb', 'Dmitri', 'Elijah', 'Felix', 'Gabriel', 'Hector', 'Isaac', 'Jamal', 'Kenji', 'Luis', 'Marcus', 'Nathan',
    'Omar', 'Pavel', 'Rafael', 'Samuel', 'Tomas', 'Victor', 'Wesley', 'Xavier', 'Yusuf', 'Zachary', 'Andre', 'Bruno', 'Calvin', 'Diego',
    'Ethan', 'Frank', 'George', 'Henry', 'Ivan', 'Julian', 'Kevin', 'Leon', 'Miguel', 'Noah', 'Oscar', 'Raymond'],
} as const;

export const LAST_NAMES = [
  'Adeyemi', 'Bianchi', 'Calloway', 'Delgado', 'Eriksen', 'Fontaine', 'Gallagher', 'Hossain', 'Ibarra', 'Jacobsen', 'Kowalski', 'Lindqvist',
  'Mahmoud', 'Novak', 'Ortega', 'Pruitt', 'Quinn', 'Rasmussen', 'Santos', 'Thorne', 'Underwood', 'Vasquez', 'Whitfield', 'Yamamoto',
  'Zielinski', 'Abbott', 'Banerjee', 'Cho', 'Dawson', 'Ellison', 'Foster', 'Greene', 'Haynes', 'Ito', 'Jensen', 'Khan', 'Larsen', 'Morrison',
  'Nakamura', 'Oduya', 'Petrov', 'Ramirez', 'Sutton', 'Takahashi', 'Ulrich', 'Voss', 'Wallace', 'Xiong', 'Young', 'Zhang', 'Barrett',
  'Coleman', 'Dunn', 'Escobar', 'Fischer', 'Grant', 'Holloway', 'Jimenez', 'Kaplan', 'Lombardi',
] as const;

/** Fictional prescribers, written the way the chart banner and the labels show them. */
export const PROVIDERS = ['Dr. A. Patel', 'Dr. L. Nguyen', 'Dr. T. Haddad', 'Dr. J. Sorensen'] as const;

/** "Dr. A. Patel" -> "Patel". */
export const providerSurname = (provider: string): string => provider.split(' ').at(-1)!;

interface AllergyChoice { label: string; family?: AllergyClass }

/** Allergies as they are written on a chart: "Substance (reaction)". Non-drug allergies never conflict with a prescription. */
const ALLERGIES: AllergyChoice[] = [
  { label: 'Penicillin (rash)', family: 'penicillin' },
  { label: 'Penicillin (hives)', family: 'penicillin' },
  { label: 'Sulfa drugs (hives)', family: 'sulfa' },
  { label: 'Sulfa drugs (rash)', family: 'sulfa' },
  { label: 'Codeine (nausea)', family: 'codeine' },
  { label: 'Aspirin (hives)', family: 'nsaid' },
  { label: 'NSAIDs (stomach pain)', family: 'nsaid' },
  { label: 'Latex (rash)' },
  { label: 'Shellfish (hives)' },
  { label: 'Iodine (rash)' },
];

export interface PatientOptions {
  /** The chart date the age is worked out on. */
  today: ISODate;
  sex?: 'F' | 'M';
  /** Whole years. Adults by default. */
  minAge?: number;
  maxAge?: number;
  /** Drug families the patient must not be allergic to, because the passage gives them a drug in that family. */
  avoid?: readonly AllergyClass[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Whole years from a date of birth to `today` (both as UTC milliseconds' calendar dates). */
function ageOn(dobMs: number, todayMs: number): number {
  const d = new Date(dobMs), t = new Date(todayMs);
  let age = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/**
 * A fictional patient for a chart banner. The age is worked out from the date of birth, never the other way round,
 * so the two always agree. Everything is random but repeatable from the Rng.
 */
export function makePatient(rng: Rng, opts: PatientOptions): Patient {
  const { today, minAge = 18, maxAge = 89, avoid = [] } = opts;
  const sex = opts.sex ?? (chance(rng, 0.5) ? 'F' : 'M');
  const name = `${pick(rng, LAST_NAMES)}, ${pick(rng, FIRST_NAMES[sex])}`;

  // Pick a date of birth in the window where the age on `today` is between minAge and maxAge.
  const todayMs = toUTC(today);
  const [ty, tm, td] = today.split('-').map(Number);
  const earliest = Date.UTC(ty - maxAge - 1, tm - 1, td) + 86_400_000; // youngest day that is still maxAge
  const latest = Date.UTC(ty - minAge, tm - 1, td); // oldest day that is already minAge
  let dobMs = earliest + Math.floor(rng() * ((latest - earliest) / 86_400_000 + 1)) * 86_400_000;
  // Leap-day arithmetic can nudge the window by a day: step back inside it if so.
  while (ageOn(dobMs, todayMs) > maxAge) dobMs += 86_400_000;
  while (ageOn(dobMs, todayMs) < minAge) dobMs -= 86_400_000;
  const dob = new Date(dobMs);

  const allowed = ALLERGIES.filter((a) => !a.family || !avoid.includes(a.family));
  let allergies = 'NKDA';
  if (chance(rng, 0.55)) {
    const first = pick(rng, allowed);
    const chosen = [first];
    if (chance(rng, 0.2)) {
      const second = pick(rng, allowed.filter((a) => a.label.split(' ')[0] !== first.label.split(' ')[0]));
      chosen.push(second);
    }
    allergies = chosen.map((a) => a.label).join(', ');
  }

  return {
    name,
    sex,
    age: `${ageOn(dobMs, todayMs)} y`,
    dob: `${pad(dob.getUTCMonth() + 1)}/${pad(dob.getUTCDate())}/${dob.getUTCFullYear()}`,
    mrn: String(int(rng, 1000000, 9999999)).padStart(7, '0'),
    allergies,
    provider: pick(rng, PROVIDERS),
  };
}
