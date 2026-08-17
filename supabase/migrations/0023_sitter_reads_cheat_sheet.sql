-- 0023_sitter_reads_cheat_sheet.sql
-- A connected sitter can READ the cheat sheet. Nothing else changes.
--
-- The cheat sheet is a one-page summary of a care guide whose entire stated
-- purpose is the sitter — the empty state on that screen literally reads "Use
-- AI to create a quick reference summary of this guide FOR YOUR PET SITTER".
-- The sitter could not see it. 0007 gave cheat_sheets a single FOR ALL policy
-- gated on household membership, so select was locked to members along with
-- insert, update and delete. An owner would generate the sheet, hand over the
-- keys, and their sitter would open that screen to an empty state offering to
-- generate one that had already been written.
--
-- This is the same shape as 0015's reads on pets and guides: a sitter sees the
-- household's care information and writes none of it.
--
-- SELECT ONLY, and a separate policy rather than a widened one.
--
-- Generation is not a read. It spends the household's one free generation or
-- requires its Crown, and the entitlement belongs to the owner — so insert,
-- update and delete stay member-only, untouched, in the policy 0007 wrote.
-- Widening that policy's USING clause would have covered select and every
-- write in one edit; leaving it alone and adding a narrow companion means the
-- write boundary is still stated in exactly one place, and a future reader can
-- see at a glance which grant is which.
--
-- The generate-cheat-sheet Edge Function is unaffected: it upserts with the
-- service role, which bypasses RLS entirely, and does its own paywall check.

drop policy if exists "cheat_sheets: connected sitter can read" on public.cheat_sheets;
create policy "cheat_sheets: connected sitter can read"
  on public.cheat_sheets for select
  to authenticated
  using (
    exists (
      select 1 from public.guides g
      where g.id = cheat_sheets.guide_id
        and public.is_connected_sitter(g.household_id)
    )
  );
