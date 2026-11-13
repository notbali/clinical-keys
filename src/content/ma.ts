import type { Drill } from './types';

export const maDrills: Drill[] = [
{ id:"ma-terms", track:"ma", mode:"copy", title:"Medical Term Warm-Up",
  blurb:"Long, tricky words you'll type in charts every day. A good first drill for each class.",
  why:"<b>Why it matters:</b> Spell-check doesn't know most medical words, and hypotension vs. hypertension is one letter apart with the opposite meaning.",
  items:[
    {ctx:"<b>Cardiovascular &amp; endocrine.</b> Watch the hypo/hyper pairs.", text:"tachycardia bradycardia arrhythmia hypertension hypotension hyperglycemia hypoglycemia hypothyroidism"},
    {ctx:"<b>Digestive system.</b> Watch the -itis, -ectomy, and -scopy endings.", text:"gastritis gastroenteritis cholecystectomy appendectomy colonoscopy endoscopy dysphagia"},
    {ctx:"<b>Skin.</b> Common wound and rash terms.", text:"dermatitis cellulitis laceration abrasion contusion erythema edema pruritus"},
    {ctx:"<b>Respiratory &amp; ENT.</b>", text:"dyspnea tachypnea apnea bronchitis pneumonia otitis media pharyngitis sinusitis"},
    {ctx:"<b>Urinary system.</b>", text:"nephrolithiasis cystitis hematuria dysuria polyuria nocturia urinalysis"}
  ]},
{ id:"ma-vitals", track:"ma", mode:"copy", title:"Vitals & Chart Entries",
  blurb:"Numbers, slashes, and units. This drill builds your number-row speed.",
  why:"<b>Why it matters:</b> Numbers are where charting errors hurt most. A BP of 182/90 typed as 128/90 can hide an emergency.",
  items:[
    {ctx:"Rooming an adult patient. Enter the vitals exactly as taken.", text:"BP 128/84 mmHg, P 76 bpm, R 16, T 98.6 F (oral), SpO2 98% on room air."},
    {ctx:"Height, weight, and pain score at intake.", text:"Ht 5 ft 6 in, Wt 154 lb, BMI 24.9. Pain 3/10, right knee."},
    {patient:{name:"Hughes, Walter", sex:"M", age:"62 y", dob:"04/30/1964", mrn:"0287754", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"Elevated blood pressure with a recheck.", text:"Pt is a 62 y/o male. BP 142/90 mmHg L arm seated; repeat 138/88 after 5 min. Provider notified."},
    {ctx:"Point-of-care glucose test.", text:"Glucose (fingerstick) 112 mg/dL at 08:45, fasting. Pt states last meal was at 9:00 p.m."},
    {patient:{name:"Ferreira, Mia", sex:"F", age:"6 mo", dob:"05/12/2026", mrn:"0745120", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"Well-child visit measurements.", text:"Infant, 6 mo: Wt 16 lb 8 oz, length 26.5 in, HC 17 in, T 99.1 F (temporal)."}
  ]},
{ id:"ma-soap", track:"ma", mode:"copy", title:"SOAP Notes",
  blurb:"Type full Subjective / Objective / Assessment / Plan notes, with a new line for each section.",
  why:"<b>Why it matters:</b> SOAP notes are the backbone of the medical record. The faster you can type them cleanly, the more time you have with patients.",
  items:[
    {patient:{name:"Whitaker, Hannah", sex:"F", age:"45 y", dob:"06/14/1981", mrn:"0418273", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"Sore throat visit. Press <b>Enter</b> at the end of each section.", text:"S: 45 y/o female with a 3-day history of sore throat, fever, and difficulty swallowing. Denies cough.\nO: T 101.2 F, P 92, R 18, BP 122/78. Tonsils red and swollen with white patches.\nA: Strep pharyngitis; rapid strep test positive.\nP: Amoxicillin 500 mg PO BID x 10 days. Fluids and rest. Return if not improving in 48 hours."},
    {patient:{name:"Castillo, Renee", sex:"F", age:"34 y", dob:"02/27/1992", mrn:"0529146", allergies:"Sulfa drugs (hives)", provider:"Dr. L. Nguyen"}, ctx:"Back pain visit.", text:"S: 34 y/o female c/o low back pain x 2 weeks after lifting boxes. Denies numbness, tingling, or bowel/bladder changes.\nO: Tenderness over lumbar muscles. Gait normal. Straight leg raise negative bilaterally.\nA: Acute lumbar strain.\nP: Ibuprofen 600 mg PO q6h prn pain, take with food. Heat and gentle stretching. Follow up in 2 weeks if not improved."},
    {patient:{name:"Brennan, Owen", sex:"M", age:"8 y", dob:"03/09/2018", mrn:"0633981", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"Pediatric ear pain visit.", text:"S: 8 y/o male brought in by mother for right ear pain x 2 days and fever. Decreased appetite.\nO: T 100.9 F, P 104. Right TM bulging and red. Left TM clear.\nA: Acute otitis media, right ear.\nP: Amoxicillin suspension, weight-based dose per provider. Acetaminophen prn fever. Recheck if no improvement in 48 to 72 hours."}
  ]},
{ id:"ma-phone", track:"ma", mode:"copy", title:"Phone Messages & Scheduling",
  blurb:"Refill requests, reschedules, and messages for the provider: names, dates, times, and details.",
  why:"<b>Why it matters:</b> Phone messages go straight to the provider. A missing date, dose, or callback number means another call and a delay in care.",
  items:[
    {patient:{name:"Lopez, Maria", sex:"F", age:"68 y", dob:"03/22/1958", mrn:"0391822", allergies:"Codeine (nausea)", provider:"Dr. A. Patel"}, ctx:"A patient called the front desk for a refill.", text:"10:15 a.m. - Maria Lopez (DOB 03/22/1958) called requesting a refill of lisinopril 10 mg, 1 tablet daily. Last office visit 06/14/2026. Preferred pharmacy: Main Street Pharmacy. Routed to Dr. Patel for approval."},
    {patient:{name:"Carter, James", sex:"M", age:"55 y", dob:"09/05/1971", mrn:"0462093", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"A patient needs to move an appointment.", text:"2:40 p.m. - James Carter called to reschedule his annual physical from Tuesday, 11/17 at 9:30 a.m. to Friday, 11/20 at 1:00 p.m. Reminded patient to fast 8 to 12 hours before lab work. Insurance on file confirmed."},
    {patient:{name:"Brown, Aisha", sex:"F", age:"36 y", dob:"12/03/1989", mrn:"0558817", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"A patient reports a possible medication reaction.", text:"Message for Dr. Nguyen: Aisha Brown reports a rash on both forearms that started 2 days after beginning amoxicillin. No trouble breathing, no swelling of lips or tongue. Told patient the provider will call back today. Advised to call 911 if trouble breathing or facial swelling develops."}
  ]},
{ id:"ma-edu", track:"ma", mode:"copy", title:"Patient Instructions",
  blurb:"Plain-language handouts: lab prep, specimen collection, and after-care.",
  why:"<b>Why it matters:</b> Patients take handouts home and follow them word for word. Clear, accurate instructions prevent repeat visits.",
  items:[
    {ctx:"Instructions for fasting lab work.", text:"Before your fasting lab work, do not eat or drink anything except water for 8 to 12 hours. Take your usual medications with water unless your provider told you otherwise."},
    {ctx:"Clean-catch urine specimen instructions.", text:"Wash your hands. Clean the area with the towelette provided. Begin urinating into the toilet, then collect the middle portion of the stream in the cup. Do not touch the inside of the cup or lid. Close the lid tightly and return it to the front desk."},
    {ctx:"After-vaccine care sheet.", text:"After your vaccine, you may have soreness, redness, or mild swelling where the shot was given. A cool, damp cloth can help. Call the office if you develop a high fever. Call 911 for trouble breathing, swelling of the face or throat, or a fast heartbeat."}
  ]},
{ id:"ma-terms-2", track:"ma", mode:"copy", title:"Medical Terms II",
  blurb:"More long words for the chart: bones, nerves, eyes and ears, blood work, and women's and children's health.",
  why:"<b>Why it matters:</b> Every body system has its own vocabulary. Spelling it right the first time keeps charts searchable and keeps the provider's meaning intact.",
  items:[
    {ctx:"<b>Bones &amp; joints.</b> Watch the double letters and the -itis endings.", text:"arthritis osteoporosis fracture sprain tendonitis scoliosis bursitis fibromyalgia"},
    {ctx:"<b>Nervous system.</b> Some of these are easy to transpose.", text:"migraine neuropathy vertigo syncope seizure paresthesia tremor meningitis"},
    {ctx:"<b>Eyes &amp; ears.</b>", text:"conjunctivitis cataract glaucoma tinnitus cerumen myopia astigmatism"},
    {ctx:"<b>Women's health &amp; children.</b>", text:"amenorrhea dysmenorrhea menopause mammogram prenatal postpartum colic croup"},
    {ctx:"<b>Blood work.</b> You will see these on every lab report.", text:"hemoglobin hematocrit leukocytosis anemia thrombocytopenia cholesterol triglycerides creatinine"},
    {ctx:"<b>Electrolytes.</b> One letter apart, opposite meanings: hypo (low) and hyper (high).", text:"hyperkalemia hypokalemia hypercalcemia hypocalcemia hypernatremia hyponatremia"}
  ]},
{ id:"ma-complaints", track:"ma", mode:"copy", title:"Chief Complaints",
  blurb:"The reason for the visit, in the chart's shorthand: what, how long, how bad, and what the patient denies.",
  why:"<b>Why it matters:</b> The chief complaint is the first line of every visit note. A clear one tells the provider what to ask before they walk into the room.",
  items:[
    {ctx:"Adult with cold symptoms. Type the complaint, the duration, and what the patient denies.", text:"CC: Cough and nasal congestion x 5 days. Cough is productive of yellow sputum. Denies fever and shortness of breath."},
    {ctx:"A patient's own words go in quotation marks.", text:"CC: \"My head has been pounding since yesterday.\" Frontal headache 6/10 with light sensitivity. No head injury."},
    {ctx:"Urinary symptoms. Note what the patient denies.", text:"CC: Burning with urination and urinary frequency x 2 days. Denies flank pain, fever, or blood in the urine."},
    {ctx:"An injury. Include how it happened and the pain score.", text:"CC: Right ankle pain and swelling after twisting it playing basketball yesterday. Pain 5/10. Able to bear weight with pain."},
    {ctx:"A skin complaint, with a possible cause.", text:"CC: Itchy rash on both arms x 3 days, started after using a new laundry detergent. No fever. No new medications."},
    {ctx:"Dizziness. Pay attention to the symptoms the patient does not have.", text:"CC: Dizziness when standing up x 1 week. Denies fainting, chest pain, or palpitations. Reports drinking less water than usual."},
    {patient:{name:"Alvarez, Mateo", sex:"M", age:"2 y", dob:"03/18/2024", mrn:"0702358", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"A parent gives the history for a young child.", text:"CC: Mother reports her 2 y/o son has had a fever of 101.5 F for 2 days, is pulling at his left ear, and is sleeping poorly."},
    {patient:{name:"Hughes, Walter", sex:"M", age:"62 y", dob:"04/30/1964", mrn:"0287754", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"A follow-up visit for a long-term condition.", text:"CC: 62 y/o male here for a follow-up of high blood pressure. Taking lisinopril 10 mg daily as prescribed. Home readings average 134/84 mmHg."},
    {ctx:"<b>A red-flag complaint.</b> The provider is told right away, before anything else is charted.", text:"CC: Chest pressure x 20 min with shortness of breath and sweating. Pt placed in an exam room at once. Dr. Nguyen notified immediately. Vitals taken."}
  ]},
{ id:"ma-abbrev", track:"ma", mode:"copy", title:"Chart Shorthand",
  blurb:"The approved abbreviations used in history, exam and order entries, typed the way they appear in a real note.",
  why:"<b>Why it matters:</b> Providers read charts fast, and standard shorthand keeps a note short. Only approved abbreviations belong in the record, and every one has to be typed exactly.",
  items:[
    {ctx:"<b>History shorthand.</b> h/o history of, s/p status post, c/o complains of, r/o rule out, f/u follow-up.", text:"h/o hypertension. s/p appendectomy 2019. c/o fatigue x 2 weeks. r/o anemia. f/u in 4 weeks."},
    {ctx:"<b>Past history.</b> PMH past medical history, PSH past surgical history, HTN hypertension, DM2 type 2 diabetes, HLD hyperlipidemia.", text:"PMH: HTN, DM2, HLD. PSH: appendectomy 2019. NKDA. Medications reviewed with patient."},
    {ctx:"<b>Exam shorthand.</b> NAD no acute distress, A&amp;O x 3 alert and oriented to person, place and time, PERRLA pupils equal, round and reactive, RRR regular rate and rhythm, CTAB clear to auscultation bilaterally, NT/ND non-tender and non-distended.", text:"Gen: NAD, A&O x 3. HEENT: PERRLA. CV: RRR, no murmurs. Lungs: CTAB. Abd: soft, NT/ND."},
    {ctx:"<b>Orders.</b> UA urinalysis, CBC complete blood count, BMP basic metabolic panel, A1c average blood sugar test, RTC return to clinic.", text:"Dx: UTI. Orders: UA with culture, CBC, BMP, A1c. RTC in 1 week."},
    {ctx:"<b>Imaging and labs.</b> CXR chest x-ray, EKG heart tracing, TSH thyroid-stimulating hormone, PCP primary care provider.", text:"Orders: CXR 2 views, EKG, TSH. Pt to f/u with PCP in 2 weeks."},
    {ctx:"A medication list, as reviewed with the patient.", text:"Med list: lisinopril 10 mg daily, metformin 500 mg BID, atorvastatin 20 mg every evening. Allergies: NKDA."}
  ]},
{ id:"ma-procedures", track:"ma", mode:"copy", title:"Injections & Procedures",
  blurb:"Documenting vaccines, injections, EKGs, blood draws and swabs: dose, route, site, and who was told.",
  why:"<b>Why it matters:</b> If it isn't charted, it didn't happen. A vaccine entry without the lot number or site can't be traced if there is ever a recall or a reaction.",
  items:[
    {patient:{name:"Moreau, Claire", sex:"F", age:"29 y", dob:"07/08/1997", mrn:"0731640", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"Documenting a vaccine. Every entry needs the dose, route, site, lot number and expiration date.", text:"29 y/o female here for a Tdap booster. Tdap vaccine 0.5 mL IM, left deltoid. Lot # KT4821B, exp 08/2027. VIS given. Pt observed for 15 min with no reaction."},
    {patient:{name:"Hughes, Walter", sex:"M", age:"62 y", dob:"04/30/1964", mrn:"0287754", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"Seasonal flu vaccine. Screening questions come before the shot.", text:"62 y/o male here for the flu shot. Influenza vaccine 0.5 mL IM, right deltoid. Lot # RM7203A, exp 06/2027. Screening questions reviewed and VIS given."},
    {patient:{name:"Lopez, Maria", sex:"F", age:"68 y", dob:"03/22/1958", mrn:"0391822", allergies:"Codeine (nausea)", provider:"Dr. A. Patel"}, ctx:"A monthly injection given on the provider's order.", text:"Cyanocobalamin 1,000 mcg (1 mL) IM, right ventrogluteal site, per order of Dr. Patel. Pt tolerated well. Next injection due 12/10/2026."},
    {patient:{name:"Carter, James", sex:"M", age:"55 y", dob:"09/05/1971", mrn:"0462093", allergies:"NKDA", provider:"Dr. L. Nguyen"}, ctx:"An EKG. The provider reads the tracing, not the MA.", text:"55 y/o male. 12-lead EKG performed per provider order. Pt supine, lead placement checked. Tracing given to Dr. Nguyen for review. Pt tolerated well."},
    {patient:{name:"Castillo, Renee", sex:"F", age:"34 y", dob:"02/27/1992", mrn:"0529146", allergies:"Sulfa drugs (hives)", provider:"Dr. L. Nguyen"}, ctx:"A blood draw for a CBC and a metabolic panel. Tubes go in order of draw.", text:"Venipuncture, left antecubital, 21-gauge butterfly, 1 attempt. Tubes drawn in order: 1 gold, then 1 lavender. Labeled at bedside with name and DOB. Pressure held and bandage applied."},
    {patient:{name:"Brennan, Owen", sex:"M", age:"8 y", dob:"03/09/2018", mrn:"0633981", allergies:"NKDA", provider:"Dr. A. Patel"}, ctx:"A rapid strep test. The MA reports the result; the provider diagnoses.", text:"8 y/o male brought in by mother for sore throat. Rapid strep swab collected per provider order. Result read at 5 min per kit instructions: positive. Dr. Patel notified at once. Mother told the provider will see the patient next."}
  ]},
{ id:"ma-referrals", track:"ma", mode:"copy", title:"Referrals & Insurance",
  blurb:"Referrals, insurance checks, no-shows, records requests and lab-result calls: the paperwork side of the clinic.",
  why:"<b>Why it matters:</b> A referral that isn't tracked can leave a patient waiting for care that was never scheduled. Clear notes let anyone on the team pick up where you left off.",
  items:[
    {ctx:"A referral that needs prior authorization.", text:"Referral placed to cardiology (Dr. R. Singh) per Dr. Patel. Insurance requires prior authorization. Request submitted 11/12/2026; authorization number pending. Patient will be called with the appointment date."},
    {ctx:"Checking coverage before a visit. The member ID must be exact.", text:"Insurance verified 11/12/2026: Blue Pine Health PPO, member ID XJK4482091, group GRP7731. Eligibility active. Copay $25.00 for office visit; patient told it is due at check-in."},
    {ctx:"A missed appointment. Check the weekday and the date.", text:"Pt did not arrive for the 2:00 p.m. appointment on Thursday, 11/12/2026. Called twice and left a voicemail with the callback number 555-0142. Rescheduled for Thursday, 11/19/2026 at 2:00 p.m."},
    {ctx:"A records request. Records only go out with a signed release.", text:"Release of information form signed 11/12/2026. Records from 01/2025 to 11/2026 faxed to Valley Orthopedics at 555-0173. Fax confirmation page scanned into the chart."},
    {ctx:"Passing on a result the provider has already reviewed. Identity comes first.", text:"Lab results reviewed by Dr. Nguyen: normal. Called the patient at 4:10 p.m. and verified name and date of birth before sharing. Patient voiced understanding. Annual follow-up due 11/2027."}
  ]}
];
