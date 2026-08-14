-- ============================================================================
-- 0007 — household RLS + membership/invite RPCs (hardened)
-- ============================================================================
-- Model recap (see 0006): the HOUSEHOLD is the unit of ownership. Pets,
-- guides, and everything derived from guides (task_completions, cheat_sheets,
-- share_links) are visible to every member of the owning household. Share
-- links stay code-based for account-less sitters via resolve_share(), which
-- this file REPLACES with a household-aware version (pets loaded only from
-- the guide's own household; internal household ids stripped from the
-- payload). settings and onboarding_state stay strictly per-user; their 0002
-- policies are NOT modified.
--
-- Hardening decisions baked in below:
--   * Invitee identity comes from auth.users with email_confirmed_at set
--     (my_confirmed_email helper) — auth.jwt()->>'email' is NEVER trusted
--     for membership-granting decisions.
--   * Invitees see only PENDING invites addressed to them; resolved/revoked
--     invites vanish from their view (no revocation-timing oracle).
--   * invite_to_household is the ONLY invite write path (no insert policy;
--     0006 revoked the INSERT grant).
--   * Last-owner protection takes a per-household advisory lock (TOCTOU),
--     and an AFTER DELETE succession trigger promotes the oldest member to
--     owner if a cascade removed the only owner.
--   * A write-time trigger on guides rejects pet_ids entries that reference
--     pets outside the guide's household (defense in depth on top of
--     resolve_share's read-time filter).
--
-- Recursion rule: a policy on any table must never read household_members
-- with a plain subquery — that subquery would evaluate household_members' own
-- RLS and either block or recurse. ALL membership checks go through the
-- SECURITY DEFINER helpers is_household_member() (0006) and
-- is_household_owner() (below), which bypass RLS on household_members.
-- The exists-subqueries on guides below are fine: they hit guides' RLS, whose
-- predicate is itself just the definer helper — one level, no cycle.
--
-- Old-client compatibility: the deployed client inserts pets/guides without
-- household_id; 0006's BEFORE INSERT triggers fill it before WITH CHECK is
-- evaluated, and its user_id-filtered selects keep returning the user's rows
-- because the user is a member of the household that owns them.
--
-- anon gets NOTHING new: every policy below is scoped TO authenticated, and
-- all RPCs revoke anon (resolve_share keeps anon EXECUTE by design — it is
-- the public share-link mechanism). Anonymous share viewing remains
-- exclusively resolve_share().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is_household_owner (same hardening as is_household_member in 0006)
-- ----------------------------------------------------------------------------
create or replace function public.is_household_owner(h uuid)
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
       and m.role = 'owner'
  );
$$;

revoke all on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Helper: my_confirmed_email — the caller's CONFIRMED email, from auth.users
-- ----------------------------------------------------------------------------
-- Invite-facing code must never trust auth.jwt()->>'email' for
-- membership-granting decisions: the claim can be stale after an email
-- change and, depending on auth configuration, can be present before the
-- address is actually verified. This definer helper reads auth.users
-- directly and returns NULL unless the account has an email AND
-- email_confirmed_at is set. Lowercased, so callers compare against the
-- lowercase-stored invite email. STABLE — safe and cheap in policies (one
-- lookup per statement).
create or replace function public.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(u.email), '')
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null;
$$;

revoke all on function public.my_confirmed_email() from public, anon;
grant execute on function public.my_confirmed_email() to authenticated;

-- ----------------------------------------------------------------------------
-- households
-- ----------------------------------------------------------------------------
alter table public.households enable row level security;

drop policy if exists "households: member can select" on public.households;
create policy "households: member can select"
  on public.households for select
  to authenticated
  using (public.is_household_member(id));

-- Plain insert is allowed for a user creating their own household; the
-- households_add_creator_as_owner trigger (0006) makes them its owner.
drop policy if exists "households: user can create own" on public.households;
create policy "households: user can create own"
  on public.households for insert
  to authenticated
  with check (created_by = auth.uid());

-- Owners can update directly (the name CHECK in 0006 bounds the only
-- user-editable column); the rename_household RPC below remains the
-- friendly-error path.
drop policy if exists "households: owner can update" on public.households;
create policy "households: owner can update"
  on public.households for update
  to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

drop policy if exists "households: owner can delete" on public.households;
create policy "households: owner can delete"
  on public.households for delete
  to authenticated
  using (public.is_household_owner(id));

-- ----------------------------------------------------------------------------
-- household_members
-- ----------------------------------------------------------------------------
alter table public.household_members enable row level security;

drop policy if exists "household_members: member can select" on public.household_members;
create policy "household_members: member can select"
  on public.household_members for select
  to authenticated
  using (public.is_household_member(household_id));

