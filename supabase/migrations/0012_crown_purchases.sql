-- ============================================================================
-- 0012 — Crown purchases: money ledger, grant provenance, free-generation mark
-- ============================================================================
-- THE MODEL
--   * CROWN is a $5 ONE-TIME purchase, per HOUSEHOLD, permanent. Not a
--     subscription, not per-user: the pet OWNER buys it and every member of
--     that household gets the premium features, read through the same
--     membership-gated has_crown(h) that 0008 introduced. (The sitter
--     subscription is a separate future product; it shares nothing with this
--     file and must not be conflated with it.) "Permanent" means it never
--     EXPIRES — it can still be reversed, by 0013's revoke_crown, when a
--     purchase is refunded or charged back.
--   * FREE TIER is ONE free generation PER GUIDE, rendered with a PREVIEW
--     watermark. Regenerating that same guide needs Crown. The allowance is
--     therefore per-GUIDE state, not per-user state, which is why the marker
--     lands on guides (section 3) and not on settings.
--   * Sheets are STORED UNWATERMARKED. The watermark is applied at RENDER
--     time only, so buying Crown unlocks the sheet the household already has
--     instantly — no regeneration, no second AI charge. That this file does
--     not touch cheat_sheets at all is the point: unlocking is a read-side
--     change, and there is nothing here to migrate when someone pays.
--   * CROWN_PURCHASES is the audit + idempotency ledger for money, and it is
--     service-role only, exactly like notifications_outbox (0008).
--
-- WHY A LEDGER, RATHER THAN JUST SETTING crown_until IN THE WEBHOOK
--   Stripe redelivers webhooks — on our 5xx, on our timeout, and on its own
--   at-least-once schedule. With no durable record of which events we have
--   already honoured, a retry is indistinguishable from a second purchase.
--   For a permanent entitlement the double GRANT happens to be harmless
--   (crown_until is set to a constant, never incremented), but the double
--   LEDGER row is not: it double-counts revenue and makes refund handling
--   ambiguous. So the UNIQUE constraint on stripe_event_id is the idempotency
--   key, and it is enforced by the DATABASE rather than by webhook code —
--   the webhook is precisely the thing that will be running twice.
--
-- crown_until FOR A PERMANENT GRANT: 9999-12-31, NOT 'infinity'
--   has_crown compares `crown_until > now()`, and BOTH values satisfy it
--   forever, so that comparison does not decide this. What decides it is
--   everything downstream, measured on postgres 16:
--     * to_jsonb('infinity'::timestamptz) is the STRING "infinity", which is
--       what PostgREST hands the client. new Date("infinity") is an Invalid
--       Date, so any future "Crown since"/"Crown until" label formats as
--       garbage — and src/lib/dates.ts is built for real dates, not sentinels.
--       The 9999 value serialises as "9999-12-31T00:00:00+00:00", which every
--       date path in the app parses normally.
--     * to_char('infinity'::timestamptz, 'YYYY-MM-DD') returns NULL rather
--       than raising — a silently blank label, the worst kind of bug to find
--       later, because nothing anywhere reports that it happened.
--     * ('infinity'::timestamptz - now()) RAISES 'cannot subtract infinite
--       timestamps'. Any "days remaining" arithmetic anyone ever writes
--       against this column would hard-error in production on exactly the
--       households that paid us.
--   9999-12-31 is ~8000 years out, which comfortably outlives the product,
--   and it is far enough from any real grant date to read unmistakably as a
--   sentinel in a support query. Code elsewhere that wants to ask "is this
--   permanent?" should compare against the literal below rather than
--   inventing its own.
--
-- ATTRIBUTION: crown_purchases.user_id IS THE HOUSEHOLD'S OWNER
--   grant_crown takes no buyer parameter and runs under the service role,
--   where auth.uid() is NULL — so the buyer cannot come from the caller's
--   identity. user_id is therefore resolved as the household's owner at grant
--   time. For a per-household entitlement bought by the pet owner that is the
--   right audit fact anyway, and unlike a user id carried in Stripe metadata
--   it cannot be influenced by the checkout payload. It is attribution for
--   reconciliation and support, never an authorization input: nothing reads
--   it back to decide anything. ON DELETE SET NULL, so deleting an account
--   blanks the attribution but never destroys the record that money moved —
--   and household_id follows the same rule for the same reason (section 1).
--
-- THE FREE-GENERATION MARKER IS FORGEABLE BY ITS OWN HOUSEHOLD UNTIL 0013
--   guides.free_generation_used_at (section 3) is server-authoritative by
--   INTENT, but the grant table does not enforce that intent and neither does
--   this file — 0013 does, with the trigger specified below. Verified against a
--   from-scratch build of 0001..0011: `authenticated` holds TABLE-WIDE UPDATE
--   on public.guides (Supabase's default privileges; no migration has ever
--   revoked it), and 0007's "guides: household member can crud" is FOR ALL
--   with is_household_member(household_id) on both sides. Any member of the
--   guide's household can therefore PATCH any column of that guide —
--   including one added today — and set free_generation_used_at back to NULL.
--
--   What that costs while it is open: one extra watermarked generation per
--   replay, i.e. one Claude call (~4 cents at generate-cheat-sheet's current
--   model/effort), by someone willing to craft a raw PostgREST call the app
--   never makes. It exposes nobody else's data and cannot reach another
--   household — the same membership predicate still gates the row. The blast
--   radius is our AI bill. Apply 0013 together with this file, not later.
--
--   It is NOT a column-scoped-grant problem. Contrast households: 0006
--   already scoped `grant update (name)`, so section 2's two new columns
--   cannot be UPDATED by clients for free (verified on the same build — but
--   only UPDATE; the line above it grants INSERT at table level, which is
--   the hole 0013 section 4 closes, and this paragraph originally missed).
--   guides has
--   no column-scoped grants at all, so closing this the same way means
--   revoking UPDATE and re-granting its other fifteen columns by name, after
--   which every future column starts unwritable and every existing guide
--   write is one missed grant away from breaking. That is the exact trade
--   0011's header refused for settings, and it is a bad one at 4 cents.
--
--   CHEAPEST CORRECT OPTION, and what 0013 ships, is one additive BEFORE
--   UPDATE trigger making the column immutable to the API roles:
--       if current_user in ('anon','authenticated')
--          and new.free_generation_used_at
--              is distinct from old.free_generation_used_at
--       then raise exception '...' ; end if;
--   current_user rather than auth.uid(): generate-cheat-sheet stamps the
--   marker with the SERVICE ROLE, so the real writer passes this test while a
--   PATCH carrying the app's own JWT does not. `is distinct from` means an
--   ordinary guide save that echoes the column back unchanged is unaffected.
--   No companion RPC is needed: that edge function already claims the
--   allowance atomically, with a conditional `update ... where
--   free_generation_used_at is null`, which is the test-and-set.
--
--   Why the trigger is not in this file: it must not land before the
--   service-role writer it depends on, and that writer was still in flight
--   alongside this migration. The ordering matters more than it looks —
--   generate-cheat-sheet logs a failed stamp and deliberately does NOT fail
--   the generation (returning 500 there would tell a user their sheet failed
--   when it plainly did not), so a trigger that rejected the stamp would
--   leave the marker permanently unset and make EVERY generation free: a
--   strictly bigger hole than the one it closes. That writer is now merged and
--   uses a service-role client for BOTH the marker read and the atomic stamp,
--   which is the precondition 0013 verified before guarding the column.
--
-- RLS IMPACT
--   * crown_purchases: RLS enabled with NO policies and NO API-role grants —
--     default deny for anon and authenticated. Only the service role (which
--     bypasses RLS) and grant_crown (SECURITY DEFINER, runs as the migration
--     owner, which owns the table; no table here uses FORCE ROW LEVEL
--     SECURITY) can reach it. See section 1 for why "no policy" is the
--     correct choice and not a missing one.
--   * households: two columns added, no policy touched. 0006's column-scoped
--     `grant update (name)` means clients cannot UPDATE them; they CAN name
--     them on INSERT, because 0006 grants INSERT at table level and a
--     table-level grant covers every column — including these. 0013 section 4
--     is the BEFORE INSERT OR UPDATE trigger that closes that, and until it
--     lands any authenticated user can create a household already crowned.
--     Reads are unaffected either way: 0007's "households: member can select"
--     means only members of that household see the columns, so no new
--     entitlement oracle — a non-member's SELECT still returns no row at all,
--     exactly as before.
--   * guides: one column added, covered by the existing member policy; see
--     the marker note above for what that means.
--   No policy is created, dropped or modified by this file, and no existing
--   policy changes which rows it matches.
--
-- IDEMPOTENCY: CREATE TABLE / CREATE INDEX / ADD COLUMN all use IF NOT
--   EXISTS, the function is CREATE OR REPLACE with its grants re-asserted
--   afterwards, and ENABLE ROW LEVEL SECURITY plus the GRANT/REVOKE
--   statements are naturally repeatable. There is no backfill and no data
--   change: re-running this file grants Crown to nobody, revokes it from
--   nobody, and consumes no household's free generation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. crown_purchases — the audit + idempotency ledger
-- ----------------------------------------------------------------------------
-- One row per honoured Stripe event. stripe_event_id is NOT NULL UNIQUE and
-- that constraint IS the idempotency key: a redelivered webhook collides,
-- grant_crown sees no inserted row, and returns false without touching the
-- entitlement (section 4).
--
-- checkout_session_id is deliberately NOT unique. Stripe can legitimately emit
-- more than one event for a single session (e.g. checkout.session.completed
-- followed by an async payment event), and a UNIQUE here would turn that
-- benign second event into a permanent 23505 the webhook can never clear —
-- Stripe would retry it until it gave up. The entitlement stays correct
-- regardless, because a permanent grant is an assignment and not an increment;
-- the only cost of two rows for one session is that revenue reconciliation
-- must group by checkout_session_id. The webhook should still call grant_crown
-- for exactly one event type, so in practice there is one row per purchase.
--
-- amount_cents / currency are recorded VERBATIM as Stripe reported them
-- (currency arrives lowercase, e.g. 'usd') and are nullable because a founder
-- or promo grant moves no money. They are a record of what was paid, never an
-- input to the grant: grant_crown does not check that amount_cents is 500,
-- because a price change, a promo code or a second currency would then
-- silently refuse to grant Crown to a customer who has already been charged.
--
-- household_id IS NULLABLE, ON DELETE SET NULL — matching user_id rather than
-- cascading, and for the same reason. A row here is the record that MONEY
-- MOVED, and the header's guarantee that deleting an account "blanks the
-- attribution but never destroys the record" is only worth anything if the
-- other FK cannot destroy the whole row a moment later. An owner tapping
-- "Delete household" would have done exactly that, taking the amount, the
-- currency, the Stripe event and the session id with it — the evidence needed
-- for a refund, a chargeback defence or a tax question, deleted by the party
-- with the most reason to want it gone. So deleting a household drops the
-- POINTER and keeps the row.
--
-- NULL therefore has exactly one meaning here — "the household this money was
-- for has since been deleted" — and nothing can write it deliberately:
-- grant_crown (section 4) and revoke_crown (0013) are the only writers and
-- both reject a null p_household outright. Readers were checked against it:
-- every lookup revoke_crown makes over this table — the grant row it is
-- reversing, and the test for whether any unreversed grant remains — filters
-- `household_id = p_household`, which never matches a NULL row (correct — an
-- orphaned row belongs to no live household, must not net against one, and
-- must not hold up a Crown), and the webhook's reversal lookup already treats a
-- missing household_id on the matched row as "nothing to revoke" rather than
-- passing it on.
create table if not exists public.crown_purchases (
  id                   uuid primary key default gen_random_uuid(),
  stripe_event_id      text not null unique,
  checkout_session_id  text,
  household_id         uuid references public.households(id) on delete set null,
  user_id              uuid references auth.users(id) on delete set null,
  amount_cents         int,
  currency             text,
  created_at           timestamptz not null default now()
);

