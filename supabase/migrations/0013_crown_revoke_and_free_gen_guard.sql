-- ============================================================================
-- 0013 — Crown revocation (refunds) + the free-generation guard 0012 deferred
-- ============================================================================
-- This file closes the three gaps Loop 6 left between what the product PROMISES
-- and what the database ENFORCES. Two were named ahead of time — one in 0012's
-- own header, one in the public refund policy — and none had code.
--
--   1. THE FREE ALLOWANCE WAS CLIENT-RESETTABLE BY UPDATE. 0012 shipped
--      guides.free_generation_used_at as "server-authoritative by intent" and
--      documented, precisely, that nothing enforced the intent: `authenticated`
--      holds table-wide UPDATE on public.guides and 0007's member policy is FOR
--      ALL, so a member could PATCH the column back to NULL and replay the free
--      AI generation forever. Section 1 closes that PATCH — and UPDATE only.
--      This is the trigger 0012's header specified; the only thing that has
--      changed is that its precondition is now met (see below).
--
--      WHAT SECTION 1 DOES NOT COVER: INSERT. `authenticated` holds table-wide
--      INSERT on guides too, and this column is not server-assigned, so a
--      guide row is created carrying whatever value the client sent. The
--      shipped client reaches that path with data from a file: importData
--      (petsitter/src/services/SupabaseAdapter.ts) deletes and RE-CREATES every
--      guide from a user-supplied backup, spreading the file's own fields
--      into the insert, and validateImportPayload whitelists no keys — so a
--      guide restored from an edited backup arrives with whatever marker that
--      backup names, including NULL on a guide whose allowance was spent.
--      Section 1's trigger note says why an INSERT guard is the wrong tool
--      here. The CLIENT does not close it either, and that is a considered
--      position stated at the site: petsitter/src/services/SupabaseAdapter.ts
--      (importData, ~line 856) records that free_generation_used_at is
--      "deliberately NOT stripped, and must not be". Its argument is that the
--      column has no default, so stripping it would give EVERY restored guide a
--      NULL — a fresh allowance, i.e. an Export+Import tap in Settings becomes a
--      household-wide reset — while a hand-edited backup smuggles in exactly
--      that same NULL regardless. Stripping would punish the honest restore and
--      close nothing. So the INSERT path is knowingly left open on BOTH sides,
--      by agreement rather than by oversight, and neither side is waiting on
--      the other.
--
--      WHAT BOUNDS IT IS NOT THIS COLUMN. Per replay the cost is what 0012
--      priced — extra watermarked generations at ~4 cents each, on guides in
--      the caller's own household, no data or entitlement leak — and each
--      replay costs a full Export/Import round trip that deletes and re-creates
--      that household's guides, which is not a quiet loop. In AGGREGATE the
--      bound is the free-tier RATE CEILING that generate-cheat-sheet applies on
--      its free path (supabase/functions/generate-cheat-sheet, per ACCOUNT,
--      per rolling hour and day, answering 429 free_limit_reached). A ceiling
--      belongs there rather than here: it stands at the moment the money is
--      actually spent, so it holds however the marker got its value.
--      Since 0014 that ceiling is counted from the ai_free_generations ledger
--      keyed on auth.uid(), NOT from these markers — the ledger has RLS with
--      zero policies and no API-role grants, so a client can neither read,
--      write nor delete a row. That is what makes an INSERT-smuggled NULL a
--      non-event: it earns the new guide its own per-guide allowance and
--      nothing more, because the spend bound does not live on guide rows at
--      all and no amount of creating, copying, deleting or restoring guides
--      moves it. That function's header owns the exact numbers; this file
--      should not restate them.
--
--   2. REFUNDS REVOKED NOTHING. RefundScreen tells customers, as fact, that
--      after a refund "the household simply returns to the free tier" — sheets
--      watermarked again, regeneration needing Crown. grant_crown had no
--      counterpart, so a refunded customer kept Crown permanently and the
--      promise was false. Section 3 adds revoke_crown as its sibling, reversing
--      one PURCHASE per call (section 2's reversed_purchase is the link), since
--      a household can hold two grants and a refund of one of them must leave
--      the other's Crown standing.
--
--   3. CROWN WAS SELF-GRANTABLE, FREE, BY ANY AUTHENTICATED USER. 0012 read
--      0006's column-scoped `grant update (name)` as making the entitlement
--      columns unwritable by clients, and for UPDATE that is true — but the
--      line directly above it grants INSERT at TABLE level, which covers every
--      column and every column added later. One POST /rest/v1/households with
--      {"name":"x","created_by":"<own uid>","crown_until":"9999-12-31"} passes
--      0007's `with check (created_by = auth.uid())`, creates a household the
--      caller owns and is a member of, and has_crown() returns true for it
--      forever. Section 4 takes those three columns away from the API roles on
--      both INSERT and UPDATE.
--
-- WHY THE TRIGGER IS SAFE TO SHIP NOW (0012 deliberately withheld it)
--   0012 refused to land this trigger ahead of the service-role writer it
--   depends on, and the reason was not caution for its own sake:
--   generate-cheat-sheet logs a failed stamp and deliberately does NOT fail the
--   generation (a 500 there would tell a user their sheet failed when it
--   plainly did not). A trigger that rejected the stamp would therefore leave
--   the marker permanently unset and make EVERY generation free — a strictly
--   bigger hole than the one it closes.
--
--   That precondition has been checked against the merged function, not
--   assumed. supabase/functions/generate-cheat-sheet/index.ts builds a
--   SERVICE-ROLE client on the free path (`admin`, from
--   SUPABASE_SERVICE_ROLE_KEY) and uses it for BOTH sides of the allowance: the
--   marker read and the atomic conditional stamp
--   (`.update({free_generation_used_at}).eq('id', …).is('free_generation_used_at', null)`).
--   The legitimate writer is therefore `service_role`, never `authenticated`,
--   and section 1's test does not touch it. Every other guides write in that
--   function and in the app runs on the user-scoped client and never names this
--   column at all.
--
-- IDEMPOTENCY: ADD COLUMN and CREATE INDEX use IF NOT EXISTS, functions are
--   CREATE OR REPLACE with their grants re-asserted afterwards, and both
--   triggers are DROP IF EXISTS + CREATE (0006/0007's pattern). revoke_crown is
--   additionally preceded by a DROP IF EXISTS of its superseded 3-argument
--   signature, which CREATE OR REPLACE cannot reach and which would otherwise
--   linger as an ambiguous overload; that drop is a no-op everywhere the older
--   shape was never applied. There is no backfill and no data change:
--   re-running this file revokes Crown from nobody, grants it to nobody, and
--   neither spends nor refunds any household's free generation.
--   Section 4 is no exception — it constrains future writes only, and section
--   4's note says why no sweep of existing rows ships with it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. guides.free_generation_used_at is immutable to anon/authenticated
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER — and that is load-bearing, not a default left unset. The
-- whole test is `current_user`, and inside a SECURITY DEFINER function
-- current_user is the function's OWNER, not the role running the statement. A
-- SECURITY DEFINER version of this trigger would read `current_user` as the
-- migration owner for every caller alike, never match, and silently guard
-- nothing — the failure mode that looks exactly like success. It also needs no
-- elevated privilege: it reads NEW and OLD and raises, nothing more.
--
-- current_user rather than auth.uid(): PostgREST runs client requests as the
-- role in the JWT ('authenticated', or 'anon' with no session), and the
-- service-role key runs as 'service_role'. auth.uid() cannot tell those apart
-- — it is NULL for the service role AND for anon — so it would either block
-- the generator or let anon through. The role IS the distinction being drawn.
--
-- `is distinct from` rather than `<>`: NULL is the meaningful value here (an
-- unspent allowance), and `<>` is NULL-blind on both sides. It also means an
-- ordinary guide save that echoes the column back unchanged — updateGuide
-- spreads whatever `select('*')` returned — passes untouched. Only an actual
-- CHANGE is refused.
create or replace function public.guard_free_generation_marker()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.free_generation_used_at is distinct from old.free_generation_used_at
  then
    raise exception
      'guides.free_generation_used_at is set by the cheat-sheet generator and cannot be changed by %',
      current_user;
  end if;

  return new;
end;
$$;

-- Same discipline as 0007's trigger functions: no API role may call it
-- directly. Firing a trigger does not check EXECUTE on its function (that is
-- checked once, at CREATE TRIGGER), so revoking here does not disarm it.
revoke execute on function public.guard_free_generation_marker()
  from public, anon, authenticated;

-- BEFORE UPDATE OF that one column, and deliberately NOT INSERT.
--   * Scoping to the column means an UPDATE that never mentions it cannot even
--     reach the function — the common path pays nothing.
--   * INSERT is excluded because no INSERT guard can draw the line that
--     matters. An insert always produces a row with a NEW id and no link to
--     any predecessor, so the database cannot tell a genuinely new guide
--     (entitled to its own free generation) from a spent guide the client
--     deleted and re-created from a backup — importData does exactly that, and
--     the file header says so. Both candidate guards get it wrong: FORCING
--     NULL hands every insert a fresh allowance, which is the permissive
--     outcome already available; REJECTING a non-null value forbids the
--     STRICT value while still permitting the loose one, and breaks
--     importData, which re-creates every guide from a backup file carrying
--     that file's own value for this column. (duplicateGuide used to send it
--     too, by spreading `select('*')`; it now strips the column deliberately,
--     so a duplicate is a new guide with its own free sheet — the promise the
--     Terms and About pages make. importData is the only client path left
--     that sends a non-null value on INSERT.) The distinction lives in the
--     client's payload, so the guard does too.
-- Order against the other BEFORE triggers on guides does not matter: none of
-- them reads or writes this column.
drop trigger if exists guides_guard_free_generation on public.guides;
create trigger guides_guard_free_generation
  before update of free_generation_used_at on public.guides
  for each row execute function public.guard_free_generation_marker();

-- ----------------------------------------------------------------------------
-- 2. crown_purchases.reason / .reversed_purchase — what a reversal row is,
--    why, and WHICH sale it unwinds
-- ----------------------------------------------------------------------------
-- reason is NULL on every grant row; required and non-blank on every reversal
-- row. It is therefore also the DIRECTION discriminator: `where reason is not
-- null` is the reversals, and that is safe to rely on for the same reason 0012
-- put no CHECK
-- on crown_source — this column is only ever written by grant_crown and
-- revoke_crown, both service-role only, so no client value can arrive here.
--
-- A discriminator is needed and the sign of amount_cents cannot serve as one:
-- amount_cents is NULL for a founder or promo grant (no money moved) and NULL
-- again for the reversal of one, so the two would be indistinguishable in
-- exactly the cases a human is reading the ledger to understand.
--
-- No new grants appear on crown_purchases from these ALTERs: Supabase's default
-- privileges apply at CREATE TABLE, not ADD COLUMN, and 0012 already revoked
-- everything from public/anon/authenticated. The table stays service-role and
-- SECURITY DEFINER only.
alter table public.crown_purchases
  add column if not exists reason text;

-- reversed_purchase: the grant row this reversal unwinds. NULL on every grant
-- row, and NULL on the one reversal that has no purchase to name (the
-- hand-revoke path in section 3). It exists because a household can hold more
-- than one grant — the product plans for that, see section 3 — so "has this
-- sale been refunded?" is a question about a ROW, and nothing else in the table
-- can answer it: checkout_session_id is non-unique by design (0012), amounts
-- repeat, and the reversal's own event id says nothing about which charge it
-- reverses. `where reversed_purchase = <grant>.id` is that answer, and its
-- absence is what "still paid for" means to section 3.
--
-- ON DELETE SET NULL, self-referencing, for exactly the reason household_id and
-- user_id use it (0012): a row here is the record that MONEY MOVED, and a
-- cascade would let deleting one row destroy the record of another.
alter table public.crown_purchases
  add column if not exists reversed_purchase uuid
    references public.crown_purchases(id) on delete set null;

-- UNIQUE, and doing two jobs. (a) It is the FK's index — Postgres does not
-- create one for the referencing side, and Supabase's linter flags
-- `unindexed_foreign_keys`; section 3 also looks up by this column on every
-- call. (b) UNIQUE makes "a grant is reversed at most once" a database fact
-- rather than a promise in a function body, so no future caller can quietly
-- double-negate one sale. Postgres treats NULLs as distinct in a unique index
-- by default, so the many grant rows carrying NULL here do not collide — that
-- default is load-bearing and must not be turned into NULLS NOT DISTINCT.
create unique index if not exists crown_purchases_reversed_purchase_idx
  on public.crown_purchases (reversed_purchase);

-- ----------------------------------------------------------------------------
-- 3. revoke_crown — reverse ONE purchase and record that it was reversed
-- ----------------------------------------------------------------------------
-- The exact sibling of grant_crown: same SECURITY DEFINER shape, same pinned
-- search_path, same required idempotency key, same service-role-only grants,
-- same one-transaction guarantee that the ledger and the entitlement can never
-- disagree. Returns TRUE when this call revoked, FALSE when there was nothing
-- for it to revoke (p_event already recorded, or no unreversed sale to unwind
-- and no un-paid-for crown_until left standing either)
-- — and, like grant_crown, it does NOT raise on those, because a Stripe
-- redelivery of charge.refunded is normal traffic that must be answerable with
-- a clean 200.
--
-- p_reason is required for the same reason p_source is on the grant side: a
-- reversal nobody can later explain is worse than no record. 'refund',
-- 'chargeback', 'duplicate purchase' are the expected values; no CHECK pins
-- them, matching 0012's argument that the next legitimate value should not need
-- a migration.
--
-- IT REVERSES A PURCHASE, NOT A HOUSEHOLD, and that is the shape of the whole
-- function. A household CAN hold more than one grant row, and the product plans
-- for it in both directions: create-checkout-session answers a second checkout
-- with 409 already_crowned precisely because a second purchase buys nothing and
-- earns a refund request, and RefundScreen promises to refund a household that
-- "paid for twice". So a refund unwinds ONE SALE. Reversing the household's
-- whole ledger net instead — and then clearing crown_until unconditionally —
-- gets the two-grant case wrong twice over: on two +500 grants of which ONE is
-- refunded it would write a -1000 reversal, asserting we returned money we
-- still hold, and strip the Crown that the OTHER, un-refunded $5 still pays
-- for.
--
-- WHICH purchase — p_session, the Checkout session of the grant being reversed:
--   * GIVEN, and the webhook always gives it. The target is that session's
--     unreversed grant row FOR THIS HOUSEHOLD. If there is none — already
--     reversed, or never ours — the call is a clean no-op returning FALSE, and
--     nothing else in the household is touched. That is why the parameter
--     exists: handleReversal traces the charge's PaymentIntent back to its
--     Checkout session, matches that session against crown_purchases, and
--     passes that row's checkout_session_id here, so reversed_purchase names
--     the exact sale the money came from. Exactness is not a nicety — the
--     UNIQUE index on reversed_purchase means a reversal linked to the wrong
--     twin can never be re-pointed afterwards.
--   * OMITTED. The target is this household's OLDEST grant row that no reversal
--     already points at. p_session DEFAULTS to null rather than being required
--     because the calls made BY HAND have no session to name — reversing a
--     founder or promo grant, or the next bullet — and because PostgREST
--     resolves an RPC BY ARGUMENT NAME: a parameter that gained a default is
--     still found by a body that omits it, while a newly REQUIRED one would be
--     PGRST202 "could not find the function". That compatibility runs one way
--     only: the shipped webhook now sends four arguments, so this file must be
--     applied BEFORE that function is deployed, or every refund is a PGRST202.
--     On identically priced $5 sales the reversal is the same number either
--     way; naming the session only makes reversed_purchase point at the exact
--     twin.
--   * OMITTED, NO UNREVERSED GRANT LEFT, AND crown_until STILL STANDING — the
--     hand-revoke path. A crown_until predating the ledger, one forged through
--     the hole section 4 closes, or one forged back onto a household whose only
--     purchase was already refunded: none has a purchase to name, so this
--     records a reversal with no amount and clears the entitlement. Note what
--     the gate is — the LIVE entitlement, not the household's grant history.
--     Gating on "has this household ever held a grant" would refuse to strip a
--     Crown from anyone who ever bought, leaving that last forgery standing for
--     good, and section 4 ships no sweep of rows forged before its guard
--     existed. This IS the affordance section 4's "the ledger tells a human
--     which households ever paid and revoke_crown can take back any that did
--     not" depends on. It is also the only no-target case that writes anything,
--     and it writes at most once per forgery: with crown_until back to NULL the
--     next untargeted call finds nothing to take back and returns FALSE.
--
-- THE SIGN OF amount_cents: NEGATIVE, and specifically the negation of the ONE
-- grant row being reversed, read from that row rather than taken as a parameter
-- (so a reversal can never disagree with the charge it reverses because a
-- caller passed the wrong number). The property that buys is
--     select sum(amount_cents) from crown_purchases where household_id = $1
-- being the household's NET revenue at all times — +500 after a purchase, 0
-- after its refund, and +500 after one of two purchases is refunded — so
-- reconciliation is a sum with no join and no sign convention to remember.
--   * A grant with a NULL amount (founder or promo, where no money moved)
--     reverses to NULL. Recording 0 there would assert that a refund of nothing
--     happened; NULL says the same thing the grant row said.
--   * currency is copied from that same row, with the same guarantee and for
--     the same reason: it is the currency of the charge being reversed, and it
--     is NULL exactly when the grant's was. No parameter, and no scan of
--     unrelated rows that could stamp a founder grant's reversal with some
--     other purchase's currency.
--   * A second reversal event against a sale already reversed finds no target
--     and returns FALSE, writing nothing — it can no longer double-negate, and
--     the UNIQUE index on reversed_purchase (section 2) means no future caller
--     can either. (The single exception is the hand-revoke path above: an
--     untargeted call arriving while the household holds a crown_until no
--     purchase pays for strips it and records a NULL-amount reversal, which
--     moves the ledger's sum by nothing.) Two distinct refund events against
--     one charge is still a human-review case; the ledger just stays honest
--     without one.
--
-- CROWN COMES OFF ONLY WHEN NO UNREVERSED GRANT REMAINS. crown_until is cleared
-- after the reversal row lands, and only if this household has no grant row
-- left that nothing points at. The household that bought twice and refunded
-- once keeps the Crown its other purchase still pays for — which is what
-- create-checkout-session's 409 assumed all along.
--
-- PROVENANCE IS NOT CLEARED. crown_source and crown_granted_at survive a
-- revoke untouched: they record that this household once PAID, which is the
-- fact refund handling and chargeback defence both start from, and erasing it
-- on refund would destroy the evidence at the exact moment it becomes useful.
-- Only crown_until moves. Consequence worth knowing, because this function is
-- what first makes re-granting possible: grant_crown's provenance COALESCEs are
-- first-write-wins, so a household that refunds and later buys again keeps its
-- ORIGINAL crown_granted_at and source. That is the intended reading — the
-- origin story is the first grant — and the ledger holds the full sequence.
--
-- guides.free_generation_used_at IS NOT CLEARED, and this is a product
-- decision, not an omission. RefundScreen's promise is "each guide keeps its
-- one free cheat sheet": KEEPS, i.e. retains the sheet it already has, not
-- receives a fresh allowance. Sheets are stored unwatermarked and the PREVIEW
-- watermark is applied at render time (0012), so a refund needs no data change
-- at all for that sentence to be literally true — every generated sheet stays
-- exactly where it is and simply renders watermarked again.
--   * Guides that never spent their allowance (everything generated while
--     crowned, since the marker is only stamped on the free path) still have
--     it, so each of those can generate once more, free and watermarked. That
--     IS the free tier, and it is what "returns to the free tier" means.
--   * Guides that already spent it stay spent. Handing the allowance back would
--     make buy → generate → refund a repeatable free-generation loop at zero
--     net cost to the buyer — reopening from the server side the exact hole
--     section 1 just closed from the client side.
--
-- If p_household does not exist, the paths that reach the ledger insert raise
-- 23503 and the whole call rolls back, deliberately loud: a refund pointing at
-- a household that is gone needs a human, and swallowing it would lose the
-- record that money moved back. (A call naming a session gets there a different
-- way — no grant row matches a household that does not exist, so it returns
-- FALSE first, having changed nothing.) Same handling as grant_crown — the
-- webhook should log it and still answer 200 so Stripe stops retrying an event
-- that can never succeed.
--
-- Like grant_crown it is NOT a policy boundary and performs no authorization:
-- verifying the Stripe signature, confirming the refund is real, and deciding
-- which household it belongs to are the webhook's job, upstream of here.
-- The 3-argument shape from this migration's own earlier draft is dropped
-- first. CREATE OR REPLACE cannot change a parameter list — it would leave the
-- old function installed as a second OVERLOAD, and a PostgREST body of
-- {p_household, p_reason, p_event} would then match both candidates and fail
-- with PGRST203 rather than revoking anything. It is a no-op on any database
-- that never ran that draft.
drop function if exists public.revoke_crown(uuid, text, text);

create or replace function public.revoke_crown(
  p_household uuid,
  p_reason    text,
  p_event     text,
  p_session   text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_grant    uuid;
  v_amount   int;
  v_currency text;
begin
  -- The same three values with no safe default as on the grant side.
  if p_household is null then
    raise exception 'revoke_crown: household is required';
  end if;

  if p_event is null or btrim(p_event) = '' then
    raise exception 'revoke_crown: event id is required (it is the idempotency key)';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'revoke_crown: reason is required (e.g. refund, chargeback)';
  end if;

  -- Attribution only, resolved the same way and with the same best-effort
  -- spirit as grant_crown: a household with no owner row is still revoked, with
  -- a NULL user_id.
  select m.user_id
    into v_owner
    from public.household_members m
   where m.household_id = p_household
     and m.role = 'owner'
   order by m.created_at asc, m.user_id asc
   limit 1;

  -- THE PURCHASE BEING REVERSED (see header): one grant row of this household
  -- — `reason is null` is the direction discriminator section 2 defines — that
  -- no reversal already points at, narrowed to the caller's checkout session
  -- when one was named. Ordered oldest-first so the untargeted call is
  -- deterministic. Amount and currency are read here, from that row, and the
  -- select runs before the insert so the reversal cannot see itself.
  select p.id, p.amount_cents, p.currency
    into v_grant, v_amount, v_currency
    from public.crown_purchases p
   where p.household_id = p_household
     and p.reason is null
     and (p_session is null or p.checkout_session_id = p_session)
     and not exists (
           select 1
             from public.crown_purchases r
            where r.reversed_purchase = p.id
         )
   order by p.created_at asc, p.id asc
   limit 1;

  if v_grant is null then
    -- No unreversed sale to unwind. A call that NAMED a session stops here,
    -- always: that checkout is already reversed, or was never ours. So does an
    -- untargeted call against a household that is already un-crowned — which is
    -- what a redelivered or duplicate reversal finds once the first one landed.
    -- Both are clean no-ops — no ledger row, no entitlement change, FALSE —
    -- because a refund we have already honoured must still answer Stripe with a
    -- 200.
    --
    -- What falls through is the hand-revoke path: crown_until still standing
    -- while no unreversed grant pays for it. The gate is that LIVE entitlement,
    -- not the household's grant history, and the difference is the whole point
    -- — a household that bought and was refunded can have a crown_until forged
    -- back onto it (section 4 ships no sweep of rows forged before its guard),
    -- and gating on "has this household ever held a grant" would make that
    -- forgery permanently un-revokable.
    --
    -- Phrased as "already un-crowned?" rather than "still crowned?" so that a
    -- p_household naming no household row at all falls THROUGH to the insert
    -- and raises 23503, deliberately loud, exactly as the header promises.
    if p_session is not null
       or exists (
            select 1
              from public.households h
             where h.id = p_household
               and h.crown_until is null
          )
    then
      return false;
    end if;
  end if;

  -- Negation, and NULL-preserving: a founder or promo grant recorded no amount,
  -- so its reversal records none either.
  v_amount := - v_amount;

  -- The idempotency gate, identical in mechanism to grant_crown's: a
  -- redelivered event collides on the UNIQUE index, inserts nothing, and leaves
  -- FOUND false — which is what makes the household update below run at most
  -- once per event, whatever the select above resolved. checkout_session_id
  -- stays NULL because a refund is not a checkout, and because the webhook's
  -- reversal lookup finds a household by `in ('checkout_session_id', …)`: a
  -- session id here would let it match a reversal row and revoke against it.
  -- reversed_purchase is the link to the charge instead (section 2).
  insert into public.crown_purchases (
    stripe_event_id, checkout_session_id, household_id,
    user_id, amount_cents, currency, reason, reversed_purchase
  )
  values (
    p_event, null, p_household,
    v_owner, v_amount, v_currency, p_reason, v_grant
  )
  on conflict (stripe_event_id) do nothing;

  if not found then
    return false;
  end if;

  -- Reached only when the ledger row is ours, so this runs at most once per
  -- event — and only when this household has no PAID-FOR Crown left: a grant
  -- row that no reversal points at is a sale still standing, and it keeps the
  -- entitlement up on its own. The reversal just inserted already counts, so a
  -- household whose only purchase this was falls through to the update. (The
  -- hand-revoke path reaches it too, by construction: it only fell through the
  -- gate above because no unreversed grant remained.)
  --
  -- NULL rather than a past timestamp: has_crown tests `crown_until > now()`,
  -- which NULL never satisfies, and NULL is also what every never-crowned
  -- household already holds — so a revoked household is indistinguishable from
  -- a free one to every read path, which is exactly the "returns to the free
  -- tier" the refund policy promises. Provenance columns are deliberately left
  -- alone; the header says why.
  if not exists (
       select 1
         from public.crown_purchases g
        where g.household_id = p_household
          and g.reason is null
          and not exists (
                select 1
                  from public.crown_purchases r
                 where r.reversed_purchase = g.id
              )
     )
  then
    update public.households
       set crown_until = null
     where id = p_household;
  end if;

  return true;
end;
$$;

-- Service-role only, exactly as for grant_crown. The revoke from public is the
-- part that matters: EXECUTE on a new function is granted to PUBLIC by default,
-- so without it any API role could strip Crown from any household id it could
-- name — a free denial-of-entitlement against paying customers.
revoke all on function public.revoke_crown(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_crown(uuid, text, text, text)
  to service_role;

-- ----------------------------------------------------------------------------
-- 4. households entitlement columns are unwritable by the API roles
-- ----------------------------------------------------------------------------
-- THE HOLE THIS CLOSES: free permanent Crown for anyone with an account. 0012
-- recorded that "0006 already scoped `grant update (name)`, so section 2's two
-- new columns are unwritable by clients for free". That is true of UPDATE and
-- false of the row as a whole, because the line above it —
--     grant select, insert, delete on public.households to authenticated;
-- is a TABLE-level INSERT grant, and a table-level grant covers every column,
-- including ones added by a later migration: crown_until (0008), crown_source
-- and crown_granted_at (0012 §2). 0007's insert policy checks only
-- `with check (created_by = auth.uid())`, and no BEFORE INSERT trigger on
-- households existed to normalise the row. So a POST /rest/v1/households with
-- the anon key, the caller's own JWT and a body naming crown_until created a
-- household that the caller owns (0006's households_add_creator_as_owner makes
-- them its owner) and that is crowned to the sentinel — after which has_crown()
-- returns true for them, because its membership test passes. No payment, no
-- ledger row, permanent. Section 4 takes the three columns back.
--
-- SECURITY INVOKER, for exactly the reason section 1 documents and worth
-- re-checking rather than copying: the entire test is `current_user`, and
-- inside a SECURITY DEFINER function current_user is the function's OWNER, not
-- the role running the statement. A DEFINER version would see the migration
-- owner for every caller alike, match nobody, and guard nothing while looking
-- installed — the failure mode indistinguishable from success. The reasoning
-- holds here unchanged, and this trigger needs no privilege of its own: it
-- reads NEW and OLD, assigns to NEW, and raises.
--
-- THE LEGITIMATE WRITERS ALL PASS, checked one by one:
--   * grant_crown (0012 §4) and revoke_crown (section 3) are SECURITY DEFINER,
--     so their UPDATE on households runs as the migration owner and
--     current_user is never 'anon'/'authenticated' — whatever role called the
--     RPC. This is the same mechanism that lets them write past 0006's
--     column-scoped grant in the first place; if it did not hold, they could
--     not write these columns at all.
--   * households_add_creator_as_owner (0006) is AFTER INSERT and reads only
--     new.id / new.created_by, neither of which this trigger touches — so the
--     creator still becomes the owner of a household created through the API.
--   * handle_new_user (0006, SECURITY DEFINER) and 0006's backfill insert
--     households as the owner, and name none of these columns anyway.
--   * rename_household (0007, SECURITY DEFINER) and an owner's direct
--     `update (name)` both leave the three columns alone, and the column-scoped
--     trigger below does not even fire for them.
--   * service_role writes (the webhook's own client) run as 'service_role'.
--
-- FORCE ON INSERT, RAISE ON UPDATE — the asymmetry is deliberate. On INSERT
-- there is no prior value to defend and exactly one correct answer: a brand-new
-- household is not crowned. Forcing gives the honest client (which sends no
-- such keys) and the forged body the same, correct row, where raising would
-- turn any future client that POSTs a full row shape into an error for no
-- safety gain. On UPDATE a prior value EXISTS, so silently discarding a
-- requested change would hide either a bug or an attack behind a 200; raising
-- names it. Note the UPDATE arm is defence in depth today — 0006's
-- `grant update (name)` already means a client naming these columns is refused
-- with 42501 before any trigger runs — and it is what keeps that true if a
-- later migration ever widens the grant, which is precisely how this hole was
-- opened.
--
-- `is distinct from` rather than `<>` for the same reason as section 1: NULL is
-- the meaningful value (never crowned, and what revoke_crown restores), and
-- `<>` is NULL-blind on both sides.
--
-- NO SWEEP OF EXISTING ROWS, and that is a decision rather than an oversight.
-- crown_until has been live since 0008, so the window this closes was open
-- before this file, and a forged crown_until is indistinguishable IN THE DATA
-- from a legitimate pre-0012 manual grant: 0012 §2 notes that both columns
-- start NULL for every household crowned before provenance existed, so
-- "crowned with no source" cannot be read as "forged". Clearing those rows
-- would strip Crown from founders and hand-granted households; leaving them is
-- recoverable, since the ledger tells a human which households ever paid and
-- revoke_crown can take back any that did not.
create or replace function public.guard_household_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.crown_until      := null;
    new.crown_source     := null;
    new.crown_granted_at := null;
    return new;
  end if;

  if new.crown_until      is distinct from old.crown_until
     or new.crown_source     is distinct from old.crown_source
     or new.crown_granted_at is distinct from old.crown_granted_at
  then
    raise exception
      'households crown entitlement is set by grant_crown/revoke_crown and cannot be changed by %',
      current_user;
  end if;

  return new;
end;
$$;

-- Same discipline as section 1 and 0007's trigger functions: no API role may
-- call it directly. Firing a trigger does not check EXECUTE on its function
-- (that is checked once, at CREATE TRIGGER), so revoking here does not disarm
-- it.
revoke execute on function public.guard_household_entitlement()
  from public, anon, authenticated;

-- The UPDATE OF column list attaches to UPDATE only; INSERT always fires,
-- which it must, since the whole point is a row that names these columns when
-- it should not. Ordering against households_add_creator_as_owner is not a
-- concern: that one is AFTER INSERT, so it necessarily sees the row this
-- trigger has already normalised.
drop trigger if exists households_guard_entitlement on public.households;
create trigger households_guard_entitlement
  before insert or update of crown_until, crown_source, crown_granted_at
  on public.households
  for each row execute function public.guard_household_entitlement();
