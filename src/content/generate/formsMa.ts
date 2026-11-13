import type { ISODate } from '../../lib/dates';
import type { FormField, FormTask } from '../../forms/types';
import { CLINIC, clinicPhone, dobInWords, splitName, usDate } from './formsCommon';
import { makePatient } from './patient';
import { FREQ, randomOrder } from './rxCatalog';
import { chance, int, pick, type Rng } from './rng';
import { makeBody, makeVitals, type VitalsProfile } from './vitals';

export type FormBody = Pick<FormTask, 'ctx' | 'patient' | 'source' | 'fields'>;

interface Complaint { text: string; profile: VitalsProfile; pain: [number, number]; days?: [number, number] }

/** What patients write in the "reason for visit" box. The vitals and the pain score fit the complaint. */
const COMPLAINTS: Complaint[] = [
  { text: 'Sore throat and fever', profile: 'febrile', pain: [3, 6], days: [2, 5] },
  { text: 'Cough and nasal congestion', profile: 'routine', pain: [0, 2], days: [3, 7] },
  { text: 'Low back pain', profile: 'routine', pain: [3, 7], days: [2, 14] },
  { text: 'Burning with urination', profile: 'routine', pain: [2, 5], days: [1, 4] },
  { text: 'Headache', profile: 'routine', pain: [3, 7], days: [1, 5] },
  { text: 'Right ankle pain and swelling', profile: 'routine', pain: [3, 7], days: [1, 3] },
  { text: 'Left ankle pain and swelling', profile: 'routine', pain: [3, 7], days: [1, 3] },
  { text: 'Nausea and vomiting', profile: 'routine', pain: [1, 4], days: [1, 3] },
  { text: 'Rash on both forearms', profile: 'routine', pain: [0, 3], days: [2, 6] },
  { text: 'Right ear pain', profile: 'routine', pain: [3, 6], days: [1, 4] },
  { text: 'Follow-up of high blood pressure', profile: 'elevated', pain: [0, 0] },
  { text: 'Follow-up of type 2 diabetes', profile: 'routine', pain: [0, 0] },
  { text: 'Annual physical exam', profile: 'routine', pain: [0, 0] },
];

const complaintText = (rng: Rng, c: Complaint): string => {
  if (!c.days) return c.text;
  const n = int(rng, c.days[0], c.days[1]);
  return `${c.text} x ${n} ${n === 1 ? 'day' : 'days'}`;
};

/**
 * The medication a patient already takes: a long-term drug from the catalog written as name, strength and frequency
 * in words. Sometimes none. The drug's allergy classes go back so the patient is never allergic to their own medicine.
 */
function currentMedication(rng: Rng): { text: string; avoid: readonly ('penicillin' | 'sulfa' | 'codeine' | 'nsaid')[] } {
  if (chance(rng, 0.15)) return { text: 'None', avoid: [] };
  for (let i = 0; i < 60; i++) {
    const o = randomOrder(rng);
    if (o.kind === 'maintenance' && o.freq) return { text: `${o.name} ${o.strengthText} ${FREQ[o.freq].label}`, avoid: o.classes };
  }
  return { text: 'None', avoid: [] };
}

/** A paper intake sheet and the fourteen-box chart form it is typed into. */
export function makeMaForm(rng: Rng, today: ISODate): FormBody {
  const complaint = pick(rng, COMPLAINTS);
  const med = currentMedication(rng);
  const patient = makePatient(rng, { today, avoid: med.avoid });
  const { last, first } = splitName(patient);
  const v = makeVitals(rng, complaint.profile);
  const body = makeBody(rng, patient.sex);
  const reason = complaintText(rng, complaint);
  const pain = `${int(rng, complaint.pain[0], complaint.pain[1])}/10`;

  const bp = `${v.sys}/${v.dia} mmHg`, pulse = `${v.pulse} bpm`, resp = String(v.resp), temp = `${v.tempF.toFixed(1)} F`, spo2 = `${v.spo2}%`;
  const weight = `${body.weightLb} lb`;

  const fields: FormField[] = [
    { id: 'name', label: 'Patient name', hint: 'Last, First', kind: 'name', answer: patient.name },
    { id: 'dob', label: 'Date of birth', hint: 'MM/DD/YYYY', kind: 'date', answer: patient.dob },
    { id: 'sex', label: 'Sex', hint: 'F or M', kind: 'code', answer: patient.sex },
    { id: 'allergies', label: 'Allergies', hint: 'Copy exactly as written', kind: 'text', answer: patient.allergies },
    { id: 'complaint', label: 'Chief complaint', hint: 'Copy exactly as written', kind: 'text', answer: reason },
    { id: 'bp', label: 'Blood pressure', hint: 'Like 120/80 mmHg', kind: 'measure', answer: bp },
    { id: 'pulse', label: 'Pulse', hint: 'Like 72 bpm', kind: 'measure', answer: pulse },
    { id: 'resp', label: 'Respiratory rate', hint: 'Breaths per minute, number only', kind: 'number', answer: resp },
    { id: 'temp', label: 'Temperature', hint: 'Like 98.6 F', kind: 'measure', answer: temp },
    { id: 'spo2', label: 'SpO2', hint: 'Like 98%', kind: 'measure', answer: spo2 },
    { id: 'height', label: 'Height', hint: 'Total inches, like 64 in', kind: 'measure', answer: `${body.heightIn} in` },
    { id: 'weight', label: 'Weight', hint: 'Like 150 lb', kind: 'measure', answer: weight },
    { id: 'pain', label: 'Pain score', hint: 'Like 4/10', kind: 'measure', answer: pain },
    { id: 'medication', label: 'Current medication', hint: 'Name, strength, how often', kind: 'text', answer: med.text },
  ];

  return {
    ctx: 'Copy the <b>patient intake sheet</b> into the chart. Press <b>Tab</b> to move to the next box. <b>Enter</b> does nothing here. When every box is filled in, press <b>Check</b>.',
    patient,
    source: {
      title: 'Patient Intake Sheet',
      subtitle: `${CLINIC} · Visit date ${usDate(today)} · Front desk ${clinicPhone(rng)}`,
      rows: [
        { label: 'Patient name', value: `${first} ${last}` },
        { label: 'Date of birth', value: dobInWords(patient) },
        { label: 'Sex', value: patient.sex === 'F' ? 'Female' : 'Male' },
        { label: 'Allergies', value: patient.allergies },
        { label: 'Reason for visit', value: reason },
        { label: 'Blood pressure', value: bp },
        { label: 'Pulse', value: pulse },
        { label: 'Respirations', value: resp },
        { label: 'Temperature', value: temp },
        { label: 'Oxygen saturation', value: spo2 },
        { label: 'Height', value: `${Math.floor(body.heightIn / 12)} ft ${body.heightIn % 12} in` },
        { label: 'Weight', value: weight },
        { label: 'Pain (0 to 10)', value: pain },
        { label: 'Current medications', value: med.text },
      ],
    },
    fields,
  };
}
