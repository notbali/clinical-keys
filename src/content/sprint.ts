import type { Track } from './types';

const rnd = (a: number, b: number) => a + Math.floor(Math.random()*(b-a+1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random()*arr.length)];
function shuffle<T>(a: T[]): T[] {
  a = a.slice();
  for (let i=a.length-1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; }
  return a;
}

const MA = [
  "Pt denies chest pain, shortness of breath, nausea, and vomiting.",
  "Pt c/o headache x 3 days, rated 4/10, relieved by rest.",
  "Allergies: penicillin (rash), sulfa drugs (hives).",
  "Last tetanus booster 2019. Immunizations up to date.",
  "Pt is a 54 y/o male here for a follow-up of hypertension.",
  "Pt is a 29 y/o female here for an annual exam.",
  "Lungs clear to auscultation bilaterally.",
  "Abdomen soft, non-tender, bowel sounds present in all four quadrants.",
  "Pt states pain is sharp and worse with movement.",
  "Wt 182 lb, Ht 5 ft 10 in, BMI 26.1.",
  "Specimen labeled with two patient identifiers before collection.",
  "Verified patient name and date of birth before rooming.",
  "Hand hygiene performed before and after patient contact.",
  "Medication list reviewed and updated with patient.",
  "Dr. Patel notified of elevated blood pressure reading.",
  "Pt tolerated the procedure well. No complications noted.",
  "Return to clinic in 2 weeks or sooner if symptoms worsen.",
  "Refill request for metformin 500 mg routed to provider for approval.",
  "Patient reports mild nausea since yesterday afternoon.",
  "Pt will fast for 8 to 12 hours before the lipid panel.",
  "Glucose (fingerstick) 104 mg/dL, fasting.",
  "Urinalysis sent to the lab. Results pending.",
  "Pulse oximetry 97% on room air.",
  "Interpreter offered; patient declined.",
  "Pt sitting on exam table in no acute distress.",
  "Insurance card and photo ID scanned into the chart.",
  "Pt to call the office if fever returns.",
  "Pt given after-visit summary and medication instructions.",
  "Pt reports taking lisinopril 10 mg daily and metformin 500 mg twice daily.",
  "T 100.4 F (oral), P 88, R 18.",
  "Pain 2/10, left shoulder, aching.",
  "Appointment scheduled for Thursday at 2:30 p.m.",
  "Pt voiced understanding of the instructions given.",
  "Amoxicillin 500 mg PO BID x 10 days.",
  "Ibuprofen 400 mg PO q6h prn pain, take with food.",
  "tachycardia bradycardia arrhythmia hypertension hypotension",
  "hyperglycemia hypoglycemia hypothyroidism hyperlipidemia",
  "gastroenteritis cholecystectomy colonoscopy appendectomy",
  "pharyngitis sinusitis bronchitis pneumonia otitis media",
  "dyspnea tachypnea hematuria dysuria nocturia edema erythema"
];

function vitalsLine(): string {
  const sys = rnd(104,138), dia = rnd(62, Math.min(84, sys-34));
  const t = (97.4 + rnd(0,17)/10).toFixed(1);
  return "BP "+sys+"/"+dia+" mmHg, P "+rnd(58,96)+" bpm, R "+rnd(12,20)+", T "+t+" F (oral), SpO2 "+rnd(96,100)+"% on room air.";
}

const RX = [
  "Take 1 tablet by mouth once daily.",
  "Take 1 capsule by mouth three times daily for 10 days.",
  "Take 1 tablet by mouth twice daily with meals.",
  "Take 1 tablet by mouth at bedtime as needed for sleep.",
  "Take 2 tablets by mouth every 6 hours as needed for pain.",
  "Take 1 capsule by mouth every morning before breakfast.",
  "Instill 1 drop in both eyes at bedtime.",
  "Instill 10 drops in the right ear once daily for 7 days.",
  "Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath.",
  "Apply a thin layer to the affected area twice daily.",
  "Dissolve 1 tablet under the tongue every 5 minutes as needed for chest pain.",
  "Shake well before using.",
  "Refrigerate. Do not freeze.",
  "Protect from light.",
  "For external use only.",
  "Do not chew or crush. Swallow whole.",
  "Take with food or milk.",
  "Take on an empty stomach, 1 hour before or 2 hours after meals.",
  "May cause drowsiness. Alcohol may intensify this effect.",
  "Finish all of this medication unless otherwise directed by prescriber.",
  "Lisinopril 10 mg tablet Qty: 90",
  "Metformin 500 mg tablet Qty: 60",
  "Atorvastatin 20 mg tablet Qty: 30",
  "Amoxicillin 500 mg capsule Qty: 30",
  "Omeprazole 20 mg capsule Qty: 30",
  "Albuterol HFA 90 mcg/actuation inhaler Qty: 1 (18 g)",
  "hydrOXYzine / hydrALAZINE",
  "glipiZIDE / glyBURIDE",
  "traMADol / traZODone",
  "predniSONE / prednisoLONE",
  "NIFEdipine / niCARdipine",
  "cloNIDine / KlonoPIN",
  "busPIRone / buPROPion",
  "Verify two patient identifiers at pickup: name and date of birth.",
  "Match the NDC on the stock bottle to the NDC on the label.",
  "Pharmacist consult needed before the sale.",
  "Patient counseled by the pharmacist. Questions answered.",
  "Prescriber's office called to clarify the quantity.",
  "Claim rejected: Refill too soon (code 79).",
  "Claim rejected: Prior authorization required (code 75).",
  "Lot number and expiration date checked.",
  "Count tray wiped down between prescriptions.",
  "dispense refill generic formulary deductible copay adjudication"
];

const RX_NAMES = ["Lopez, Maria","Carter, James","Brown, Aisha","Kim, David","Reyes, Carlos","Okafor, Grace","Walsh, Peter","Tran, Linh"];
const RX_DOCS = ["Dr. A. Patel","Dr. L. Nguyen"];
function rxLine(): string {
  return "Rx# 44"+String(rnd(0,99999)).padStart(5,"0")+" "+pick(RX_NAMES)+" Refills: "+rnd(0,5)+" "+pick(RX_DOCS);
}

export const SPRINT = {
  limit: 60,
  intro: "<b>60-second sprint.</b> Type as much as you can. The clock starts on your first keystroke.",
  note: "Accuracy first: every wrong key counts against you, even if you fix it. Aim for 95% or better, then push your speed.",
  why: "<b>Why it matters:</b> A short, focused burst wakes up your fingers and shows your real pace. A steady speed you can hold beats a sprint full of backspaces.",
  build(track: Track): string {
    const base = shuffle(track==="rx" ? RX : MA).slice(0,22);
    const extra = track==="rx" ? [rxLine(), rxLine(), rxLine()] : [vitalsLine(), vitalsLine(), vitalsLine()];
    const text = shuffle(base.concat(extra)).join(" ");
    return text;
  }
};
