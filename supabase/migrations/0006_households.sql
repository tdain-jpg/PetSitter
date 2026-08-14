-- ============================================================================
-- 0006 — households: ownership moves from user to household
-- ============================================================================
-- Model:
--   * A HOUSEHOLD is the unit of ownership for pets and guides. Every user
--     gets a personal household at signup (existing users are backfilled at
--     the bottom of this file). Multiple accounts can belong to a household
--     via household_members / household_invites — a partner today, sitter
--     accounts attaching to a client's household later.
--   * SHARE LINKS stay code-based: account-less sitters keep viewing guides
--     through resolve_share() — hardened in 0007 to load pets only from the
--     guide's own household and to strip internal household ids from the
--     payload.
--   * SETTINGS and ONBOARDING_STATE stay strictly per-user (see 0007).
--
-- Hardened model (this file + 0007):
--   * households.name is length-checked at the table (CHECK) as well as in
--     the rename RPC.
--   * household_invites: the invite_to_household RPC (0007) is the ONLY
--     write path — authenticated has no INSERT grant here and 0007 defines
--     no insert policy. An email-shape CHECK backstops whatever reaches the
--     table through privileged paths.
--   * pets/guides/share_links.user_id is attribution only ("created by"):
--     nullable, ON DELETE SET NULL. Deleting an ACCOUNT no longer deletes
--     the household's data — household_id's ON DELETE CASCADE governs data
--     lifetime.
--   * user_id is server-authoritative: set_default_household forces it to
--     auth.uid() on API inserts and pins it on API updates (immutable via
--     the API).
--   * primary_household_of(uuid) is not callable by API roles (it would be
--     a membership oracle for arbitrary user ids); clients use the zero-arg
--     my_primary_household() instead.
--
-- Old-client compatibility window (DB migrated, web client not yet deployed):
--   * The deployed client INSERTs pets/guides WITHOUT household_id. The
--     BEFORE INSERT triggers below fill household_id from the caller's
--     primary household — server-authoritative — before RLS WITH CHECK
--     evaluates (WITH CHECK runs on the row as modified by BEFORE triggers).
--   * The deployed client SELECTs filtered by user_id. Rows keep user_id,
--     and the caller is a member of the household that now owns them, so the
--     same rows come back under the household policies in 0007.
--
-- pets.household_id / guides.household_id are NULLABLE ON PURPOSE: the old
-- client cannot send them, so NOT NULL would break its inserts. The trigger
-- guarantees they are populated on every API insert, and the backfill
-- populates every existing row. RLS for all of this lands in 0007.
--
-- Idempotency: tables/indexes/columns use IF NOT EXISTS, functions use
-- CREATE OR REPLACE, triggers are dropped-then-created, FK swaps use
-- drop-if-exists + add, and the backfill only creates households for users
-- with no membership — safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- households
-- ----------------------------------------------------------------------------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Household'
              constraint households_name_length
              check (char_length(btrim(name)) between 1 and 60),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Enable RLS immediately so there is no window where the table is API-readable
-- before 0007 lands. No policies yet = default deny. 0007 adds the policies
-- (and re-asserts ENABLE, which is a no-op).
alter table public.households enable row level security;

-- Never grant anon anything new; give authenticated only what 0007's policies
-- can actually authorize (defense-in-depth under RLS).
revoke all on table public.households from public, anon, authenticated;
-- UPDATE is column-scoped to name: created_by/created_at look authoritative
-- (created_by drives creator-becomes-owner; created_at drives the
-- primary-household tiebreak), so owners must not be able to rewrite them.
grant select, insert, delete on public.households to authenticated;
grant update (name) on public.households to authenticated;

-- ----------------------------------------------------------------------------
-- household_members
-- ----------------------------------------------------------------------------
create table if not exists public.household_members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner','member')),
  created_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_id_idx
  on public.household_members (user_id);

alter table public.household_members enable row level security;

-- Membership rows are only ever WRITTEN by SECURITY DEFINER paths (signup
-- trigger, creator trigger, respond_to_invite RPC, owner-succession trigger).
-- authenticated needs only select (see members) and delete (leave / owner
-- removes member).
revoke all on table public.household_members from public, anon, authenticated;
grant select, delete on public.household_members to authenticated;

