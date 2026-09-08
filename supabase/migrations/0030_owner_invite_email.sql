-- 0030: email the owner when a sitter asks to connect.
--
-- Same outbox pattern as every other notification (0008): a trigger enqueues,
-- the notify function delivers, and dedupe_key makes a retry harmless.
--
-- The recipient usually has NO ACCOUNT at all — that is the entire point of the
-- sitter-to-owner direction — so this email is the only way they learn the ask
-- exists. It has to say who is asking and what accepting would give them.

-- notifications_outbox constrains `kind` to a known list, so a new notification
-- type has to be admitted before anything can enqueue one. The dry run found
-- this by failing the insert, which is exactly the job of a dry run: the
-- trigger would otherwise have raised on the first real invitation and taken
-- the whole invite down with it, since it fires inside invite_owner.
alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_kind;
alter table public.notifications_outbox
  add constraint notifications_outbox_kind
  check (kind in ('invite', 'share_opened', 'trip_incomplete', 'sitter_checkin',
                  'sitter_wants_to_connect'));

create or replace function public.enqueue_owner_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sitter_email text;
  v_sitter_name text;
begin
  select lower(u.email) into v_sitter_email from auth.users u where u.id = new.sitter_user_id;
  select nullif(p.full_name, '') into v_sitter_name from public.profiles p where p.id = new.sitter_user_id;

  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  values (
    'sitter_wants_to_connect',
    new.email,
    jsonb_build_object(
      'sitter_email', v_sitter_email,
      'sitter_name',  coalesce(v_sitter_name, v_sitter_email)
    ),
    'owner_invite:' || new.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end;
$$;

drop trigger if exists sitter_owner_invites_email on public.sitter_owner_invites;
create trigger sitter_owner_invites_email
  after insert on public.sitter_owner_invites
  for each row when (new.status = 'invited')
  execute function public.enqueue_owner_invite_email();
