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
  reset role;

  ---------------------------------------------------------------- anonymous
  perform pg_temp.as_anon();
  perform pg_temp.check_('anonymous cannot read students', pg_temp.count_of('select 1 from public.students') <= 0);
  perform pg_temp.check_('anonymous cannot read attempts', pg_temp.count_of('select 1 from public.attempts') <= 0);
  perform pg_temp.check_('anonymous cannot insert attempts', pg_temp.raises($q$insert into public.attempts (student_id, kind, track, passage, wpm, accuracy, errors_left, seconds, completed, clean) values ('00000000-0000-0000-0000-0000000000d1','sprint','ma',0,1,1,0,1,true,false)$q$));
  perform pg_temp.check_('anonymous cannot call delete_class', pg_temp.raises($q$select public.delete_class('00000000-0000-0000-0000-0000000000c1')$q$));
  perform pg_temp.check_('anonymous cannot call the helper functions', pg_temp.raises('select public.my_student_id()') and pg_temp.raises('select public.is_instructor()'));
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
  perform pg_temp.check_('delete_class leaves other instructors'' data alone',
    (select count(*) from public.students where username = 'threegamma') = 1
    and (select count(*) from public.attempts where student_id = '00000000-0000-0000-0000-0000000000d3') = 1);
end $t$;

select case when ok then 'PASS' else 'FAIL' end as result, name from results order by ok, name;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results;
rollback;
