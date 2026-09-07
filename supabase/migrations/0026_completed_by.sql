-- 0026_completed_by.sql
-- Record WHO ticked a task.
--
-- task_completions has had a `completed_by text` column since 0001, described
-- in types/index.ts as "sitter name or ID", and nothing has ever written to it.
-- So an owner opening the daily routine can see that the dog was fed and
-- cannot see whether they fed it or their sitter did — which, once you are
-- paying somebody to do it, is most of the point of the checklist.
--
-- PINNED SERVER-SIDE, never sent by the client.
--
-- A client-supplied value here would be worth nothing: the person with the
-- most reason to write "the sitter did it" is the sitter. A BEFORE trigger
-- overwrites whatever arrives with auth.uid(), so the column is a fact about
-- who made the request rather than a claim in the request body.
--
-- The user ID, not a name. Names change, and resolving one here would mean
-- reading auth.users inside a trigger and freezing a display string into a row
-- forever. The client compares this to its own user id, which is all it needs
-- to say "you" or "your sitter" — and it stays correct if anybody renames
-- themselves later.
--
-- Existing rows keep completed_by null. Backfilling would mean guessing, and a
-- guessed attribution is worse than an honest blank: the UI simply says
-- nothing for rows that predate this.

create or replace function public.pin_task_completion_author()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- SECURITY INVOKER on purpose: this must run as the caller so auth.uid() is
  -- the caller. A definer function here would record the function owner.
  new.completed_by := auth.uid()::text;
  return new;
end;
$$;

drop trigger if exists task_completions_pin_author on public.task_completions;
create trigger task_completions_pin_author
  before insert or update on public.task_completions
  for each row execute function public.pin_task_completion_author();

comment on column public.task_completions.completed_by is
  'auth.uid() of whoever ticked it, pinned by trigger — never trusted from the '
  'client. Null on rows predating migration 0026.';
