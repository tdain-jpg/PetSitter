-- ============================================================================
-- 0008 — crown entitlement, notifications outbox, pet-photo storage
-- ============================================================================
-- Model:
--   * CROWN is a per-HOUSEHOLD entitlement (households.crown_until): every
--     member of a crowned household gets the premium features. The single
--     read path for API roles is has_crown(h) — membership-gated so a
--     non-member always gets FALSE, never "this household you don't belong
--     to has/hasn't paid" (no entitlement oracle). Nothing here writes
--     crown_until; granting crown is a privileged (service-role) operation.
--   * NOTIFICATIONS_OUTBOX is a service-role-only queue. Triggers (below)
--     and privileged code INSERT rows; the 'notify' Edge Function — invoked
--     by cron with the x-cron-secret header, never by clients — drains
--     unsent rows and records sent_at / attempts / last_error. RLS is
--     enabled with NO policies and NO API-role grants: authenticated and
--     anon can neither see nor touch the queue. dedupe_key (UNIQUE
--     constraint) makes enqueueing idempotent — retried/racing writers
--     collapse into one email.
--   * Outbox kinds: 'invite' (someone was invited to a household),
--     'share_opened' (a share link was viewed for the first time),
--     'trip_incomplete' (reserved for the daily digest; enqueued by the
--     notify function itself, no trigger here).
--   * PET PHOTOS live in the public 'pet-photos' storage bucket. Object
--     path contract: '<auth.uid()>/<clientGeneratedId>.jpg' — the first
--     path segment is the uploader's user id, and every storage.objects
--     policy scopes to that folder. Reads by URL need no policy (public
--     bucket); the SELECT policy only serves authenticated listing/metadata
--     of one's own folder.
--
-- Swallow-errors decision (share_opened): the share_links UPDATE that fires
-- the share_opened trigger is resolve_share()'s view-count increment — the
-- anonymous share-viewing path. A raise from the trigger would surface as a
-- broken share link for a sitter standing in someone's kitchen. The trigger
-- body is therefore wrapped in an exception handler that swallows ALL
-- errors: losing a notification is acceptable; breaking anonymous shares is
-- not. The invite trigger deliberately does NOT swallow — it fires inside
-- invite_to_household, where failing loudly (invite not created) beats
-- silently creating an invite nobody is told about.
--
-- Idempotency: column/table/index DDL uses IF NOT EXISTS, the dedupe_key
-- constraint is guarded by a pg_constraint check, functions use CREATE OR
-- REPLACE, triggers and policies are dropped-then-created, the bucket
-- insert is ON CONFLICT DO NOTHING followed by a hardening UPDATE — safe
-- to re-run.
--
-- Retention (deliberate): sent outbox rows are kept FOREVER. This is not an
-- oversight — dedupe correctness depends on it. share_opened keys promise
-- "one email per (link, member), ever"; deleting sent rows would re-arm
-- those keys and re-email on the next view-count race. invite keys are
-- per-invite-id (can't re-fire for a deleted row) and the recipient cap only
-- counts TODAY's rows, and trip_incomplete keys are date-scoped — so a
-- future cleanup job MAY safely delete those two kinds' sent rows older
-- than a few days, but it must never touch share_opened rows. No cleanup
-- job ships today; volume is tiny.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CROWN : households.crown_until + has_crown()
-- ----------------------------------------------------------------------------
alter table public.households
  add column if not exists crown_until timestamptz;

-- Membership-gated entitlement check. SECURITY DEFINER: must read households
-- regardless of the caller's RLS view, and is_household_member (0006) is the
-- one true membership predicate. Null-safe: a NULL crown_until never compares
-- true, and with no JWT is_household_member() is false — so anon/expired/
-- non-member all collapse to FALSE, indistinguishable from one another.
create or replace function public.has_crown(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_household_member(h)
     and exists (
       select 1
         from public.households hh
        where hh.id = h
          and hh.crown_until > now()
     );
$$;

revoke all on function public.has_crown(uuid) from public, anon;
grant execute on function public.has_crown(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- OUTBOX : notifications_outbox (service-role only)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications_outbox (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null
                   constraint notifications_outbox_kind
                   check (kind in ('invite','share_opened','trip_incomplete')),
  -- Same email-shape backstop as household_invites (0006).
  recipient_email  text not null
                   constraint notifications_outbox_email_shape
                   check (recipient_email ~ '^[^@\s]+@[^@\s]+$'),
  payload          jsonb not null default '{}'::jsonb,
  dedupe_key       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  attempts         int not null default 0,
  last_error       text
);

-- Idempotent enqueueing: writers insert ON CONFLICT (dedupe_key) DO NOTHING.
--
-- This must be a FULL unique constraint, not a partial unique index: the
-- notify function enqueues via PostgREST upsert, which compiles to
-- ON CONFLICT (dedupe_key) with NO index predicate, and Postgres refuses to
-- infer a partial unique index without a matching WHERE clause (42P10). A
-- total constraint is inferred by both that bare conflict target and the
-- triggers' explicit 'on conflict (dedupe_key) where dedupe_key is not null'
-- form below. Default NULLS DISTINCT keeps unlimited NULL dedupe_keys legal.
drop index if exists public.notifications_outbox_dedupe_key_uniq;
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'notifications_outbox_dedupe_key_key'
       and conrelid = 'public.notifications_outbox'::regclass
  ) then
    alter table public.notifications_outbox
      add constraint notifications_outbox_dedupe_key_key unique (dedupe_key);
  end if;
end $$;

-- The notify function drains WHERE sent_at IS NULL, oldest first.
create index if not exists notifications_outbox_unsent_idx
  on public.notifications_outbox (created_at)
  where sent_at is null;

-- RLS on, NO policies, NO API-role grants = default-deny for everyone but
-- the service role (which bypasses RLS) and the SECURITY DEFINER triggers
-- below (which run as the table owner).
alter table public.notifications_outbox enable row level security;
revoke all on table public.notifications_outbox from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- INVITE EMAILS : enqueue on pending-invite creation
-- ----------------------------------------------------------------------------
-- AFTER INSERT so it sees the row as actually stored — in particular after
-- household_invites_normalize_email (0006) has lowercased new.email.
-- SECURITY DEFINER: must read households and auth.users, and must insert
-- into the ungranted outbox table. inviter_email is null-safe: invited_by
-- may be NULL (or the account since deleted, ON DELETE SET NULL), and
-- auth.users.email can be NULL for phone signups — the payload then simply
-- carries a JSON null. invite_note: intentionally none — there is no invite
-- note feature; the mailer templates around its absence.
-- Anti-email-bombing design (two layers, both required):
--   1. Per-RECIPIENT daily cap (below): at most 5 invite emails to any single
--      address per UTC day, across ALL households and inviters. This is the
--      real abuse bound — a household-scoped dedupe key alone is bypassable
--      by scripting fresh households (household creation is free), and an
--      invite->revoke->re-invite loop mints unlimited fresh invite rows.
--   2. Per-invite-id dedupe key: each real invite row enqueues exactly once
--      (retries/races collapse via the UNIQUE constraint), and a LEGITIMATE
--      same-day re-invite (after decline, revoke, or accept-then-leave) still
--      sends its email — a day-scoped key would silently eat it, which
--      matters because for invitees without accounts the email is the ONLY
--      notification channel.
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
  -- Layer 1: recipient cap. Counts every invite row queued for this address
  -- today (sent or not — retention keeps rows, so the count is complete).
  -- On cap, the invite itself still exists (in-app acceptance path intact);
  -- only the email is suppressed. Two concurrent inserts can both pass the
  -- check and land at cap+1 — a bound-not-exact race that is fine for abuse
  -- limiting.
  select count(*)
    into v_today_count
    from public.notifications_outbox o
   where o.kind = 'invite'
     and o.recipient_email = new.email
     and o.created_at >= date_trunc('day', now());
  if v_today_count >= 5 then
    return null;
  end if;

  select h.name
    into v_household_name
    from public.households h
   where h.id = new.household_id;

  select lower(u.email)
    into v_inviter_email
    from auth.users u
   where u.id = new.invited_by;

  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  values (
    'invite',
    new.email,
    jsonb_build_object(
      'household_name', v_household_name,
      'inviter_email',  v_inviter_email
    ),
    -- Layer 2: one enqueue per invite row (see design note above).
    'invite:' || new.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end;
$$;

revoke execute on function public.enqueue_invite_email()
  from public, anon, authenticated;

drop trigger if exists household_invites_enqueue_email on public.household_invites;
create trigger household_invites_enqueue_email
  after insert on public.household_invites
  for each row
  when (new.status = 'pending')
  execute function public.enqueue_invite_email();

-- ----------------------------------------------------------------------------
-- SHARE OPENED : enqueue on a share link's FIRST view
-- ----------------------------------------------------------------------------
-- Fires on the 0 → >0 view_count transition (the WHEN clause), i.e. exactly
-- once per link under resolve_share()'s increment. One outbox row per
-- CONFIRMED-email member of the guide's household; dedupe_key pins one email
-- per (link, member) even if a concurrent first-view races the WHEN check.
-- The regex filter mirrors the table's recipient_email CHECK so one member's
-- malformed address cannot abort the multi-row insert for everyone else.
--
-- MUST NEVER BREAK resolve_share: the entire body is wrapped in an
-- exception handler that swallows every error (see header). Notification
-- loss is acceptable; failing the anonymous share-view path is not.
create or replace function public.enqueue_share_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  select 'share_opened',
         lower(u.email),
         jsonb_build_object('guide_title', g.title, 'code', new.code),
         'share_opened:' || new.id::text || ':' || m.user_id::text
    from public.guides g
    join public.household_members m on m.household_id = g.household_id
    join auth.users u on u.id = m.user_id
   where g.id = new.guide_id
     and u.email_confirmed_at is not null
     and u.email ~ '^[^@\s]+@[^@\s]+$'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
exception
  when others then
    -- Swallow by design: never let notification plumbing break shares.
    return null;
end;
$$;

revoke execute on function public.enqueue_share_opened()
  from public, anon, authenticated;

drop trigger if exists share_links_enqueue_share_opened on public.share_links;
create trigger share_links_enqueue_share_opened
  after update on public.share_links
  for each row
  when (old.view_count = 0 and new.view_count > 0)
  execute function public.enqueue_share_opened();

-- ----------------------------------------------------------------------------
-- STORAGE : 'pet-photos' bucket + per-user-folder policies
-- ----------------------------------------------------------------------------
-- Public bucket: photo URLs are served without auth (getPublicUrl), which is
-- what lets share-link viewers see pet photos with no account. Write access
-- is folder-scoped: the object path contract is
-- '<auth.uid()>/<clientGeneratedId>.jpg', and every policy requires the
-- first path segment to be the caller's own user id — users can never
-- write into (or list) anyone else's folder. The SELECT policy exists for
-- authenticated listing/metadata of one's own folder only; public-URL reads
-- do not go through it.
--
-- Known lifecycle caveat (accepted): folders are keyed per-UPLOADER, so a
-- user who later leaves the household keeps DELETE rights over the objects
-- they uploaded — an ex-member can remove photos backing shared pets
-- (recoverable by re-upload; no cross-user write exposure). Moving the path
-- contract to household-keyed folders is a possible future migration.
--
-- Hardened at creation: without limits, any authenticated user could park
-- arbitrary files of arbitrary size on the project's public storage domain
-- (free phishing/malware hosting, storage-cost griefing). 5 MB cap, images
-- only — the picker emits jpeg on native, and on web returns the original
-- file, so png/webp are legitimate too (matches uploadPetPhoto's allowed
-- set). The follow-up UPDATE makes the hardening idempotent when the bucket
-- already exists from a prior run of the old, unconstrained version.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-photos', 'pet-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'pet-photos';

drop policy if exists "pet-photos: user selects own folder" on storage.objects;
create policy "pet-photos: user selects own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pet-photos: user inserts into own folder" on storage.objects;
create policy "pet-photos: user inserts into own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pet-photos: user updates own folder" on storage.objects;
create policy "pet-photos: user updates own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pet-photos: user deletes own folder" on storage.objects;
create policy "pet-photos: user deletes own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
