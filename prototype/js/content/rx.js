/* Pharmacy Tech drills.
   Each drill: id, track ('ma'|'rx'), mode ('copy' shows the text | 'hidden' reveals letters as typed),
   title, blurb, why (HTML), items: [{ctx (HTML), text (exact text to type; \n = Enter)}].
   All patients, prescribers and Rx numbers must be fictional. */
window.DRILLS = window.DRILLS || [];
window.DRILLS.push(
{ id:"rx-sig", track:"rx", mode:"hidden", title:"Sig Code Translator", glossary:true,
  blurb:"You see the prescriber's shorthand. You type the label directions. Letters appear as you get them right.",
  why:"<b>Why it matters:</b> Turning sig codes into label directions is one of the most common things a pharmacy tech types. A wrong frequency on a label means a wrong dose at home.",
  items:[
    {ctx:"<b>Lisinopril 10 mg tablet</b> &nbsp; Sig: <code>1 tab PO daily</code>", text:"Take 1 tablet by mouth once daily."},
    {ctx:"<b>Amoxicillin 500 mg capsule</b> &nbsp; Sig: <code>1 cap PO TID x 10 days</code>", text:"Take 1 capsule by mouth three times daily for 10 days."},
    {ctx:"<b>Metformin 500 mg tablet</b> &nbsp; Sig: <code>1 tab PO BID with meals</code>", text:"Take 1 tablet by mouth twice daily with meals."},
    {ctx:"<b>Trazodone 50 mg tablet</b> &nbsp; Sig: <code>1 tab PO qhs prn sleep</code>", text:"Take 1 tablet by mouth at bedtime as needed for sleep."},
    {ctx:"<b>Acetaminophen 325 mg tablet</b> &nbsp; Sig: <code>2 tabs PO q6h prn pain</code>", text:"Take 2 tablets by mouth every 6 hours as needed for pain."},
    {ctx:"<b>Omeprazole 20 mg capsule</b> &nbsp; Sig: <code>1 cap PO qAM ac breakfast</code>", text:"Take 1 capsule by mouth every morning before breakfast."},
    {ctx:"<b>Amoxicillin 400 mg/5 mL suspension</b> &nbsp; Sig: <code>5 mL PO BID x 10 days</code>", text:"Take 5 mL by mouth twice daily for 10 days."},
    {ctx:"<b>Latanoprost 0.005% eye drops</b> &nbsp; Sig: <code>1 gtt OU qhs</code>", text:"Instill 1 drop in both eyes at bedtime."},
    {ctx:"<b>Ofloxacin 0.3% ear drops</b> &nbsp; Sig: <code>10 gtts AD daily x 7 days</code>", text:"Instill 10 drops in the right ear once daily for 7 days."},
    {ctx:"<b>Albuterol HFA 90 mcg inhaler</b> &nbsp; Sig: <code>2 puffs inh q4-6h prn SOB</code>", text:"Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath."},
    {ctx:"<b>Hydrocortisone 2.5% cream</b> &nbsp; Sig: <code>Apply thin layer to aa BID</code>", text:"Apply a thin layer to the affected area twice daily."},
    {ctx:"<b>Promethazine 25 mg suppository</b> &nbsp; Sig: <code>1 supp PR q6h prn N/V</code>", text:"Insert 1 suppository rectally every 6 hours as needed for nausea and vomiting."},
    {ctx:"<b>Nitroglycerin 0.4 mg SL tablet</b> &nbsp; Sig: <code>1 tab SL q5min prn CP, max 3 doses</code>", text:"Dissolve 1 tablet under the tongue every 5 minutes as needed for chest pain. Do not take more than 3 doses."},
    {ctx:"<b>Azithromycin 250 mg tablet</b> &nbsp; Sig: <code>2 tabs PO day 1, then 1 tab PO daily days 2-5</code>", text:"Take 2 tablets by mouth on day 1, then take 1 tablet by mouth once daily on days 2 through 5."}
  ]},
{ id:"rx-lasa", track:"rx", mode:"copy", title:"Look-Alike Drugs (Tall Man)",
  blurb:"Confusable drug-name pairs in Tall Man lettering. A Shift-key workout that also builds safety habits.",
  why:"<b>Why it matters:</b> Look-alike, sound-alike drug names are a leading cause of dispensing errors. Tall Man lettering (hydrOXYzine vs. hydrALAZINE) highlights the letters that differ.",
  items:[
    {ctx:"Type each pair exactly. The capital letters are the part that differs.", text:"hydrOXYzine / hydrALAZINE, glipiZIDE / glyBURIDE, traMADol / traZODone"},
    {ctx:"Antipsychotic vs. Parkinson's drug, and blood pressure vs. seizure drug.", text:"risperiDONE / rOPINIRole, cloNIDine / KlonoPIN, metFORMIN / metroNIDAZOLE"},
    {ctx:"Brand names are confused too.", text:"CeleBREX / CeleXA / CereBYX, LaMICtal / LamISIL"},
    {ctx:"Steroids and blood pressure medicines.", text:"predniSONE / prednisoLONE, NIFEdipine / niCARdipine"},
    {ctx:"Mental health medicines.", text:"ALPRAZolam / LORazepam / clonazePAM, busPIRone / buPROPion, PARoxetine / FLUoxetine / DULoxetine"}
  ]},
{ id:"rx-labels", track:"rx", mode:"copy", title:"Prescription Labels",
  blurb:"Full multi-line labels: patient, drug, strength, quantity, directions, and refills.",
  why:"<b>Why it matters:</b> The label is the last thing between the pharmacy and the patient. Every character on it has to be right.",
  items:[
    {ctx:"Maintenance medication, 90-day supply. Press <b>Enter</b> at each line break.", text:"Rx# 4471029 Lopez, Maria\nLisinopril 10 mg tablet Qty: 90\nTake 1 tablet by mouth once daily.\nRefills: 3 Dr. A. Patel"},
    {ctx:"Antibiotic with an auxiliary instruction.", text:"Rx# 4471086 Carter, James\nAmoxicillin 500 mg capsule Qty: 30\nTake 1 capsule by mouth three times daily for 10 days.\nFinish all of this medication unless otherwise directed by prescriber.\nRefills: 0 Dr. L. Nguyen"},
    {ctx:"Rescue inhaler.", text:"Rx# 4471112 Brown, Aisha\nAlbuterol HFA 90 mcg/actuation inhaler Qty: 1 (18 g)\nInhale 2 puffs every 4 to 6 hours as needed for wheezing or shortness of breath.\nShake well before each use.\nRefills: 1 Dr. A. Patel"},
    {ctx:"Tapering dose. Check that the tablets add up to the quantity.", text:"Rx# 4471140 Kim, David\nPrednisone 10 mg tablet Qty: 21\nTake as directed: 6 tablets on day 1, 5 tablets on day 2, 4 tablets on day 3, 3 tablets on day 4, 2 tablets on day 5, then 1 tablet on day 6.\nTake with food.\nRefills: 0 Dr. L. Nguyen"}
  ]},
{ id:"rx-safety", track:"rx", mode:"copy", title:"Do-Not-Use Abbreviations & Aux Labels",
  blurb:"The Joint Commission's do-not-use list plus standard auxiliary label wording.",
  why:"<b>Why it matters:</b> These abbreviations are on The Joint Commission's do-not-use list because they have caused real harm. Knowing them cold makes you a safer tech.",
  items:[
    {ctx:"Leading and trailing zeros, units, and daily dosing.", text:"Write 0.5 mg, never .5 mg. Write 5 mg, never 5.0 mg. Write units or international units, never U or IU. Write daily, never QD. Write every other day, never QOD."},
    {ctx:"Dangerous drug abbreviations.", text:"Write morphine sulfate or magnesium sulfate in full, never MS, MSO4, or MgSO4. If a prescription uses one of these, the pharmacist calls the prescriber to clarify before it is filled."},
    {ctx:"Common auxiliary labels, one per line.", text:"May cause drowsiness. Alcohol may intensify this effect.\nTake with food or milk.\nDo not take dairy products, antacids, or iron preparations within one hour of this medication."},
    {ctx:"More auxiliary labels, one per line.", text:"Shake well before using.\nRefrigerate. Do not freeze.\nProtect from light.\nFor external use only.\nDo not chew or crush. Swallow whole."}
  ]},
{ id:"rx-workflow", track:"rx", mode:"copy", title:"Insurance & Workflow Notes",
  blurb:"Claim rejections, prior authorizations, inventory, and pharmacist referrals.",
  why:"<b>Why it matters:</b> Clear notes keep the next shift, the pharmacist, and the prescriber's office on the same page.",
  items:[
    {ctx:"An insurance claim came back rejected.", text:"Claim rejected: Refill too soon (code 79). Next eligible fill date 11/20/2026. Patient notified by phone; will pick up on or after that date."},
    {ctx:"A medication needs prior authorization.", text:"Claim rejected: Prior authorization required (code 75). Fax sent to Dr. Patel's office at 11:05 a.m. requesting PA. Patient offered cash price of $42.18 and declined; will wait for approval."},
    {ctx:"Receiving an order.", text:"Inventory note: Received 3 bottles of atorvastatin 20 mg, 90 count. Lot number and expiration date checked. Short-dated stock (exp. 01/2027) moved to the front of the shelf."},
    {ctx:"A patient question that needs the pharmacist.", text:"Pharmacist consult needed: Patient taking warfarin asked about buying an over-the-counter pain reliever. Sale held until the pharmacist speaks with the patient."}
  ]}
);
