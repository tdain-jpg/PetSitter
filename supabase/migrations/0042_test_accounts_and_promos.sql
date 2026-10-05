-- 0042 Test accounts kept out of the numbers, and promotion code tracking.
--
-- 1. Test accounts. Tim's QA logins were counted as users, households, pets
--    and usage, which makes every number on the admin page wrong in the
--    direction that flatters. profiles.is_test marks them; the admin reports
--    leave them out of every count and report them separately. A household
--    counts as a test household when the account that created it is a test
--    account. The admin can flip the flag for anyone from the Users tab.
--
-- 2. Promotion codes. Codes are created in Stripe (from the admin page or the
--    Stripe dashboard); Stripe counts redemptions. What Stripe cannot say is
--    which of OUR users and households used a code, so the webhook records
--    each redemption here, keyed by checkout session.

alter table public.profiles add column if not exists is_test boolean not null default false;

update public.profiles p set is_test = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) in ('tcdain+qapaws@gmail.com', 'tcdain+qasitter@gmail.com',
                          'tcdain@gmail.com', 'dana@vacationeer.com');

-- A user marking themselves as a test account (or not) is meaningless and
-- would corrupt the numbers, so ordinary profile updates cannot touch it.
create or replace function public.profiles_protect_is_test()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('pawstructions.admin_write', true) is distinct from 'on' then
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_is_test on public.profiles;
create trigger profiles_protect_is_test before update on public.profiles
  for each row execute function public.profiles_protect_is_test();

create or replace function public.admin_set_test(p_user uuid, p_test boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  perform set_config('pawstructions.admin_write', 'on', true);
  update public.profiles set is_test = coalesce(p_test, false) where id = p_user;
  perform set_config('pawstructions.admin_write', 'off', true);
end;
$$;

create or replace function public.is_test_user(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_test from public.profiles where id = p_user), false); $$;

create or replace function public.is_test_household(p_household uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select public.is_test_user(h.created_by) from public.households h where h.id = p_household), false);
$$;
revoke all on function public.is_test_user(uuid) from public, anon, authenticated;
revoke all on function public.is_test_household(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promotion code redemptions, written by stripe-webhook (service role).
-- ---------------------------------------------------------------------------
create table if not exists public.promo_redemptions (
  checkout_session_id text primary key,
  code                text not null,
  promotion_code_id   text,
  kind                text not null check (kind in ('crown', 'sitter')),
  user_id             uuid references auth.users (id) on delete set null,
  household_id        uuid references public.households (id) on delete set null,
  amount_discount     int,
  currency            text,
  created_at          timestamptz not null default now()
);
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_redemptions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports, now excluding test accounts.
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
    'sitter_subscribers', (select count(*) from public.sitter_subscriptions s where s.status in ('active', 'trialing', 'past_due') and not public.is_test_user(s.user_id)),
    'feedback_new',  (select count(*) from public.feedback where status = 'new'),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s, 'count', c) order by c desc)
        from (select coalesce(signup_source, 'before tracking') s, count(*) c
                from public.profiles where not is_test group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_users(p_search text default null, p_limit int default 300)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.is_test, x.created_at desc)
      from (
        select u.id as user_id,
               lower(u.email) as email,
               public.person_name(u.id, null) as name,
               u.created_at,
               u.last_sign_in_at,
               p.signup_source,
               p.role,
               coalesce(p.is_test, false) as is_test,
               (select count(*) from public.household_members m where m.user_id = u.id) as households,
               (select count(*) from public.pets pt
                  join public.household_members m on m.household_id = pt.household_id
                 where m.user_id = u.id and coalesce(pt.status, 'active') <> 'deceased') as pets,
               (select count(*) from public.guides g
                  join public.household_members m on m.household_id = g.household_id
                 where m.user_id = u.id) as guides,
               exists (select 1 from public.households h
                         join public.household_members m on m.household_id = h.id
                        where m.user_id = u.id and h.crown_until > now()) as crown,
               (select s.status from public.sitter_subscriptions s where s.user_id = u.id) as sitter_plan,
               (select count(*) from public.sitter_connections sc
                 where sc.sitter_user_id = u.id and sc.status = 'active') as sitter_clients,
               (select string_agg(distinct pr.code, ', ') from public.promo_redemptions pr where pr.user_id = u.id) as promo_codes
          from auth.users u
          left join public.profiles p on p.id = u.id
         where p_search is null or btrim(p_search) = ''
            or lower(u.email) like '%' || lower(btrim(p_search)) || '%'
            or lower(coalesce(public.person_name(u.id, null), '')) like '%' || lower(btrim(p_search)) || '%'
         order by u.created_at desc
         limit greatest(1, least(p_limit, 1000))
      ) x), '[]'::jsonb);
