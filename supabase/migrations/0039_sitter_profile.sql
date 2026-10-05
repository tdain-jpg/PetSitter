-- 0039 A sitter profile owners can see: name, phone, business, photo.
--
-- Until now an owner knew their sitter only as an email address. The sitter
-- could call the owner (owner_contact, 0025) but the owner could not call the
-- sitter from the app, and every screen said "amandahbeth@gmail.com" where a
-- person's name belonged.
--
-- The details live on profiles (the sitter's own row, which only they can
-- read or write). Owners never read profiles directly. They read them through
-- household_sitters(), which hands a household's members the profile of each
-- sitter connected to that household, and only once the sitter has ACCEPTED:
-- an invitation someone has not answered yet shares nothing of theirs.
--
-- The photo reuses the pet photo pipeline unchanged: the same public
-- 'pet-photos' bucket, uploaded into the sitter's own folder, stored here as
-- its public URL.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists business_name text,
  add column if not exists photo_url text;

alter table public.profiles drop constraint if exists profiles_sitter_fields_sane;
alter table public.profiles add constraint profiles_sitter_fields_sane check (
  (phone is null or char_length(phone) between 7 and 40)
  and (business_name is null or char_length(business_name) <= 120)
  and (full_name is null or char_length(full_name) <= 120)
  and (photo_url is null or (photo_url like 'https://%' and char_length(photo_url) <= 1000))
);

/**
 * A household's sitters, for its members: every connection row, plus the
 * sitter's own profile details for the ones who have accepted. Invited,
 * revoked and declined rows come back with the profile columns null.
 */
create or replace function public.household_sitters(h uuid)
returns table (
  connection_id uuid,
  email text,
  status text,
  starts_on date,
  ends_on date,
  created_at timestamptz,
  sitter_name text,
  sitter_phone text,
  business_name text,
  photo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select sc.id, sc.email, sc.status, sc.starts_on, sc.ends_on, sc.created_at,
         case when sc.status = 'active' then nullif(btrim(p.full_name), '') end,
         case when sc.status = 'active' then nullif(btrim(p.phone), '') end,
         case when sc.status = 'active' then nullif(btrim(p.business_name), '') end,
         case when sc.status = 'active' then p.photo_url end
    from public.sitter_connections sc
    left join public.profiles p on p.id = sc.sitter_user_id
   where sc.household_id = h
     and public.is_household_member(h)
   order by sc.created_at desc;
$$;
revoke all on function public.household_sitters(uuid) from public, anon;
grant execute on function public.household_sitters(uuid) to authenticated;