-- NO insert/update policies: membership is written only by SECURITY DEFINER
-- paths (handle_new_user, households_add_creator_as_owner, respond_to_invite,
-- promote_owner_after_delete).

drop policy if exists "household_members: leave or owner removes" on public.household_members;
create policy "household_members: leave or owner removes"
  on public.household_members for delete
  to authenticated
  using (
    user_id = auth.uid()                      -- anyone can leave
    or public.is_household_owner(household_id) -- an owner can remove members
  );

-- A household must never lose its last owner via leave/remove. SECURITY
-- DEFINER: needs unrestricted reads of household_members and auth.users.
-- The two existence guards let FK cascades through: when the household row or
-- the auth.users row is already gone (household deleted / account deleted),
-- the cascading membership delete must not be blocked.
create or replace function public.forbid_removing_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- TOCTOU guard: serialize membership deletes per household. Without this,
  -- two owners leaving in concurrent transactions each see the other as
  -- "still there", both pass the remaining-owner check, and the household
  -- ends up ownerless. Transaction-scoped advisory lock — released
  -- automatically at commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended(old.household_id::text, 0));

  if old.role <> 'owner' then
    return old;
  end if;

  -- Cascade from a household delete: household row already gone → allow.
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  -- Cascade from an auth.users delete: user row already gone → allow.
  -- (promote_owner_after_delete below then hands the household to the
  -- oldest remaining member.)
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;

  -- Accepted caveat (scan order): a single statement deleting MULTIPLE
  -- membership rows fires this trigger once per row, and each check sees the
  -- table with earlier rows already removed — so whether/where a multi-owner
  -- bulk delete trips the exception depends on scan order. Our clients only
  -- ever delete single rows (leave / remove one member), so this is accepted
  -- rather than engineered away.
  if not exists (
    select 1
      from public.household_members m
     where m.household_id = old.household_id
       and m.role = 'owner'
       and m.user_id <> old.user_id
  ) then
    raise exception 'cannot remove the last owner of a household';
  end if;

  return old;
end;
$$;

revoke execute on function public.forbid_removing_last_owner()
  from public, anon, authenticated;

drop trigger if exists household_members_forbid_last_owner_delete on public.household_members;
create trigger household_members_forbid_last_owner_delete
  before delete on public.household_members
  for each row execute function public.forbid_removing_last_owner();

-- ----------------------------------------------------------------------------
-- Owner succession: never leave a household with members but no owner
-- ----------------------------------------------------------------------------
-- forbid_removing_last_owner deliberately lets FK cascades through (account
-- deletion). If that removes the only owner while other members remain, the
-- household would be permanently ownerless — nobody could rename it, manage
-- members, or delete it. This AFTER DELETE trigger heals that state by
-- promoting the longest-standing remaining member to owner. It runs in the
-- same transaction as the BEFORE trigger above, under the advisory lock that
-- trigger already took, so successions serialize with membership deletes.
create or replace function public.promote_owner_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  -- Household itself being deleted (cascade): nothing to heal.
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  -- Still has an owner → nothing to do.
  if exists (
    select 1
      from public.household_members m
     where m.household_id = old.household_id
       and m.role = 'owner'
  ) then
    return old;
  end if;

  -- Oldest remaining member (stable tie-break on user_id) becomes owner.
  select m.user_id
    into v_user
    from public.household_members m
   where m.household_id = old.household_id
   order by m.created_at asc, m.user_id asc
   limit 1;

  if v_user is not null then
    update public.household_members
       set role = 'owner'
     where household_id = old.household_id
       and user_id = v_user;
    return old;
  end if;

  -- ZERO members remain (sole member's account was deleted — a sole member is
  -- always an owner, so no user-initiated path reaches here). Without this,
  -- the household would persist forever unreachable by any API role, with its
  -- pets/guides retained and any ACTIVE SHARE LINKS still resolving for
  -- anonymous callers — un-revocable, since nobody could ever match its
  -- policies again. Delete the household; its ON DELETE CASCADE removes pets,
  -- guides, share_links, task_completions and cheat_sheets. No membership
  -- rows remain, so this re-fires no member triggers, and we already hold the
  -- per-household advisory lock taken by forbid_removing_last_owner.
  delete from public.households where id = old.household_id;

  return old;
end;
$$;

revoke execute on function public.promote_owner_after_delete()
  from public, anon, authenticated;

drop trigger if exists household_members_promote_owner_after_delete on public.household_members;
create trigger household_members_promote_owner_after_delete
  after delete on public.household_members
  for each row execute function public.promote_owner_after_delete();

