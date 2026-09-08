-- 0029: a sitter can invite an owner, not only be invited by one.
--
-- WHY THIS DIRECTION MATTERS. Until now a sitter existed only because an owner
-- invited them. The roadmap's own note calls the reverse the best distribution
-- idea on the list: a professional sitter with twenty clients who invites them
-- is twenty qualified signups, from somebody with a direct financial interest
-- in those clients being organised.
--
-- IT IS A REQUEST, NEVER A GRANT. This table holds an ASKING. A sitter cannot
-- give themselves access to anybody's animals, home, door codes or WiFi by
-- filling in an email box; the owner accepts, and only then does a
-- sitter_connections row exist. That distinction is the whole security model of
-- this feature and it is why the invite does not name a household: at the moment
-- it is sent, the owner usually has no account at all, let alone a household.
--
-- WHY A SEPARATE TABLE from sitter_connections. That table joins a sitter to a
-- HOUSEHOLD, and a household is exactly what the invited owner does not have
-- yet. Widening it to allow a null household would put rows that grant nothing
-- in the table whose whole job is granting, and every policy reading it would
-- have to learn the difference.

create table if not exists public.sitter_owner_invites (
  id uuid primary key default gen_random_uuid(),
  sitter_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- The household the owner attached when they accepted. Null until then, and
  -- the audit trail for what this invite actually produced.
  household_id uuid references public.households(id) on delete set null
);

-- Same shape check the other invite tables carry (0021).
alter table public.sitter_owner_invites
  drop constraint if exists sitter_owner_invites_email_shape;
alter table public.sitter_owner_invites
  add constraint sitter_owner_invites_email_shape
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$');

-- One live ask per sitter per address. Re-inviting after a decline is allowed
-- (people change their minds); pestering with duplicates is not.
create unique index if not exists sitter_owner_invites_one_live
  on public.sitter_owner_invites (sitter_user_id, email)
  where status = 'invited';

create index if not exists sitter_owner_invites_by_email
  on public.sitter_owner_invites (email) where status = 'invited';

alter table public.sitter_owner_invites enable row level security;

-- The sitter sees the asks they made.
drop policy if exists "sitter reads own owner invites" on public.sitter_owner_invites;
create policy "sitter reads own owner invites"
  on public.sitter_owner_invites for select to authenticated
  using ((select auth.uid()) = sitter_user_id);

-- The invited person sees an ask addressed to their CONFIRMED address. Confirmed
-- and not merely claimed: an unverified address would let anyone register
-- someone else's email and read invitations meant for them.
drop policy if exists "invited owner reads their invite" on public.sitter_owner_invites;
create policy "invited owner reads their invite"
  on public.sitter_owner_invites for select to authenticated
  using (status = 'invited' and email = public.my_confirmed_email());

-- No insert/update/delete policies at all: every write goes through the definer
-- functions below, which is what keeps "who may ask" and "who may accept"
-- in one auditable place.

/**
 * A sitter asks an owner to connect.
 *
 * The client limit is enforced HERE as well as on acceptance. Without it a
 * sitter at zero clients could send twenty invitations and accept their way to
 * twenty free clients later, which is the paywall's most obvious back door.
 * Refusing at send time also puts the message in front of the person it is
 * about, rather than in front of an owner who has done nothing wrong.
 */
create or replace function public.invite_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_active integer;
begin
  if public.my_confirmed_email() is null then
    raise exception 'your account has no confirmed email address';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'invalid email format';
  end if;

  if v_email = public.my_confirmed_email() then
    raise exception 'that is your own address';
  end if;

  if not public.sitter_has_unlimited_clients(auth.uid()) then
    v_active := public.sitter_active_client_count(auth.uid());
    if v_active >= public.sitter_free_client_limit() then
      raise exception 'sitter_client_limit_reached (% of %)',
        v_active, public.sitter_free_client_limit()
        using errcode = 'check_violation';
    end if;
  end if;

  if exists (
    select 1 from public.sitter_owner_invites i
    where i.sitter_user_id = auth.uid()
      and i.email = v_email
      and i.status = 'invited'
  ) then
    raise exception 'already invited';
  end if;

  insert into public.sitter_owner_invites (sitter_user_id, email)
  values (auth.uid(), v_email)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.invite_owner(text) from public, anon;
