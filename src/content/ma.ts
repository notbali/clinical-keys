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
    {ctx:"Elevated blood pressure with a recheck.", text:"Pt is a 62 y/o male. BP 142/90 mmHg L arm seated; repeat 138/88 after 5 min. Provider notified."},
    {ctx:"Point-of-care glucose test.", text:"Glucose (fingerstick) 112 mg/dL at 08:45, fasting. Pt states last meal was at 9:00 p.m."},
    {ctx:"Well-child visit measurements.", text:"Infant, 6 mo: Wt 16 lb 8 oz, length 26.5 in, HC 17 in, T 99.1 F (temporal)."}
  ]},
{ id:"ma-soap", track:"ma", mode:"copy", title:"SOAP Notes",
  blurb:"Type full Subjective / Objective / Assessment / Plan notes, with a new line for each section.",
  why:"<b>Why it matters:</b> SOAP notes are the backbone of the medical record. The faster you can type them cleanly, the more time you have with patients.",
  items:[
    {ctx:"Sore throat visit. Press <b>Enter</b> at the end of each section.", text:"S: 45 y/o female with a 3-day history of sore throat, fever, and difficulty swallowing. Denies cough.\nO: T 101.2 F, P 92, R 18, BP 122/78. Tonsils red and swollen with white patches.\nA: Strep pharyngitis; rapid strep test positive.\nP: Amoxicillin 500 mg PO BID x 10 days. Fluids and rest. Return if not improving in 48 hours."},
    {ctx:"Back pain visit.", text:"S: 34 y/o female c/o low back pain x 2 weeks after lifting boxes. Denies numbness, tingling, or bowel/bladder changes.\nO: Tenderness over lumbar muscles. Gait normal. Straight leg raise negative bilaterally.\nA: Acute lumbar strain.\nP: Ibuprofen 600 mg PO q6h prn pain, take with food. Heat and gentle stretching. Follow up in 2 weeks if not improved."},
    {ctx:"Pediatric ear pain visit.", text:"S: 8 y/o male brought in by mother for right ear pain x 2 days and fever. Decreased appetite.\nO: T 100.9 F, P 104. Right TM bulging and red. Left TM clear.\nA: Acute otitis media, right ear.\nP: Amoxicillin suspension, weight-based dose per provider. Acetaminophen prn fever. Recheck if no improvement in 48 to 72 hours."}
  ]},
{ id:"ma-phone", track:"ma", mode:"copy", title:"Phone Messages & Scheduling",
  blurb:"Refill requests, reschedules, and messages for the provider: names, dates, times, and details.",
  why:"<b>Why it matters:</b> Phone messages go straight to the provider. A missing date, dose, or callback number means another call and a delay in care.",
  items:[
    {ctx:"A patient called the front desk for a refill.", text:"10:15 a.m. - Maria Lopez (DOB 03/22/1958) called requesting a refill of lisinopril 10 mg, 1 tablet daily. Last office visit 06/14/2026. Preferred pharmacy: Main Street Pharmacy. Routed to Dr. Patel for approval."},
    {ctx:"A patient needs to move an appointment.", text:"2:40 p.m. - James Carter called to reschedule his annual physical from Tuesday, 11/17 at 9:30 a.m. to Friday, 11/20 at 1:00 p.m. Reminded patient to fast 8 to 12 hours before lab work. Insurance on file confirmed."},
    {ctx:"A patient reports a possible medication reaction.", text:"Message for Dr. Nguyen: Aisha Brown reports a rash on both forearms that started 2 days after beginning amoxicillin. No trouble breathing, no swelling of lips or tongue. Told patient the provider will call back today. Advised to call 911 if trouble breathing or facial swelling develops."}
  ]},
{ id:"ma-edu", track:"ma", mode:"copy", title:"Patient Instructions",
  blurb:"Plain-language handouts: lab prep, specimen collection, and after-care.",
  why:"<b>Why it matters:</b> Patients take handouts home and follow them word for word. Clear, accurate instructions prevent repeat visits.",
  items:[
    {ctx:"Instructions for fasting lab work.", text:"Before your fasting lab work, do not eat or drink anything except water for 8 to 12 hours. Take your usual medications with water unless your provider told you otherwise."},
    {ctx:"Clean-catch urine specimen instructions.", text:"Wash your hands. Clean the area with the towelette provided. Begin urinating into the toilet, then collect the middle portion of the stream in the cup. Do not touch the inside of the cup or lid. Close the lid tightly and return it to the front desk."},
    {ctx:"After-vaccine care sheet.", text:"After your vaccine, you may have soreness, redness, or mild swelling where the shot was given. A cool, damp cloth can help. Call the office if you develop a high fever. Call 911 for trouble breathing, swelling of the face or throat, or a fast heartbeat."}
  ]}
];
