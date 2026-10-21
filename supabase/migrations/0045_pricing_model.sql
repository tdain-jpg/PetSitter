-- 0045 The pricing model Tim set on 2026-10-21. Goal: monthly recurring revenue.
--
--   Owners       free, including live-sitter features on 2 trips a calendar
--                year; Pawstructions Plus ($3/month or $24/year) removes the
--                limit and includes unlimited clean AI cheat sheets. Crown is no
--                longer sold; every household that bought it keeps it forever,
--                and Crown counts as Plus.
--   Friends and  sitters invited BY AN OWNER are always free, no limit.
--   family
--   Pro sitters  clients a sitter brings in themselves need Pro: a 30-day free
--                trial with a card up front, then $9/month or $79/year. The old
--                "3 households free" tier is gone.
--
-- Existing connections are never cut off: the rules apply to new accepts.

-- ---------------------------------------------------------------------------
-- 1. Which side started each sitter connection.
-- ---------------------------------------------------------------------------
alter table public.sitter_connections
  add column if not exists origin text not null default 'owner';
alter table public.sitter_connections drop constraint if exists sitter_connections_origin;
alter table public.sitter_connections add constraint sitter_connections_origin
  check (origin in ('owner', 'sitter'));

-- Owner invitations are inserted as 'invited' and become active when the
-- sitter accepts. The only path that inserts a connection already 'active' is
-- an owner accepting a SITTER's request (respond_to_owner_invite, 0029), so
-- that is what marks a sitter-brought client.
create or replace function public.sitter_connections_origin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.origin := case when new.status = 'active' then 'sitter' else 'owner' end;
  return new;
end;
$$;
drop trigger if exists sitter_connections_origin on public.sitter_connections;
create trigger sitter_connections_origin before insert on public.sitter_connections
  for each row execute function public.sitter_connections_origin();

-- The one sitter-brought connection that exists (two test accounts, 2026-09-08).
update public.sitter_connections sc set origin = 'sitter'
  from public.sitter_owner_invites i
 where i.status = 'accepted'
   and sc.sitter_user_id = i.sitter_user_id
   and sc.household_id in (select m.household_id from public.household_members m
                            join auth.users u on u.id = m.user_id
                           where lower(u.email) = lower(i.email));

-- ---------------------------------------------------------------------------
-- 2. Sitter rules.
-- ---------------------------------------------------------------------------
-- No free sitter-brought clients any more: with a limit of 0, invite_owner
-- and respond_to_owner_invite (0029) require Pro (active, trialing or
-- past_due) for every new one. Owner invitations never consult this.
create or replace function public.sitter_free_client_limit()
returns integer
language sql
immutable
set search_path = public
as $$ select 0 $$;

