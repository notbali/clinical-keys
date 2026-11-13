import type { ISODate } from '../lib/dates';
import { makeChartPassage } from './generate/maChart';
import { makeMaHuntPassage } from './generate/huntMa';
import { makeRxHuntPassage } from './generate/huntRx';
import { makePhonePassage, makeSoapPassage, makeVitalsPassage } from './generate/maPassages';
import { hashSeed, mulberry32, type Rng } from './generate/rng';
import { makeLabelPassage, makeLasaPassage, makeSigPassage } from './generate/rxPassages';
import type { Drill, GeneratedDrill, Passage, Track } from './types';

/**
 * Drills that build a new passage each time from realistic templates: fictional patients, plausible vitals, real
 * strengths and sigs. They are separate from the written drills in ma.ts and rx.ts, so nothing a student has already
 * done (keyed by drill id and passage index) or been graded on moves. They appear on the "All drills" page only.
 */
export const GENERATED_DRILLS: GeneratedDrill[] = [
  { id: 'ma-gen-vitals', track: 'ma', mode: 'copy', title: 'Vitals Entries (Generated)',
    blurb: 'A new set of vitals, blood pressure recheck or fasting glucose every time: numbers, slashes, units and times.',
    why: '<b>Why it matters:</b> Numbers are where charting errors hurt most. Every set here is new, so you practice reading digits, not remembering a passage.',
    make: makeVitalsPassage },
  { id: 'ma-gen-soap', track: 'ma', mode: 'copy', title: 'SOAP Notes (Generated)',
    blurb: 'A new Subjective / Objective / Assessment / Plan note for a new patient every time, with a new line for each section.',
    why: '<b>Why it matters:</b> SOAP notes are the backbone of the medical record. Practicing on a different patient and condition each time builds speed you can use on any chart.',
    make: makeSoapPassage },
  { id: 'ma-gen-phone', track: 'ma', mode: 'copy', title: 'Phone Messages (Generated)',
    blurb: 'Refill requests, reschedules and possible medication reactions, with new names, dates and times every time.',
    why: '<b>Why it matters:</b> Phone messages go straight to the provider. A wrong weekday, date or dose means another call and a delay in care.',
    make: makePhonePassage },
  { id: 'ma-gen-chart', track: 'ma', mode: 'hidden', title: 'Chart It From Memory (Generated)',
    blurb: 'The facts are in the scenario line; you type the chart entry in the standard format. Letters appear as you get them right.',
    why: '<b>Why it matters:</b> Charting follows a fixed format so the next person can find a blood pressure, an allergy or a dose at a glance. Knowing the format by heart is what makes you fast and safe.',
    make: makeChartPassage },
  { id: 'ma-gen-hunt', track: 'ma', mode: 'hunt', title: 'Error Hunt: Clinic Notes (Generated)',
    blurb: 'A new note every time, with three or four mistakes planted in it: numbers, units, spelling, the chart banner, allergies and unsafe abbreviations.',
    why: '<b>Why it matters:</b> Catching a wrong number, a missing allergy or a name that does not match the chart before it reaches the provider is part of the job. Every note here is new, so you practice looking, not remembering.',
    make: makeMaHuntPassage },
  { id: 'rx-gen-labels', track: 'rx', mode: 'copy', title: 'Prescription Labels (Generated)',
    blurb: 'A new multi-line label every time: patient, drug, quantity, directions, days supply and refills.',
    why: '<b>Why it matters:</b> The label is the last thing between the pharmacy and the patient. Check that the quantity, the directions and the days supply agree before you type.',
    make: makeLabelPassage },
  { id: 'rx-gen-sig', track: 'rx', mode: 'hidden', title: 'Sig Code Translator (Generated)', glossary: true,
    blurb: 'A fresh mix of prescriptions to translate into label directions: different drugs, strengths and sigs each time.',
    why: '<b>Why it matters:</b> The same few abbreviations make up most sigs, but every drug adds a new twist. Practice on many different prescriptions until the translation is automatic.',
    make: makeSigPassage },
  { id: 'rx-gen-lasa', track: 'rx', mode: 'copy', title: 'Look-Alike Drugs (Generated)',
    blurb: 'Different Tall Man pairs and groups every time, as pairs, in sentences and on shelf labels.',
    why: '<b>Why it matters:</b> Look-alike, sound-alike names cause dispensing errors. The capital letters mark where the names differ, so slow down and check letter by letter.',
    make: makeLasaPassage },
  { id: 'rx-gen-hunt', track: 'rx', mode: 'hunt', title: 'Error Hunt: Pharmacist Check (Generated)',
    blurb: 'Check a new label against its prescription every time, or a look-alike drug rule list. Three or four mistakes are planted.',
    why: '<b>Why it matters:</b> The pharmacist check is the last line of defense, and it only works if the label is compared with the prescription field by field. A wrong quantity, an unsafe abbreviation or a lowercase look-alike name is easy to miss when you read quickly.',
    make: makeRxHuntPassage },
];

export const getGeneratedDrill = (id: string): GeneratedDrill | undefined => GENERATED_DRILLS.find((d) => d.id === id);
export const generatedDrillsForTrack = (track: Track): GeneratedDrill[] => GENERATED_DRILLS.filter((d) => d.track === track);

/** The passage for a drill, a seed and a chart date. The drill id is folded into the seed so drills never share a sequence. */
export const generatePassage = (drill: GeneratedDrill, seed: number, today: ISODate): Passage =>
  drill.make(mulberry32(hashSeed(drill.id, seed)), today);

/** A generated drill as an ordinary one-passage Drill, so the practice screen can use it like any other. */
export function resolveGeneratedDrill(id: string, seed: number, today: ISODate): Drill | undefined {
  const g = getGeneratedDrill(id);
  if (!g) return undefined;
  const { make: _make, ...rest } = g;
  return { ...rest, items: [generatePassage(g, seed, today)] };
}

const MAX_SEED = 2147483647; // fits the database's integer column, where the attempt keeps it

/** A new random seed for a new passage. */
export const newSeed = (rng: Rng = Math.random): number => Math.floor(rng() * (MAX_SEED + 1));

/** A seed from the page address, or null when it is missing or not a whole number the database can hold. */
export function parseSeed(raw: string | null): number | null {
  if (raw == null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_SEED ? n : null;
}
