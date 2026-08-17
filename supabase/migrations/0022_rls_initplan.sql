-- 0022_rls_initplan.sql
-- Stop re-evaluating auth.uid() once per row, and index two foreign keys that
-- are actually queried.
--
-- Supabase's performance linter flags nine policies under `auth_rls_initplan`.
-- The problem is subtle and only shows up with data: a bare `auth.uid()` inside
-- a policy is treated as a per-row expression, so a table scan calls it once
-- per candidate row. Wrapping it as `(select auth.uid())` makes the planner
-- hoist it into an InitPlan evaluated exactly once per query. Same semantics,
-- same result set — this is a planning hint, not a policy change.
--
-- Worth doing before launch specifically BECAUSE it is invisible now. With six
-- users every one of these tables fits on a page and the difference is
-- unmeasurable; the cost arrives later, quietly, on the tables every screen
-- reads. Changing RLS is easiest while there is nobody to break.
--
-- Every policy below is recreated verbatim from what production currently
-- carries (read out of pg_policies, not from the migration files, which have
-- drifted) with two changes only: `auth.uid()` becomes `(select auth.uid())`,
-- and the zero-argument `my_confirmed_email()` gets the same treatment for the
-- same reason. Function calls that take a column — is_household_owner(...),
-- is_household_member(...), is_connected_sitter(...) — are deliberately left
-- alone: they depend on the row, so they cannot be hoisted, and pretending
-- otherwise would be wrong rather than slow.
--
-- The roles on each policy are preserved exactly. Three of these are TO public
-- rather than TO authenticated; that is pre-existing and not this migration's
-- business to change (anon has no grants on these tables, so the practical
-- effect is the same), but silently narrowing it here would be a security
-- change smuggled inside a performance one.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
drop policy if exists "settings: owner can crud" on public.settings;
create policy "settings: owner can crud" on public.settings
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- onboarding_state
-- ---------------------------------------------------------------------------
drop policy if exists "onboarding_state: owner can crud" on public.onboarding_state;
create policy "onboarding_state: owner can crud" on public.onboarding_state
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
drop policy if exists "households: user can create own" on public.households;
create policy "households: user can create own" on public.households
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- household_members
--
-- The two arms stay in this order on purpose: "is this my own membership row"
-- is a column comparison against a hoisted constant, so it settles the common
-- case (leaving a household) without calling the definer function at all.
-- ---------------------------------------------------------------------------
drop policy if exists "household_members: leave or owner removes" on public.household_members;
create policy "household_members: leave or owner removes" on public.household_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_household_owner(household_id));

-- ---------------------------------------------------------------------------
-- sitter_connections
-- ---------------------------------------------------------------------------
drop policy if exists "sitter_connections: owner, sitter, or invitee can read" on public.sitter_connections;
create policy "sitter_connections: owner, sitter, or invitee can read" on public.sitter_connections
  for select using (
    public.is_household_owner(household_id)
    or sitter_user_id = (select auth.uid())
    or email = (select public.my_confirmed_email())
  );

-- ---------------------------------------------------------------------------
-- sitter_checkins
--
-- author_user_id is still pinned to the caller in WITH CHECK — that is what
-- stops a sitter posting a check-in under someone else's name, and it is doing
-- exactly the same job here as before, just without re-asking who the caller is
-- for every row considered.
-- ---------------------------------------------------------------------------
drop policy if exists "sitter_checkins: household and sitters can write" on public.sitter_checkins;
create policy "sitter_checkins: household and sitters can write" on public.sitter_checkins
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (public.is_household_member(household_id) or public.is_connected_sitter(household_id))
  );

drop policy if exists "sitter_checkins: author can delete own" on public.sitter_checkins;
create policy "sitter_checkins: author can delete own" on public.sitter_checkins
  for delete to authenticated
  using (author_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Foreign keys worth indexing
--
-- Only the two that are actually queried by guide id. share_links.guide_id is
-- read on every visit to the Share screen and is the column the ON DELETE
-- CASCADE has to scan when a guide is removed; sitter_checkins.guide_id is the
-- same story for the check-in feed.
--
-- The linter also flags households.created_by, household_invites.invited_by and
-- sitter_connections.invited_by. Those are attribution columns — nothing filters
-- or joins on them, and their parent rows are effectively never deleted. An
-- index there would be write cost buying nothing, so they are left unindexed on
-- purpose rather than by oversight.
-- ---------------------------------------------------------------------------
create index if not exists share_links_guide_id_idx
  on public.share_links (guide_id);

create index if not exists sitter_checkins_guide_id_idx
  on public.sitter_checkins (guide_id);
