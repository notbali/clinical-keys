import { addDays, fromUTC, toUTC, type ISODate } from '../../lib/dates';
import type { Passage, Patient } from '../types';
import { makePatient, providerSurname, type AllergyClass } from './patient';
import { allOrders, FREQ, type RxOrder } from './rxCatalog';
import { chance, int, pick, type Rng } from './rng';
import { bodyLine, makeBody, makeVitals, vitalsLine, type Vitals, type VitalsProfile } from './vitals';

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "3:05 p.m." from minutes after midnight. */
const clock = (mins: number): string => `${Math.floor(mins / 60) % 12 || 12}:${pad(mins % 60)} ${mins >= 12 * 60 ? 'p' : 'a'}.m.`;
/** "11/17/2026" from an ISO date. */
const usDate = (iso: ISODate): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const sexWord = (p: Patient) => (p.sex === 'F' ? 'female' : 'male');
const ageNumber = (p: Patient) => Number.parseInt(p.age, 10);
const callTime = (rng: Rng): string => clock(int(rng, 8 * 60, 16 * 60 + 59));
const phone = (rng: Rng): string => `555-01${pad(int(rng, 0, 99))}`;

// ---------------------------------------------------------------------------------------------------------------------
// SOAP notes

interface SoapParts { label: string; S: (cx: Cx) => string; O: (cx: Cx) => string; A: string | ((cx: Cx) => string); P: (cx: Cx) => string }
interface Cx { rng: Rng; v: Vitals; patient: Patient; lead: string }
interface Condition { sex?: 'F' | 'M'; profile: VitalsProfile; avoid: AllergyClass[]; build: (rng: Rng) => SoapParts }

/** "T 101.2 F, P 92, R 18, BP 122/78" in the order the written notes use. */
const vitalsBrief = (v: Vitals) => `T ${v.tempF.toFixed(1)} F, P ${v.pulse}, R ${v.resp}, BP ${v.sys}/${v.dia}`;

