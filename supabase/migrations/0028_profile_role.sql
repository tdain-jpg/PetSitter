-- 0028: how a user prefers to be landed, so a sitter can join without waiting
-- to be invited.
--
-- THE HOLE THIS CLOSES. Until now a sitter existed only because an owner
-- invited them: my_pending_sitter_invites was the entire mechanism. A
-- professional sitter could not sign up, could not reach Sitter plans, and
-- therefore could not buy the subscription we started selling on 2026-09-07 —
-- while the landing page had begun addressing them directly.
--
-- THIS IS A LANDING PREFERENCE, NOT A PERMISSION. Nothing reads it to decide
-- what anybody may see. RLS already answers that question, correctly, and has
-- been proven to; a role that granted access would be a second and weaker
-- security model competing with the one that works, and the two would drift.
-- It answers one question only: which home screen do we open on.
--
-- NULL IS A REAL AND PERMANENT STATE. Every account that exists today has no
-- role, and they must keep working exactly as they do — the owner dashboard is
-- the historical default and stays the default for null. Nothing backfills
-- this column.
--
-- 'both' is deliberately NOT a value. Plenty of sitters own pets, and the
-- original design said so, but "which screen do I open on" has one answer at a
-- time. A sitter with pets sets 'sitter' and still reaches everything they own;
-- the app's navigation, not this column, is what must let them cross over.

alter table public.profiles
  add column if not exists role text;

-- The "profiles: update own" policy already lets a user write their own row,
-- so the column has to constrain its own values — without this, a client could
-- put anything at all in there.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role is null or role in ('owner', 'sitter'));

comment on column public.profiles.role is
  'Landing preference only: owner | sitter | null. NEVER read for authorisation — RLS decides access. Null means the historical default (owner dashboard).';
