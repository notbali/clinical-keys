import type { ISODate } from '../../lib/dates';
import type { Passage } from '../types';
import { plantNote } from './huntCore';
import { allergyLine, COMMON_MUTATORS } from './huntMutators';
import { makePhonePassage, makeSoapPassage, makeVitalsPassage } from './maPassages';
import { int, type Rng } from './rng';

/** An MA error hunt: a SOAP note, a phone message or a vitals entry from the generators, with the allergy line a chart note carries, and 3 or 4 mistakes planted. */
export function makeMaHuntPassage(rng: Rng, today: ISODate): Passage {
  for (let attempt = 0; attempt < 40; attempt++) {
    const roll = int(rng, 0, 9);
    const [label, base] = roll < 5 ? ['A SOAP note', makeSoapPassage(rng, today)] : roll < 8 ? ['A phone message', makePhonePassage(rng, today)] : ['A vitals entry', makeVitalsPassage(rng, today)];
    const patient = base.patient!;
    const lines = base.text.split('\n');
    // The allergy line ends the first line of a SOAP note (the history) and the whole of any other note.
    const at = label === 'A SOAP note' ? 0 : lines.length - 1;
    lines[at] = `${lines[at]} ${allergyLine(patient)}`;
    const text = lines.join('\n');
    const planted = plantNote(text, COMMON_MUTATORS, { rng, patient, reference: false });
    if (!planted) continue;
    const check = planted.errors.some((e) => e.category === 'patient' || e.category === 'allergy')
      ? 'Check it against the chart banner above.' : 'Everything you need is in the note.';
    return {
      ctx: `<b>Error hunt.</b> ${label}. There are ${planted.errors.length} errors. ${check} Edit the note to fix each one, then press Check.`,
      text, flawed: planted.flawed, errors: planted.errors, patient,
    };
  }
  throw new Error('could not plant errors in an MA note');
}
