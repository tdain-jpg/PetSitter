-- 0050 A personal note from Tim a week into a sitter's free month.
--
-- Agreed 2026-10-21: the moment a sitter is most likely to say what is
-- missing, and before they decide whether to keep paying. The free month is
-- 30 days and, while trialing, current_period_end is the trial's end, so
-- "about day 7" is "about 23 days left". The daily job queues it with a
-- 21-to-24-day window (GitHub's schedule can slip by a day) and a per-
-- subscription dedupe key, so each trial gets it exactly once. Test accounts
-- are skipped. Replies go to Tim (notify sets reply-to).

alter table public.notifications_outbox
  drop constraint if exists notifications_outbox_kind;
alter table public.notifications_outbox
  add constraint notifications_outbox_kind
  check (kind in ('invite', 'share_opened', 'trip_incomplete', 'sitter_checkin',
                  'sitter_wants_to_connect', 'sitter_invite', 'trip_request',
                  'trip_response', 'feedback', 'sitter_trial_checkin'));

create or replace function public.queue_sitter_trial_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  select 'sitter_trial_checkin',
         lower(u.email),
         jsonb_build_object('first_name', split_part(coalesce(public.person_name(s.user_id, null), ''), ' ', 1),
                            'trial_ends', s.current_period_end::date),
         'trial_checkin:' || s.stripe_subscription_id
    from public.sitter_subscriptions s
    join auth.users u on u.id = s.user_id
   where s.status = 'trialing'
     and s.stripe_subscription_id is not null
     and s.current_period_end between now() + interval '21 days' and now() + interval '24 days'
     and not public.is_test_user(s.user_id)
     and u.email is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.queue_sitter_trial_checkins() from public, anon, authenticated;
