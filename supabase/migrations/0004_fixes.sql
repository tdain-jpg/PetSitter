-- ============================================================================
-- 0004 — fixes: scope task completion uniqueness to the guide
-- ============================================================================
-- task_completions was keyed by a global unique (task_id, date). Generated
-- task ids are deterministic client-side strings (e.g. 'walk-morning',
-- 'feeding-<petId>-<feedingId>') shared by every guide covering the same pet
-- (and by duplicated guides verbatim), so completions collided across guides —
-- an upsert from guide B rewrote guide A's row (including guide_id), and an
-- uncheck in one guide deleted the other's completion. Because the constraint
-- was global across users too, two users completing the same static task id on
-- the same date collided and the second user's upsert hard-errored under RLS.
--
-- Fix: uniqueness is per (guide_id, task_id, date). The client upserts with
-- onConflict 'guide_id,task_id,date' and deletes with a guide_id filter.
-- ============================================================================

alter table public.task_completions
  drop constraint if exists task_completions_task_id_date_key;

alter table public.task_completions
  add constraint task_completions_guide_task_date_key
  unique (guide_id, task_id, date);