-- ----------------------------------------------------------------------------
-- household_invites
-- ----------------------------------------------------------------------------
alter table public.household_invites enable row level security;

-- Members see their household's invites (full history); an invitee sees only
-- PENDING invites addressed to their CONFIRMED email. my_confirmed_email()
-- is the identity source — never the raw JWT claim. The status filter means
-- a revoked/resolved invite simply disappears from the invitee's view (no
-- revocation-timing oracle). Null-safety: my_confirmed_email() is NULL for
-- phone signups and unconfirmed addresses; `= NULL` is NULL, which a policy
-- treats as false.
drop policy if exists "household_invites: member or invitee can select" on public.household_invites;
create policy "household_invites: member or invitee can select"
  on public.household_invites for select
  to authenticated
  using (
    public.is_household_member(household_id)
    or (status = 'pending'
        and lower(email) = public.my_confirmed_email())
  );

-- NO insert policy — and no INSERT grant (0006): invite_to_household below
-- is the ONLY write path (it dedupes, validates the email, and rejects
-- existing members). The drop cleans up databases where an earlier revision
-- created a direct-insert policy.
drop policy if exists "household_invites: member can insert" on public.household_invites;

-- NO update/delete policies: status transitions only via the RPCs below.

-- ----------------------------------------------------------------------------
-- pets : owner-keyed policy → household-keyed policy
-- ----------------------------------------------------------------------------
drop policy if exists "pets: owner can crud" on public.pets;

drop policy if exists "pets: household member can crud" on public.pets;
create policy "pets: household member can crud"
  on public.pets for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ----------------------------------------------------------------------------
-- guides : same replacement
-- ----------------------------------------------------------------------------
drop policy if exists "guides: owner can crud" on public.guides;

drop policy if exists "guides: household member can crud" on public.guides;
create policy "guides: household member can crud"
  on public.guides for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ----------------------------------------------------------------------------
-- guides.pet_ids ↔ household integrity (write-time, defense in depth)
-- ----------------------------------------------------------------------------
-- resolve_share() (below) filters pets by the guide's household at READ
-- time; this trigger stops cross-household references from being WRITTEN at
-- all — a member of household A must not build a guide that points at
-- household B's pets. Empty pet_ids skips validation. SECURITY DEFINER: the
-- check must see pets regardless of the caller's RLS view (and privileged
-- writes must be validated too).
create or replace function public.validate_guide_pet_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad uuid;
begin
  if new.pet_ids is null or cardinality(new.pet_ids) = 0 then
    return new;
  end if;

  select pid
    into v_bad
    from unnest(new.pet_ids) as pid
   where new.household_id is null
      or not exists (
        select 1
          from public.pets p
         where p.id = pid
           and p.household_id = new.household_id
      )
   limit 1;

  if v_bad is not null then
    raise exception
      'guide pet_ids: pet % does not belong to the guide''s household', v_bad;
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_guide_pet_ids()
  from public, anon, authenticated;

-- Fires after guides_set_household on the same events (BEFORE triggers run
-- in name order: 'guides_set_household' < 'guides_validate_pet_ids'), so
-- household_id is already filled for old-client inserts when this runs.
-- UPDATE is scoped to the two columns the invariant depends on: an UPDATE
-- that doesn't touch pet_ids/household_id can't change the relationship, and
-- must not be blocked by pre-existing stale references — in particular the
-- user_id ON DELETE SET NULL cascade from an account deletion (0006) must
-- never fail because a guide still lists a since-deleted pet id.
drop trigger if exists guides_validate_pet_ids on public.guides;
create trigger guides_validate_pet_ids
  before insert or update of pet_ids, household_id on public.guides
  for each row execute function public.validate_guide_pet_ids();

-- ----------------------------------------------------------------------------
-- task_completions : derived via the guide's household
-- ----------------------------------------------------------------------------
drop policy if exists "task_completions: guide owner can crud" on public.task_completions;