-- Index both FKs. Postgres does not create indexes for the referencing side,
-- so without these the owner's "Delete household" action and an account
-- deletion (both ON DELETE SET NULL) each sequential-scan this table
-- while holding their locks — and Supabase's database linter flags both as
-- `unindexed_foreign_keys`. Same reasoning as 0011's settings FK index; the
-- table is small, so these are close to free.
create index if not exists crown_purchases_household_id_idx
  on public.crown_purchases (household_id);

create index if not exists crown_purchases_user_id_idx
  on public.crown_purchases (user_id);

-- RLS on, NO policies, NO API-role grants = default deny for everyone except
-- the service role and the SECURITY DEFINER function below, matching
-- notifications_outbox (0008).
--
-- "No policy" is the CORRECT choice here, not an omission. A policy only has
-- meaning for anon/authenticated, and no user-facing feature reads this table:
-- the app asks has_crown(household) for the entitlement and never needs the
-- receipts behind it. Adding even a read policy would make payment history
-- queryable over the REST API — a household's purchase dates, amounts and
-- Stripe identifiers — which is strictly more than the boolean the product
-- needs, and it is the same entitlement-oracle shape 0008 was careful to
-- avoid. If a receipts screen is ever built, the right shape is a
-- membership-gated SECURITY DEFINER RPC returning only that household's rows
-- and only the columns it renders, not a policy that opens the table.
alter table public.crown_purchases enable row level security;
revoke all on table public.crown_purchases from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. households.crown_source / crown_granted_at — grant provenance
-- ----------------------------------------------------------------------------
-- crown_until alone cannot answer "why is this household crowned?", and the
-- three ways it can happen need to stay distinguishable long after the fact:
-- 'stripe' (they paid, so a refund request is real and a chargeback is
-- possible), 'founder' (we granted it by hand) and 'promo'. Support answers
-- and revenue reconciliation both start from this question.
--
-- No CHECK constraint on the vocabulary. These columns are only ever written
-- by grant_crown, which is service-role only, so a typo cannot arrive from a
-- client; and pinning the list means the next grant kind (a gift, a support
-- make-good) needs a migration before it can be recorded. grant_crown rejects
-- a null or blank source instead, which is the failure that actually matters.
--
-- Nothing in this file grants Crown to anyone. Both columns start NULL for
-- every existing household, including any already crowned by a manual
-- pre-0012 UPDATE — grant_crown fills provenance in for the first grant it
-- sees, and a NULL source honestly means "granted before we recorded why".
alter table public.households
  add column if not exists crown_source text;

