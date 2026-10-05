-- 0035 Name the person in invitation emails, not their email address.
--
-- Rendering the first real sitter invitation before sending it showed
-- "tim@mousetechstudios.com invited you to look after their pets": the owner
-- had never filled in a profile name. Most owners won't have. But the
-- household's Home details (0032) usually name its people. So, for emails sent
-- on a household's behalf:
--   1. the person's profile name, if they gave one;
--   2. their entry in the household's Home details, matched by email;
--   3. the household's listed owners ("Tim Dain and Dana Dain"), up to two;
--   4. their email address, as before.

create or replace function public.person_label_in(p_user uuid, p_household uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_names text[];
begin
  select lower(u.email), nullif(btrim(p.full_name), '')
    into v_email, v_name
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = p_user;
  if v_name is not null then return v_name; end if;

  select nullif(btrim(o->>'name'), '') into v_name
    from public.household_home_details d, jsonb_array_elements(d.owners) o
   where d.household_id = p_household and lower(btrim(o->>'email')) = v_email
   limit 1;
  if v_name is not null then return v_name; end if;

  select array_agg(n) into v_names from (
    select nullif(btrim(o->>'name'), '') as n
      from public.household_home_details d, jsonb_array_elements(d.owners) o
     where d.household_id = p_household
  ) x where n is not null;
  if v_names is not null and array_length(v_names, 1) between 1 and 2 then
    return array_to_string(v_names, ' and ');
  end if;

  return v_email;
end;
$$;
revoke all on function public.person_label_in(uuid, uuid) from public, anon, authenticated;

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
      'inviter_name',   public.person_label_in(new.invited_by, new.household_id),
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
           'inviter_name',     public.person_label_in(auth.uid(), v_household),
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
