-- Explicit, least-privilege access.
--
-- New Supabase projects have an option, "Automatically expose new tables and functions" (Supabase recommends turning it off).
-- Turned off, tables created by migrations are NOT reachable through the API unless granted here. Turned on, tables get broad
-- default grants that this file narrows. Either way the result is the same, so the setting does not matter to this app.
-- Row-level security (migration 0001) still decides which rows each person can touch; these grants decide which tables
-- and operations are reachable at all.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;
-- anon (not signed in) gets nothing. Student sign-in runs in an Edge Function with the service role.

grant select on public.instructors to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert on public.attempts to authenticated;           -- runs are never edited or deleted from the app
grant select, insert, update, delete on public.grade_overrides to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert on public.audit_log to authenticated;          -- append-only
grant select, insert, update, delete on public.settings to authenticated;
-- login_attempts: no grant. Only the service role (the Edge Function) touches it.

grant execute on function public.is_instructor() to authenticated;
grant execute on function public.my_student_id() to authenticated;
grant execute on function public.owns_student(uuid) to authenticated;
grant execute on function public.delete_class(uuid) to authenticated;
-- stamp_attempt() is a trigger function and needs no caller grant.