alter table public.households
  add column if not exists crown_granted_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. guides.free_generation_used_at — the per-guide free-generation marker
-- ----------------------------------------------------------------------------
-- NULL means this guide's one free (PREVIEW-watermarked) generation is still
-- available; a timestamp means it has been spent and regenerating this guide
-- needs Crown. Per-guide, because the free tier is per-guide: a household with
-- three guides gets three previews, one each.
--
-- SERVER-AUTHORITATIVE BY INTENT: it is to be written only by the edge
-- function that performs the generation, and never read back from the client
-- as permission to generate. A client-trusted allowance is trivially
-- replayable — the client would simply not send the flag — so the server must
-- decide, from this column, whether a generation is free, paid, or refused.
--
-- This file does not ENFORCE that intent: `authenticated` holds table-wide
-- UPDATE on guides and 0007's member policy is FOR ALL, so a member can clear
-- this column on their own guide with a hand-written API call. 0013 closes it
-- with a BEFORE UPDATE trigger that stops anon/authenticated CHANGING the
-- column (INSERT is a separate question its header answers) while leaving the
-- service-role stamp untouched; the file
-- header states why that is a separate migration and what the exposure is until
-- it lands. No index: the column is only ever read for a single guide already
-- being fetched by primary key.
alter table public.guides
  add column if not exists free_generation_used_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. grant_crown — record the payment and grant the entitlement, atomically