-- ----------------------------------------------------------------------------
-- household_invites
-- ----------------------------------------------------------------------------
create table if not exists public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  email         text not null,   -- always stored lowercased (trigger below)
  invited_by    uuid references auth.users(id) on delete set null,
  status        text not null default 'pending'
                check (status in ('pending','accepted','declined','revoked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  -- Backstop only — invite_to_household (0007) validates first with a
  -- friendlier error. Catches anything a privileged path writes directly.
  constraint household_invites_email_shape
    check (email ~ '^[^@\s]+@[^@\s]+$')
);

-- One LIVE invite per (household, email); resolved/revoked invites do not
-- block re-inviting.
create unique index if not exists household_invites_pending_uniq
  on public.household_invites (household_id, email)
  where status = 'pending';

-- Invitee lookup by email (my_pending_invites RPC).
create index if not exists household_invites_email_idx
  on public.household_invites (email);

-- Listing a household's invites.
create index if not exists household_invites_household_id_idx
  on public.household_invites (household_id);

alter table public.household_invites enable row level security;

-- The invite_to_household RPC (0007, SECURITY DEFINER) is the ONLY write
-- path: no INSERT grant (and 0007 defines no insert policy), and status
-- transitions happen only via the RPCs — so no update/delete privilege
-- either. Members keep SELECT (policy in 0007).
revoke all on table public.household_invites from public, anon, authenticated;
grant select on public.household_invites to authenticated;

-- Guarantee the lowercase-storage invariant on every write path: the RPC
-- lowercases too, but privileged/service-role writes bypass it and must not
-- be able to sneak 'Bob@X.com' past the pending-dedupe index.
create or replace function public.normalize_invite_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

revoke execute on function public.normalize_invite_email()
  from public, anon, authenticated;

drop trigger if exists household_invites_normalize_email on public.household_invites;
create trigger household_invites_normalize_email
  before insert or update of email on public.household_invites
  for each row execute function public.normalize_invite_email();

-- ----------------------------------------------------------------------------
-- pets / guides : household ownership column
-- ----------------------------------------------------------------------------
alter table public.pets
  add column if not exists household_id uuid references public.households(id) on delete cascade;
create index if not exists pets_household_id_idx on public.pets (household_id);

alter table public.guides
  add column if not exists household_id uuid references public.households(id) on delete cascade;
create index if not exists guides_household_id_idx on public.guides (household_id);

-- ----------------------------------------------------------------------------
-- user_id becomes attribution-only: nullable, ON DELETE SET NULL
-- ----------------------------------------------------------------------------
-- With households owning the data, deleting an ACCOUNT must not delete the
-- household's pets/guides/share_links out from under the remaining members
-- (account-deletion griefing / shared-data loss). The user_id FKs switch
-- from ON DELETE CASCADE to ON DELETE SET NULL, and the columns drop
-- NOT NULL so the SET NULL can land. Data lifetime is now governed by
-- household_id's ON DELETE CASCADE (pets, guides) and guide_id's cascade
-- (share_links, task_completions, cheat_sheets).
alter table public.pets alter column user_id drop not null;
alter table public.pets drop constraint if exists pets_user_id_fkey;
alter table public.pets
  add constraint pets_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.guides alter column user_id drop not null;
alter table public.guides drop constraint if exists guides_user_id_fkey;
alter table public.guides
  add constraint guides_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.share_links alter column user_id drop not null;
alter table public.share_links drop constraint if exists share_links_user_id_fkey;
alter table public.share_links
  add constraint share_links_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so that RLS policies on OTHER tables can check membership
-- without triggering household_members' own RLS (no recursion / no blocked
-- reads). STABLE: reads only, result fixed within a statement.
create or replace function public.is_household_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.household_members m
     where m.household_id = h
       and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- The user's primary household: owner-role households first, then oldest.
