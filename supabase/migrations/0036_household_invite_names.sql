-- 0036 Household invitation emails name the inviter, and know if the
-- recipient already has an account.
--
-- Dana received "tim@mousetechstudios.com invited you to The Dain Family". The
-- owner had no profile name, but his Google sign-in carries one, and that was
-- never read. Names now come from, in order:
--   1. the profile name;
--   2. the name the sign-in provider gave (Google's full_name / name);
--   3. the person's entry in the household's Home details, matched by email;
-- and only then the email address.
--
-- The "household's listed owners" fallback from 0035 is deliberately NOT used
-- for household invites: the person being invited is often one of those
-- owners, and "Tim Dain and Dana Dain invited you" sent to Dana is wrong.
-- Sitter emails keep it (a sitter is never one of the owners), and gain step 2.
--
-- has_account lets the email send someone who already has an account to sign
-- in, and everyone else to a sign-up page made for joining.

create or replace function public.person_name(p_user uuid, p_household uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin
  select lower(u.email),
         coalesce(nullif(btrim(p.full_name), ''),
                  nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data->>'name'), ''))
    into v_email, v_name
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = p_user;
  if v_name is not null then return v_name; end if;

  select nullif(btrim(o->>'name'), '') into v_name
    from public.household_home_details d, jsonb_array_elements(d.owners) o
   where d.household_id = p_household and lower(btrim(o->>'email')) = v_email
   limit 1;
  return v_name;
end;
$$;
revoke all on function public.person_name(uuid, uuid) from public, anon, authenticated;

-- Sitter-facing label (0035), now starting from person_name.
create or replace function public.person_label_in(p_user uuid, p_household uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  v_names text[];
begin
  v_name := public.person_name(p_user, p_household);
  if v_name is not null then return v_name; end if;

  select array_agg(n) into v_names from (
    select nullif(btrim(o->>'name'), '') as n
      from public.household_home_details d, jsonb_array_elements(d.owners) o
     where d.household_id = p_household
  ) x where n is not null;
  if v_names is not null and array_length(v_names, 1) between 1 and 2 then
    return array_to_string(v_names, ' and ');
  end if;

  return (select lower(u.email) from auth.users u where u.id = p_user);
end;
$$;
revoke all on function public.person_label_in(uuid, uuid) from public, anon, authenticated;

-- Household invite email (0008), unchanged except for the two new payload keys.
create or replace function public.enqueue_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_name text;
  v_inviter_email  text;
  v_today_count    int;
begin
  -- Layer 1: recipient cap (see 0008). On cap the invite still exists; only
  -- the email is suppressed.
  select count(*)
    into v_today_count
    from public.notifications_outbox o
   where o.kind = 'invite'
     and o.recipient_email = new.email
     and o.created_at >= date_trunc('day', now());
  if v_today_count >= 5 then
    return null;
  end if;

  select h.name into v_household_name from public.households h where h.id = new.household_id;
  select lower(u.email) into v_inviter_email from auth.users u where u.id = new.invited_by;

  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  values (
    'invite',
    new.email,
    jsonb_build_object(
      'household_name', v_household_name,
      'inviter_email',  v_inviter_email,
      'inviter_name',   coalesce(public.person_name(new.invited_by, new.household_id), v_inviter_email),
      'has_account',    exists (select 1 from auth.users u where lower(u.email) = lower(new.email))
    ),
    -- Layer 2: one enqueue per invite row (see 0008).
    'invite:' || new.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end;
$$;
revoke execute on function public.enqueue_invite_email() from public, anon, authenticated;
