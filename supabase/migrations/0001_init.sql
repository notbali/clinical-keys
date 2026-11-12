-- Clinical Keys: initial schema, row-level security and helper functions.
--
-- STATUS: written but NOT yet applied or tested against a real Supabase project.
-- Apply it to a scratch project first and run the checks in docs/BACKEND.md before trusting it.
--
-- Model: one instructor account owns classes and students. Students never read tables directly
-- before they have a session; the `student-login` Edge Function (see docs/BACKEND.md) checks a username
-- with the service role and returns a student-scoped session. After that, row-level security limits
-- a student to their own rows.

create type public.track as enum ('ma', 'rx');

create table public.instructors (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.instructors (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.instructors (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9]+$'),
  first_name text not null,
  last_name text not null,
  track public.track not null,
  -- Blackboard username, used to line up the CSV export (and later the LTI link).
  external_id text,
  status text not null default 'active' check (status in ('active', 'archived')),
  -- The Supabase auth user that represents this student's session. Created by the Edge Function.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  start_date date not null,
  exit_date date
);
create index on public.enrollments (student_id);
create index on public.enrollments (class_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('drill', 'sprint')),
  track public.track not null,
  drill_id text,
  passage int not null default 0 check (passage >= 0),
  day int check (day between 1 and 30),
  act int check (act >= 0),
  wpm int not null check (wpm between 0 and 400),
  accuracy numeric(4, 1) not null check (accuracy between 0 and 100),
  errors_left int not null check (errors_left >= 0),
  seconds int not null check (seconds between 0 and 3600),
  completed boolean not null,
  clean boolean not null,
  revealed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.attempts (student_id, created_at desc);

create table public.grade_overrides (
  student_id uuid primary key references public.students (id) on delete cascade,
  value int not null check (value between 0 and 100),
  reason text not null check (length(trim(reason)) > 0),
  set_by uuid not null references public.instructors (id),
  set_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  author_id uuid not null references public.instructors (id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.instructors (id),
  action text not null,
  subject text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

-- Targets, grade weights, school closings and the Blackboard link, one row per instructor.
create table public.settings (
  owner_id uuid primary key references public.instructors (id) on delete cascade,
  data jsonb not null
);

-- Failed student sign-in guesses, used for rate limiting. Only the Edge Function (service role) touches it.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  client text not null,
  username text,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.login_attempts (client, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_instructor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.instructors where id = auth.uid());
$$;

create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where auth_user_id = auth.uid() and status = 'active';
$$;

create or replace function public.owns_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students where id = sid and owner_id = auth.uid());
$$;

-- When a signed-in student inserts an attempt, force it to be theirs and stamp the server clock.
-- Server-side callers with no student session (the service role, imports) keep the values they send.
create or replace function public.stamp_attempt() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_student_id();
begin
  if sid is not null then
    new.student_id := sid;
    new.created_at := now();
  end if;
  return new;
end $$;
create trigger attempts_stamp before insert on public.attempts
  for each row execute function public.stamp_attempt();

-- Deleting a class removes its students too (and, by cascade, their runs, notes and overrides).
create or replace function public.delete_class(class_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select owner_id into owner from public.classes where id = class_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'Class not found';
  end if;
  delete from public.students where id in (select student_id from public.enrollments where enrollments.class_id = delete_class.class_id);
  delete from public.classes where id = class_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.instructors enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.attempts enable row level security;
alter table public.grade_overrides enable row level security;
alter table public.notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.settings enable row level security;
alter table public.login_attempts enable row level security; -- no policies: nobody but the service role

create policy instructors_self on public.instructors for select using (id = auth.uid());

create policy classes_owner on public.classes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy students_owner on public.students for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy students_self on public.students for select using (id = public.my_student_id());

create policy enrollments_owner on public.enrollments for all
  using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy enrollments_self on public.enrollments for select using (student_id = public.my_student_id());

create policy attempts_owner_read on public.attempts for select using (public.owns_student(student_id));
create policy attempts_self_read on public.attempts for select using (student_id = public.my_student_id());
-- The insert trigger overwrites student_id, so the check only has to confirm a student is signed in.
create policy attempts_self_insert on public.attempts for insert with check (public.my_student_id() is not null);

create policy overrides_owner on public.grade_overrides for all
  using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy overrides_self_read on public.grade_overrides for select using (student_id = public.my_student_id());

create policy notes_owner on public.notes for all
  using (public.owns_student(student_id)) with check (public.owns_student(student_id) and author_id = auth.uid());

create policy audit_owner_read on public.audit_log for select using (actor_id = auth.uid());
create policy audit_owner_insert on public.audit_log for insert with check (actor_id = auth.uid());

create policy settings_owner on public.settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy settings_student_read on public.settings for select
  using (owner_id = (select owner_id from public.students where id = public.my_student_id()));