end;
$$;

create or replace function public.admin_paid()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
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

create or replace function public.admin_usage(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_array(
    jsonb_build_object('label', 'New accounts', 'count', (select count(*) from auth.users u where u.created_at >= since and not public.is_test_user(u.id))),
    jsonb_build_object('label', 'Pets added', 'count', (select count(*) from public.pets p where p.created_at >= since and not public.is_test_household(p.household_id))),
    jsonb_build_object('label', 'Guides created', 'count', (select count(*) from public.guides g where g.created_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Cheat sheets generated', 'count', (select count(*) from public.cheat_sheets c join public.guides g on g.id = c.guide_id where c.generated_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Share links created', 'count', (select count(*) from public.share_links s join public.guides g on g.id = s.guide_id where s.created_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Share link views (links made in period)', 'count', (select coalesce(sum(s.view_count), 0) from public.share_links s join public.guides g on g.id = s.guide_id where s.created_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Tasks ticked off', 'count', (select count(*) from public.task_completions t join public.guides g on g.id = t.guide_id where t.completed_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Sitter check-ins', 'count', (select count(*) from public.sitter_checkins c where c.created_at >= since and not public.is_test_household(c.household_id))),
    jsonb_build_object('label', 'Family invites sent', 'count', (select count(*) from public.household_invites i where i.created_at >= since and not public.is_test_household(i.household_id))),
    jsonb_build_object('label', 'Family invites accepted', 'count', (select count(*) from public.household_invites i where i.status = 'accepted' and i.responded_at >= since and not public.is_test_household(i.household_id))),
    jsonb_build_object('label', 'Sitter invites sent', 'count', (select count(*) from public.sitter_connections s where s.created_at >= since and not public.is_test_household(s.household_id))),
    jsonb_build_object('label', 'Sitter invites accepted', 'count', (select count(*) from public.sitter_connections s where s.status = 'active' and s.responded_at >= since and not public.is_test_household(s.household_id))),
    jsonb_build_object('label', 'Trips given a sitter', 'count', (select count(*) from public.guides g where g.sitter_connection_id is not null and g.updated_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Trips accepted by a sitter', 'count', (select count(*) from public.guides g where g.sitter_status = 'accepted' and g.sitter_responded_at >= since and not public.is_test_household(g.household_id))),
    jsonb_build_object('label', 'Home details saved', 'count', (select count(*) from public.household_home_details d where d.updated_at >= since and not public.is_test_household(d.household_id))),
    jsonb_build_object('label', 'Promo codes redeemed', 'count', (select count(*) from public.promo_redemptions r where r.created_at >= since and not public.is_test_user(r.user_id))),
    jsonb_build_object('label', 'Feedback received', 'count', (select count(*) from public.feedback f where f.created_at >= since and not public.is_test_user(f.user_id)))
  ) || coalesce((
    select jsonb_agg(jsonb_build_object('label', 'Logged: ' || e.event, 'count', e.c) order by e.c desc)
      from (select event, count(*) c from public.app_events a
             where a.created_at >= since and not public.is_test_user(a.user_id) group by event) e
  ), '[]'::jsonb);
end;
$$;

/** Who redeemed each code, for the Promo codes tab (Stripe has the totals). */
create or replace function public.admin_promo_redemptions()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', r.code, 'kind', r.kind,
             'email', (select lower(u.email) from auth.users u where u.id = r.user_id),
             'household', (select h.name from public.households h where h.id = r.household_id),
             'amount_discount', r.amount_discount, 'currency', r.currency,
             'is_test', public.is_test_user(r.user_id),
             'at', r.created_at) order by r.created_at desc)
      from public.promo_redemptions r), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_set_test(uuid, boolean)', 'admin_overview()', 'admin_users(text, int)',
                           'admin_paid()', 'admin_usage(int)', 'admin_promo_redemptions()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
