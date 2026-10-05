-- 0037 Pending household invitations carry the inviter's name.
--
-- The invitation screen said "Invited by tim@mousetechstudios.com" while the
-- email that brought Dana there said "Timathy Dain". Same name source as the
-- email (person_name, 0036); the email column stays for anyone who wants it
-- and as the fallback when no name is known. A new column changes the return
-- type, which Postgres only allows by dropping and recreating the function.

drop function if exists public.my_pending_invites();
create function public.my_pending_invites()
returns table (
  id                uuid,
  household_id      uuid,
  household_name    text,
  invited_by_email  text,
  created_at        timestamptz,
  invited_by_name   text
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
         i.created_at,
         public.person_name(i.invited_by, i.household_id)
    from public.household_invites i
    join public.households h on h.id = i.household_id
    left join auth.users u on u.id = i.invited_by
   where i.status = 'pending'
     and i.email = public.my_confirmed_email()
   order by i.created_at desc;
$$;
revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;
