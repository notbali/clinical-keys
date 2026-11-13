-- Row-level security checks. Run against a LOCAL database only (it rolls back, but still):
--   docker exec -i supabase_db_clinical-keys psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
-- Prints PASS or FAIL for each check and ends with a summary. Nothing is committed.
begin;

create temp table results (name text, ok boolean, detail text);
grant all on results to public;

-- Fixtures, created as the superuser (bypasses RLS).
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inst1@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inst2@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@students.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's2@students.invalid');
insert into public.instructors (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Instructor One'),
  ('00000000-0000-0000-0000-0000000000a2', 'Instructor Two');
insert into public.classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Class One'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Class Two');
insert into public.students (id, owner_id, username, first_name, last_name, track, auth_user_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'onealpha', 'Alpha', 'One', 'ma', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'twobeta', 'Beta', 'Two', 'rx', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2', 'threegamma', 'Gamma', 'Three', 'ma', null);
insert into public.enrollments (student_id, class_id, start_date) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '2026-11-09'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', '2026-11-09'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2', '2026-11-09');
insert into public.attempts (student_id, kind, track, passage, wpm, accuracy, errors_left, seconds, completed, clean) values
  ('00000000-0000-0000-0000-0000000000d1', 'sprint', 'ma', 0, 29, 97.0, 0, 60, true, true) ,
  ('00000000-0000-0000-0000-0000000000d2', 'sprint', 'rx', 0, 31, 96.0, 0, 60, true, true) ,
  ('00000000-0000-0000-0000-0000000000d3', 'sprint', 'ma', 0, 25, 94.0, 0, 60, true, false);
insert into public.notes (student_id, author_id, body) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'private note');
insert into public.audit_log (actor_id, action, subject, detail) values ('00000000-0000-0000-0000-0000000000a1', 'test', 'x', 'y');
insert into public.login_attempts (client, username) values ('1.2.3.4', 'x');
insert into public.challenges (id, class_id, passages, status, ended_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '{"ma": {"drillId": "ma-gen-vitals", "seed": 1, "chartDate": "2026-11-12"}}', 'open', null),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '{"ma": {"drillId": "ma-gen-vitals", "seed": 2, "chartDate": "2026-11-12"}, "rx": {"drillId": "rx-gen-labels", "seed": 2, "chartDate": "2026-11-12"}}', 'ended', now()),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', '{"ma": {"drillId": "ma-gen-vitals", "seed": 3, "chartDate": "2026-11-12"}}', 'open', null);
insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'Beta T.', 'rx', 30, 97.0, 0, 70, true),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d3', 'Gamma T.', 'ma', 35, 98.0, 0, 65, true);
insert into public.class_plans (class_id, days) values
  ('00000000-0000-0000-0000-0000000000c1', '{1,2,4,5,6,7,8,9,10}'),
  ('00000000-0000-0000-0000-0000000000c2', '{2,1}');

