# Deploying (hosted Supabase + a static site host)

You do the account steps; keys stay in your own terminal and dashboards, never in this repo or in chat.

1. **Create a Supabase project** at supabase.com (pick a region near the school; save the database password in a password manager).
   Free projects pause after a week of inactivity and have no backups, which a school break can trigger; Pro ($25/month) never pauses and keeps 7 days of backups. Use Pro before real students.
   On the new-project form, under security: tick **Enable automatic RLS** (a safety net that turns row-level security on for any table
   you add later) and untick **Automatically expose new tables** (Supabase recommends this). Neither choice breaks the app: migration
   `0001` turns row-level security on for every table itself, and `0002` grants exactly the access the app needs. If a table
   is ever added, give it both row-level security and an explicit grant.
2. **Link and apply the schema** (from the repo, signed in with `npx supabase login`):
   `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Deploy the sign-in function:** `npx supabase functions deploy student-login`, then
   `npx supabase secrets set ALLOWED_ORIGIN=https://your-site-address` (no trailing slash).
4. **Turn off public sign-ups:** Dashboard > Authentication > Sign In / Providers > "Allow new users to sign up" off.
5. **Create your instructor account:** Dashboard > Authentication > Users > Add user (auto-confirm), copy its id, then in the SQL Editor:
   `insert into public.instructors (id, name) values ('<that id>', 'Your Name');`
6. **Host the site** (Netlify or Cloudflare Pages): connect the repo, build `npm run build`, publish `dist`,
   and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key). `public/_redirects` makes page refreshes work.
   Never put the secret or service key in a `VITE_` variable: those end up in the public site.
7. **Smoke test** with an empty project before real data: sign in as the instructor, create a class, enroll a test student,
   sign in as them, finish a run. Optionally run `src/data/supabaseApi.integration.test.ts` against the project (it cleans up after itself).
8. **Try it on a student Chromebook on the school network.** Filters can block the Supabase address.

Not done yet: two-step verification for instructors in the app, backups and restore drills, and a retention job.
