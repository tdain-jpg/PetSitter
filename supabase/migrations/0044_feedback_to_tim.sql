-- 0044 Feedback emails go straight to Tim's personal inbox.
--
-- Tim asked (2026-10-21) for each new feedback message to land at
-- tcdain@gmail.com, so it reminds him to check the Admin inbox. Previously
-- they went to support@pawstructions.com. Sending to one address, not both,
-- avoids a duplicate if support@ also forwards there. Everything else in the
-- trigger is unchanged from 0041.

create or replace function public.enqueue_feedback_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- At most 10 feedback emails per sender per day; the rows are all kept.
  if (select count(*) from public.feedback f
       where f.user_id = new.user_id and f.created_at >= now() - interval '1 day') > 10 then
    return null;
  end if;
  insert into public.notifications_outbox (kind, recipient_email, payload, dedupe_key)
  values ('feedback', 'tcdain@gmail.com',
          jsonb_build_object('from_email', new.email,
                             'from_name', public.person_name(new.user_id, null),
                             'message', new.message,
                             'screen', new.context->>'screen'),
          'feedback:' || new.id::text)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return null;
end;
$$;