drop policy if exists "task_completions: household member can crud" on public.task_completions;
create policy "task_completions: household member can crud"
  on public.task_completions for all
  to authenticated
  using (
    exists (
      select 1 from public.guides g
      where g.id = task_completions.guide_id
        and public.is_household_member(g.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.guides g
      where g.id = task_completions.guide_id
        and public.is_household_member(g.household_id)
    )
  );

-- ----------------------------------------------------------------------------
-- cheat_sheets : derived via the guide's household
-- ----------------------------------------------------------------------------
drop policy if exists "cheat_sheets: guide owner can crud" on public.cheat_sheets;

drop policy if exists "cheat_sheets: household member can crud" on public.cheat_sheets;
create policy "cheat_sheets: household member can crud"
  on public.cheat_sheets for all
  to authenticated
  using (
    exists (
      select 1 from public.guides g
      where g.id = cheat_sheets.guide_id
        and public.is_household_member(g.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.guides g
      where g.id = cheat_sheets.guide_id
        and public.is_household_member(g.household_id)
    )
  );

-- ----------------------------------------------------------------------------
-- share_links : derived via the guide's household
-- ----------------------------------------------------------------------------
drop policy if exists "share_links: owner can crud" on public.share_links;

drop policy if exists "share_links: household member can crud" on public.share_links;
create policy "share_links: household member can crud"
  on public.share_links for all
  to authenticated
  using (
    exists (
      select 1 from public.guides g
      where g.id = share_links.guide_id
        and public.is_household_member(g.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.guides g
      where g.id = share_links.guide_id
        and public.is_household_member(g.household_id)
    )
  );

-- share_links.user_id attribution pinning: same server-authoritative rule as
-- pets/guides (0006's set_default_household), minus the household_id logic —
-- share_links has no household_id column, so that function would raise here.
-- INSERT: user_id := auth.uid(). UPDATE: pinned, except transitions to NULL
-- (the ON DELETE SET NULL cascade fires this trigger as an ordinary UPDATE).
create or replace function public.pin_share_link_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- privileged path: leave as supplied
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is not null then
      new.user_id := old.user_id;
    end if;
    return new;
  end if;
  new.user_id := auth.uid();
  return new;
end;
$$;

revoke execute on function public.pin_share_link_user_id()
  from public, anon, authenticated;

drop trigger if exists share_links_pin_user_id on public.share_links;
create trigger share_links_pin_user_id
  before insert or update on public.share_links
  for each row execute function public.pin_share_link_user_id();

-- settings / onboarding_state: intentionally untouched — per-user (0002).

-- ----------------------------------------------------------------------------
-- resolve_share : household-aware hardening (replaces 0003's definition)
-- ----------------------------------------------------------------------------
-- Two changes; everything else is identical to 0003 (active + expiry checks,
-- best-effort view_count increment, payload shape):
--   1. Pets are loaded ONLY from the guide's own household. 0003 trusted
--      guide.pet_ids blindly, so a guide referencing another household's pet
--      ids would leak those pets to anonymous viewers. The
--      guides_validate_pet_ids trigger above blocks such writes; this is the
--      matching read-side filter.
--   2. household_id is an internal key — stripped from both the guide and
--      each pet before the payload leaves the database.
create or replace function public.resolve_share(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_id    uuid;
  v_guide_id   uuid;
  v_guide      public.guides%rowtype;
  v_pets       jsonb;
begin
  -- Validate share link
  select id, guide_id
    into v_link_id, v_guide_id
    from public.share_links
   where code = p_code
     and is_active = true
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_link_id is null then
    return null;
  end if;

  -- Increment view counter (best-effort; non-blocking)
  update public.share_links
     set view_count = view_count + 1
   where id = v_link_id;

  -- Load guide
  select * into v_guide from public.guides where id = v_guide_id;
  if not found then
    return null;
  end if;

  -- Load referenced pets — only those listed in guide.pet_ids AND owned by
  -- the guide's household. (An orphan guide with NULL household_id matches
  -- no pets and returns an empty list.)
  -- Strip internal keys: household_id AND user_id are account/tenant
  -- identifiers with no value to an anonymous sitter viewing a share.
  select coalesce(jsonb_agg((to_jsonb(p) - 'household_id' - 'user_id') order by p.name), '[]'::jsonb)
    into v_pets
    from public.pets p
   where p.id = any(v_guide.pet_ids)
     and p.household_id = v_guide.household_id;

  return jsonb_build_object(
    'guide', to_jsonb(v_guide) - 'household_id' - 'user_id',
    'pets',  v_pets
  );
end;
$$;

-- Anyone with the code can resolve it (0003/0005 stance, unchanged). RLS
-- still protects everything else.
revoke all on function public.resolve_share(text) from public;
grant execute on function public.resolve_share(text) to anon, authenticated;

-- ============================================================================
-- RPCs — all SECURITY DEFINER, search_path pinned, validated server-side,
-- revoked from public+anon, granted to authenticated only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- invite_to_household(h, invite_email) → invite id
-- ----------------------------------------------------------------------------
-- The ONLY write path into household_invites (no insert policy, no INSERT
-- grant). The email-shape CHECK on the table (0006) backstops this same
-- regex.
create or replace function public.invite_to_household(h uuid, invite_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_household_member(h) then
    raise exception 'not a member of this household';
  end if;

  v_email := lower(trim(invite_email));
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  -- Reject inviting an email that already belongs to a member. Null-safe:
  -- auth.users.email can be NULL (phone signups); lower(NULL) = v_email is
  -- NULL → not matched, which is correct.
  if exists (
    select 1
      from public.household_members m
      join auth.users u on u.id = m.user_id
     where m.household_id = h
       and lower(u.email) = v_email
  ) then
    raise exception 'that email already belongs to a household member';
  end if;

  -- Race-safe against the partial unique index (0006): concurrent duplicate
  -- inserts collapse into the existing pending invite.
  insert into public.household_invites (household_id, email, invited_by)
  values (h, v_email, v_uid)
  on conflict (household_id, email) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select i.id
      into v_id
      from public.household_invites i
     where i.household_id = h
       and i.email = v_email
       and i.status = 'pending';
  end if;

  -- Narrow race: the conflicting pending invite was revoked between our
  -- insert and the fallback select. Ask the caller to retry rather than
  -- returning NULL as if an invite existed.
  if v_id is null then
    raise exception 'invite could not be created, please try again';
  end if;

  return v_id;
end;
$$;

revoke all on function public.invite_to_household(uuid, text) from public, anon;
grant execute on function public.invite_to_household(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- my_pending_invites() → invites addressed to the caller's confirmed email
-- ----------------------------------------------------------------------------
-- Identity via my_confirmed_email(): callers with no confirmed email (phone
-- signups, unverified addresses) get ZERO rows — the comparison is NULL.
-- invited_by may have been deleted → left join, NULL email in the output.
create or replace function public.my_pending_invites()
returns table (
  id                uuid,
  household_id      uuid,
  household_name    text,
  invited_by_email  text,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         i.household_id,
         h.name,
         u.email::text,
         i.created_at
    from public.household_invites i
    join public.households h on h.id = i.household_id
    left join auth.users u on u.id = i.invited_by
   where i.status = 'pending'
     and i.email = public.my_confirmed_email()
   order by i.created_at desc;
$$;

revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;

-- ----------------------------------------------------------------------------
-- respond_to_invite(invite, accept) → accept
-- ----------------------------------------------------------------------------
-- Accepting an invite GRANTS MEMBERSHIP, so the caller's identity must be
-- their confirmed auth.users email (my_confirmed_email) — an unconfirmed or
-- missing address cannot claim invites.
create or replace function public.respond_to_invite(invite uuid, accept boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_row    public.household_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if accept is null then
    raise exception 'accept must be true or false';
  end if;

  v_email := public.my_confirmed_email();
  if v_email is null then
    raise exception 'your account has no confirmed email address';
  end if;

  -- Lock the row so concurrent respond/revoke calls serialize.
  select * into v_row
    from public.household_invites i
   where i.id = invite
   for update;

  if not found then
    raise exception 'invite not found';
  end if;

  -- Not addressed to the caller: report as not-found rather than leaking
  -- that the invite id exists.
  if lower(v_row.email) <> v_email then
    raise exception 'invite not found';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'invite is not pending';
  end if;

  update public.household_invites
     set status       = case when accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = invite;

  if accept then
    insert into public.household_members (household_id, user_id, role)
    values (v_row.household_id, v_uid, 'member')
    on conflict (household_id, user_id) do nothing;
  end if;

  return accept;
end;
$$;

revoke all on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- revoke_invite(invite)
-- ----------------------------------------------------------------------------
create or replace function public.revoke_invite(invite uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_household  uuid;
  v_status     text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select i.household_id, i.status
    into v_household, v_status
    from public.household_invites i
   where i.id = invite
   for update;

  if not found then
    raise exception 'invite not found';
  end if;

  -- Caller must be a member of the invite's household; report not-found
  -- rather than leaking other households' invite ids.
  if not public.is_household_member(v_household) then
    raise exception 'invite not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'invite is not pending';
  end if;

  update public.household_invites
     set status       = 'revoked',
         responded_at = now()
   where id = invite;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- rename_household(h, new_name)
-- ----------------------------------------------------------------------------
-- Kept alongside the owner direct-update policy; the households_name_length
-- CHECK (0006) backstops both paths with the same 1-60 bound.
create or replace function public.rename_household(h uuid, new_name text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_name := trim(coalesce(new_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'household name must be 1-60 characters';
  end if;

  if not public.is_household_owner(h) then
    raise exception 'only a household owner can rename it';
  end if;

  update public.households
     set name = v_name
   where id = h;
end;
$$;

revoke all on function public.rename_household(uuid, text) from public, anon;
grant execute on function public.rename_household(uuid, text) to authenticated;
