# Back end plan (Supabase)

Status: **not built yet.** The app currently runs on a browser-only demo adapter (`src/data/demoApi.ts`).
`supabase/migrations/0001_init.sql` holds the proposed schema and row-level security. It has **not been applied or tested**.

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

## Adapter to write
`src/data/supabaseApi.ts` implementing `Api` from `src/data/api.ts`, chosen in `createApi()` in `src/data/context.tsx`
when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Map table columns to the camelCase types in
`src/data/types.ts`. Wrap writes that need several steps (enroll, exit, delete class) in database functions so they are
atomic. `delete_class` already exists in the migration.

## Checks to run before trusting the schema
Run these as separate users against a scratch project:
- A student can read and insert only their own attempts. Inserting with another student's id is ignored (the trigger overwrites it).
- A student cannot read `students`, `classes`, `notes`, `audit_log`, or another student's attempts.
- A student cannot update or delete attempts.
- An instructor can read only their own classes and students (create two instructors and confirm they cannot see each other's).
- `login_attempts` is unreadable and unwritable by anyone except the service role.
- `delete_class` removes the class, its students, their attempts, notes and overrides, and nothing else.

## Not in this schema yet
Blackboard LTI 1.3 launch and grade return (Phase 2), school calendar beyond a list of closed days (kept in `settings.data`),
co-instructor or substitute roles, and the retention job that purges archived records after 30 days.
