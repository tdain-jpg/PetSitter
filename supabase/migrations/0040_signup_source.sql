-- 0040 Where each new account came from.
--
-- Growth is meant to come from the product itself: the QR code on a printed
-- cheat sheet, the footer of a share link, sitter and family invitations. To
-- know which of those actually brings people, every link carries ?ref=<slug>,
-- the app keeps the first one it sees, and a brand-new account records it
-- here once. 'direct' means no ref at all.
--
-- First touch, set once: an account older than a day is not new, and a source
-- already recorded is never overwritten, so signing in later from a different
-- link cannot rewrite history.

alter table public.profiles
  add column if not exists signup_source text;

alter table public.profiles drop constraint if exists profiles_signup_source_slug;
alter table public.profiles add constraint profiles_signup_source_slug
  check (signup_source is null or signup_source ~ '^[a-z0-9_]{1,32}$');

create or replace function public.record_signup_source(p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(coalesce(nullif(btrim(p_source), ''), 'direct'));
  v_created timestamptz;
begin
  if auth.uid() is null then
    return null;
  end if;
  if v_source !~ '^[a-z0-9_]{1,32}$' then
    v_source := 'direct';
  end if;
  select u.created_at into v_created from auth.users u where u.id = auth.uid();
  if v_created is null or v_created < now() - interval '1 day' then
    return null;
  end if;
  update public.profiles
     set signup_source = v_source
   where id = auth.uid() and signup_source is null;
  return v_source;
end;
$$;
revoke all on function public.record_signup_source(text) from public, anon;
grant execute on function public.record_signup_source(text) to authenticated;