const CONDITIONS: Condition[] = [
  { // Strep throat. Amoxicillin 500 mg twice a day for 10 days is an accepted adult regimen.
    profile: 'febrile', avoid: ['penicillin'],
    build: (rng) => {
      const days = int(rng, 2, 5);
      const extra = pick(rng, ['', ' Tender anterior cervical lymph nodes.', ' No rash.']);
      return {
        label: 'A sore throat visit',
        S: (c) => `${c.lead} with a ${days}-day history of sore throat, fever, and difficulty swallowing. Denies cough.`,
        O: (c) => `${vitalsBrief(c.v)}. Tonsils red and swollen with white patches.${extra}`,
        A: 'Strep pharyngitis; rapid strep test positive.',
        P: () => 'Amoxicillin 500 mg PO BID x 10 days. Fluids and rest. Return if not improving in 48 hours.',
      };
    },
  },
  { // Common cold: no antibiotic.
    profile: 'routine', avoid: [],
    build: (rng) => {
      const days = int(rng, 3, 7);
      const symptom = pick(rng, ['cough and nasal congestion', 'cough and a runny nose', 'cough, sore throat, and nasal congestion']);
      const denies = pick(rng, ['Denies fever, chest pain, and shortness of breath.', 'Denies fever and shortness of breath.', 'Denies chest pain, wheezing, and fever.']);
      const throat = pick(rng, ['Throat mildly red.', 'Throat clear.', 'Nasal mucosa swollen and pale.']);
      return {
        label: 'A cold-symptoms visit',
        S: (c) => `${c.lead} c/o ${symptom} x ${days} days. ${denies} Taking no new medications.`,
        O: (c) => `${vitalsBrief(c.v)} mmHg, SpO2 ${c.v.spo2}% on room air. Lungs clear to auscultation bilaterally. ${throat}`,
        A: 'Upper respiratory infection.',
        P: () => 'Fluids and rest. Return to clinic if symptoms last more than 10 days or if fever develops.',
      };
    },
  },
  { // Uncomplicated cystitis in a woman: 3 days of trimethoprim-sulfamethoxazole DS is a standard regimen.
    sex: 'F', profile: 'routine', avoid: ['sulfa'],
    build: (rng) => {
      const days = int(rng, 1, 4);
      const more = pick(rng, ['urinary frequency', 'urgency']);
      return {
        label: 'A urinary-symptoms visit',
        S: (c) => `${c.lead} c/o burning with urination and ${more} x ${days} ${plural(days, 'day')}. Denies flank pain, fever, or blood in the urine.`,
        O: (c) => `${vitalsBrief(c.v)}. Mild suprapubic tenderness. No CVA tenderness.`,
        A: 'Uncomplicated UTI; urinalysis positive for leukocytes and nitrites.',
        P: () => 'Sulfamethoxazole-trimethoprim DS 1 tab PO BID x 3 days. Push fluids. Call if symptoms persist or fever develops.',
      };
    },
  },
  { // Hypertension follow-up. The MA records; the provider decides about changes.
    profile: 'elevated', avoid: [],
    build: (rng) => {
      const [drug, strength] = pick(rng, [['lisinopril', 10], ['lisinopril', 20], ['amlodipine', 5], ['amlodipine', 10], ['losartan', 50], ['losartan', 100]] as const);
      const denies = pick(rng, ['Denies headache, chest pain, or dizziness.', 'Denies chest pain, vision changes, or swelling in the legs.']);
      return {
        label: 'A blood pressure follow-up',
        S: (c) => `${c.lead} here for a follow-up of hypertension. Taking ${drug} ${strength} mg daily as prescribed. ${denies}`,
        O: (c) => `${vitalsBrief(c.v)} mmHg seated, left arm. Wt ${makeBody(c.rng, c.patient.sex).weightLb} lb.`,
        A: 'Hypertension; BP above goal today.',
        P: () => `Continue ${drug} ${strength} mg daily. Provider to review BP and any medication changes. Return to clinic in 4 weeks.`,
      };
    },
  },
  { // Type 2 diabetes follow-up.
    profile: 'routine', avoid: [],
    build: (rng) => {
      const strength = pick(rng, [500, 1000]);
      const fasting = chance(rng, 0.5);
      const glucose = fasting ? int(rng, 98, 138) : int(rng, 118, 196);
      const foot = pick(rng, ['Foot exam: no sores or lesions.', 'Foot exam: skin intact, pulses present.']);
      return {
        label: 'A diabetes follow-up',
        S: (c) => `${c.lead} here for a follow-up of type 2 diabetes. Taking metformin ${strength} mg BID with meals. Denies excessive thirst, frequent urination, or blurred vision.`,
        O: (c) => `${vitalsBrief(c.v)}. Glucose (fingerstick) ${glucose} mg/dL, ${fasting ? 'fasting' : 'non-fasting'}. ${foot}`,
        A: 'Type 2 diabetes mellitus.',
        P: () => `Hemoglobin A1c ordered. Continue metformin ${strength} mg BID with meals. Return to clinic in 3 months.`,
      };
    },
  },
  { // Gastroenteritis: ondansetron 4 mg every 8 hours as needed.
    profile: 'routine', avoid: [],
    build: (rng) => {
      const days = int(rng, 1, 3);
      return {
        label: 'A stomach-illness visit',
        S: (c) => `${c.lead} c/o nausea, vomiting, and diarrhea x ${days} ${plural(days, 'day')}. Denies blood in the stool or severe abdominal pain.`,
        O: (c) => `${vitalsBrief(c.v)}. Mucous membranes slightly dry. Abdomen soft with mild diffuse tenderness.`,
        A: 'Acute gastroenteritis.',
        P: () => 'Ondansetron 4 mg PO q8h prn nausea. Oral fluids in small, frequent sips. Return if unable to keep fluids down or if symptoms last more than 3 days.',
      };
    },
  },
  { // Ankle sprain: the side is the same in the history and the exam.
    profile: 'routine', avoid: [],
    build: (rng) => {
      const side = pick(rng, ['right', 'left']);
      const cause = pick(rng, ['twisting it playing basketball', 'stepping off a curb', 'rolling it on a trail run', 'landing awkwardly after a jump']);
      const days = int(rng, 1, 3);
      return {
        label: 'An ankle-injury visit',
        S: (c) => `${c.lead} c/o ${side} ankle pain and swelling after ${cause} ${days} ${plural(days, 'day')} ago. Pain ${int(rng, 3, 7)}/10. Able to bear weight with pain.`,
        O: (c) => `${vitalsBrief(c.v)}. Swelling and tenderness over the ${side} lateral ankle. No deformity. Pulses and sensation intact.`,
        A: 'Ankle sprain.',
        P: () => 'X-ray ordered per provider. Rest, ice, compression, and elevation. Return if pain worsens or numbness develops.',
      };
    },
  },
  { // Low back strain: ibuprofen 600 mg every 6 hours as needed, with food.
    profile: 'routine', avoid: ['nsaid'],
    build: (rng) => {
      const days = int(rng, 2, 14);
      const cause = pick(rng, ['lifting boxes', 'moving furniture', 'working in the yard', 'lifting a heavy bag']);
      return {
        label: 'A back-pain visit',
        S: (c) => `${c.lead} c/o low back pain x ${days} days after ${cause}. Denies numbness, tingling, or bowel/bladder changes.`,
        O: (c) => `${vitalsBrief(c.v)}. Tenderness over lumbar muscles. Gait normal. Straight leg raise negative bilaterally.`,
        A: 'Acute lumbar strain.',
        P: () => 'Ibuprofen 600 mg PO q6h prn pain, take with food. Heat and gentle stretching. Follow up in 2 weeks if not improved.',
      };
    },
  },
  { // Seasonal allergies: fluticasone nasal spray, 2 sprays in each nostril once daily.
    profile: 'routine', avoid: [],
    build: (rng) => {
      const weeks = int(rng, 1, 4);
      return {
        label: 'A seasonal-allergy visit',
        S: (c) => `${c.lead} c/o sneezing, a runny nose, and itchy watery eyes x ${weeks} ${plural(weeks, 'week')}. Denies fever or shortness of breath.`,
        O: (c) => `${vitalsBrief(c.v)} mmHg, SpO2 ${c.v.spo2}% on room air. Nasal mucosa pale and swollen. Eyes: mild redness, no discharge.`,
        A: 'Allergic rhinitis.',
        P: () => 'Fluticasone nasal spray, 2 sprays in each nostril once daily. Avoid known triggers. Return if no relief in 2 weeks.',
      };
    },
  },
];

