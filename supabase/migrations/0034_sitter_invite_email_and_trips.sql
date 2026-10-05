-- 0034 Email the sitter, and let owners ask a sitter to take a trip.
--
-- Two gaps found by Tim inviting his real sitter on 2026-10-04:
--
-- 1. Inviting a sitter sent no email. The app told the owner "we don't email
--    sitter invites yet, so let them know it's waiting", which is how a real
--    invitation ends up never seen. Now an invitation queues a branded email,
--    the same way household and owner invites already do (0008, 0030).
--
-- 2. A sitter connection is household-wide and open-ended, so there was no way
--    to say "will you look after the dogs for THIS trip", and nowhere for a
--    sitter to see the trips they have agreed to. Now a guide (a trip) can name
--    one sitter: the owner asks, the sitter accepts or declines, both are told
--    by email, and accepted trips appear under Upcoming trips on the sitter's
--    home.

-- ---------------------------------------------------------------------------
-- Outbox kinds
-- ---------------------------------------------------------------------------
alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_kind;
alter table public.notifications_outbox
  add constraint notifications_outbox_kind
  check (kind in ('invite', 'share_opened', 'trip_incomplete', 'sitter_checkin',
                  'sitter_wants_to_connect', 'sitter_invite', 'trip_request',
                  'trip_response'));

-- Who to say the email is from: their name if they gave one, else their email.
create or replace function public.person_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), lower(u.email))
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = p_user;
$$;
revoke all on function public.person_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Sitter invitation email
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_sitter_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  select
    'sitter_invite',
    new.email,
    jsonb_build_object(
      'inviter_name',   public.person_label(new.invited_by),
      'household_name', h.name,
      'has_account',    exists (select 1 from auth.users u where lower(u.email) = lower(new.email))
    ),
    'sitter_invite:' || new.id::text
  from public.households h
  where h.id = new.household_id
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;
revoke all on function public.enqueue_sitter_invite_email() from public, anon, authenticated;

drop trigger if exists sitter_connections_invite_email on public.sitter_connections;
create trigger sitter_connections_invite_email
  after insert on public.sitter_connections
  for each row when (new.status = 'invited')
  execute function public.enqueue_sitter_invite_email();

-- ---------------------------------------------------------------------------
-- 2. A sitter for a trip
-- ---------------------------------------------------------------------------
alter table public.guides
  add column if not exists sitter_connection_id uuid
    references public.sitter_connections (id) on delete set null,
  add column if not exists sitter_status text,
  add column if not exists sitter_requested_by uuid
    references auth.users (id) on delete set null,
  add column if not exists sitter_responded_at timestamptz;

alter table public.guides drop constraint if exists guides_sitter_status;
alter table public.guides add constraint guides_sitter_status
  check (
    (sitter_connection_id is null and sitter_status is null)
    or (sitter_connection_id is not null and sitter_status in ('requested', 'accepted', 'declined'))
  );

create index if not exists guides_sitter_connection_idx
  on public.guides (sitter_connection_id) where sitter_connection_id is not null;

/**
 * The four sitter columns are written ONLY by the two functions below. A
 * household member can update a guide freely, so without this an owner's
 * client (or the guide form's auto-save replaying an old copy) could mark a
 * trip "accepted" that the sitter never saw, or silently undo an assignment.
 * Any other write to these columns is quietly put back.
 */
create or replace function public.guides_protect_sitter_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('pawstructions.trip_sitter_write', true) is distinct from 'on' then
    if tg_op = 'INSERT' then
      new.sitter_connection_id := null;
      new.sitter_status := null;
      new.sitter_requested_by := null;
      new.sitter_responded_at := null;
    else
      new.sitter_connection_id := old.sitter_connection_id;
      new.sitter_status := old.sitter_status;
      new.sitter_requested_by := old.sitter_requested_by;
      new.sitter_responded_at := old.sitter_responded_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guides_protect_sitter_columns on public.guides;
create trigger guides_protect_sitter_columns
  before insert or update on public.guides
  for each row execute function public.guides_protect_sitter_columns();

/**
 * Owner side: ask a sitter to take this trip, or clear it (p_connection null).
 * The sitter must be one of THIS household's sitters, invited or connected.
 * Re-asking the same sitter after a decline puts it back to "requested".
 */
