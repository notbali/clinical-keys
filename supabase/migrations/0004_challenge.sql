-- Class challenge: a live round where a class types the same generated passage and a projector shows a leaderboard.
--
-- STATUS: written but NOT yet applied or tested against a real Supabase project. Run supabase/tests/rls.sql on a scratch
-- database before trusting it.
--
-- Model: an instructor opens a round for one of their classes (`challenges`). Students of that class insert one result
-- each (`challenge_results`) while the round is open. The database stamps who the student is, their track, a display
-- name of first name and last initial only (the results are shown on a classroom projector), the server clock, and
-- whether the run was clean, so a student cannot forge any of those.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  -- One passage per track: {"ma": {"drillId": "...", "seed": 1, "chartDate": "2026-11-12"}, "rx": {...}}. At least one.
  passages jsonb not null check (jsonb_typeof(passages) = 'object' and passages <> '{}'::jsonb and passages - 'ma' - 'rx' = '{}'::jsonb),
  status text not null default 'open' check (status in ('open', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on public.challenges (class_id, created_at desc);
-- A class has at most one open round at a time.
create unique index challenges_one_open_per_class on public.challenges (class_id) where status = 'open';

create table public.challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  -- "Maya S.": first name and last initial only. Set by the trigger below.
  display_name text not null,
  track public.track not null,
  wpm int not null check (wpm between 0 and 400),
  accuracy numeric(4, 1) not null check (accuracy between 0 and 100),
  errors_left int not null check (errors_left >= 0),
  seconds int not null check (seconds between 0 and 3600),
  revealed boolean not null default false,
  -- No errors left, accuracy 95 or better, answer not shown. Set by the trigger for a signed-in student.
  clean boolean not null,
  submitted_at timestamptz not null default now(),
  -- One result per student per round.
  unique (challenge_id, student_id)
);
create index on public.challenge_results (challenge_id, submitted_at);

-- ---------------------------------------------------------------------------
-- Helpers (security definer, so a policy can look at other tables without a student being able to read them)
-- ---------------------------------------------------------------------------
create or replace function public.my_class_id() returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from public.enrollments where student_id = public.my_student_id() order by start_date desc limit 1;
$$;

create or replace function public.owns_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = cid and owner_id = auth.uid());
$$;

create or replace function public.class_of_challenge(chid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from public.challenges where id = chid;
$$;

-- A round keeps its class and passages for life, never reopens once ended, and records when it ended.
create or replace function public.guard_challenge() returns trigger
language plpgsql as $$
begin
  if new.class_id <> old.class_id or new.passages <> old.passages or new.created_at <> old.created_at then
    raise exception 'A round''s class and passages cannot be changed';
  end if;
  if old.status = 'ended' and new.status = 'open' then
    raise exception 'An ended round cannot be reopened';
  end if;
  if new.status = 'ended' then
    new.ended_at := coalesce(old.ended_at, now());
  end if;
  return new;
end $$;
create trigger challenges_guard before update on public.challenges
  for each row execute function public.guard_challenge();

-- When a signed-in student submits a result: it is theirs, in their own class's open round, for a track the round has a
-- passage for. Name, track, clean flag and time come from the server. Server-side callers with no student session
-- (the service role, imports) keep the values they send.
create or replace function public.stamp_challenge_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.my_student_id();
  stu public.students%rowtype;
  ch public.challenges%rowtype;
begin
  if sid is not null then
    select * into stu from public.students where id = sid;
    select * into ch from public.challenges where id = new.challenge_id;
    if ch.id is null or ch.class_id is distinct from public.my_class_id() then
      raise exception 'That round was not found';
    end if;
    if ch.status <> 'open' then
      raise exception 'This round is closed';
    end if;
    if not (ch.passages ? stu.track::text) then
      raise exception 'This round has no passage for your track';
    end if;
    new.student_id := sid;
    new.track := stu.track;
    new.display_name := trim(stu.first_name) || case when length(trim(stu.last_name)) > 0 then ' ' || upper(left(trim(stu.last_name), 1)) || '.' else '' end;
    new.submitted_at := now();
    new.clean := new.errors_left = 0 and new.accuracy >= 95 and not new.revealed;
  end if;
  return new;
end $$;
create trigger challenge_results_stamp before insert on public.challenge_results
  for each row execute function public.stamp_challenge_result();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.challenges enable row level security;
alter table public.challenge_results enable row level security;

-- Instructors manage only their own classes' rounds.
create policy challenges_owner on public.challenges for all
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
-- Students read only their own class's rounds, and never write them.
create policy challenges_student_read on public.challenges for select using (class_id = public.my_class_id());

-- Instructors read the results of their own classes' rounds. They never write results.
create policy challenge_results_owner_read on public.challenge_results for select
  using (public.owns_class(public.class_of_challenge(challenge_id)));
-- Students read their classmates' results. The class only ever sees first name and last initial.
create policy challenge_results_student_read on public.challenge_results for select
  using (public.class_of_challenge(challenge_id) = public.my_class_id());
-- A student inserts only their own result, into an open round of their own class. The trigger overwrites student_id,
-- and runs before this check, so the check confirms the result really is theirs. The unique constraint allows one.
create policy challenge_results_self_insert on public.challenge_results for insert with check (
  student_id = public.my_student_id()
  and exists (select 1 from public.challenges c where c.id = challenge_id and c.status = 'open' and c.class_id = public.my_class_id())
);

-- ---------------------------------------------------------------------------
-- Explicit grants (see 0002_explicit_grants.sql)
-- ---------------------------------------------------------------------------
revoke all on public.challenges, public.challenge_results from anon, authenticated;
revoke all on function public.my_class_id(), public.owns_class(uuid), public.class_of_challenge(uuid) from public, anon, authenticated;
revoke all on function public.guard_challenge(), public.stamp_challenge_result() from public, anon, authenticated;

grant select, insert, update, delete on public.challenges to authenticated;
grant select, insert on public.challenge_results to authenticated; -- results are never edited or deleted from the app
grant execute on function public.my_class_id() to authenticated;
grant execute on function public.owns_class(uuid) to authenticated;
grant execute on function public.class_of_challenge(uuid) to authenticated;
