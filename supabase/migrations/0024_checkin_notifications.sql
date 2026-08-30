-- 0024_checkin_notifications.sql
-- Email the household when their sitter posts a check-in.
--
-- A QA pass walked the sitter journey end to end and named the one thing it
-- would actually want in the field: there is no way for the sitter to reach the
-- owner. The emergency contact has a tap-to-call button. The vet has one. The
-- owner appears nowhere. So a pet that stops eating on day three leaves the
-- sitter with a journal entry nobody may read for hours, or the neighbour.
--
-- Of the three shapes recorded in ROADMAP, this is the one that needs NO
-- contact details to be shared with anybody. The sitter still cannot see the
-- owner's address or number; the owner simply finds out that a check-in landed,
-- through the same outbox that already emails invitations and share-opens. If
-- the answer later is also to expose a contact field, that is a separate and
-- deliberate decision — this does not pre-empt it.
--
-- WHO GETS IT: every member of the household, when the author is NOT one of
-- them — i.e. when a sitter posted. A member writing in the shared feed does
-- not email the rest of the household; that is a different feature with a
-- different noise profile and nobody asked for it. The sitter, not being a
-- member, is never a recipient of anything here.

-- ---------------------------------------------------------------------------
-- Allow the new kind.
--
-- Dropped and re-added rather than altered: Postgres has no ALTER CONSTRAINT
-- for a CHECK expression, and re-adding revalidates the existing rows, which is
-- the point. Widening a CHECK cannot fail on data that already satisfied the
-- narrower one, but running it and finding out beats assuming.
-- ---------------------------------------------------------------------------
alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_kind;
alter table public.notifications_outbox
  add constraint notifications_outbox_kind
  check (kind in ('invite', 'share_opened', 'trip_incomplete', 'sitter_checkin'));

-- ---------------------------------------------------------------------------
-- Enqueue on insert.
--
-- Modelled on enqueue_share_opened (0008), including the part that matters
-- most: the whole body is wrapped in a handler that swallows every error. A
-- check-in is the sitter telling the owner the dog is fine. Losing the email
-- about it is a disappointment; failing the INSERT because the notification
-- plumbing had a bad day would mean the sitter's message never existed. The
-- notification is the least important thing in this transaction and it must
-- behave that way.
--
-- The display name is derived the same way the client's personNameFromEmail
-- does it — local part, plus-address stripped, separators to spaces, first
-- letter up. An owner reading "tcdain+qasitter@gmail.com checked in" was a
-- defect fixed in the app this week; it would be a poor look to reintroduce it
-- in the email.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_sitter_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  select 'sitter_checkin',
         lower(u.email),
         jsonb_build_object(
           'sitter_name', coalesce(
             nullif(
               initcap(
                 replace(
                   replace(
                     split_part(split_part(author.email, '@', 1), '+', 1),
                     '.', ' '),
                   '_', ' ')
               ), ''),
             'Your sitter'),
           'note', new.note,
           'household_name', h.name,
           'guide_title', g.title
         ),
         'sitter_checkin:' || new.id::text || ':' || m.user_id::text
    from public.households h
    join public.household_members m on m.household_id = h.id
    join auth.users u on u.id = m.user_id
    left join public.guides g on g.id = new.guide_id
    left join auth.users author on author.id = new.author_user_id
   where h.id = new.household_id
     -- SITTER check-ins only. This is a sitter-to-owner channel, and a family
     -- member jotting a note in the shared feed emailing everyone else is a
     -- different feature with a different noise profile — one nobody asked
     -- for. Restricting it here rather than in the app means it holds however
     -- the row was written.
     and not exists (
       select 1 from public.household_members am
        where am.household_id = new.household_id
          and am.user_id = new.author_user_id
     )
     -- And never the author, belt-and-braces: the clause above already implies
     -- it, but this stays correct if the membership test is ever relaxed.
     and m.user_id is distinct from new.author_user_id
     and u.email_confirmed_at is not null
     -- Same shape test 0021 put on the column, so one member's malformed
     -- address cannot abort the multi-row insert for everybody else.
     and u.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
exception
  when others then
    -- Swallow by design: never let notification plumbing break a check-in.
    return null;
end;
$$;

revoke execute on function public.enqueue_sitter_checkin()
  from public, anon, authenticated;

drop trigger if exists sitter_checkins_notify on public.sitter_checkins;
create trigger sitter_checkins_notify
  after insert on public.sitter_checkins
  for each row execute function public.enqueue_sitter_checkin();
