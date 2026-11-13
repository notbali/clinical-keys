# Clinical Keys — project context

Typing trainer for a 2-week Medical Assistant (MA) and Pharmacy Tech (PT) typing course. Students currently use typing.com and find it to be busywork; the goal is engagement through **realistic job tasks** (charting, sig codes, labels, phone messages) instead of random sentences.

## The classroom
- Course is ~2 weeks (10 class days). Typing block is **~3 hours/day** inside a 6.5-hour day (~30 hours total).
- The teacher wants students engaged, not slogging. Variety across the 3-hour block matters more than raw volume.
- Students open a link in a browser and sign in with a username only (last name then first name, no password). They also work from home. Many use school Chromebooks.
- MA and PT students share the room, and students join continuously, each running their own Day 1 to Day 10 from their own start date. Morning (9:00 to 11:55) is Microsoft 365 work graded in Blackboard; afternoon (12:35 to 3:30) is typing.

## Tech constraints (updated for the web app)
- React + TypeScript + Vite. `npm run dev`, `npm test`, `npm run build`. The original no-build prototype is kept in `prototype/`.
- Content lives in `src/content/*.ts` as data; logic lives in `src/lib` and `src/typing`; screens in `src/pages`. Keep content, logic and screens separate.
- Screens talk to data only through the `Api` interface in `src/data/api.ts`. The demo adapter (browser storage, fictional roster) is the default; a Supabase adapter is planned (`docs/BACKEND.md`).
- Colors and fonts come only from `src/styles/theme.css`.
- This is a **public repo**: never commit secrets, real student names or exports. Use `.env.local` (ignored).
- No external network calls besides Google Fonts, and later the chosen back end.

## Content rules (important)
- All patients, prescribers, Rx numbers, and phone numbers are **fictional**.
- Medical and pharmacy content must be **accurate**: real sig conventions, correct Tall Man lettering (ISMP/FDA lists), Joint Commission do-not-use abbreviations, plausible vitals, doses within standard ranges. Double-check anything clinical before adding it.
- Patients shown in the chart banner (`patient` on a passage in `src/content`) must be fictional and agree with the passage: same age and sex as the text, a date of birth that gives that age, the same person identical everywhere, and an allergy list that never includes a drug the passage gives them. `src/content/patients.test.ts` enforces this.
- Never model do-not-use abbreviations (QD, QOD, U, IU, trailing zeros, missing leading zeros) as correct output.
- MAs and techs don't give clinical advice: messages route to the provider/pharmacist.
- Accuracy over speed is the core message. Personal bests only count for runs with zero uncorrected errors and ≥95% accuracy.

## Roadmap (agreed direction)
1. **10-day program view**: "Day 1 … Day 10" so students click today's assignment.
   - Day 1 baseline test, Day 5 mid-point test, Day 10 final test (compare against Day 1).
   - MA path: terms → vitals → chief complaints → SOAP 1 → test → phone/refills → scheduling → SOAP 2 → patient instructions → final.
   - PT path: terms → sig frequencies → sig routes → Tall Man → test → full labels → do-not-use + aux labels → insurance/PA → workflow/referrals → final.
2. **Daily 3-hour rotation** (change activity every 20–30 min):
   warm-up sprint (1-min timed tests) → today's skill → dictation (browser speechSynthesis reads a note aloud; student types it) → break → shift simulation (timed queue of mixed tasks, points for accuracy) → error hunt (find/fix planted errors in a note or label) → EHR-style data-entry forms (Tab between fields) → class challenge (projector-friendly).
3. **Generated content** from realistic templates (random fictional names, vitals in plausible ranges, sig combos, label fields) so students never run out or retype the same passage.
   - Built (phase 1): `src/content/generate/` plus `src/content/generated.ts`. Six drills on the "All drills" page: MA vitals, SOAP notes, phone messages; Rx labels, sig translator, Tall Man. Kept apart from the written drills, which progress and grades are keyed to. A run saves its **seed** in the attempt's `passage` field.
   - Adding a drug: add it to `rxCatalog.ts` **and** to `src/test/rxReference.ts` (real strengths, adult daily maximum). The two are written separately on purpose so a typo in one fails against the other.
   - Not yet generated: error hunts, pharmacy workflow/claim notes, patient handouts. The sig translator has about 90 distinct prescriptions, so it repeats sooner than the others.
4. **Movement/ergonomics breaks** between activities.
5. Teacher-facing: easy way to collect results (currently a "Copy my result" button students paste into an assignment).

## Files
- `index.html`: page shell
- `css/styles.css`: styles; MA track is teal, PT track is plum (`body[data-track=rx]`)
- `js/content/ma.js`, `js/content/rx.js`: drills; `js/content/glossary.js`: sig cheat sheet
- `js/content/program.js`: the Day 1–10 plan per track (which drills/passages each day uses; `soon:true` marks planned-but-unbuilt activities)
- `js/content/sprint.js`: warm-up sprint line pools + generator (`SPRINT.build(track)`)
- `.claude/launch.json`: local static server for previewing (`file://` previews don't run scripts in the Claude pane)
- `js/app.js`: typing engine (input handling, scoring, results, local bests)
