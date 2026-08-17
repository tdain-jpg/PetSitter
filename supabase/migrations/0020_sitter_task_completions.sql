-- ============================================================================
-- 0020 — let a connected sitter actually tick tasks (0015 only half-did it)
-- ============================================================================
-- THE GAP
--   0015 gave connected sitters INSERT and DELETE on task_completions and
--   nothing else. The client does:
--       .upsert(row, { onConflict: 'guide_id,task_id,date' }).select('*').single()
--   which needs UPDATE (an upsert onto an existing row is an update) and SELECT
--   (the `.select('*')` returning clause, and reading today's state at all).
--   So a sitter could insert a completion once and then never see it, and
--   re-ticking anything already recorded failed outright.
--
--   Two pieces of SHIPPED copy promise this works: the sitter-welcome journey
--   card "Tick tasks as you go", and the owner's Household screen telling them
--   "Sitters can view ... and tick off tasks". This migration makes the app
--   honest rather than rewording the promise, because ticking tasks is most of
--   why a sitter has an account at all.
--
-- WHY THE MEMBER POLICY DID NOT ALREADY COVER IT
--   0007's "task_completions: household member can crud" is FOR ALL, but its
--   predicate is household MEMBERSHIP. A sitter is deliberately not a member,
--   so it never matched them. These policies sit alongside it — permissive
--   policies OR together, so an owner's access is untouched.
--
-- SCOPE — this is the sitter's ONLY write anywhere in the app
--   Everything else they can reach is read-only, and a completion row is the
--   least dangerous thing to let them write: it records that a task was done on
--   a date, cascades away with its guide, and carries no owner data. It is also
--   the whole point of the account.
--
-- IDEMPOTENCY: drop-then-create for both policies. Safe to re-run.
-- ============================================================================

-- Reading their own work back. Without this the sitter ticks a box, the row is
-- written, and the screen cannot show it — the tick appears to do nothing.
drop policy if exists "task_completions: connected sitter can read" on public.task_completions;
create policy "task_completions: connected sitter can read"
  on public.task_completions for select
  to authenticated
  using (
    public.is_connected_sitter(
      (select g.household_id from public.guides g where g.id = task_completions.guide_id)
    )
  );

-- The upsert path. USING decides which existing rows they may touch; WITH CHECK
-- decides what the row may look like afterwards. Both are the same test, so a
-- sitter can never move a completion to a guide in a household they are not
-- connected to.
drop policy if exists "task_completions: connected sitter can update" on public.task_completions;
create policy "task_completions: connected sitter can update"
  on public.task_completions for update
  to authenticated
  using (
    public.is_connected_sitter(
      (select g.household_id from public.guides g where g.id = task_completions.guide_id)
    )
  )
  with check (
    public.is_connected_sitter(
      (select g.household_id from public.guides g where g.id = task_completions.guide_id)
    )
  );