/** A four-line SOAP note, like the written SOAP Notes drill, with a banner patient who matches it. */
export function makeSoapPassage(rng: Rng, today: ISODate): Passage {
  const cond = pick(rng, CONDITIONS);
  const patient = makePatient(rng, { today, sex: cond.sex, avoid: cond.avoid });
  const v = makeVitals(rng, cond.profile);
  const parts = cond.build(rng);
  const cx: Cx = { rng, v, patient, lead: `S: ${ageNumber(patient)} y/o ${sexWord(patient)}` };
  const A = typeof parts.A === 'string' ? parts.A : parts.A(cx);
  const text = [parts.S(cx), `O: ${parts.O(cx)}`, `A: ${A}`, `P: ${parts.P(cx)}`].join('\n');
  return { ctx: `${parts.label}. Press <b>Enter</b> at the end of each section.`, text, patient };
}

// ---------------------------------------------------------------------------------------------------------------------
// Phone messages

const PHARMACIES = ['Main Street Pharmacy', 'Valley Drug', 'Riverside Pharmacy', 'Maple Grove Pharmacy', 'Cedar Health Pharmacy', 'Lakeside Pharmacy'];
/** "lisinopril" from "Lisinopril", but "hydrALAZINE" and "NIFEdipine ER" keep their Tall Man capitals. */
const lowerFirst = (name: string): string => name.replace(/^([A-Z])([a-z]+)\b/, (_, a: string, b: string) => `${a.toLowerCase()}${b}`);

let maintenance: RxOrder[] | undefined;
const maintenanceOrders = (): RxOrder[] => (maintenance ??= allOrders().filter((o) => o.kind === 'maintenance' && o.perDose === 1));

/** Drugs a patient might start and then call about, with a side effect that really goes with each, and the allergy families to keep away from. */
const REACTIONS: { drug: string; classes: AllergyClass[]; effects: string[] }[] = [
  { drug: 'amoxicillin', classes: ['penicillin'], effects: ['a rash on both forearms', 'an itchy rash on the chest and back'] },
  { drug: 'lisinopril', classes: [], effects: ['a dry cough'] },
  { drug: 'amlodipine', classes: [], effects: ['swelling in both ankles'] },
  { drug: 'metformin', classes: [], effects: ['nausea and loose stools'] },
  { drug: 'sertraline', classes: [], effects: ['nausea and trouble sleeping'] },
  { drug: 'atorvastatin', classes: [], effects: ['muscle aches in both legs'] },
];

/** The next weekday on or after an ISO date. */
function nextWeekday(iso: ISODate): ISODate {
  let d = iso;
  while ([0, 6].includes(new Date(toUTC(d)).getUTCDay())) d = addDays(d, 1);
  return d;
}

