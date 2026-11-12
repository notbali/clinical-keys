# Clinical Keys

Typing practice for a 2-week Medical Assistant and Pharmacy Tech course. Students type realistic job tasks
(charting, sig codes, labels, phone messages) instead of random sentences. Instructors enroll students into
classes, see everyone by program day, and export typing grades for Blackboard.

All patients, prescribers, students and Rx numbers in this repo are **fictional**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck and production build
```

With no back end configured the app runs in **demo mode**: a fictional roster, with everything stored in the browser.

- Student: sign in as `santosmaya` (Maya Santos, Day 4). Other demo usernames: `johnsonmarcus`, `brooksimani`, `ramanpriya`,
  `fischerjordan`, `parkdaniel`, `vasquezelena`, `reedtyler`.
- Instructor: `/instructor/signin`, any email and password.

## Layout

- `src/lib/` pure, tested logic: school days, program day, usernames, roster paste, grades, CSV
- `src/typing/` the typing scorer and the player component
- `src/content/` drills, sig glossary, sprint lines, and the 10-day program (data only)
- `src/data/` the `Api` interface, the demo adapter and its seed data
- `src/pages/` student and instructor screens
- `src/styles/` theme and app styles
- `supabase/` database schema, security checks and the student sign-in Edge Function
- `docs/` design decisions and the back end plan
- `prototype/` the original single-file typing trainer

## Status

Phase 1 works on the demo adapter and on a local Supabase stack (see `docs/BACKEND.md` for how to run and test it).
Not done: deploying to a hosted Supabase project, achievements, the day 1/5/10 tests, dictation, shift simulation, error hunt and
forms, and the Blackboard launch and grade return.
