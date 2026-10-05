-- 0043 Usage reported as real and test side by side.
--
-- 0042 left test accounts out of the usage counts, which made the numbers
-- right but invisible: Tim could not see that test activity existed, or how
-- much. Each metric now returns both, so the Usage tab shows a Real column
-- and a Test column. Same metrics and windows as before.

drop function if exists public.admin_usage(int);
create function public.admin_usage(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 3650)));
  out jsonb := '[]'::jsonb;
  r record;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  for r in
    select 'New accounts' label,
           count(*) filter (where not public.is_test_user(u.id)) real_n,
           count(*) filter (where public.is_test_user(u.id)) test_n
      from auth.users u where u.created_at >= since
    union all
    select 'Pets added', count(*) filter (where not public.is_test_household(p.household_id)), count(*) filter (where public.is_test_household(p.household_id))
      from public.pets p where p.created_at >= since
    union all
    select 'Guides created', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.guides g where g.created_at >= since
    union all
    select 'Cheat sheets generated', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.cheat_sheets c join public.guides g on g.id = c.guide_id where c.generated_at >= since
    union all
    select 'Share links created', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.share_links s join public.guides g on g.id = s.guide_id where s.created_at >= since
    union all
    select 'Share link views (links made in period)',
           coalesce(sum(s.view_count) filter (where not public.is_test_household(g.household_id)), 0),
           coalesce(sum(s.view_count) filter (where public.is_test_household(g.household_id)), 0)
      from public.share_links s join public.guides g on g.id = s.guide_id where s.created_at >= since
    union all
    select 'Tasks ticked off', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.task_completions t join public.guides g on g.id = t.guide_id where t.completed_at >= since
    union all
    select 'Sitter check-ins', count(*) filter (where not public.is_test_household(c.household_id)), count(*) filter (where public.is_test_household(c.household_id))
      from public.sitter_checkins c where c.created_at >= since
    union all
    select 'Family invites sent', count(*) filter (where not public.is_test_household(i.household_id)), count(*) filter (where public.is_test_household(i.household_id))
      from public.household_invites i where i.created_at >= since
    union all
    select 'Family invites accepted', count(*) filter (where not public.is_test_household(i.household_id)), count(*) filter (where public.is_test_household(i.household_id))
      from public.household_invites i where i.status = 'accepted' and i.responded_at >= since
    union all
    select 'Sitter invites sent', count(*) filter (where not public.is_test_household(s.household_id)), count(*) filter (where public.is_test_household(s.household_id))
      from public.sitter_connections s where s.created_at >= since
    union all
    select 'Sitter invites accepted', count(*) filter (where not public.is_test_household(s.household_id)), count(*) filter (where public.is_test_household(s.household_id))
      from public.sitter_connections s where s.status = 'active' and s.responded_at >= since
    union all
    select 'Trips given a sitter', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.guides g where g.sitter_connection_id is not null and g.updated_at >= since
    union all
    select 'Trips accepted by a sitter', count(*) filter (where not public.is_test_household(g.household_id)), count(*) filter (where public.is_test_household(g.household_id))
      from public.guides g where g.sitter_status = 'accepted' and g.sitter_responded_at >= since
    union all
    select 'Home details saved', count(*) filter (where not public.is_test_household(d.household_id)), count(*) filter (where public.is_test_household(d.household_id))
      from public.household_home_details d where d.updated_at >= since
    union all
    select 'Promo codes redeemed', count(*) filter (where not public.is_test_user(x.user_id)), count(*) filter (where public.is_test_user(x.user_id))
      from public.promo_redemptions x where x.created_at >= since
    union all
    select 'Feedback received', count(*) filter (where not public.is_test_user(f.user_id)), count(*) filter (where public.is_test_user(f.user_id))
      from public.feedback f where f.created_at >= since
    union all
    (select 'Logged: ' || a.event, count(*) filter (where not public.is_test_user(a.user_id)), count(*) filter (where public.is_test_user(a.user_id))
       from public.app_events a where a.created_at >= since group by a.event order by count(*) desc)
  loop
    out := out || jsonb_build_object('label', r.label, 'real', r.real_n, 'test', r.test_n);
  end loop;
  return out;
end;
$$;
revoke all on function public.admin_usage(int) from public, anon;
grant execute on function public.admin_usage(int) to authenticated;
