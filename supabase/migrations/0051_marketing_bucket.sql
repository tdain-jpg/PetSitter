-- 0051: a public bucket for marketing media (2026-10-21).
--
-- Instagram and Facebook fetch a post's video or image from a public URL;
-- they do not accept an upload from n8n directly. This bucket holds those
-- files: the promo video first, later whatever the Pawstructions posting
-- workflow publishes.
--
-- Kept apart from pet-photos on purpose: that bucket holds customers' photos
-- and caps files at 5 MB. Anyone may read from this bucket, and no policy
-- grants writes, so only the service role (Tim's tooling) can add files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing',
  'marketing',
  true,
  104857600, -- 100 MB
  array['video/mp4', 'video/quicktime', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
