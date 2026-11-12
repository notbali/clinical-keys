# Back end plan (Supabase)

Status: **built and tested against a local Supabase stack (Docker). Not yet deployed to a hosted project.**
With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set the app uses `src/data/supabaseApi.ts`; without them it runs on the
browser-only demo adapter (`src/data/demoApi.ts`).

What was verified locally:
- `supabase/tests/rls.sql`: 37 row-level security checks, all passing (students see only their own rows, instructors only theirs,
  the audit log is append-only, `delete_class` is owner-only and removes only that class's data, and more).
- `src/data/supabaseApi.integration.test.ts`: 8 end-to-end tests of the adapter and the `student-login` function (instructor and
  student sign-in, enroll, save runs, overrides, notes, archive blocks sign-in, delete cascades).
- The rate limit (40 failed guesses per client per 10 minutes, then HTTP 429).
- A manual click-through in the browser: instructor sign-in, create class, paste-and-enroll, student sign-in with the
  "Is this you?" step, and a typing run saved to the database.

Not verified: hosted Supabase (settings differ from local), the Microsoft or Google sign-in, two-step verification, and load.

## Why Supabase
Hosted Postgres with row-level security, instructor accounts (email and password, Microsoft or Google sign-in,
two-step verification) and Edge Functions, without running a server. Confirm your school allows the service and
approves storing student data there before using real names.

## The two sign-in paths
**Instructor.** Normal Supabase Auth. A row in `instructors` (same id as the auth user) marks the account as an instructor.

**Student (username only).** A student has no password, so the browser never reads `students` directly before signing in.
A small Edge Function, `student-login`, does it with the service role:

1. `POST { username }` (normalized the same way as `normalizeUsername` in `src/lib/username.ts`).
2. Rate limit by client address using `login_attempts` (for example 10 failed guesses per 10 minutes). Return the same
   error for "unknown username" and "archived student".
3. Look up an active student. If none, record the attempt and return an error.
4. Make sure the student has an auth user. If not, create one with a synthetic email such as
   `<student id>@students.invalid`, a random password, and store its id in `students.auth_user_id`.
5. Return a short-lived session for that auth user. After this, row-level security limits the student to their own rows.
6. A separate `POST { username, preview: true }` returns only `{ firstName, lastInitial, track }` for the "Is this you?" step.

Because the data is low-risk but the sign-in is passwordless, keep the rate limit, return identical errors, and never
return anything beyond first name and last initial before the student confirms.

## The adapter
`src/data/supabaseApi.ts` implements `Api` from `src/data/api.ts` and is chosen in `createApi()` in `src/data/context.tsx`.
Known limits: multi-step writes (enroll, archive, restore, exit) are several requests, not one transaction. If one fails part way
the data can be left half-changed (enroll removes a student it could not enroll; the others do not clean up). Move them into
database functions before a large cohort relies on them. `delete_class` is already a database function.
The student sign-in function creates a student's auth user the first time they sign in; two simultaneous first sign-ins could race.

## Run it locally
Needs Docker Desktop running.
```bash
npx supabase start -x realtime,storage-api,imgproxy,mailpit,studio,logflare,vector,supavisor,postgres-meta
npx supabase functions serve            # in a second terminal; keep it running
npx supabase status -o env              # prints the local URL and keys (local-only dev keys)
# put the URL and the anon key in .env.local as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
SB_URL=... SB_SERVICE=... node scripts/create-instructor.mjs you@example.test "a password" "Your Name"
npm run dev
```
Checks:
```bash
docker exec -i supabase_db_clinical-keys psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
SB_URL=... SB_ANON=... SB_SERVICE=... npx vitest run src/data/supabaseApi.integration.test.ts
```
Reset the local database with `npx supabase db reset`. Never put hosted-project keys in a file in this repo.

## What the security checks cover
`supabase/tests/rls.sql` runs these as separate users:
- A student can read and insert only their own attempts. Inserting with another student's id is ignored (the trigger overwrites it).
- A student cannot read `students`, `classes`, `notes`, `audit_log`, or another student's attempts.
- A student cannot update or delete attempts.
- An instructor can read only their own classes and students (create two instructors and confirm they cannot see each other's).
- `login_attempts` is unreadable and unwritable by anyone except the service role.
- `delete_class` removes the class, its students, their attempts, notes and overrides, and nothing else.

## Not in this schema or adapter yet
Blackboard LTI 1.3 launch and grade return (Phase 2), school calendar beyond a list of closed days (kept in `settings.data`),
co-instructor or substitute roles, and the retention job that purges archived records after 30 days.

## Going hosted
See `docs/DEPLOY.md` for the step-by-step.
