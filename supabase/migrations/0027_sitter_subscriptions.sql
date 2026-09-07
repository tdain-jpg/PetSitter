-- 0027: the sitter subscription.
--
-- WHAT IS SOLD. A sitter may hold up to THREE active client households for
-- free, for good. Beyond that they need a subscription ($9/month or $60/year).
-- Nothing that exists today is taken away: the limit is checked only when a
-- sitter ACCEPTS a new client, so a sitter already above it keeps every client
-- they have. There is no code path here that disconnects anybody, and that is
-- deliberate — a paywall that severs a live arrangement could leave an animal
-- unattended, which is not a trade we are willing to make for $9.
--
-- WHY THREE AND NOT TWO. The Sitter plans screen has been telling sitters "up
-- to three clients free for good" since it shipped. Two was the number picked
-- in planning, before anyone re-read that screen. Three is what we promised in
-- public, so three is what it is.
--
-- WHERE ENTITLEMENT LIVES. Crown is a HOUSEHOLD property (households.crown_*).
-- This is not: it belongs to a sitter, who is a user, and who carries it across
-- every household they sit for. Hence its own table keyed by user rather than
-- another column on households.

create table if not exists public.sitter_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  -- Unique so a single Stripe subscription cannot be attached to two accounts.
  stripe_subscription_id text unique,
  -- Stripe's own vocabulary, stored verbatim rather than mapped to a boolean:
  -- 'past_due' is not 'canceled', and next year we will want to tell them apart.
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Stripe does not promise delivery order. This is the `created` of the last
  -- event applied, and an event older than it is dropped, so a late-arriving
  -- 'created' cannot overwrite the 'deleted' that already landed.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.sitter_subscriptions enable row level security;

-- A sitter may read their own row and nothing else. There is deliberately NO
-- insert/update/delete policy for authenticated: every write comes from the
-- Stripe webhook through the definer function below, because the only source of
-- truth about whether someone paid is Stripe.
drop policy if exists "sitter reads own subscription" on public.sitter_subscriptions;
create policy "sitter reads own subscription"
  on public.sitter_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- One place to change the free allowance.
create or replace function public.sitter_free_client_limit()
returns integer
language sql
immutable
set search_path = public
as $$ select 3 $$;

/**
 * Does this sitter have an unlimited-clients subscription right now?
 *
 * 'trialing' counts: a trial is a promise we made. 'past_due' also counts,
 * deliberately — Stripe retries a failed card for days, and cutting a working
 * sitter off from their clients over a card that expired on a Tuesday is a
 * worse outcome than carrying them until Stripe gives up and sends
 * customer.subscription.deleted.
 */
create or replace function public.sitter_has_unlimited_clients(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sitter_subscriptions s
    where s.user_id = p_user
      and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now())
  )
$$;

revoke all on function public.sitter_has_unlimited_clients(uuid) from public, anon;
grant execute on function public.sitter_has_unlimited_clients(uuid) to authenticated;

/** How many client households this sitter is actively connected to. */
create or replace function public.sitter_active_client_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.sitter_connections sc
  where sc.sitter_user_id = p_user
    and sc.status = 'active'
$$;

revoke all on function public.sitter_active_client_count(uuid) from public, anon;
grant execute on function public.sitter_active_client_count(uuid) to authenticated;

/**
 * What the sitter side needs to draw its own paywall, in one round trip.
 * Returns the caller's own numbers only — it takes no user argument at all,
 * so it cannot be used to inspect another sitter's business.
 */
create or replace function public.my_sitter_plan()
returns table (
  active_clients integer,
  free_limit integer,
  subscribed boolean,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.sitter_active_client_count(auth.uid()),
    public.sitter_free_client_limit(),
    public.sitter_has_unlimited_clients(auth.uid()),
    coalesce(s.status, 'inactive'),
    s.current_period_end,
    coalesce(s.cancel_at_period_end, false)
  from (select 1) one
  left join public.sitter_subscriptions s on s.user_id = auth.uid()
$$;

revoke all on function public.my_sitter_plan() from public, anon;
grant execute on function public.my_sitter_plan() to authenticated;

/**
 * Applied by the Stripe webhook, and by nothing else.
 *
 * SECURITY DEFINER with no grant to `authenticated`: a user who could call this
 * could award themselves an unlimited plan, so only the service role — which
 * bypasses RLS anyway and is held solely by the edge function — may reach it.
 */
create or replace function public.apply_sitter_subscription(
  p_user uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_price text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sitter_subscriptions as s (
    user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
    current_period_end, cancel_at_period_end, last_event_at, updated_at
  )
  values (
    p_user, p_customer, p_subscription, p_status, p_price,
    p_period_end, coalesce(p_cancel_at_period_end, false), p_event_at, now()
  )
  on conflict (user_id) do update
    set stripe_customer_id     = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
        stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
        status                 = excluded.status,
        price_id               = coalesce(excluded.price_id, s.price_id),
        current_period_end     = excluded.current_period_end,
        cancel_at_period_end   = excluded.cancel_at_period_end,
        last_event_at          = excluded.last_event_at,
        updated_at             = now()
    -- Out-of-order and replayed events are dropped here rather than in the
    -- edge function, so a Stripe retry storm cannot resurrect a dead plan.
    where s.last_event_at is null
       or excluded.last_event_at is null
       or excluded.last_event_at >= s.last_event_at;

  return found;
end;
$$;

revoke all on function public.apply_sitter_subscription(
  uuid, text, text, text, text, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

/**
 * THE PAYWALL ITSELF.
 *
 * Replaces 0015's version. Identical in every respect but one: accepting a
 * FOURTH active client without a subscription is refused. Enforced here, in the
 * definer function that is the only way to accept an invite, because a limit
 * that lives in the UI is not a limit.
 *
 * Declining is never blocked — a sitter at their limit must always be able to
 * say no to an invitation, and charging someone for the privilege of declining
 * would be absurd.
 */
create or replace function public.respond_to_sitter_invite(connection uuid, accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row sitter_connections%rowtype;
  v_active integer;
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
    if not public.sitter_has_unlimited_clients(auth.uid()) then
      v_active := public.sitter_active_client_count(auth.uid());
      if v_active >= public.sitter_free_client_limit() then
        -- Recognised by the client and turned into an upgrade prompt. The
        -- numbers travel in the message so the screen can say "3 of 3" without
        -- a second round trip.
        raise exception 'sitter_client_limit_reached (% of %)',
          v_active, public.sitter_free_client_limit()
          using errcode = 'check_violation';
      end if;
    end if;

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
