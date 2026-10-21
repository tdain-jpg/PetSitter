-- 0048 Live sitter features follow "asked to take this trip" (Tim, 2026-10-21).
--
-- 0045 limited free households to 2 sitter trips a year, but only counted
-- trips where the owner asked a sitter to take them. A sitter connected to
-- the household could still tick tasks and post check-ins on ANY current
-- guide without being asked, so the limit was easy to step around.
--
-- Now a connected sitter may tick tasks on a guide, and post check-ins, only
-- when they were asked to take that trip (requested or accepted), or when the
-- household has Plus (which includes complimentary Plus). READING is
-- unchanged: a connected sitter still sees every pet and guide, and the share
-- link stays free and unlimited. Household members are unaffected.

create or replace function public.sitter_can_work_guide(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guides gg
     where gg.id = g
       and public.is_connected_sitter(gg.household_id)
       and (
         public.household_has_plus(gg.household_id)
         or exists (select 1 from public.sitter_connections sc
                     where sc.id = gg.sitter_connection_id
                       and sc.sitter_user_id = auth.uid()
                       and sc.status = 'active'
                       and gg.sitter_status in ('requested', 'accepted'))
       )
  );
$$;
revoke all on function public.sitter_can_work_guide(uuid) from public, anon;
grant execute on function public.sitter_can_work_guide(uuid) to authenticated;

-- Check-ins belong to a household, not a guide: allowed with Plus, or while
-- the sitter has a trip there that has not ended (a day's grace after).
create or replace function public.sitter_can_work_household(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_connected_sitter(h)
     and (
       public.household_has_plus(h)
       or exists (select 1 from public.guides gg
                    join public.sitter_connections sc on sc.id = gg.sitter_connection_id
                   where gg.household_id = h
                     and sc.sitter_user_id = auth.uid()
                     and sc.status = 'active'
                     and gg.sitter_status in ('requested', 'accepted')
                     and (gg.end_date is null or gg.end_date >= current_date - 1))
     );
$$;
revoke all on function public.sitter_can_work_household(uuid) from public, anon;
grant execute on function public.sitter_can_work_household(uuid) to authenticated;

/** Every guide the caller may work as a sitter: what Today lists. */
create or replace function public.my_workable_guide_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gg.id
    from public.guides gg
    join public.sitter_connections sc on sc.household_id = gg.household_id
   where sc.sitter_user_id = auth.uid()
     and sc.status = 'active'
     and public.sitter_can_work_guide(gg.id);
$$;
revoke all on function public.my_workable_guide_ids() from public, anon;
grant execute on function public.my_workable_guide_ids() to authenticated;

-- Ticking tasks: insert, update and delete now need a workable guide.
drop policy if exists "task_completions: connected sitter can insert" on public.task_completions;
create policy "task_completions: connected sitter can insert"
  on public.task_completions for insert
  with check (public.sitter_can_work_guide(guide_id));

drop policy if exists "task_completions: connected sitter can delete" on public.task_completions;
create policy "task_completions: connected sitter can delete"
  on public.task_completions for delete
  using (public.sitter_can_work_guide(guide_id));

drop policy if exists "task_completions: connected sitter can update" on public.task_completions;
create policy "task_completions: connected sitter can update"
  on public.task_completions for update
  to authenticated
  using (public.sitter_can_work_guide(task_completions.guide_id))
  with check (public.sitter_can_work_guide(task_completions.guide_id));

-- Check-ins: members as before; sitters only on a household they may work.
drop policy if exists "sitter_checkins: household and sitters can write" on public.sitter_checkins;
create policy "sitter_checkins: household and sitters can write"
  on public.sitter_checkins for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and (
      public.is_household_member(household_id)
      or public.sitter_can_work_household(household_id)
    )
  );
