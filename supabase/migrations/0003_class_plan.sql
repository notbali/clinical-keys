-- Per-class day plan: which original program days (1 to 10) a class is taught, and in what order.
-- A day left out of the list is skipped for that class (not assigned, not graded). Attempts and grades stay keyed by the
-- ORIGINAL day number and activity index, so nothing already saved moves. A class with no row follows the default Day 1 to 10.
--
-- STATUS: written but NOT applied or tested against a real database. Run supabase/tests/rls.sql locally before trusting it.

-- A valid plan is 1 to 10 distinct whole numbers, each from 1 to 10 (mirrors validatePlan in src/lib/plan.ts).
create or replace function public.valid_plan_days(d int[]) returns boolean
language sql immutable as $$
  select d is not null
    and cardinality(d) between 1 and 10
    and not exists (select 1 from unnest(d) x where x is null or x < 1 or x > 10)
    and (select count(distinct x) from unnest(d) x) = cardinality(d);
$$;

create table public.class_plans (
  class_id uuid primary key references public.classes (id) on delete cascade,
  days int[] not null check (public.valid_plan_days(days)),
  updated_at timestamptz not null default now()
);

-- Helpers (security definer so the policies do not depend on the caller being able to read classes/enrollments).
create or replace function public.owns_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = cid and owner_id = auth.uid());
$$;

create or replace function public.in_my_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments where class_id = cid and student_id = public.my_student_id());
$$;

alter table public.class_plans enable row level security;

-- The instructor who owns the class manages its plan.
create policy class_plans_owner on public.class_plans for all
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
-- A student can read (only) the plan of the class they are enrolled in.
create policy class_plans_student_read on public.class_plans for select using (public.in_my_class(class_id));

-- Explicit grants, in the style of migration 0002.
revoke all on public.class_plans from anon, authenticated;
grant select, insert, update, delete on public.class_plans to authenticated;

revoke execute on function public.valid_plan_days(int[]) from public, anon;
revoke execute on function public.owns_class(uuid) from public, anon;
revoke execute on function public.in_my_class(uuid) from public, anon;
grant execute on function public.valid_plan_days(int[]) to authenticated;
grant execute on function public.owns_class(uuid) to authenticated;
grant execute on function public.in_my_class(uuid) to authenticated;
