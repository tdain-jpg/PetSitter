-- 0041 The admin page: feedback, users, paid accounts, and what gets used.
--
-- One admin today (Tim, tim@mousetechstudios.com). Admin status is a row in
-- public.admins, checked INSIDE every admin function by is_admin(); hiding
-- the Admin button in the app is a convenience, never the protection.
--
-- Money is NOT reported here as revenue. Stripe is the record for that (Tim's
-- call, 2026-10-05): every discount and comp goes through Stripe so its
-- reports stay consistent. This page shows who is paying, from the state the
-- webhook already mirrors, and everything Stripe cannot see: who signed up,
-- where they came from, what they use, and what they told us.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from public, anon, authenticated;

insert into public.admins (user_id)
select id from auth.users where lower(email) = 'tim@mousetechstudios.com'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback: stored, and still emailed to support@
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  email       text,
  message     text not null check (char_length(btrim(message)) between 1 and 5000),
  context     jsonb not null default '{}'::jsonb check (pg_column_size(context) < 4000),
  status      text not null default 'new' check (status in ('new', 'read', 'done')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;
-- Supabase's default privileges grant every new table to authenticated;
-- take all of it back and give insert alone, so reading fails outright
-- rather than relying only on RLS to return nothing.
revoke all on public.feedback from public, anon, authenticated;
grant insert on public.feedback to authenticated;

-- Anyone signed in can send feedback, as themselves. Nobody reads it back
-- through the table; the admin reads it through admin_feedback().
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());

-- The sender's email is taken from their account, not from the client.
create or replace function public.feedback_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := (select lower(u.email) from auth.users u where u.id = auth.uid());
  new.status := 'new';
  new.admin_note := null;
  new.handled_at := null;
  return new;
end;
$$;
drop trigger if exists feedback_stamp on public.feedback;
create trigger feedback_stamp before insert on public.feedback
  for each row execute function public.feedback_stamp();

alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_kind;
alter table public.notifications_outbox
  add constraint notifications_outbox_kind
  check (kind in ('invite', 'share_opened', 'trip_incomplete', 'sitter_checkin',
                  'sitter_wants_to_connect', 'sitter_invite', 'trip_request',
                  'trip_response', 'feedback'));

create or replace function public.enqueue_feedback_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- At most 10 feedback emails per sender per day; the rows are all kept.
  if (select count(*) from public.feedback f
       where f.user_id = new.user_id and f.created_at >= now() - interval '1 day') > 10 then
    return null;
  end if;
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  values ('feedback', 'support@pawstructions.com',
          jsonb_build_object('from_email', new.email,
                             'from_name', public.person_name(new.user_id, null),
                             'message', new.message,
                             'screen', new.context->>'screen'),
          'feedback:' || new.id::text)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;
drop trigger if exists feedback_email on public.feedback;
create trigger feedback_email after insert on public.feedback
  for each row execute function public.enqueue_feedback_email();

