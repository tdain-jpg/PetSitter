-- ============================================================================
-- 0016 — my_pending_sitter_invites(): let an invited sitter FIND their invite
-- ============================================================================
-- THE GAP 0015 LEFT
--   my_sitter_connections() filters on `sitter_user_id = auth.uid()`, and that
--   column is NULL until respond_to_sitter_invite ACCEPTS. So the one moment a
--   sitter most needs to see an invitation — before they have accepted it — is
--   exactly the moment that function cannot return it. An owner could invite
--   somebody, that person could sign up, and the app would show them nothing.
--
--   RLS alone does not close it either. 0015's SELECT policy on
--   sitter_connections does let the invitee read their own row (the
--   `email = my_confirmed_email()` arm), but a sitter is NOT a member of that
--   household, so `households` is invisible to them and a client-side join
--   cannot name who is asking. An invitation from nobody-in-particular is not
--   an invitation anyone will accept.
--
-- THE FIX
--   The same shape 0007 already uses for household invites: a SECURITY DEFINER
--   function that joins the household on the caller's behalf and returns only
--   rows addressed to their own confirmed email. Modelled on my_pending_invites
--   deliberately, so the two invitation paths stay recognisably the same.
--
-- WHY THIS IS NOT AN ORACLE
--   The only rows it can return are ones naming the caller's own confirmed
--   email, which is an address they have already proven they control. Someone
--   with no invitations gets an empty set, indistinguishable from a household
--   that does not exist — there is no id to probe and no way to ask about
--   anybody else.
--
-- IDEMPOTENCY: CREATE OR REPLACE plus explicit re-grants. Safe to re-run.
-- RLS IMPACT: none. No policy is added, dropped or modified; this reads through
--   SECURITY DEFINER exactly as my_pending_invites has since 0007.
-- ============================================================================

create or replace function public.my_pending_sitter_invites()
returns table (
  id              uuid,
  household_id    uuid,
  household_name  text,
  invited_by_email text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select sc.id,
         sc.household_id,
         h.name,
         u.email::text,
         sc.created_at
    from public.sitter_connections sc
    join public.households h on h.id = sc.household_id
    left join auth.users u on u.id = sc.invited_by
   where sc.status = 'invited'
     and sc.email = public.my_confirmed_email()
   order by sc.created_at desc;
$$;

-- anon has no confirmed email, so it could only ever get an empty set — but it
-- is revoked anyway, matching every other helper in this schema rather than
-- relying on that argument holding forever.
revoke all on function public.my_pending_sitter_invites() from public, anon;
grant execute on function public.my_pending_sitter_invites() to authenticated;
