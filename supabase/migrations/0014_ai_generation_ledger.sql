-- ============================================================================
-- 0014 — ai_free_generations: an append-only ledger for the free-tier ceiling
-- ============================================================================
-- TWO RULES, TWO MECHANISMS. Conflating them is what made the second one wrong
-- three times running, so this file states the split once and generate-cheat-
-- sheet's header repeats it:
--
--   RULE 1 — ONE FREE SHEET PER GUIDE. The product promise: every guide earns
--     one free, PREVIEW-watermarked generation; regenerating THAT guide needs
--     Crown. Its state is guides.free_generation_used_at (0012 §3), made
--     immutable to anon/authenticated by 0013 §1. This file does not touch that
--     column, does not read it, and does not change that rule.
--
--   RULE 2 — THE FREE-TIER RATE CEILING. The abuse bound: a rolling cap on how
--     many free AI calls one ACCOUNT may charge us for. Rule 1 alone bounds
--     nothing, because guides are unlimited and free to create — create guide →
--     free sheet → repeat is unlimited claude-opus-5 at roughly 4 cents a call,
--     on our Anthropic bill. Its state is THIS TABLE, and nothing else.
--
-- WHY A NEW TABLE, AND WHY KEYED BY user_id
--   The ceiling previously counted stamped guides.free_generation_used_at
--   values within the guide's HOUSEHOLD. Three things were wrong with that, and
--   all three are properties of the counting basis rather than of the numbers:
--
--   a. THE SCOPE KEY WAS CLIENT-MINTABLE. A household costs nothing to create:
--      as `authenticated`, `insert into households (name, created_by) values
--      ('x', <own uid>)` satisfies 0007's "households: user can create own"
--      policy (with check created_by = auth.uid()) and 0006's table-wide insert
--      grant. So the cap capped nothing per ACCOUNT — mint household → create
--      guide → free sheet, forever. A per-GUIDE cap failed the same way one
--      level down. auth.uid() is where that regress stops: an account needs a
--      confirmable email (0007 already leans on my_confirmed_email() for
--      exactly this reason), which is not something a loop mints.
--
--   b. A MARKER IS NOT EVIDENCE OF AN AI CALL. importData re-creates every
--      guide carrying the backup file's own value for the column, so stamped
--      rows exist with no generation behind them. (duplicateGuide used to do
--      the same by spreading `select('*')`; it now strips the column, so a
--      duplicate is a new guide with its own free sheet.) Counting those
--      overcharges honest users while, per (c), the same user can zero the
--      count at will.
--
--   c. THE COUNTING BASIS WAS CLIENT-DELETABLE. Deleting a guide takes its
--      marker with it, and importData calls clearAllData FIRST — so restoring
--      any backup wipes every stamp the household had. A count the counted
--      party can delete is not a bound.
--
--   A row here is written by the edge function at the moment the money is
--   actually spent, keyed to the ACCOUNT that spent it, in a table the client
--   can neither read, write, nor delete. Minting households, duplicating
--   guides, deleting guides and importing a backup therefore all leave the
--   count exactly where it was.
--
-- APPEND-ONLY, AND WHAT THAT COSTS
--   Nothing ever updates or deletes a row here except the ON DELETE CASCADE
--   from auth.users below: when the account itself is gone there is no rate
--   window left to enforce and no per-user history worth keeping (unlike
--   crown_purchases, which records that MONEY MOVED and therefore keeps its row
--   with the pointer blanked — see 0012 §1). Cascading is safe against replay
--   for the same reason (a) works: coming back needs a new confirmable email.
--   Old rows age out of both windows on their own; a periodic prune of rows
--   older than the daily window would be a pure housekeeping change and is
--   deliberately not shipped here, since a few rows per account per day is
--   nothing and keeping them makes abuse investigable.
--
-- IDEMPOTENCY: CREATE TABLE / CREATE INDEX use IF NOT EXISTS, and ENABLE ROW
--   LEVEL SECURITY plus REVOKE are naturally repeatable. There is no backfill:
--   re-running this file grants nobody a generation and takes nobody's away.
--   Deliberately no backfill from existing free_generation_used_at stamps
--   either — per (b) those timestamps are not a reliable record of AI calls,
--   and starting the ledger empty costs at most one extra window's worth of
--   free generations for accounts that were mid-window at deploy time.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ai_free_generations — one row per free AI generation actually performed
-- ----------------------------------------------------------------------------
-- user_id is THE scope key and the only column the ceiling reads. NOT NULL:
-- a row that cannot be attributed to an account is a row that bounds nothing,
-- and the writer (generate-cheat-sheet) refuses the generation outright rather
-- than record one.
--
-- household_id and guide_id are DIAGNOSTIC ONLY — for answering "which
-- household was this spent on" in a support or abuse investigation. They are
-- deliberately NOT foreign keys. An FK would either cascade (deleting a guide
-- would delete its ledger rows, which is precisely defect (c) above, reopened
-- through the back door) or SET NULL (harmless to the count, but it makes
-- every guide/household delete take a row lock here and, unindexed, a
-- sequential scan — importData deletes every guide in the household, one
-- statement at a time). Neither buys anything: the ceiling never joins these
-- columns, and a dangling id in a diagnostic field still names the thing that
-- was deleted, which is more useful for an investigation than a NULL.
create table if not exists public.ai_free_generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid,
  guide_id      uuid,
  created_at    timestamptz not null default now()
);

-- The one query this table exists to answer, run on every free generation:
--   select created_at from ai_free_generations
--    where user_id = $1 and created_at > now() - '24 hours'
-- The composite makes that an index-only range scan of the few rows in the
-- window. It also covers the user_id side of the auth.users FK, so an account
-- deletion does not sequential-scan this table while holding its locks —
-- the `unindexed_foreign_keys` case 0012's FK indexes call out.
create index if not exists ai_free_generations_user_created_idx
  on public.ai_free_generations (user_id, created_at);

-- RLS on, NO policies, NO API-role grants = default deny for everyone except
-- the service role, exactly like notifications_outbox (0008) and
-- crown_purchases (0012 §1).
--
-- "No policy" is the whole point here, not an omission. The client having no
-- read is a privacy nicety; the client having no WRITE and no DELETE is the
-- security property the ceiling rests on. A select policy would additionally
-- hand out a precise "how many free generations do I have left" oracle, and a
-- write policy of any shape would return us to a count the counted party
-- controls. The app never needs either: it learns it is over the ceiling from
-- the edge function's 429, which carries the wait time already.
alter table public.ai_free_generations enable row level security;
revoke all on table public.ai_free_generations from public, anon, authenticated;