create or replace function public.set_trip_sitter(p_guide uuid, p_connection uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_title text;
  v_start date;
  v_end date;
  v_email text;
  v_conn_status text;
begin
  select g.household_id, g.title, g.start_date, g.end_date
    into v_household, v_title, v_start, v_end
    from public.guides g where g.id = p_guide;
  if v_household is null or not public.is_household_member(v_household) then
    raise exception 'guide not found';
  end if;

  perform set_config('pawstructions.trip_sitter_write', 'on', true);

  if p_connection is null then
    update public.guides
       set sitter_connection_id = null, sitter_status = null,
           sitter_requested_by = null, sitter_responded_at = null
     where id = p_guide;
    perform set_config('pawstructions.trip_sitter_write', 'off', true);
    return null;
  end if;

  select sc.email, sc.status into v_email, v_conn_status
    from public.sitter_connections sc
   where sc.id = p_connection and sc.household_id = v_household;
  if v_email is null or v_conn_status not in ('invited', 'active') then
    raise exception 'that sitter is not connected to this household';
  end if;

  update public.guides
     set sitter_connection_id = p_connection, sitter_status = 'requested',
         sitter_requested_by = auth.uid(), sitter_responded_at = null
   where id = p_guide;
  perform set_config('pawstructions.trip_sitter_write', 'off', true);

  -- Tell the sitter. Keyed on guide + connection + time so asking again after
  -- a decline sends a fresh email instead of being swallowed as a duplicate.
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  select 'trip_request', v_email,
         jsonb_build_object(
           'inviter_name',     public.person_label(auth.uid()),
           'household_name',   h.name,
           'guide_title',      v_title,
           'start_date',       v_start,
           'end_date',         v_end,
           'pending_household', v_conn_status = 'invited'
         ),
         'trip_request:' || p_guide::text || ':' || p_connection::text || ':' ||
           extract(epoch from now())::bigint::text
    from public.households h where h.id = v_household
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return 'requested';
end;
$$;
revoke all on function public.set_trip_sitter(uuid, uuid) from public, anon;
grant execute on function public.set_trip_sitter(uuid, uuid) to authenticated;

/** Sitter side: say yes or no to a trip you were asked to take. */
create or replace function public.respond_to_trip(p_guide uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_by uuid;
  v_title text;
  v_status text;
  v_owner_email text;
begin
  select g.sitter_requested_by, g.title
    into v_requested_by, v_title
    from public.guides g
    join public.sitter_connections sc on sc.id = g.sitter_connection_id
   where g.id = p_guide
     and sc.sitter_user_id = auth.uid()
     and sc.status = 'active';
  if not found then
    raise exception 'trip not found';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;
  perform set_config('pawstructions.trip_sitter_write', 'on', true);
  update public.guides
     set sitter_status = v_status, sitter_responded_at = now()
   where id = p_guide;
  perform set_config('pawstructions.trip_sitter_write', 'off', true);

  select lower(u.email) into v_owner_email from auth.users u where u.id = v_requested_by;
  if v_owner_email is not null then
    insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
    values (
      'trip_response', v_owner_email,
      jsonb_build_object(
        'sitter_name', public.person_label(auth.uid()),
        'guide_title', v_title,
        'accepted',    p_accept
      ),
      'trip_response:' || p_guide::text || ':' || extract(epoch from now())::bigint::text
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return v_status;
end;
$$;
revoke all on function public.respond_to_trip(uuid, boolean) from public, anon;
grant execute on function public.respond_to_trip(uuid, boolean) to authenticated;

/**
 * The calling sitter's trips that are still ahead or under way: requests
 * waiting for an answer and trips they accepted. Declined ones drop out.
 */
create or replace function public.my_sitter_trips()
returns table (
  guide_id uuid,
  household_id uuid,
  household_name text,
  title text,
  start_date date,
  end_date date,
  sitter_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.household_id, h.name, g.title, g.start_date, g.end_date, g.sitter_status
    from public.guides g
    join public.sitter_connections sc on sc.id = g.sitter_connection_id
    join public.households h on h.id = g.household_id
   where sc.sitter_user_id = auth.uid()
     and sc.status = 'active'
     and g.sitter_status in ('requested', 'accepted')
     and (g.end_date is null or g.end_date >= current_date)
   order by g.start_date nulls last, g.title;
$$;
revoke all on function public.my_sitter_trips() from public, anon;
grant execute on function public.my_sitter_trips() to authenticated;