-- ----------------------------------------------------------------------------
-- Ledger insert and entitlement update happen in ONE transaction (a function
-- body is one), so the two can never disagree: there is no state where money
-- was recorded but Crown was not granted, or vice versa.
--
-- Returns TRUE when this call granted, FALSE when p_event was already
-- recorded. It deliberately does NOT raise on the duplicate: a webhook retry
-- is normal, expected traffic, and it must be able to answer Stripe with a
-- clean 200 rather than a 500 that schedules another retry.
--
-- p_event is a required, caller-chosen idempotency key, not a Stripe-only
-- field. For a founder or promo grant, pass something stable and
-- self-describing (e.g. 'founder:<household>:2026-08-15') so re-running the
-- same manual grant is a no-op for the same reason a webhook retry is.
--
-- Provenance is FIRST-WRITE-WINS (the COALESCEs below): these columns describe
-- how this household FIRST became crowned, and that fact never changes.
-- Letting a later promo or founder grant overwrite 'stripe' would erase the
-- fact that a household PAID, which is precisely the fact refund handling
-- depends on. Same rule after a reversal: a household that is refunded (0013's
-- revoke_crown, which leaves both columns alone) and later buys again keeps its
-- ORIGINAL source and granted_at. The ledger keeps the complete history; the
-- households row keeps the origin story.
--
-- If p_household does not exist, the ledger insert raises 23503 and the whole
-- call rolls back — deliberately loud, because a completed payment pointing at
-- a household that is gone is a refund case a human needs to see, and silently
-- swallowing it would discard money. The webhook should catch that one case,
-- log it for manual handling, and still answer 200 so Stripe stops retrying an
-- event that can never succeed.
--
-- SECURITY DEFINER: it must insert into a table with no API-role grants and
-- update households past 0006's column-scoped `grant update (name)`. It runs
-- as the migration owner, which owns both tables, and no table here uses FORCE
-- ROW LEVEL SECURITY — the same mechanism 0008's triggers and 0011's
-- primary_household_of already rely on. search_path is pinned per 0005.
--
-- It is NOT a policy boundary and performs no authorization of its own: it
-- trusts its caller completely, which is exactly why it is service-role only.
-- Verifying the Stripe signature, confirming the session was actually paid,
-- and deciding which household the payment belongs to are all the webhook's
-- job, upstream of here.
create or replace function public.grant_crown(
  p_household uuid,
  p_source    text,
  p_event     text,
  p_session   text default null,
  p_amount    int  default null,
  p_currency  text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- Argument guards. These are the three values with no safe default: a null
  -- household would fail confusingly at the FK, a null event id would defeat
  -- the idempotency the whole design rests on, and a null source would record
  -- a grant nobody can later explain.
  if p_household is null then
    raise exception 'grant_crown: household is required';
  end if;

  if p_event is null or btrim(p_event) = '' then
    raise exception 'grant_crown: event id is required (it is the idempotency key)';
  end if;

  if p_source is null or btrim(p_source) = '' then
    raise exception 'grant_crown: source is required (e.g. stripe, founder, promo)';
  end if;

  -- Attribution only (see header). Best-effort and non-fatal: a household with
  -- no owner row still gets its Crown, with a NULL user_id. Ordered so the
  -- result is deterministic if a household ever carries more than one owner.
  select m.user_id
    into v_owner
    from public.household_members m
   where m.household_id = p_household
     and m.role = 'owner'
   order by m.created_at asc, m.user_id asc
   limit 1;

  -- The idempotency gate. A redelivered event collides on the UNIQUE index and
  -- inserts nothing, leaving FOUND false. Under a genuine race the second
  -- transaction blocks on the index until the first commits, then also inserts
  -- nothing — so concurrent deliveries of one event cannot both grant.
  -- SECOND IDEMPOTENCY KEY: the SESSION, not just the event.
  --
  -- stripe_event_id alone is not enough. The webhook handles BOTH
  -- checkout.session.completed and checkout.session.async_payment_succeeded,
  -- and for a delayed payment method Stripe can send both for the SAME session
  -- under DIFFERENT event ids. Each would clear the on-conflict below and write
  -- its own +500 row, so one $5 sale would read as $10 of revenue — and a later
  -- refund reverses one grant row, leaving the household crowned and the ledger
  -- claiming money we no longer hold.
  --
  -- Returns false rather than raising, exactly like the duplicate-event case:
  -- a second event for a session we have already honoured is BENIGN, and the
  -- webhook must be able to answer 200 so Stripe stops redelivering it. This is
  -- also why checkout_session_id carries no UNIQUE constraint — a constraint
  -- would turn that benign event into a 23505 the webhook could never clear.
  --
  -- Matches ANY row for the session, deliberately, rather than only grant rows.
  -- Once 0013 adds reversals, a session that has been refunded also has a
  -- reversal row here, and a grant event arriving afterwards (Stripe does not
  -- guarantee ordering) must NOT re-crown a sale we already gave the money
  -- back for. A genuine second purchase always carries a new session.
  -- Written without reference to any 0013 column so this file still stands
  -- alone if it is ever applied on its own.
  if p_session is not null and exists (
    select 1
      from public.crown_purchases p
     where p.checkout_session_id = p_session
  ) then
    return false;
  end if;

  insert into public.crown_purchases (
    stripe_event_id, checkout_session_id, household_id,
    user_id, amount_cents, currency
  )
  values (
    p_event, p_session, p_household,
    v_owner, p_amount, p_currency
  )
  on conflict (stripe_event_id) do nothing;

  if not found then
    return false;
  end if;

  -- Reached only when the ledger row is ours, so this runs exactly once per
  -- event. The row is guaranteed to exist: the insert above just passed the
  -- household_id foreign key inside this same transaction.
  --
  -- 9999-12-31 is the permanent-Crown sentinel — a real, formattable, JSON-safe
  -- timestamp rather than 'infinity'. The header records the three concrete
  -- ways 'infinity' breaks downstream.
  update public.households
     set crown_until      = '9999-12-31T00:00:00+00'::timestamptz,
         crown_source     = coalesce(crown_source, p_source),
         crown_granted_at = coalesce(crown_granted_at, now())
   where id = p_household;

  return true;
end;
$$;

-- Service-role only. The revoke from public is what actually matters — EXECUTE
-- on a new function is granted to PUBLIC by default, so without it every API
-- role could mint Crown for any household id. service_role is then granted
-- explicitly rather than left to Supabase's default privileges, so the
-- function keeps working if those are ever tightened.
revoke all on function public.grant_crown(uuid, text, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.grant_crown(uuid, text, text, text, int, text)
  to service_role;
