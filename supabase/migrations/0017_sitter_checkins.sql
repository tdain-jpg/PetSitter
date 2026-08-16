-- ============================================================================
-- 0017 — sitter check-ins: "I was here, this is what I did"
-- ============================================================================
-- WHY
--   The owner's actual anxiety while away is "is my pet all right?", and until
--   now the app answered it only by holding still. A check-in is the sitter
--   writing a line back — fed him, he's fine, gave the 7:30 dose — and it is
--   what turns ticking a checklist from invisible labour into something the
--   owner can see. It is also the substrate for the daily digest in ROADMAP.
--
-- SCOPE, deliberately narrow
--   photo_path is nullable and NOTHING writes it yet. Including the column now
--   means photos need no second migration, but the storage decision is left
--   open on purpose: the existing pet-photos bucket is PUBLIC, and a photo
--   taken inside somebody's house deserves a harder look than inheriting that
--   by default. A note carries most of the reassurance and none of that risk.
--
-- WHO CAN WRITE ONE
--   A connected sitter for that household, or a member of it. Members are
--   included because a household with two people has one travelling and one at
--   home, and the one at home has exactly the same thing to say.
--
-- WHO CAN READ ONE
--   Members of the household (it is written FOR them), and connected sitters of
--   that household (a sitter must be able to see what they wrote, and a second
--   sitter on the same house benefits from the handover). Nobody else: no
--   anonymous share-link reader, no other household.
--
-- WHY NO UPDATE POLICY
--   A check-in is a log entry, not a document. Editing one after the fact would
--   let the record of what happened during a stay be rewritten, which is the
--   one property that makes it worth anything to a worried owner. The author
--   may DELETE their own — a wrong note posted to the wrong house should be
--   removable — and that is all.
--
-- IDEMPOTENCY: guarded DDL, drop-then-create for every policy, safe to re-run.
-- ============================================================================

create table if not exists public.sitter_checkins (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  -- Optional: a check-in usually belongs to the stay it happened during, but a
  -- sitter feeding someone's cat with no guide written should still be able to
  -- say so.
  guide_id       uuid references public.guides(id) on delete set null,
  -- ON DELETE SET NULL, not CASCADE: deleting an account must not erase the
  -- record that somebody cared for these animals. The note survives; only the
  -- attribution goes.
  author_user_id uuid references auth.users(id) on delete set null,
  note           text not null check (btrim(note) <> ''),
  photo_path     text,
  created_at     timestamptz not null default now()
);

-- The owner's feed and the digest both read "this household, newest first".
create index if not exists sitter_checkins_household_created_idx
  on public.sitter_checkins (household_id, created_at desc);
-- Covers the author FK so deleting an account does not sequential-scan.
create index if not exists sitter_checkins_author_idx
  on public.sitter_checkins (author_user_id);

alter table public.sitter_checkins enable row level security;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
-- Both arms are needed on every policy: is_household_member covers the people
-- who own the animals, is_connected_sitter covers the person looking after
-- them, and neither implies the other.

drop policy if exists "sitter_checkins: household and sitters can read" on public.sitter_checkins;
create policy "sitter_checkins: household and sitters can read"
  on public.sitter_checkins for select
  to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_connected_sitter(household_id)
  );

-- author_user_id is pinned to the caller in WITH CHECK rather than trusted from
-- the payload: without it a sitter could post a note under someone else's name.
drop policy if exists "sitter_checkins: household and sitters can write" on public.sitter_checkins;
create policy "sitter_checkins: household and sitters can write"
  on public.sitter_checkins for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and (
      public.is_household_member(household_id)
      or public.is_connected_sitter(household_id)
    )
  );

-- Only the author, and only their own. A household owner cannot quietly delete
-- a sitter's note about their house, which is the point of keeping the log
-- honest.
drop policy if exists "sitter_checkins: author can delete own" on public.sitter_checkins;
create policy "sitter_checkins: author can delete own"
  on public.sitter_checkins for delete
  to authenticated
  using (author_user_id = auth.uid());

-- No UPDATE policy anywhere, on purpose — see the header.

-- ----------------------------------------------------------------------------
-- Read helper: the feed, with author emails resolved
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER for one reason: auth.users is not readable by API roles, so
-- a client-side join cannot turn author_user_id into a name. The membership
-- test inside is the same one the SELECT policy applies, so this grants no
-- reach the caller does not already have — it only saves them a join they are
-- not permitted to make.
create or replace function public.household_checkins(h uuid, limit_count int default 50)
returns table (
  id            uuid,
  household_id  uuid,
  guide_id      uuid,
  author_email  text,
  is_mine       boolean,
  note          text,
  photo_path    text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.household_id,
         c.guide_id,
         u.email::text,
         c.author_user_id = auth.uid(),
         c.note,
         c.photo_path,
         c.created_at
    from public.sitter_checkins c
    left join auth.users u on u.id = c.author_user_id
   where c.household_id = h
     and (public.is_household_member(h) or public.is_connected_sitter(h))
   order by c.created_at desc
   limit least(greatest(coalesce(limit_count, 50), 1), 200);
$$;

revoke all on function public.household_checkins(uuid, int) from public, anon;
grant execute on function public.household_checkins(uuid, int) to authenticated;
