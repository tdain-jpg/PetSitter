-- ============================================================================
-- 0018 — my_crown_receipt(): answer "did I already pay for this?"
-- ============================================================================
-- Tim asked where a user sees their spend history. Deliberately NOT a history
-- screen: Crown is one $5 purchase, once, permanent, so a ledger view would
-- render a single row forever. What answers the real question is one line on
-- the Crown card Settings already shows — active, and when it was bought.
--
-- WHY AN RPC AND NOT A READ POLICY (0012's header called this in advance)
--   A SELECT policy on crown_purchases would expose amounts, Stripe event ids
--   and session ids over REST when the app needs a boolean and a date. This
--   returns the two facts the UI uses and nothing else.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN
--   Who paid. crown_purchases.user_id is DERIVED as the household's owner at
--   grant time (grant_crown takes no buyer argument), so surfacing it would
--   assert something that is not reliably true. A household member reading
--   "bought by X" where X did not buy it is worse than no attribution.
--
-- TELLS THE TRUTH AFTER A REFUND
--   0013's revoke_crown clears crown_until and writes a reversal row. This
--   reports `active` from the entitlement itself rather than from the presence
--   of a purchase, so a refunded household reads as inactive with the date of
--   the reversal — never a stale "active since".
--
-- IDEMPOTENCY: CREATE OR REPLACE + explicit re-grants. Safe to re-run.
-- RLS IMPACT: none. No policy added, dropped or modified.
-- ============================================================================

create or replace function public.my_crown_receipt(h uuid)
returns table (
  is_active   boolean,
  granted_at  timestamptz,
  source      text,
  refunded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The entitlement itself, not "a purchase exists" — see the header.
    (hh.crown_until is not null and hh.crown_until > now())        as is_active,
    hh.crown_granted_at                                            as granted_at,
    hh.crown_source                                                as source,
    (select max(p.created_at)
       from public.crown_purchases p
      where p.household_id = hh.id
        and p.reason is not null)                                  as refunded_at
  from public.households hh
  where hh.id = h
    -- Membership-gated exactly like has_crown, so this never becomes an oracle:
    -- a non-member gets no row at all, indistinguishable from a household that
    -- does not exist.
    and public.is_household_member(h);
$$;

revoke all on function public.my_crown_receipt(uuid) from public, anon;
grant execute on function public.my_crown_receipt(uuid) to authenticated;
