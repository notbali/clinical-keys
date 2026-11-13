import type { ISODate } from '../../lib/dates';
import type { FormField } from '../../forms/types';
import { CLINIC, clinicPhone, dobHandwritten, splitName, usDate } from './formsCommon';
import type { FormBody } from './formsMa';
import { makePatient } from './patient';
import { randomOrder, type RxOrder } from './rxCatalog';
import { pick, type Rng } from './rng';

/** A tablet or capsule order. Inhalers, sprays and drops are left out: their quantity is written differently. */
function solidOrder(rng: Rng): RxOrder {
  for (let i = 0; i < 100; i++) {
    const o = randomOrder(rng);
    if (o.kind !== 'fixed') return o;
  }
  throw new Error('the catalog has no tablet or capsule order');
}

/** A written prescription and the pharmacy's eleven-box order entry form. The sig is turned into label directions. */
export function makeRxForm(rng: Rng, today: ISODate): FormBody {
  const order = solidOrder(rng);
  const patient = makePatient(rng, { today, avoid: order.classes });
  const { last, first } = splitName(patient);
  const prescriber = patient.provider!;
  const refills = String(pick(rng, order.refillOptions));
  const form = order.form!;
  const drug = order.name;

  const fields: FormField[] = [
    { id: 'name', label: 'Patient name', hint: 'Last, First', kind: 'name', answer: patient.name },
    { id: 'dob', label: 'Date of birth', hint: 'MM/DD/YYYY', kind: 'date', answer: patient.dob },
    { id: 'allergies', label: 'Allergies', hint: 'Copy exactly as written', kind: 'text', answer: patient.allergies },
    { id: 'drug', label: 'Drug name', hint: 'Exactly as written, Tall Man capitals included', kind: 'drug', answer: drug },
    { id: 'strength', label: 'Strength', hint: 'Number and unit, like 25 mg', kind: 'dose', answer: order.strengthText },
    { id: 'form', label: 'Dosage form', hint: 'Spell it out: tablet or capsule', kind: 'text', answer: form },
    { id: 'quantity', label: 'Quantity', hint: 'Number only', kind: 'number', answer: order.qty },
    { id: 'directions', label: 'Directions', hint: 'Turn the sig into label directions: Take ... by mouth ...', kind: 'directions', answer: order.directions },
    { id: 'days', label: 'Days supply', hint: 'Number only: quantity divided by doses per day', kind: 'number', answer: String(order.daysSupply) },
    { id: 'refills', label: 'Refills', hint: 'Number only', kind: 'number', answer: refills },
    { id: 'prescriber', label: 'Prescriber', hint: 'Like Dr. A. Smith', kind: 'text', answer: prescriber },
  ];

  return {
    ctx: 'Enter the <b>written prescription</b> into the pharmacy system. Press <b>Tab</b> to move to the next box. <b>Enter</b> does nothing here. Spell the sig out as label directions, work out the days supply, then press <b>Check</b>.',
    patient,
    source: {
      title: 'Written Prescription',
      subtitle: `${CLINIC} · Written ${usDate(today)} · Office ${clinicPhone(rng)}`,
      rows: [
        { label: 'Patient', value: `${first} ${last}` },
        { label: 'DOB', value: dobHandwritten(patient) },
        { label: 'Allergies', value: patient.allergies },
        { label: 'Rx', value: `${drug} ${order.strengthText} ${form === 'tablet' ? 'tab' : 'cap'}` },
        { label: 'Disp', value: `#${order.qty}` },
        { label: 'Sig', value: order.sig },
        { label: 'Refills', value: refills },
        { label: 'Prescriber', value: prescriber },
      ],
    },
    fields,
  };
}