-- ---------------------------------------------------------------------------
-- Usage log: things the app does not otherwise record (a PDF printed, a
-- quick trip finished). Write-only for users; read only by the admin.
-- ---------------------------------------------------------------------------
create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,
  event       text not null check (event ~ '^[a-z0-9_]{1,48}$'),
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  created_at  timestamptz not null default now()
);
create index if not exists app_events_event_created_idx on public.app_events (event, created_at desc);
alter table public.app_events enable row level security;
revoke all on public.app_events from public, anon, authenticated;
grant insert on public.app_events to authenticated;
drop policy if exists app_events_insert_own on public.app_events;
create policy app_events_insert_own on public.app_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin reports. Every one refuses anyone who is not an admin.
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'users_total',   (select count(*) from auth.users),
    'users_7d',      (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'users_30d',     (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'sitters',       (select count(*) from public.profiles where role = 'sitter'),
    'households',    (select count(*) from public.households),
    'pets',          (select count(*) from public.pets where coalesce(status, 'active') <> 'deceased'),
    'guides',        (select count(*) from public.guides),
    'crown_households', (select count(*) from public.households where crown_until > now()),
    'sitter_subscribers', (select count(*) from public.sitter_subscriptions where status in ('active', 'trialing', 'past_due')),
    'feedback_new',  (select count(*) from public.feedback where status = 'new'),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s, 'count', c) order by c desc)
        from (select coalesce(signup_source, 'before tracking') s, count(*) c
                from public.profiles group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_users(p_search text default null, p_limit int default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
      from (
        select u.id as user_id,
               lower(u.email) as email,
               public.person_name(u.id, null) as name,
               u.created_at,
               u.last_sign_in_at,
               p.signup_source,
               p.role,
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
                 where sc.sitter_user_id = u.id and sc.status = 'active') as sitter_clients
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
language plpgsql
stable
security definer
set search_path = public
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
               'active', h.crown_until > now()) order by cp.created_at desc)
        from public.crown_purchases cp
        join public.households h on h.id = cp.household_id), '[]'::jsonb),
    'sitters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', (select lower(u.email) from auth.users u where u.id = s.user_id),
               'name', public.person_name(s.user_id, null),
               'status', s.status,
               'price_id', s.price_id,
               'period_end', s.current_period_end,
               'cancel_at_period_end', s.cancel_at_period_end) order by s.updated_at desc)
        from public.sitter_subscriptions s), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_feedback(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'email', f.email, 'name', public.person_name(f.user_id, null),
             'message', f.message, 'screen', f.context->>'screen',
             'status', f.status, 'admin_note', f.admin_note, 'created_at', f.created_at)
           order by f.created_at desc)
      from public.feedback f
     where p_status is null or f.status = p_status), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_feedback(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.feedback
     set status = p_status,
         admin_note = coalesce(p_note, admin_note),
         handled_at = case when p_status = 'done' then now() else handled_at end
   where id = p_id;
end;
$$;

/**
 * What people actually use, over the last p_days. Counted straight from the
 * tables that already record each thing, plus the usage log for the few the
 * app would otherwise forget.
 */
create or replace function public.admin_usage(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_array(
    jsonb_build_object('label', 'New accounts', 'count', (select count(*) from auth.users where created_at >= since)),
    jsonb_build_object('label', 'Pets added', 'count', (select count(*) from public.pets where created_at >= since)),
    jsonb_build_object('label', 'Guides created', 'count', (select count(*) from public.guides where created_at >= since)),
    jsonb_build_object('label', 'Cheat sheets generated', 'count', (select count(*) from public.cheat_sheets where generated_at >= since)),
    jsonb_build_object('label', 'Share links created', 'count', (select count(*) from public.share_links where created_at >= since)),
    jsonb_build_object('label', 'Share link views (all time, links made in period)', 'count', (select coalesce(sum(view_count), 0) from public.share_links where created_at >= since)),
    jsonb_build_object('label', 'Tasks ticked off', 'count', (select count(*) from public.task_completions where completed_at >= since)),
    jsonb_build_object('label', 'Sitter check-ins', 'count', (select count(*) from public.sitter_checkins where created_at >= since)),
    jsonb_build_object('label', 'Family invites sent', 'count', (select count(*) from public.household_invites where created_at >= since)),
    jsonb_build_object('label', 'Family invites accepted', 'count', (select count(*) from public.household_invites where status = 'accepted' and responded_at >= since)),
    jsonb_build_object('label', 'Sitter invites sent', 'count', (select count(*) from public.sitter_connections where created_at >= since)),
    jsonb_build_object('label', 'Sitter invites accepted', 'count', (select count(*) from public.sitter_connections where status = 'active' and responded_at >= since)),
    jsonb_build_object('label', 'Trips given a sitter', 'count', (select count(*) from public.guides where sitter_connection_id is not null and updated_at >= since)),
    jsonb_build_object('label', 'Trips accepted by a sitter', 'count', (select count(*) from public.guides where sitter_status = 'accepted' and sitter_responded_at >= since)),
    jsonb_build_object('label', 'Home details saved', 'count', (select count(*) from public.household_home_details where updated_at >= since)),
    jsonb_build_object('label', 'Feedback received', 'count', (select count(*) from public.feedback where created_at >= since))
  ) || coalesce((
    select jsonb_agg(jsonb_build_object('label', 'Logged: ' || e.event, 'count', e.c) order by e.c desc)
      from (select event, count(*) c from public.app_events where created_at >= since group by event) e
  ), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_overview()', 'admin_users(text, int)', 'admin_paid()',
                           'admin_feedback(text)', 'admin_update_feedback(uuid, text, text)',
                           'admin_usage(int)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
