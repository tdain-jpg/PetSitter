-- ============================================================================
-- 0010 — settle the welcome journey for users who predate it
-- ============================================================================
-- 0009 added settings.journeys defaulting to '{}', which means "nothing
-- recorded yet" — i.e. every registered journey is eligible to show. Correct
-- for new signups, wrong for everyone who already finished onboarding before
-- Loop 4 shipped: they would be handed "Welcome to Pawstructions / Add your
-- first pet / Create a care guide" on their next launch.
--
-- The client's silent auto-complete does NOT cover them. It fires only when
-- EVERY predicate card passes, and one of those is "Invite your family"
-- (household member count > 1) — so a long-standing solo user with pets and
-- guides fails that check and gets the checklist anyway.
--
-- 'done', deliberately NOT 'skipped': the client treats a 'skipped'
-- founder-welcome as the marker for "this user is a joiner", which would then
-- show them the joiner tour ("You've joined a household") they never joined.
-- 'done' settles the journey without claiming anything about how they arrived.
--
-- Scoped to rows still at the 0009 default, so re-running can never clobber
-- state a user has since created. Idempotent.
-- ============================================================================

update public.settings
   set journeys = jsonb_build_object(
         'founder-welcome',
         jsonb_build_object(
           'status',  'done',
           'version', 1,
           'at',      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
       )
 where onboarding_completed
   and journeys = '{}'::jsonb;
