-- 0021_email_shape.sql
-- Tighten the "is this an email address" backstop.
--
-- Every email check in the schema so far used `^[^@\s]+@[^@\s]+$`, which asks
-- only "is there an @ with something on both sides". Browser QA found the hole:
-- `a@b` sails through it. invite_sitter() writes the row, the outbox queues a
-- message, Brevo cannot deliver to a domain with no dot in it, and the owner is
-- left staring at a pending invitation that will never be accepted and gives no
-- hint why. Household invites had the same hole.
--
-- The real fix is client-side — both invite forms now run isValidEmail before
-- calling, because that is where a person can be told what is wrong while they
-- can still fix it. This migration closes the door behind it, so anything
-- reaching the database by another route gets the same answer.
--
-- Shape only. Deliverability is not knowable from a regex, and a stricter
-- pattern risks rejecting addresses that are unusual but real. Requiring a dot
-- and a final label of two or more characters is the line between "obviously
-- not an address" and "we would be guessing". This does reject bare-hostname
-- addresses like user@localhost — correct for a consumer app with no local mail
-- transport.
--
-- Verified against production before applying: zero existing rows in
-- household_invites, notifications_outbox or auth.users fail the new pattern.
--
-- No shared is_email_shape() helper. It would be called from two plpgsql
-- functions and referenced by two CHECK constraints, and a constraint that
-- depends on a function is only as good as the moment it was validated —
-- Postgres will not re-check existing rows when the function later changes.
-- Four literal copies that are all verified here beat one definition that two
-- of the four only appear to follow.

-- ---------------------------------------------------------------------------
-- The two invite functions.
--
-- Edited in place from their live definitions rather than restated. Their other
-- guards — ownership, membership collision, rate limiting, duplicate invites —
-- were settled in 0007, 0015 and 0019 and are not what this migration is about;
-- pasting fresh copies here would mean maintaining a second version of each,
-- and a stale copy is a worse outcome than a targeted edit. It also means this
-- migration cannot silently disagree with what is actually deployed.
--
-- The count check is the point of the whole block: a replace() that matched
-- nothing would leave the hole wide open while reporting success.
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_old  constant text := '''^[^@\s]+@[^@\s]+$''';
  v_new  constant text := '''^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$''';
  v_name text;
  v_src  text;
  v_out  text;
begin
  foreach v_name in array array['invite_sitter', 'invite_to_household'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;

    if v_src is null then
      raise exception '0021: public.% not found', v_name;
    end if;

    v_out := replace(v_src, v_old, v_new);
    if v_out = v_src then
      raise exception
        '0021: no email pattern found in public.% — refusing to report success '
        'over a function that still accepts a@b', v_name;
    end if;

    execute v_out;
    raise notice '0021: tightened email check in public.%', v_name;
  end loop;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Table-level backstops.
--
-- Dropped and re-added rather than altered: Postgres has no ALTER CONSTRAINT
-- for a CHECK expression. Re-adding revalidates every existing row, which is
-- the point — a constraint that was never checked against the data behind it
-- is worse than no constraint, because it reads as a guarantee.
--
-- Constraint names are the ones production actually carries (both `_email_shape`,
-- confirmed against pg_constraint); a guessed name would silently ADD a second
-- constraint instead of replacing the loose one.
-- ---------------------------------------------------------------------------
alter table public.household_invites
  drop constraint if exists household_invites_email_shape;
alter table public.household_invites
  add constraint household_invites_email_shape
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$');

alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_email_shape;
alter table public.notifications_outbox
  add constraint notifications_outbox_email_shape
  check (recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$');
