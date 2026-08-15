-- ============================================================================
-- 0011 — explicit primary household (settings.primary_household_id)
-- ============================================================================
-- THE BUG
--   handle_new_user (0006) gives EVERY signup a personal household they OWN,
--   and primary_household_of (0006) picks the default purely by ordering:
--       (m.role = 'owner') desc, h.created_at asc, h.id asc
--   For someone who signed up and THEN joined a family, that ordering always
--   returns their OWN empty household — they are its 'owner', and they are
--   only a 'member' of the family. set_default_household (0006) stamps that
--   household onto every pet and guide they create, so their data lands in a
--   household nobody else belongs to and the family never sees it. No error,
--   no warning. Verified in production: a user who belongs to "The Dain
--   Family" had primary_household_of return her own empty "My Household".
--
-- THE MODEL (this file)
--   The default household becomes EXPLICIT and user-visible instead of
--   inferred: settings.primary_household_id. primary_household_of returns it
--   when set, falling back to 0006's ordering when it is not — so nothing
--   changes for users who never make a choice.
--     * Set automatically on invite ACCEPT, but only when the joiner's current
--       default is VESTIGIAL: EMPTY (see "empty" below) AND holding no member
--       but the joiner. A brand-new joiner's auto-created personal household is
--       both, so the family becomes their default; a founder keeps their own —
--       whether they already have pets or guides, or have merely invited
--       someone and not yet added the first pet. Emptiness alone would not
--       spare that second founder: her household is empty BECAUSE she invited
--       first, which is the flow onboarding actually ships.
--       The test is structural. It never asks whether a HUMAN picked the
--       current pointer: the schema records only WHICH household the pointer
--       names, never who set it, so a clause sparing a hand-picked default
--       equally spares the pointer respond_to_invite itself wrote on an earlier
--       accept — and "spare whatever is already there" is just never adopting.
--       Telling the two apart needs a marker the schema does not have (e.g. a
--       primary_household_chosen_at stamped only by the user's own UI action).
--       What the member count DOES cost is the F-then-G case: accept into empty
--       family F, then into family G holding the pets the user actually cares
--       for, and the pointer stays on F. That is a deliberate trade. F is a
--       household they SHARE with someone, so their pets stay visible to a
--       human — categorically unlike the bug at the top of this file, where the
--       pets land where NOBODY else can see them. Two real families is a
--       genuine ambiguity no heuristic settles, and the Household screen names
--       the default and switches it in one tap.
--     * Set by the user at any time from the household UI (client work; this
--       file only provides the column, which the existing per-user settings
--       policy already covers).
--     * BACKFILLED here with the SAME rule — and therefore with the same
--       limits. It repoints a stranded user only while their current default is
--       still EMPTY and still holds them alone. A user who was stranded and has
--       since ADDED a pet or guide (so the bug already misfiled real data into
--       their personal household) is deliberately NOT repointed: from the
--       outside, "solo household that holds data" is indistinguishable from a
--       founder who genuinely keeps their own pets, and silently re-homing a
--       founder's default would be a second bug. Neither is a household that
--       already has another member in it — empty or not, somebody else is
--       there, so it is a family and not a leftover. Those users are covered by
--       the new default-household control on the Household screen, which names
--       the destination and lets them switch in one tap. (Note that the
--       already-misfiled rows stay
--       where they are either way — nothing in this migration moves pets or
--       guides between households. The client covers that separately: Pet
--       Detail names the household holding the pet and can move it, taking the
--       guides that describe only that pet with it, since 0007's
--       guides_validate_pet_ids trigger requires a guide's pets to live in the
--       guide's household.)
--
--   NO HOUSEHOLD IS EVER DELETED by this migration. Deleting the vestigial
--   personal household would be tidier, but it creates a reachable state where
--   a user belongs to ZERO households — and set_default_household raises
--   'no household' there, so pet creation would hard-fail for anyone who later
--   leaves the family. A spare empty household costs one row.
--
-- "EMPTY HOUSEHOLD" = no rows in pets AND no rows in guides for that
--   household_id. Deliberately NOT filtered by pets.status / deceased_date: a
--   memorialised pet is real data the user entered, and silently re-homing
--   their default away from it would be a worse bug than the one being fixed.
--   Both existence probes ride pets_household_id_idx / guides_household_id_idx
--   (0006) and stop at the first row. Emptiness is only half the adoption test
--   (see the invite-ACCEPT bullet above) — the other half, "and I am its only
--   member", is a leading-column scan of household_members_pkey
--   (household_id, user_id), so the whole test stays cheap even on the
--   interactive invite-accept path.
--
-- HOT PATH / MUST NEVER RAISE
--   primary_household_of is called by the set_default_household BEFORE INSERT
--   trigger on EVERY pet and guide insert, and (via my_primary_household) by
--   the client on every app load. No RLS policy references it today — 0002,
--   0007 and 0008 route every membership check through is_household_member /
--   is_household_owner — but it must behave like a policy helper anyway:
--     * stays 'stable' (reads only, fixed within a statement, so the planner
--       can cache it per statement);
--     * stays cheap: the new branch is one settings primary-key lookup plus one
--       household_members primary-key probe, and COALESCE short-circuits, so
--       the fallback scan is not even evaluated once a valid pointer is found;
--     * cannot raise. Both branches are provably single-row — settings.user_id
--       is the primary key, and the fallback keeps its LIMIT 1 — so the
--       "more than one row returned by a subquery" error is unreachable. A
--       raise here would break every pet/guide insert in the app.
--
-- MEMBERSHIP VALIDATION IS ESSENTIAL (and is deliberately READ-time only)
--   A stale pointer must never win. The FK is ON DELETE SET NULL, which clears
--   the pointer when a household is deleted, but that does not cover the user
--   LEAVING (their household_members row goes away; the household lives on).
--   So the explicit branch is gated on a live membership row and falls through
--   to the ordering when the user is no longer a member. This also makes the
--   column safe to write from anywhere: the worst a bogus value can do is be
--   ignored.
--
--   There is NO write-time membership check — the column carries only the
--   households FK and 0002's per-user settings policy, so a user CAN store an
--   id for a household they don't belong to. That is a considered choice, not
--   an oversight. Gating it would mean either a set_primary_household() RPC
--   plus revoking UPDATE on settings from authenticated and re-granting it
--   column by column (settings has no column-scoped grants today; introducing
--   them means every future column starts unwritable and every existing
--   settings write is one missed grant away from breaking), or a trigger on a
--   table written on every settings save. The value it would buy is small: the
--   read gate above makes a bogus pointer inert, and the client makes a
--   refused choice a true no-op — DataContext.setPrimaryHousehold captures the
--   previous pointer, writes, re-reads my_primary_household(), and restores the
--   old value if the server did not honour the new one. The residual is that a
--   row can hold an id the user has no other business knowing, and that the FK
--   turns the column into a household-id existence oracle (a real id succeeds,
--   a made-up one raises 23503). With random v4 ids that is not a practical
--   probe, and invitees already learn household ids from their deep links.
--
--   A pointer also SURVIVES the user leaving that household, and comes back to
--   life if they are ever re-added. Leaving through the app clears it
--   (DataContext.leaveHousehold), so this only bites someone an OWNER removed
--   and later re-invited: their old choice quietly becomes their default again.
--   Deliberate — "restore the choice you made" beats "forget it silently" —
--   and the Household screen shows which household is the default and changes
--   it in one tap, so it is not a state the user has to discover from misfiled
--   pets.
--
-- SECURITY DEFINER vs. per-user settings RLS
--   settings is owner-only from 0002 ("settings: owner can crud", per-user,
--   deliberately untouched by the household work). primary_household_of is
--   SECURITY DEFINER, so it runs as the migration owner (postgres), which owns
--   these tables; no table in this schema uses FORCE ROW LEVEL SECURITY, so the
--   owner bypasses RLS and the function can read ANY user's settings row. That
--   is the same mechanism is_household_member (0006) already relies on to read
--   household_members from inside policies, so it is proven in production.
--   It leaks nothing: the function is REVOKED from public/anon/authenticated
--   (0006's stance — with an arbitrary user id it would be a membership
--   oracle), the only API-reachable wrapper is my_primary_household(), which
--   passes auth.uid(), and every value it can return is a household the caller
--   is a member of — something they can already read from household_members.
--   Likewise respond_to_invite is SECURITY DEFINER, so its settings UPSERT
--   works even though the caller's own RLS would normally scope it — and it
--   only ever writes the row keyed by the caller's own auth.uid(), so it grants
--   no reach the caller does not already have.
--
-- RLS IMPACT: none. No policy is added, dropped or modified, and no policy
--   references primary_household_of. settings' existing FOR ALL owner policy
--   already covers the new column (settings has no column-scoped grants —
--   unlike households, where 0006 scoped UPDATE to (name) — so the API-role
--   table grants extend to it automatically). What CAN change is which
--   household a user's inserts land in, i.e. which rows their existing
--   policies match — and only ever toward a household they are already a
--   member of. No new access, for anyone.
--
-- IDEMPOTENCY: guarded ALTER and CREATE INDEX (IF NOT EXISTS), CREATE OR
--   REPLACE for both functions with their grants re-asserted afterwards, and a
--   backfill that (a) only considers users whose pointer is still NULL, (b)
--   emits at most one row per user (DISTINCT ON, so ON CONFLICT DO UPDATE can
--   never hit the same row twice), and (c) re-guards with a WHERE on the
--   conflict action. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. settings.primary_household_id — the explicit default
-- ----------------------------------------------------------------------------
-- ON DELETE SET NULL, not CASCADE: deleting a household must clear the
-- pointer, never delete the user's settings row. NULL simply means "no
-- explicit choice" and hands the decision back to the 0006 ordering.
alter table public.settings
  add column if not exists primary_household_id uuid
    references public.households(id) on delete set null;

-- Index the FK. Postgres does NOT create one for the referencing side, so
-- without this every `delete from households` (the owner's Delete household
-- action) has to sequential-scan settings — one row per user in the whole app
-- — while holding the delete's locks. It is also what Supabase's database
-- linter flags as `unindexed_foreign_keys` for this constraint. Partial: the
-- referential-integrity scan only ever looks for non-NULL matches, and most
-- rows are NULL (no explicit choice), so this stays tiny.
create index if not exists settings_primary_household_id_idx
  on public.settings (primary_household_id)
  where primary_household_id is not null;

-- ----------------------------------------------------------------------------
-- 2. primary_household_of — explicit choice first, 0006 ordering as fallback
-- ----------------------------------------------------------------------------
-- Signature, language, volatility, security and search_path are all unchanged
-- from 0006; only the body moves. Branch 2 is 0006's query verbatim, so a user
-- with no settings row, or a NULL / stale pointer, resolves exactly as before
-- this migration.
create or replace function public.primary_household_of(u uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1) The user's EXPLICIT choice — honoured only while they are still a
    --    member of it. A pointer to a household they have left (or one that
    --    vanished between the FK's SET NULL and this read) falls through.
    (
      select s.primary_household_id
        from public.settings s
       where s.user_id = u
         and s.primary_household_id is not null
         and exists (
           select 1
             from public.household_members m
            where m.household_id = s.primary_household_id
              and m.user_id = u
         )
    ),
    -- 2) 0006's ordering, unchanged: owner-role households first, then oldest.
    --    No hard role='owner' filter — a member-only user still gets a working
    --    default instead of a NULL that breaks their inserts.
    (
      select m.household_id
        from public.household_members m
        join public.households h on h.id = m.household_id
       where m.user_id = u
       order by (m.role = 'owner') desc, h.created_at asc, h.id asc
       limit 1
    )
  );
$$;

-- CREATE OR REPLACE preserves the ACL, but 0006's stance is re-asserted
-- explicitly so it survives any future rebuild-from-scratch: taking an
-- arbitrary user id, this would be a membership oracle for API roles. Clients
-- use my_primary_household() instead.
revoke all on function public.primary_household_of(uuid)
  from public, anon, authenticated;

-- my_primary_household() (0006) is deliberately NOT touched: it delegates to
-- primary_household_of(auth.uid()) by OID, which CREATE OR REPLACE preserves,
-- so it picks up the new behaviour automatically and keeps its 0006 grant
-- (revoked from public/anon, execute to authenticated). Same for
-- set_default_household (0006) and the two backfill UPDATEs in 0006 — every
-- caller gets the explicit default for free.

-- ----------------------------------------------------------------------------
-- 3. respond_to_invite — adopt the joined household when the current default
--    is empty
-- ----------------------------------------------------------------------------
-- Identical to 0007 (same signature, volatility, SECURITY DEFINER,
-- search_path, confirmed-email identity check, row lock, status transitions)
-- except for the marked block at the end of the accept branch.
--
-- Why AFTER the membership insert: the insert is visible to the subsequent
-- primary_household_of call (a STABLE function called from a VOLATILE plpgsql
-- body sees the effects of earlier statements in the same transaction), so the
-- "current effective primary household" we test is the post-join reality.
-- Whatever it returns IS the household the caller's next pet or guide would
-- land in, so that is the one worth testing for emptiness — usually their own
-- household, since role='owner' sorts ahead of the 'member' row just inserted,
-- but the code does not depend on that: a user who has left their own
-- household has no owner row at all, and we simply inspect whichever household
-- the ordering picked for them.
--
-- Not wrapped in an exception handler, unlike 0008's share_opened trigger: the
-- UPSERT has no realistic failure mode (the household exists — we just joined
-- it — and settings.user_id points at the authenticated caller), and if it
-- somehow failed, accepting an invite while silently keeping the broken default
-- is precisely the bug this migration exists to remove. Fail loudly, let the
-- transaction roll back, let the user retry.
create or replace function public.respond_to_invite(invite uuid, accept boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_row      public.household_invites%rowtype;
  v_current  uuid;
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

    -- ---- 0011: adopt the joined household as the explicit default --------
    -- Only when the caller's current default is VESTIGIAL: it holds NOTHING
    -- and the caller is its ONLY member. A joiner whose personal household is
    -- the empty one handle_new_user made for them gets the family; a founder
    -- keeps their own default and can switch in the UI — whether they already
    -- have pets or guides, or have merely invited someone and are waiting on
    -- the first pet. Deceased pets count as pets.
    --
    -- The member count is what separates "nobody else is in here, this is the
    -- signup artefact" from "I made this household FOR someone, it is just
    -- empty so far". Emptiness cannot tell those apart, and guessing wrong
    -- moves a founder's default out of the household she invited her partner
    -- into, so her pets land where that partner cannot see them.
    --
    -- The test is structural — it never asks whether a HUMAN picked the current
    -- pointer, because the schema cannot tell a hand-picked pointer from one
    -- this same function auto-wrote on an earlier accept, and an exemption for
    -- the former would spare the latter too. See the file header for the marker
    -- column (primary_household_chosen_at) that would be needed, and for the
    -- one case the member count deliberately trades away.
    v_current := public.primary_household_of(v_uid);

    if v_current is null            -- no membership at all (defensive)
       or v_current = v_row.household_id
       or (
            not exists (select 1 from public.pets p
                         where p.household_id = v_current)
        and not exists (select 1 from public.guides g
                         where g.household_id = v_current)
        and (select count(*) from public.household_members mm
              where mm.household_id = v_current) = 1
          )
    then
      -- UPSERT, not UPDATE: the settings row may not exist yet (a joiner can
      -- accept from the invite deep link before the client has ever written
      -- settings). Every other column takes its table default, which is
      -- byte-identical to the client's DEFAULT_SETTINGS — theme 'system',
      -- notifications/auto-save on, onboarding_completed false, journeys '{}'
      -- — so creating the row here is indistinguishable from the row
      -- getSettings() would have created on first load.
      insert into public.settings (user_id, primary_household_id)
      values (v_uid, v_row.household_id)
      on conflict (user_id) do update
        set primary_household_id = excluded.primary_household_id;
    end if;
    -- ---- end 0011 -------------------------------------------------------
  end if;

  return accept;
end;
$$;

-- Re-assert 0007's grants explicitly (CREATE OR REPLACE keeps the ACL; losing
-- the authenticated grant would break invite acceptance for every user).
revoke all on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. BACKFILL — retroactively apply the same rule to existing users
-- ----------------------------------------------------------------------------
-- Everyone who joined a household BEFORE this migration went through the old
-- respond_to_invite and is still pointed at their personal household.
-- Same rule, one shot: if a user's current effective primary household holds
-- no pets and no guides AND holds no member but them, and they belong to some
-- OTHER household, that other household becomes their explicit default —
-- PREFERRING one that holds pets or guides, but not requiring it.
--
-- Why prefer rather than require: requiring data in the destination silently
-- skips the cohort the shipped invite-first onboarding manufactures — a founder
-- creates a household and invites their partner BEFORE adding the first pet, so
-- at migration time BOTH households are empty and neither side qualifies. That
-- pair would stay stranded forever, because nothing re-runs this rule later
-- (respond_to_invite only fires on a NEW accept, and there may never be one).
--
-- But accepting an empty DESTINATION is only safe because `stranded` refuses to
-- move anyone out of a household that is anything more than a signup artefact,
-- and emptiness alone does not establish that. "No data to strand" is not the
-- same as "nothing to strand": in exactly the pair described above, the FOUNDER
-- is also stranded-by-emptiness, and repointing her sends her first pet to some
-- other household she belongs to instead of the one she just invited her
-- partner into — silently, at deploy time, with no dialog. So `stranded` also
-- requires the current default to have exactly ONE member. The partner, alone
-- in the vestigial household handle_new_user gave them, is still repointed to
-- the family; the founder keeps the household she created, and her first pet
-- lands where the partner can see it.
--
-- SCOPE, stated plainly: this fixes the stranded users whose personal household
-- is still EMPTY and holds nobody but them. It does NOT fix a stranded user who
-- has already added a pet or guide since joining — their personal household
-- holds data, so the rule (correctly, given only what the database can see)
-- treats them like a founder and leaves their default alone. Nor does it touch
-- a user whose current default has other members in it. Both cohorts keep
-- adding to the wrong household until they use the default-household control on
-- the Household screen; there is no query that can tell either apart from a
-- genuine founder, which is exactly why the fix makes the choice visible and
-- editable instead of guessing harder.
--
-- Tie-break when several other households qualify: the ones that actually hold
-- pets or guides first, then most members (the shared family beats a two-person
-- side household), then oldest, then id for determinism.
--
-- Idempotent three ways:
--   * `candidates` only includes users whose pointer is still NULL (or who
--     have no settings row), so a choice a user has already made — by this
--     backfill, by respond_to_invite, or in the UI — is never overwritten;
--   * the ON CONFLICT action re-guards exactly that condition
--     (`where settings.primary_household_id is null`), so a pointer written
--     between the CTE scan and the insert is left alone. This is what carries
--     re-run safety now that an empty destination is acceptable: after a run
--     the user's effective default may still hold nothing, so `stranded` no
--     longer excludes them on its own — the two NULL guards do;
--   * DISTINCT ON emits at most one row per user, so ON CONFLICT DO UPDATE
--     can never try to affect the same row twice within the statement.
-- Runs privileged (auth.uid() is null, RLS bypassed), so it sees every user.
with candidates as (
  -- Users with a membership who have never had an explicit default set.
  select distinct m.user_id
    from public.household_members m
    left join public.settings s on s.user_id = m.user_id
   where s.user_id is null
      or s.primary_household_id is null
),
effective as (
  select c.user_id,
         public.primary_household_of(c.user_id) as current_id
    from candidates c
),
stranded as (
  -- ...whose current default holds neither pets nor guides. No status filter:
  -- a household whose only pet is deceased is NOT empty.
  --
  -- ...AND that they are ALONE in. Emptiness proves only that there is no DATA
  -- to strand; it says nothing about the household's PURPOSE. The invite-first
  -- founder's household is empty precisely BECAUSE she invited her partner
  -- before adding the first pet, and repointing her out of it would send her
  -- first pet to whichever other household she happens to belong to — visible
  -- there, invisible to the partner she just invited. A household with a
  -- second member is somebody's family, not a signup artefact, so only a SOLO
  -- empty household is safe to adopt away from. `target` below computes this
  -- same member_count for the destination side.
  select e.user_id, e.current_id
    from effective e
   where e.current_id is not null
     and not exists (select 1 from public.pets p   where p.household_id = e.current_id)
     and not exists (select 1 from public.guides g where g.household_id = e.current_id)
     and (select count(*) from public.household_members mm
           where mm.household_id = e.current_id) = 1
),
target as (
  -- ...and belong to another household. Holding data is the FIRST sort key
  -- rather than a WHERE, so a data-holding household always wins when one
  -- exists, and an empty one is still better than leaving the user stranded.
  select distinct on (s.user_id)
         s.user_id,
         h.id as household_id,
         (exists (select 1 from public.pets p   where p.household_id = h.id)
          or exists (select 1 from public.guides g where g.household_id = h.id))
           as has_data,
         (select count(*)
            from public.household_members mm
           where mm.household_id = h.id) as member_count
    from stranded s
    join public.household_members m
      on m.user_id = s.user_id
     and m.household_id <> s.current_id
    join public.households h on h.id = m.household_id
   order by s.user_id, has_data desc, member_count desc, h.created_at asc, h.id asc
)
insert into public.settings (user_id, primary_household_id)
select t.user_id, t.household_id
  from target t
on conflict (user_id) do update
   set primary_household_id = excluded.primary_household_id
 where settings.primary_household_id is null;
