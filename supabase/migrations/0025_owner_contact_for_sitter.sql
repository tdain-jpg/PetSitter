-- 0025_owner_contact_for_sitter.sql
-- Give the sitter a way to reach the owner.
--
-- A QA pass walked the sitter journey and ended on this: "the one thing I'd
-- actually want and couldn't find". The emergency contact has a tap-to-call
-- button. The vet has one. The person who owns the animal appears nowhere. A
-- pet that stops eating on day three leaves the sitter with a check-in note
-- nobody may read for hours, or the neighbour.
--
-- ROADMAP recorded three shapes. Option 1 (ask the owner to add themselves as
-- an emergency contact) shipped as a copy nudge in b7a5bb4, and option 3 (email
-- the owner when a check-in lands) shipped in 7l. This is option 2, which Tim
-- chose deliberately on 2026-09-06 because neither of those puts a number in
-- the sitter's hand at the moment they need it.
--
-- PER-CONNECTION, not per-account, and that is the whole design:
--
--   * The owner types the number they want THIS sitter to have. A dog walker
--     they use twice a year and a sister-in-law who has a key are not owed the
--     same access, and an account-level field cannot tell them apart.
--   * It dies with the connection. Revoking a sitter revokes the number, with
--     no separate cleanup to forget.
--   * It never touches auth.users or profiles, so nothing here can leak an
--     address the owner did not type on purpose.
--
-- Nullable, because an owner who does not want to share a number should be able
-- to invite a sitter anyway. The client says what the blank means rather than
-- pretending the field is mandatory.

alter table public.sitter_connections
  add column if not exists owner_contact text;

comment on column public.sitter_connections.owner_contact is
  'Phone or note the OWNER chose to expose to THIS sitter. Per-connection and '
  'revoked with it. Never populated from auth.users — only what the owner typed.';

-- Shape only, and generous: "555-0100 (cell, after 6pm)" is a more useful
-- answer than a bare number, and rejecting it would push owners into leaving
-- the field blank. The cap stops it becoming a free-text channel.
alter table public.sitter_connections
  drop constraint if exists sitter_connections_owner_contact_len;
alter table public.sitter_connections
  add constraint sitter_connections_owner_contact_len
  check (owner_contact is null or char_length(btrim(owner_contact)) between 7 and 120);

-- ---------------------------------------------------------------------------
-- invite_sitter gains the field.
--
-- DROPPED and recreated rather than CREATE OR REPLACE'd with a defaulted third
-- argument. Adding a default would leave TWO overloads of invite_sitter in the
-- catalog, and PostgREST resolves an RPC by argument NAME — a client sending
-- {h, sitter_email} would match both and get an ambiguity error rather than an
-- invitation. Every existing guard below is carried over verbatim from the live
-- definition; only the new argument and its insert are added.
-- ---------------------------------------------------------------------------
drop function if exists public.invite_sitter(uuid, text);

create function public.invite_sitter(
  h uuid,
  sitter_email text,
  owner_contact text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_email   text;
  v_contact text;
  v_id      uuid;
begin
  if not public.is_household_owner(h) then
    raise exception 'not authorized';
  end if;

  v_email := lower(btrim(coalesce(sitter_email, '')));

  -- Same message the household invite path raises, so the client's existing
  -- friendlyRpcError mapping covers both.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
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

  -- Blank and whitespace both mean "no number", not an empty string that would
  -- render as a contact row with nothing in it.
  v_contact := nullif(btrim(coalesce(owner_contact, '')), '');
  if v_contact is not null and char_length(v_contact) < 7 then
    raise exception 'contact too short';
  end if;

  insert into public.sitter_connections (household_id, email, status, invited_by, owner_contact)
  values (h, v_email, 'invited', auth.uid(), v_contact)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.invite_sitter(uuid, text, text) from public, anon;
grant execute on function public.invite_sitter(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The sitter's own list carries it.
--
-- my_sitter_connections is how the sitter screen learns anything, and it is
-- SECURITY DEFINER keyed on auth.uid(), so a sitter still sees only their own
-- connections — this adds a column to rows they could already read, not a new
-- row anywhere.
-- ---------------------------------------------------------------------------
drop function if exists public.my_sitter_connections();

create function public.my_sitter_connections()
returns table (
  id uuid,
  household_id uuid,
  household_name text,
  status text,
  starts_on date,
  ends_on date,
  owner_contact text
)
language sql
stable
security definer
set search_path = public
as $function$
  select sc.id, sc.household_id, h.name, sc.status, sc.starts_on, sc.ends_on,
         -- Only while the connection is live. A revoked sitter keeps the row
         -- in their history; they do not keep the phone number.
         case when sc.status = 'active' then sc.owner_contact end
    from public.sitter_connections sc
    join public.households h on h.id = sc.household_id
   where sc.sitter_user_id = auth.uid()
   order by h.name;
$function$;

revoke all on function public.my_sitter_connections() from public, anon;
grant execute on function public.my_sitter_connections() to authenticated;