-- Helpers: run as a given user, count rows, or try a statement and report whether it raised.
create function pg_temp.as_user(uid uuid, r text default 'authenticated') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute format('set local role %I', r);
end $f$;
create function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $f$;
create function pg_temp.count_of(q text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  begin
    execute 'select count(*) from (' || q || ') t' into n;
  exception when others then
    return -1; -- permission denied or other error
  end;
  return n;
end $f$;
create function pg_temp.raises(q text) returns boolean language plpgsql as $f$
begin
  begin
    execute q;
  exception when others then
    return true;
  end;
  return false;
end $f$;
create function pg_temp.affected(q text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  begin
    execute q;
    get diagnostics n = row_count;
  exception when others then
    return -1;
  end;
  return n;
end $f$;
grant execute on all functions in schema pg_temp to public;

create function pg_temp.check_(name text, ok boolean, detail text default '') returns void language plpgsql as $f$
begin
  insert into results values (name, ok, detail);
end $f$;

do $t$
declare n bigint; sid uuid;
begin
  ---------------------------------------------------------------- student 1
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');

  perform pg_temp.check_('student sees only their own attempts', pg_temp.count_of('select 1 from public.attempts') = 1);
  perform pg_temp.check_('student sees only their own student row', pg_temp.count_of('select 1 from public.students') = 1);
  perform pg_temp.check_('student sees only their own enrollment', pg_temp.count_of('select 1 from public.enrollments') = 1);
  perform pg_temp.check_('student cannot read classes', pg_temp.count_of('select 1 from public.classes') <= 0);
  perform pg_temp.check_('student cannot read notes', pg_temp.count_of('select 1 from public.notes') <= 0);
  perform pg_temp.check_('student cannot read the audit log', pg_temp.count_of('select 1 from public.audit_log') <= 0);
  perform pg_temp.check_('student cannot read login_attempts', pg_temp.count_of('select 1 from public.login_attempts') <= 0);
  perform pg_temp.check_('student cannot read instructors', pg_temp.count_of('select 1 from public.instructors') <= 0);

  -- Insert pretending to be student 2: the trigger must overwrite student_id with student 1.
  perform pg_temp.affected($q$insert into public.attempts (student_id, kind, track, passage, wpm, accuracy, errors_left, seconds, completed, clean, created_at)
    values ('00000000-0000-0000-0000-0000000000d2', 'sprint', 'ma', 0, 40, 99.0, 0, 60, true, true, '2000-01-01')$q$);
  perform pg_temp.check_('student attempt insert is stamped with their own id',
    pg_temp.count_of($q$select 1 from public.attempts where student_id = '00000000-0000-0000-0000-0000000000d1' and wpm = 40$q$) = 1);
  perform pg_temp.check_('student attempt insert is stamped with the server clock',
    pg_temp.count_of($q$select 1 from public.attempts where wpm = 40 and created_at > now() - interval '1 minute'$q$) = 1);
  perform pg_temp.check_('student cannot update attempts', pg_temp.affected('update public.attempts set wpm = 999') <= 0);
  perform pg_temp.check_('student cannot delete attempts', pg_temp.affected('delete from public.attempts') <= 0);
  perform pg_temp.check_('student cannot write notes', pg_temp.raises($q$insert into public.notes (student_id, author_id, body) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','x')$q$));
  perform pg_temp.check_('student cannot write grade overrides', pg_temp.raises($q$insert into public.grade_overrides (student_id, value, reason, set_by) values ('00000000-0000-0000-0000-0000000000d1', 100, 'x', '00000000-0000-0000-0000-0000000000a1')$q$));
  perform pg_temp.check_('student cannot change their own track', pg_temp.affected($q$update public.students set track = 'rx'$q$) <= 0);
  perform pg_temp.check_('student cannot touch login_attempts even by insert', pg_temp.raises($q$insert into public.login_attempts (client) values ('x')$q$));
  perform pg_temp.check_('student cannot create classes', pg_temp.raises($q$insert into public.classes (owner_id, name) values ('00000000-0000-0000-0000-0000000000a1','x')$q$));
  perform pg_temp.check_('student cannot call delete_class on a real class', pg_temp.raises($q$select public.delete_class('00000000-0000-0000-0000-0000000000c1')$q$));
  perform pg_temp.check_('student reads only their own class plan', pg_temp.count_of('select 1 from public.class_plans') = 1
    and pg_temp.count_of($q$select 1 from public.class_plans where class_id = '00000000-0000-0000-0000-0000000000c1'$q$) = 1);
  perform pg_temp.check_('student cannot change their class plan', pg_temp.affected($q$update public.class_plans set days = '{1}'$q$) <= 0);
  perform pg_temp.check_('student cannot delete a class plan', pg_temp.affected('delete from public.class_plans') <= 0);
  perform pg_temp.check_('student cannot create a class plan', pg_temp.raises($q$insert into public.class_plans (class_id, days) values ('00000000-0000-0000-0000-0000000000c2', '{1}')$q$));

  -- Class challenge, as student 1 (MA, class one).
  perform pg_temp.check_('student sees only their own class''s challenge rounds', pg_temp.count_of('select 1 from public.challenges') = 2);
  perform pg_temp.check_('student sees only their own class''s challenge results', pg_temp.count_of('select 1 from public.challenge_results') = 1);
  perform pg_temp.check_('student can submit a challenge result (forged id, name, track and clean flag are overwritten)',
    pg_temp.affected($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$) = 1);
  perform pg_temp.check_('challenge result is stamped with the student, first name and last initial, own track and the real clean flag',
    pg_temp.count_of($q$select 1 from public.challenge_results where challenge_id = '00000000-0000-0000-0000-0000000000e1' and student_id = '00000000-0000-0000-0000-0000000000d1' and display_name = 'Alpha O.' and track = 'ma' and clean = false$q$) = 1);
  perform pg_temp.check_('challenge result is stamped with the server clock',
    pg_temp.count_of($q$select 1 from public.challenge_results where student_id = '00000000-0000-0000-0000-0000000000d1' and submitted_at > now() - interval '1 minute'$q$) = 1);
  perform pg_temp.check_('student sees classmates'' results after submitting', pg_temp.count_of('select 1 from public.challenge_results') = 2);
  perform pg_temp.check_('student cannot submit a second result to the same round', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  perform pg_temp.check_('student cannot submit to an ended round', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  perform pg_temp.check_('student cannot submit to another class''s round', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  perform pg_temp.check_('student cannot change or delete challenge results', pg_temp.affected('update public.challenge_results set wpm = 999') <= 0 and pg_temp.affected('delete from public.challenge_results') <= 0);
  perform pg_temp.check_('student cannot open, change or end a challenge round',
    pg_temp.raises($q$insert into public.challenges (class_id, passages, status) values ('00000000-0000-0000-0000-0000000000c1', '{"ma": {"drillId": "x", "seed": 1, "chartDate": "2026-11-12"}}', 'ended')$q$)
    and pg_temp.affected($q$update public.challenges set status = 'ended'$q$) <= 0
    and pg_temp.affected('delete from public.challenges') <= 0);
  reset role;

  ---------------------------------------------------------------- student 2 (PT, class one)
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  perform pg_temp.check_('student cannot submit to a round with no passage for their track', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  reset role;

  ---------------------------------------------------------------- instructor 1
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.check_('instructor sees only their own students', pg_temp.count_of('select 1 from public.students') = 2);
  perform pg_temp.check_('instructor sees only their own classes', pg_temp.count_of('select 1 from public.classes') = 1);
  perform pg_temp.check_('instructor sees attempts of their own students only', pg_temp.count_of('select 1 from public.attempts') = 3);
  perform pg_temp.check_('instructor cannot read login_attempts', pg_temp.count_of('select 1 from public.login_attempts') <= 0);
  perform pg_temp.check_('instructor cannot read another instructor''s student', pg_temp.count_of($q$select 1 from public.students where username = 'threegamma'$q$) = 0);
  perform pg_temp.check_('instructor can add a note to their student', not pg_temp.raises($q$insert into public.notes (student_id, author_id, body) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','ok')$q$));
  perform pg_temp.check_('instructor cannot add a note to another instructor''s student', pg_temp.raises($q$insert into public.notes (student_id, author_id, body) values ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000a1','nope')$q$));
  perform pg_temp.check_('instructor cannot forge another author on a note', pg_temp.raises($q$insert into public.notes (student_id, author_id, body) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a2','forged')$q$));
  perform pg_temp.check_('instructor can set a grade override with a reason', not pg_temp.raises($q$insert into public.grade_overrides (student_id, value, reason, set_by) values ('00000000-0000-0000-0000-0000000000d1', 80, 'Missed time', '00000000-0000-0000-0000-0000000000a1')$q$));
  perform pg_temp.check_('an override with a blank reason is rejected', pg_temp.raises($q$insert into public.grade_overrides (student_id, value, reason, set_by) values ('00000000-0000-0000-0000-0000000000d2', 80, '   ', '00000000-0000-0000-0000-0000000000a1')$q$));
  perform pg_temp.check_('instructor cannot override another instructor''s student', pg_temp.raises($q$insert into public.grade_overrides (student_id, value, reason, set_by) values ('00000000-0000-0000-0000-0000000000d3', 50, 'nope', '00000000-0000-0000-0000-0000000000a1')$q$));
  perform pg_temp.check_('instructor audit entries must name themselves as actor', pg_temp.raises($q$insert into public.audit_log (actor_id, action, subject, detail) values ('00000000-0000-0000-0000-0000000000a2','x','y','z')$q$));
  perform pg_temp.check_('audit log cannot be edited', pg_temp.affected($q$update public.audit_log set detail = 'changed'$q$) <= 0);
  perform pg_temp.check_('audit log cannot be deleted from', pg_temp.affected('delete from public.audit_log') <= 0);
  perform pg_temp.check_('instructor cannot delete another instructor''s class', pg_temp.raises($q$select public.delete_class('00000000-0000-0000-0000-0000000000c2')$q$));

  -- Class challenge, as instructor 1.
  perform pg_temp.check_('instructor sees only their own classes'' challenge rounds', pg_temp.count_of('select 1 from public.challenges') = 2);
  perform pg_temp.check_('instructor sees only their own classes'' challenge results', pg_temp.count_of('select 1 from public.challenge_results') = 2);
  perform pg_temp.check_('instructor cannot open a second round while one is open', pg_temp.raises($q$insert into public.challenges (class_id, passages) values ('00000000-0000-0000-0000-0000000000c1', '{"ma": {"drillId": "ma-gen-vitals", "seed": 9, "chartDate": "2026-11-12"}}')$q$));
  perform pg_temp.check_('instructor cannot open a round for another instructor''s class', pg_temp.raises($q$insert into public.challenges (class_id, passages, status) values ('00000000-0000-0000-0000-0000000000c2', '{"ma": {"drillId": "ma-gen-vitals", "seed": 9, "chartDate": "2026-11-12"}}', 'ended')$q$));
  perform pg_temp.check_('a round must have at least one passage', pg_temp.raises($q$insert into public.challenges (class_id, passages, status) values ('00000000-0000-0000-0000-0000000000c1', '{}', 'ended')$q$));
  perform pg_temp.check_('instructor cannot write challenge results', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  perform pg_temp.check_('instructor cannot change a round''s passages', pg_temp.raises($q$update public.challenges set passages = '{"rx": {"drillId": "rx-gen-labels", "seed": 1, "chartDate": "2026-11-12"}}' where id = '00000000-0000-0000-0000-0000000000e1'$q$));
  perform pg_temp.check_('an ended round cannot be reopened', pg_temp.raises($q$update public.challenges set status = 'open' where id = '00000000-0000-0000-0000-0000000000e2'$q$));
  perform pg_temp.check_('instructor cannot end another instructor''s round', pg_temp.affected($q$update public.challenges set status = 'ended' where id = '00000000-0000-0000-0000-0000000000e3'$q$) <= 0);
  perform pg_temp.check_('instructor can end their own round, and the end time is recorded', pg_temp.affected($q$update public.challenges set status = 'ended' where id = '00000000-0000-0000-0000-0000000000e1'$q$) = 1
    and pg_temp.count_of($q$select 1 from public.challenges where id = '00000000-0000-0000-0000-0000000000e1' and ended_at is not null$q$) = 1);
  perform pg_temp.check_('instructor can open a new round once the old one has ended', not pg_temp.raises($q$insert into public.challenges (class_id, passages) values ('00000000-0000-0000-0000-0000000000c1', '{"ma": {"drillId": "ma-gen-vitals", "seed": 9, "chartDate": "2026-11-12"}}')$q$));
  perform pg_temp.check_('instructor sees only their own class plans', pg_temp.count_of('select 1 from public.class_plans') = 1);
  perform pg_temp.check_('instructor can change their own class plan', pg_temp.affected($q$update public.class_plans set days = '{3,1,2}' where class_id = '00000000-0000-0000-0000-0000000000c1'$q$) = 1);
  perform pg_temp.check_('instructor cannot change another instructor''s class plan', pg_temp.affected($q$update public.class_plans set days = '{9}' where class_id = '00000000-0000-0000-0000-0000000000c2'$q$) <= 0);
  perform pg_temp.check_('instructor cannot create a plan for another instructor''s class', pg_temp.raises($q$insert into public.class_plans (class_id, days) values ('00000000-0000-0000-0000-0000000000c2', '{1}') on conflict (class_id) do update set days = excluded.days$q$));
  perform pg_temp.check_('a plan with a repeated day is rejected', pg_temp.raises($q$update public.class_plans set days = '{1,1}' where class_id = '00000000-0000-0000-0000-0000000000c1'$q$));
  perform pg_temp.check_('a plan with a day above 10 is rejected', pg_temp.raises($q$update public.class_plans set days = '{1,11}' where class_id = '00000000-0000-0000-0000-0000000000c1'$q$));
  perform pg_temp.check_('an empty plan is rejected', pg_temp.raises($q$update public.class_plans set days = '{}' where class_id = '00000000-0000-0000-0000-0000000000c1'$q$));
  perform pg_temp.check_('instructor can reset (delete) their own class plan', pg_temp.affected($q$delete from public.class_plans where class_id = '00000000-0000-0000-0000-0000000000c1'$q$) = 1);
  perform pg_temp.check_('instructor can save a plan again for their own class', not pg_temp.raises($q$insert into public.class_plans (class_id, days) values ('00000000-0000-0000-0000-0000000000c1', '{1,3,2}')$q$));
  reset role;

  ---------------------------------------------------------------- anonymous
  perform pg_temp.as_anon();
  perform pg_temp.check_('anonymous cannot read students', pg_temp.count_of('select 1 from public.students') <= 0);
  perform pg_temp.check_('anonymous cannot read attempts', pg_temp.count_of('select 1 from public.attempts') <= 0);
  perform pg_temp.check_('anonymous cannot insert attempts', pg_temp.raises($q$insert into public.attempts (student_id, kind, track, passage, wpm, accuracy, errors_left, seconds, completed, clean) values ('00000000-0000-0000-0000-0000000000d1','sprint','ma',0,1,1,0,1,true,false)$q$));
  perform pg_temp.check_('anonymous cannot call delete_class', pg_temp.raises($q$select public.delete_class('00000000-0000-0000-0000-0000000000c1')$q$));
  perform pg_temp.check_('anonymous cannot call the helper functions', pg_temp.raises('select public.my_student_id()') and pg_temp.raises('select public.is_instructor()'));
  perform pg_temp.check_('anonymous cannot read challenges or results', pg_temp.count_of('select 1 from public.challenges') <= 0 and pg_temp.count_of('select 1 from public.challenge_results') <= 0);
  perform pg_temp.check_('anonymous cannot submit a challenge result', pg_temp.raises($q$insert into public.challenge_results (challenge_id, student_id, display_name, track, wpm, accuracy, errors_left, seconds, clean) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'Fake F.', 'rx', 50, 99.0, 2, 60, true)$q$));
  perform pg_temp.check_('anonymous cannot read class plans', pg_temp.count_of('select 1 from public.class_plans') <= 0);
  perform pg_temp.check_('anonymous cannot read settings or classes', pg_temp.count_of('select 1 from public.settings') <= 0 and pg_temp.count_of('select 1 from public.classes') <= 0);
  reset role;

  ---------------------------------------------------------------- delete_class (owner)
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform public.delete_class('00000000-0000-0000-0000-0000000000c1');
  reset role;
  perform pg_temp.check_('delete_class removes the class and its students and their runs',
    (select count(*) from public.classes where id = '00000000-0000-0000-0000-0000000000c1') = 0
    and (select count(*) from public.students where owner_id = '00000000-0000-0000-0000-0000000000a1') = 0
    and (select count(*) from public.attempts where student_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2')) = 0
    and (select count(*) from public.notes) = 0);
  perform pg_temp.check_('delete_class removes the class''s challenge rounds and results',
    (select count(*) from public.challenges where class_id = '00000000-0000-0000-0000-0000000000c1') = 0
    and (select count(*) from public.challenge_results where challenge_id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2')) = 0
    and (select count(*) from public.challenges where id = '00000000-0000-0000-0000-0000000000e3') = 1);
  perform pg_temp.check_('delete_class leaves other instructors'' data alone',
    (select count(*) from public.students where username = 'threegamma') = 1
    and (select count(*) from public.attempts where student_id = '00000000-0000-0000-0000-0000000000d3') = 1);
  perform pg_temp.check_('delete_class removes that class''s plan and keeps the other''s',
    (select count(*) from public.class_plans where class_id = '00000000-0000-0000-0000-0000000000c1') = 0
    and (select count(*) from public.class_plans where class_id = '00000000-0000-0000-0000-0000000000c2') = 1);
end $t$;

select case when ok then 'PASS' else 'FAIL' end as result, name from results order by ok, name;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results;
rollback;
