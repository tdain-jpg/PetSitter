-- 0047 A short bio for each pet, written with AI and editable by the owner.
--
-- Agreed 2026-10-21: a "Write a bio" feature on the pet's page, tested on
-- Clark and Lillee (admin only, enforced in generate-pet-bio) before it is
-- opened to everyone. Bios are meant to be shared, so the generator is told
-- never to include medical details or anything identifying the owners.
-- Saved through the ordinary pet update, so the existing household RLS on
-- pets governs who can change it.
alter table public.pets
  add column if not exists bio text,
  add column if not exists bio_updated_at timestamptz;
alter table public.pets drop constraint if exists pets_bio_length;
alter table public.pets add constraint pets_bio_length check (bio is null or char_length(bio) <= 2000);