grant execute on function public.invite_owner(text) to authenticated;

/** Asks addressed to the caller's confirmed address, with the sitter's name. */
create or replace function public.my_pending_owner_invites()
returns table (id uuid, sitter_user_id uuid, sitter_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         i.sitter_user_id,
         -- Falls back to the address rather than to nothing: "somebody wants
         -- access to your home" with no name is not a decision anyone can make.
         coalesce(nullif(p.full_name, ''), p.email, 'A pet sitter'),
         i.created_at
  from public.sitter_owner_invites i
  left join public.profiles p on p.id = i.sitter_user_id
  where i.status = 'invited'
    and i.email = public.my_confirmed_email()
  order by i.created_at desc
$$;

revoke all on function public.my_pending_owner_invites() from public, anon;
grant execute on function public.my_pending_owner_invites() to authenticated;

/**
 * The owner answers. Accepting is what creates the actual access.
 *
 * The sitter's client limit is checked again here, because an invite sent while
 * they had room can be accepted weeks later when they have none. If they are
 * full, the owner is told plainly rather than being handed a connection that
 * should not exist.
 */
create or replace function public.respond_to_owner_invite(invite uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row sitter_owner_invites%rowtype;
  v_household uuid;
  v_active integer;
  v_conn uuid;
begin
  if public.my_confirmed_email() is null then
    raise exception 'your account has no confirmed email address';
  end if;

  select * into v_row from public.sitter_owner_invites i
  where i.id = invite for update;

  -- "No such invite" and "not addressed to you" answer identically, so an id is
  -- never an existence oracle.
  if not found or v_row.email != public.my_confirmed_email()
     or v_row.status != 'invited' then
    raise exception 'invite not found';
  end if;

  if not accept then
    update public.sitter_owner_invites
      set status = 'declined', responded_at = now()
      where id = invite;
    return null;
  end if;

  v_household := public.my_primary_household();
  if v_household is null then
    raise exception 'you need a household before you can add a sitter';
  end if;

  if not public.sitter_has_unlimited_clients(v_row.sitter_user_id) then
    v_active := public.sitter_active_client_count(v_row.sitter_user_id);
    if v_active >= public.sitter_free_client_limit() then
      raise exception 'sitter_at_capacity';
    end if;
  end if;

  -- Already connected by the other direction in the meantime: settle the ask
  -- and hand back the connection that already exists rather than duplicating it.
  select sc.id into v_conn from public.sitter_connections sc
  where sc.household_id = v_household
    and sc.sitter_user_id = v_row.sitter_user_id
    and sc.status = 'active'
  limit 1;

  if v_conn is null then
    insert into public.sitter_connections (
      household_id, sitter_user_id, email, status, invited_by, responded_at
    ) values (
      v_household,
      v_row.sitter_user_id,
      coalesce((select p.email from public.profiles p where p.id = v_row.sitter_user_id),
               v_row.email),
      'active',
      auth.uid(),
      now()
    ) returning id into v_conn;
  end if;

  update public.sitter_owner_invites
    set status = 'accepted', responded_at = now(), household_id = v_household
    where id = invite;

  return v_conn;
end;
$$;

revoke all on function public.respond_to_owner_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_owner_invite(uuid, boolean) to authenticated;

/** A sitter withdraws an ask they have not had answered. */
create or replace function public.revoke_owner_invite(invite uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sitter_owner_invites
    set status = 'revoked', responded_at = now()
  where id = invite
    and sitter_user_id = auth.uid()
    and status = 'invited';
  return found;
end;
$$;

revoke all on function public.revoke_owner_invite(uuid) from public, anon;
grant execute on function public.revoke_owner_invite(uuid) to authenticated;
