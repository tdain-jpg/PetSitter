-- 0038 Everyone in a household can see its sitters.
--
-- Dana joined The Dain Family as a member. Tim had asked their sitter to take
-- Day Trip, and Dana's view of the trip said "A sitter no longer connected":
-- the sitter_connections read policy (0015) admitted only the household's
-- OWNER, the sitter, and the invitee, so a member could see that a trip had a
-- sitter but not who. Family members share every pet and guide already; who
-- looks after those pets is the same kind of fact. Read access only: inviting
-- and removing sitters keep their own checks inside the RPCs.

drop policy if exists "sitter_connections: owner, sitter, or invitee can read" on public.sitter_connections;
drop policy if exists "sitter_connections: household, sitter, or invitee can read" on public.sitter_connections;
create policy "sitter_connections: household, sitter, or invitee can read"
  on public.sitter_connections
  for select to authenticated
  using (
    public.is_household_member(household_id)
    or sitter_user_id = (select auth.uid())
    or email = (select public.my_confirmed_email())
  );
