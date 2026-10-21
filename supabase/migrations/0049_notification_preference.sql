-- 0049 The Settings "Email updates" switch now does something.
--
-- settings.notifications_enabled existed from the first schema and controlled
-- nothing. notify now asks this before sending an OPTIONAL email (your sitter
-- opened the guide, a sitter check-in, a trip-tomorrow reminder). Invitations,
-- trip requests and replies, feedback and anything about billing are never
-- optional and never consult it. Unknown address or no settings row: send.
create or replace function public.wants_optional_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.notifications_enabled
      from auth.users u
      join public.settings s on s.user_id = u.id
     where lower(u.email) = lower(p_email)
     limit 1), true);
$$;
revoke all on function public.wants_optional_email(text) from public, anon, authenticated;
