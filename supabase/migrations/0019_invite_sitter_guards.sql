-- ============================================================================
-- 0019 — invite_sitter: refuse a household MEMBER, and say so in human words
-- ============================================================================
-- Browser QA found two things wrong with invite_sitter:
--
--   1. An owner could invite THEMSELVES as a sitter and it succeeded — their own
--      address appeared in their own sitter list, and accepting put their own
--      household under "My Clients". A member already has strictly more access
--      than a sitter, so a sitter connection for them is meaningless at best and
--      confusing at worst. invite_to_household (0007) has refused this since it
--      shipped; this function simply never learned to.
--
--   2. An invalid address surfaced as the raw string `invalid email format` —
--      lowercase, no guidance, straight out of RAISE and into a dialog. The
--      household path raises 'invalid email', which the client already maps to
--      friendly copy, so matching that text makes one existing mapping serve
--      both paths instead of needing a second.
--
-- Only the guards change. Signature, volatility, SECURITY DEFINER, search_path
-- and grants are all as 0015 left them.
-- ============================================================================

create or replace function public.invite_sitter(h uuid, sitter_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if not public.is_household_owner(h) then
    raise exception 'not authorized';
  end if;

  v_email := lower(btrim(coalesce(sitter_email, '')));

  -- Same message the household invite path raises, so the client's existing
  -- friendlyRpcError mapping covers both.
  if v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  -- A member already has more access than any sitter connection could grant.
  -- Checked against auth.users because a sitter is invited by EMAIL, and the
  -- membership we care about is that address's, not the caller's.
  if exists (
    select 1
      from public.household_members m
      join auth.users u on u.id = m.user_id
     where m.household_id = h
       and lower(u.email) = v_email
  ) then
    raise exception 'that person is already in this household';
  end if;

  if exists (
    select 1 from public.sitter_connections sc
     where sc.household_id = h
       and sc.email = v_email
       and sc.status in ('invited', 'active')
  ) then
    raise exception 'that email already has a live connection to this household';
  end if;

  insert into public.sitter_connections (household_id, email, status, invited_by)
  values (h, v_email, 'invited', auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.invite_sitter(uuid, text) from public, anon;
grant execute on function public.invite_sitter(uuid, text) to authenticated;