-- Accepting an OWNER's invitation: always free now (friends and family).
create or replace function public.respond_to_sitter_invite(connection uuid, accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row sitter_connections%rowtype;
begin
  if public.my_confirmed_email() is null then
    raise exception 'your account has no confirmed email address';
  end if;

  select * into invite_row
  from public.sitter_connections sc
  where sc.id = connection
  for update;

  if not found or invite_row.email != public.my_confirmed_email() then
    raise exception 'invite not found';
  end if;

  if invite_row.status != 'invited' then
    raise exception 'invite not found';
  end if;

  if accept then
    update public.sitter_connections sc
    set status = 'active',
        sitter_user_id = auth.uid(),
        responded_at = now()
    where sc.id = connection;
  else
    update public.sitter_connections sc
    set status = 'declined',
        responded_at = now()
    where sc.id = connection;
  end if;

  return accept;
end;
$$;
revoke all on function public.respond_to_sitter_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_sitter_invite(uuid, boolean) to authenticated;

-- What a subscription is worth, recorded by the webhook, so the admin page
-- can show monthly recurring revenue without asking Stripe.
alter table public.sitter_subscriptions
  add column if not exists amount_cents int,
  add column if not exists billing_interval text;

-- ---------------------------------------------------------------------------
-- 3. Pawstructions Plus, per household (every member benefits, as with Crown).
-- ---------------------------------------------------------------------------
create table if not exists public.household_subscriptions (
  household_id           uuid primary key references public.households (id) on delete cascade,
  user_id                uuid references auth.users (id) on delete set null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null,
  price_id               text,
  amount_cents           int,
  billing_interval       text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  last_event_at          timestamptz,
  updated_at             timestamptz not null default now()
);
alter table public.household_subscriptions enable row level security;
revoke all on public.household_subscriptions from public, anon, authenticated;

-- Written only by stripe-webhook (service role). Same out-of-order guard as
-- apply_sitter_subscription: an older event never overwrites a newer one.
create or replace function public.apply_household_subscription(
  p_household uuid, p_user uuid, p_customer text, p_subscription text, p_status text,
  p_price text, p_amount int, p_interval text, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.household_subscriptions as s (
    household_id, user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
    amount_cents, billing_interval, current_period_end, cancel_at_period_end, last_event_at, updated_at
  ) values (
    p_household, p_user, p_customer, p_subscription, p_status, p_price,
    p_amount, p_interval, p_period_end, coalesce(p_cancel_at_period_end, false), p_event_at, now()
  )
  on conflict (household_id) do update
    set user_id                = coalesce(excluded.user_id, s.user_id),
        stripe_customer_id     = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
        stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
        status                 = excluded.status,
        price_id               = coalesce(excluded.price_id, s.price_id),
        amount_cents           = coalesce(excluded.amount_cents, s.amount_cents),
        billing_interval       = coalesce(excluded.billing_interval, s.billing_interval),
        current_period_end     = excluded.current_period_end,
        cancel_at_period_end   = excluded.cancel_at_period_end,
        last_event_at          = excluded.last_event_at,
        updated_at             = now()
    where s.last_event_at is null
       or excluded.last_event_at is null
       or excluded.last_event_at >= s.last_event_at;
  return found;
end;
$$;
revoke all on function public.apply_household_subscription(
  uuid, uuid, text, text, text, text, int, text, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

create or replace function public.owner_free_sitter_trips()
returns integer language sql immutable set search_path = public as $$ select 2 $$;

/**
 * Plus, for a household, with no membership check (internal). Crown bought
 * before Plus existed counts. 'past_due' counts, as for sitters: Stripe is
 * still retrying the card, and cutting a family off mid-trip over that is the
 * worse outcome.
 */
create or replace function public.household_has_plus(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.households hh where hh.id = h and hh.crown_until > now())
      or exists (select 1 from public.household_subscriptions s
                  where s.household_id = h
                    and s.status in ('active', 'trialing', 'past_due')
                    and (s.current_period_end is null or s.current_period_end > now()));
$$;
revoke all on function public.household_has_plus(uuid) from public, anon, authenticated;

-- has_crown is what the cheat sheets, the watermark and the PDF already ask.
-- It now answers "Crown or Plus", so Plus unlocks them with no other change.
create or replace function public.has_crown(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_household_member(h) and public.household_has_plus(h);
$$;
revoke all on function public.has_crown(uuid) from public, anon;
grant execute on function public.has_crown(uuid) to authenticated;

/** The owner's plan, for the Plus screen and the trip card. Members only. */
create or replace function public.owner_plan_status(h uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.household_subscriptions%rowtype;
begin
  if not public.is_household_member(h) then raise exception 'household not found'; end if;
  select * into v_sub from public.household_subscriptions s where s.household_id = h;
  return jsonb_build_object(
    'has_plus', public.household_has_plus(h),
    'via', case
             when exists (select 1 from public.households hh where hh.id = h and hh.crown_until > now()) then 'crown'
             when v_sub.status in ('active', 'trialing', 'past_due') then 'subscription'
             else null end,
    'status', v_sub.status,
    'interval', v_sub.billing_interval,
    'period_end', v_sub.current_period_end,
    'cancel_at_period_end', coalesce(v_sub.cancel_at_period_end, false),
    'free_trips', public.owner_free_sitter_trips(),
    'trips_used_this_year', (select count(*) from public.guides g
                              where g.household_id = h and g.sitter_connection_id is not null
                                and extract(year from coalesce(g.start_date, g.created_at::date)) = extract(year from current_date))
  );
end;
$$;
revoke all on function public.owner_plan_status(uuid) from public, anon;
grant execute on function public.owner_plan_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Asking a sitter to take a trip: 2 free a year (0035 + the check).
-- ---------------------------------------------------------------------------
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

  -- Free owners get live-sitter trips for 2 trips a calendar year (0045).
  -- Re-asking or switching sitter on a trip that already has one costs
  -- nothing; only a trip gaining its first sitter counts. Plus, or Crown
  -- bought before Plus existed, removes the limit.
  if not public.household_has_plus(v_household)
     and not exists (select 1 from public.guides g where g.id = p_guide and g.sitter_connection_id is not null)
     and (select count(*) from public.guides g
           where g.household_id = v_household
             and g.id <> p_guide
             and g.sitter_connection_id is not null
             and extract(year from coalesce(g.start_date, g.created_at::date))
               = extract(year from coalesce(v_start, current_date))) >= public.owner_free_sitter_trips()
  then
    raise exception 'owner_plan_required';
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
revoke all on function public.set_trip_sitter(uuid, uuid) from public, anon;
grant execute on function public.set_trip_sitter(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin: Plus counts, trials, and monthly recurring revenue.
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'users_total',   (select count(*) from auth.users u where not public.is_test_user(u.id)),
    'users_7d',      (select count(*) from auth.users u where not public.is_test_user(u.id) and u.created_at >= now() - interval '7 days'),
    'users_30d',     (select count(*) from auth.users u where not public.is_test_user(u.id) and u.created_at >= now() - interval '30 days'),
    'test_accounts', (select count(*) from public.profiles where is_test),
    'sitters',       (select count(*) from public.profiles where role = 'sitter' and not is_test),
    'households',    (select count(*) from public.households h where not public.is_test_household(h.id)),
    'pets',          (select count(*) from public.pets p where coalesce(p.status, 'active') <> 'deceased' and not public.is_test_household(p.household_id)),
    'guides',        (select count(*) from public.guides g where not public.is_test_household(g.household_id)),
    'crown_households', (select count(*) from public.households h where h.crown_until > now() and not public.is_test_household(h.id)),
    'plus_households', (select count(*) from public.household_subscriptions s where s.status in ('active', 'past_due') and not public.is_test_household(s.household_id)),
    'plus_trialing', (select count(*) from public.household_subscriptions s where s.status = 'trialing' and not public.is_test_household(s.household_id)),
    'sitter_trialing', (select count(*) from public.sitter_subscriptions s where s.status = 'trialing' and not public.is_test_user(s.user_id)),
    -- Monthly recurring revenue: every PAYING subscription (trials excluded,
    -- they have not paid yet) as its monthly equivalent, a yearly price / 12.
    'mrr_cents', (
      select coalesce(sum(case when x.billing_interval = 'year' then x.amount_cents / 12.0 else x.amount_cents end), 0)::int
        from (select s.amount_cents, s.billing_interval from public.sitter_subscriptions s
               where s.status in ('active', 'past_due') and not s.cancel_at_period_end and not public.is_test_user(s.user_id)
              union all
              select s.amount_cents, s.billing_interval from public.household_subscriptions s
               where s.status in ('active', 'past_due') and not s.cancel_at_period_end and not public.is_test_household(s.household_id)) x),
    'sitter_subscribers', (select count(*) from public.sitter_subscriptions s where s.status in ('active', 'past_due') and not public.is_test_user(s.user_id)),
    'feedback_new',  (select count(*) from public.feedback where status = 'new'),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s, 'count', c) order by c desc)
        from (select coalesce(signup_source, 'before tracking') s, count(*) c
                from public.profiles where not is_test group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_paid()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'plus', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household', h.name,
               'email', (select lower(u.email) from auth.users u where u.id = s.user_id),
               'status', s.status,
               'amount_cents', s.amount_cents,
               'interval', s.billing_interval,
               'period_end', s.current_period_end,
               'cancel_at_period_end', s.cancel_at_period_end,
               'is_test', public.is_test_household(s.household_id)) order by s.updated_at desc)
        from public.household_subscriptions s
        join public.households h on h.id = s.household_id), '[]'::jsonb),
    'crown', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household', h.name,
               'buyer', (select lower(u.email) from auth.users u where u.id = cp.user_id),
               'amount_cents', cp.amount_cents,
               'currency', cp.currency,
               'reason', cp.reason,
               'at', cp.created_at,
               'active', h.crown_until > now(),
               'is_test', public.is_test_household(h.id),
               'promo_code', (select pr.code from public.promo_redemptions pr where pr.checkout_session_id = cp.checkout_session_id))
             order by cp.created_at desc)
        from public.crown_purchases cp
        join public.households h on h.id = cp.household_id), '[]'::jsonb),
    'sitters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', (select lower(u.email) from auth.users u where u.id = s.user_id),
               'name', public.person_name(s.user_id, null),
               'status', s.status,
               'price_id', s.price_id,
               'amount_cents', s.amount_cents,
               'interval', s.billing_interval,
               'period_end', s.current_period_end,
               'cancel_at_period_end', s.cancel_at_period_end,
               'is_test', public.is_test_user(s.user_id),
               'promo_code', (select string_agg(distinct pr.code, ', ') from public.promo_redemptions pr
                               where pr.user_id = s.user_id and pr.kind = 'sitter'))
             order by s.updated_at desc)
        from public.sitter_subscriptions s), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
revoke all on function public.admin_paid() from public, anon;
grant execute on function public.admin_paid() to authenticated;