-- No hard role='owner' filter — a member-only user (e.g. someone who joined
-- a partner's household and owns none of their own) still gets a working
-- default household instead of a NULL that breaks their inserts.
-- NOT callable by API roles: taking an arbitrary user id, it would be a
-- membership oracle. Only the SECURITY DEFINER trigger below and the
-- backfill call it; clients use my_primary_household().
create or replace function public.primary_household_of(u uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
    from public.household_members m
    join public.households h on h.id = m.household_id
   where m.user_id = u
   order by (m.role = 'owner') desc, h.created_at asc, h.id asc
   limit 1;
$$;

revoke all on function public.primary_household_of(uuid)
  from public, anon, authenticated;

-- Caller-scoped variant for clients: same lookup, but only ever for
-- auth.uid(). Null-safe — with no JWT, auth.uid() is null and the lookup
-- returns null.
create or replace function public.my_primary_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.primary_household_of(auth.uid());
$$;

revoke all on function public.my_primary_household() from public, anon;
grant execute on function public.my_primary_household() to authenticated;

-- ----------------------------------------------------------------------------
-- Default-household + attribution trigger for pets/guides
-- ----------------------------------------------------------------------------
-- BEFORE INSERT, API callers (auth.uid() not null):
--   * forces user_id := auth.uid() — attribution is server-authoritative,
--     never client-supplied;
--   * fills household_id from the caller's primary household when omitted
--     (keeps the OLD deployed client working). New clients may send an
--     explicit household_id — any household they belong to; WITH CHECK in
--     0007 enforces that.
-- BEFORE UPDATE, API callers: pins user_id := old.user_id — attribution is
-- immutable via the API.
-- Privileged callers (service role / SQL editor: auth.uid() IS null) get NEW
-- back untouched: they must supply household_id explicitly. If they don't,
-- the deliberate consequence is an RLS-invisible orphan row (no household
-- policy matches a NULL household_id), visible only to privileged roles.
-- SECURITY DEFINER so the nested helper call never depends on caller
-- function grants (primary_household_of is deliberately not granted to API
-- roles); auth.uid() still resolves to the caller (it reads the request JWT,
-- not the function owner).
create or replace function public.set_default_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- Privileged write path: leave the row exactly as supplied.
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Pin attribution against forgery (user_id can never be rewritten to a
    -- different account via the API), but let transitions to NULL through:
    -- the ON DELETE SET NULL referential action runs as an ordinary UPDATE
    -- and fires this trigger — with a JWT in scope (e.g. a future self-serve
    -- delete-account RPC) an unconditional pin would revert the SET NULL and
    -- abort the account deletion with an FK violation.
    if new.user_id is not null then
      new.user_id := old.user_id;
    end if;
    return new;
  end if;

  new.user_id := auth.uid();

  if new.household_id is null then
    new.household_id := public.primary_household_of(auth.uid());
  end if;
  if new.household_id is null then
    raise exception 'no household';
  end if;
  return new;
end;
$$;

revoke execute on function public.set_default_household()
  from public, anon, authenticated;

drop trigger if exists pets_set_household on public.pets;
create trigger pets_set_household
  before insert or update on public.pets
  for each row execute function public.set_default_household();

drop trigger if exists guides_set_household on public.guides;
create trigger guides_set_household
  before insert or update on public.guides
  for each row execute function public.set_default_household();

-- ----------------------------------------------------------------------------
-- Creator becomes owner
-- ----------------------------------------------------------------------------
-- 0007 allows a plain INSERT into households (created_by = auth.uid()), but
-- household_members has no direct insert policy. This SECURITY DEFINER
-- trigger makes the creator an owner so a directly-created household is never
-- orphaned. ON CONFLICT keeps it idempotent alongside handle_new_user and the
-- backfill, which also insert the membership explicitly.
create or replace function public.add_household_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.household_members (household_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (household_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.add_household_creator_as_owner()
  from public, anon, authenticated;

drop trigger if exists households_add_creator_as_owner on public.households;
create trigger households_add_creator_as_owner
  after insert on public.households
  for each row execute function public.add_household_creator_as_owner();

-- ----------------------------------------------------------------------------
-- handle_new_user : profile (0001 behavior) + personal household
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  -- 0001 behavior, unchanged: auto-create the profile row.
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  -- 0006: every new user gets a personal household with an owner membership.
  if not exists (
    select 1 from public.household_members m where m.user_id = new.id
  ) then
    insert into public.households (name, created_by)
    values ('My Household', new.id)
    returning id into v_household;

    -- households_add_creator_as_owner already added this row; assert it
    -- explicitly so this function does not silently depend on that trigger.
    insert into public.household_members (household_id, user_id, role)
    values (v_household, new.id, 'owner')
    on conflict (household_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but re-assert 0005's
-- hardening explicitly: this is a trigger function, never an RPC.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- BACKFILL (re-runnable)
-- ----------------------------------------------------------------------------
-- 1) Every existing auth.users row without any membership gets a personal
--    household + owner membership. Re-running is a no-op: users who already
--    have a membership are skipped, so no duplicate households.
with missing as (
  select u.id as user_id
    from auth.users u
   where not exists (
     select 1 from public.household_members m where m.user_id = u.id
   )
),
created as (
  insert into public.households (name, created_by)
  select 'My Household', missing.user_id
    from missing
  returning id, created_by
)
insert into public.household_members (household_id, user_id, role)
select created.id, created.created_by, 'owner'
  from created
on conflict (household_id, user_id) do nothing;

-- 2) Point existing pets/guides at their user's primary household. Only rows
--    still NULL are touched, so re-running is a no-op. (Notes: this bumps
--    updated_at via the 0001 set_updated_at triggers — harmless — and the
--    pets/guides_set_household UPDATE branch is a no-op here because the
--    migration runs privileged, auth.uid() is null.)
update public.pets p
   set household_id = public.primary_household_of(p.user_id)
 where p.household_id is null
   and public.primary_household_of(p.user_id) is not null;

update public.guides g
   set household_id = public.primary_household_of(g.user_id)
 where g.household_id is null
   and public.primary_household_of(g.user_id) is not null;
