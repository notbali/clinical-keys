import type { Patient, Track } from '../content/types';

/**
 * How a field is graded and what a wrong entry is diagnosed as.
 * name: "Last, First". date: MM/DD/YYYY. code: a short fixed code such as F or M. drug: a drug name (Tall Man letters count).
 * measure: a value with its unit ("154 lb"). dose: a drug strength ("5 mg"). number: digits only. directions: label directions.
 * text: anything else typed exactly as written.
 */
export type FieldKind = 'name' | 'date' | 'code' | 'text' | 'drug' | 'measure' | 'dose' | 'number' | 'directions';

/** One box on the entry form, with the value the student must end up with. */
export interface FormField {
  id: string;
  label: string;
  /** A format reminder shown under the label. It never gives away the answer. */
  hint: string;
  kind: FieldKind;
  answer: string;
}

/** One line on the paper document: what the student reads. */
export interface SourceRow { label: string; value: string }

/** The paper document the student copies from: an intake sheet or a written prescription. */
export interface SourceDoc { title: string; subtitle: string; rows: SourceRow[] }

export type FormDrillId = 'ma-form' | 'rx-form';

/** A whole chart-entry exercise, built from a seed. The same seed and chart date always give the same task. */
export interface FormTask {
  drillId: FormDrillId;
  track: Track;
  seed: number;
  /** Trusted HTML for the line above the form. */
  ctx: string;
  patient: Patient;
  source: SourceDoc;
  fields: FormField[];
}