/** A refill request, a reschedule, or a possible reaction: three kinds of message that go to the provider. */
export function makePhonePassage(rng: Rng, today: ISODate): Passage {
  const kind = int(rng, 0, 2);

  if (kind === 0) {
    const order = pick(rng, maintenanceOrders());
    const patient = makePatient(rng, { today, avoid: order.classes });
    const [last, first] = patient.name.split(', ');
    const visit = fromUTC(toUTC(today) - int(rng, 20, 300) * 86_400_000);
    const unit = order.form!;
    const drug = `${lowerFirst(order.name)} ${order.strengthText}, 1 ${unit} ${FREQ[order.freq!].label}`;
    return {
      ctx: pick(rng, ['A patient called the front desk for a refill.', 'A refill request comes in by phone.']),
      text: `${callTime(rng)} - ${first} ${last} (DOB ${patient.dob}) called requesting a refill of ${drug}. Last office visit ${usDate(visit)}. Preferred pharmacy: ${pick(rng, PHARMACIES)}. Routed to Dr. ${providerSurname(patient.provider!)} for approval.`,
      patient,
    };
  }

  if (kind === 1) {
    const patient = makePatient(rng, { today });
    const [last, first] = patient.name.split(', ');
    const type = pick(rng, [
      { name: 'annual physical', reminder: 'Reminded patient to fast 8 to 12 hours before lab work' },
      { name: 'lab draw', reminder: 'Reminded patient to fast 8 to 12 hours before the lab draw' },
      { name: 'follow-up', reminder: 'Reminded patient to bring a current medication list' },
    ]);
    const oldDay = nextWeekday(addDays(today, int(rng, 3, 30)));
    const newDay = nextWeekday(addDays(oldDay, int(rng, 2, 14)));
    const slot = () => 8 * 60 + 15 * int(rng, 0, 34); // 8:00 a.m. to 4:30 p.m. in quarter hours
    const when = (iso: ISODate, mins: number) => `${WEEKDAYS[new Date(toUTC(iso)).getUTCDay()]}, ${iso.slice(5, 7)}/${iso.slice(8, 10)} at ${clock(mins)}`;
    return {
      ctx: pick(rng, ['A patient needs to move an appointment. Check the weekday and the date.', 'A reschedule request. Weekdays and dates have to agree.']),
      text: `${callTime(rng)} - ${first} ${last} called to reschedule the ${type.name} from ${when(oldDay, slot())} to ${when(newDay, slot())} ${type.reminder}. Callback number ${phone(rng)}. Message routed to Dr. ${providerSurname(patient.provider!)}.`,
      patient,
    };
  }

  const r = pick(rng, REACTIONS);
  const patient = makePatient(rng, { today, avoid: r.classes });
  const [last, first] = patient.name.split(', ');
  const days = int(rng, 2, 6);
  const negatives = pick(rng, ['No trouble breathing, no swelling of lips or tongue.', 'No trouble breathing and no swelling of the face.', 'No fever and no trouble breathing.']);
  return {
    ctx: 'A patient reports a possible medication reaction. The MA passes it on; the provider decides what to do.',
    text: `Message for Dr. ${providerSurname(patient.provider!)}: ${first} ${last} reports ${pick(rng, r.effects)} that started ${days} days after beginning ${r.drug}. ${negatives} Told patient the provider will call back today. Advised to call 911 if trouble breathing or facial swelling develops.`,
    patient,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Vitals entries

/** A full set of vitals with height and weight, a blood pressure recheck, or a fasting glucose with its times. */
export function makeVitalsPassage(rng: Rng, today: ISODate): Passage {
  const kind = int(rng, 0, 2);
  const patient = makePatient(rng, { today });

  if (kind === 0) {
    return {
      ctx: pick(rng, ['Rooming an adult patient. Enter the vitals, height and weight exactly as taken.', 'Intake vitals with height and weight. The BMI has to match the numbers.']),
      text: `${vitalsLine(makeVitals(rng, 'routine'))} ${bodyLine(makeBody(rng, patient.sex))}`,
      patient,
    };
  }

  if (kind === 1) {
    const v = makeVitals(rng, 'elevated');
    const rSys = v.sys - int(rng, 2, 8);
    const rDia = v.dia - int(rng, 0, 4);
    return {
      ctx: 'Elevated blood pressure with a recheck. Type both readings.',
      text: `Pt is a ${ageNumber(patient)} y/o ${sexWord(patient)}. BP ${v.sys}/${v.dia} mmHg ${pick(rng, ['L', 'R'])} arm seated; repeat ${rSys}/${rDia} after 5 min. Provider notified.`,
      patient,
    };
  }

  const test = 6 * 60 + 30 + 5 * int(rng, 0, 36); // 6:30 to 9:30 a.m.
  const meal = 18 * 60 + 15 * int(rng, 0, 14); // 6:00 to 9:30 p.m.
  return {
    ctx: 'Point-of-care glucose test. Check the times as well as the number.',
    text: `Glucose (fingerstick) ${int(rng, 70, 125)} mg/dL at ${clock(test)}, fasting. Pt states last meal was at ${clock(meal)}`,
    patient,
  };
}
