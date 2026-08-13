-- ============================================================================
-- 0005 — hardening (from Supabase security advisors)
-- ============================================================================
-- 1. handle_new_user is a trigger function (SECURITY DEFINER); it must not be
--    callable as an RPC by anon/authenticated. Revoke all API-role EXECUTE.
-- 2. set_updated_at had a role-mutable search_path; pin it. Also revoke RPC
--    execute — it is trigger-only.
-- resolve_share keeps anon EXECUTE intentionally: it is the public share-link
-- resolution mechanism (validates the code, increments view_count).
-- ============================================================================

revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
