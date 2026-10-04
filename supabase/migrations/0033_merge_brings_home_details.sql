-- 0033 Moving pets into another household brings Home details along.
--
-- merge_my_household_into (0031) moved pets and guides but not the household's
-- Home details (0032), which arrived a migration later. Someone who had typed
-- their address and contacts, then joined their partner's household and moved
-- their pets across, would find all of it left behind in the empty household
-- they just left. Same function, one step added after the guides move; every
-- refusal and every other line is unchanged from 0031.

create or replace function public.merge_my_household_into(p_target uuid)
returns table (pets_moved integer, guides_moved integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source uuid;
  v_members integer;
  v_sitters integer;
  v_pets integer;
  v_guides integer;
begin
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_target and m.user_id = auth.uid()
  ) then
    -- Same answer for "no such household" and "not yours", so an id is never
    -- an existence oracle.
    raise exception 'household not found';
  end if;

  v_source := public.my_primary_household();

  if v_source is null then
    raise exception 'you have no household to move';
  end if;

  if v_source = p_target then
    raise exception 'that is already your household';
  end if;

  /**
   * ONLY IF YOU ARE ALONE IN IT.
   *
   * A household with other members holds THEIR pets and guides too, and
   * "merge" would move everyone's belongings somewhere they never agreed to,
   * at the request of any one member. Refusing is the only safe answer: the
   * person doing this is describing their own move, not everybody's.
   */
  select count(*) into v_members
  from public.household_members m where m.household_id = v_source;

  if v_members > 1 then
    raise exception 'household_has_other_members';
  end if;

  /**
   * AND ONLY IF NO SITTER IS WATCHING IT.
   *
   * sitter_connections attach to a HOUSEHOLD. Move the pets out and a
   * connected sitter keeps their access to a household that no longer contains
   * anything, so their client card silently empties — while the animals they
   * are actually looking after are now somewhere they cannot see. Refuse, and
   * say so, rather than quietly breaking somebody's job.
   */
  select count(*) into v_sitters
  from public.sitter_connections sc
  where sc.household_id = v_source and sc.status in ('invited', 'active');

  if v_sitters > 0 then
    raise exception 'household_has_sitters';
  end if;

  -- Guides carry pet_ids, and the pets travel with them, so the ids stay valid
  -- and 0007's guides_validate_pet_ids trigger stays satisfied. Cheat sheets,
  -- task completions and share links reference the GUIDE rather than the
  -- household, so they follow it without being touched.
  update public.pets set household_id = p_target where household_id = v_source;
  get diagnostics v_pets = row_count;

  update public.guides set household_id = p_target where household_id = v_source;
  get diagnostics v_guides = row_count;

  /**
   * Home details (0032) come along when the household being joined has none,
   * so the person moving in does not lose the address and contacts they typed.
   * When it already has its own, those win: they belong to the people who were
   * there first, and overwriting them with a newcomer's would be the surprise.
   * The newcomer's copy is then left where it was, untouched, rather than
   * deleted; nothing a user typed disappears because of a move.
   */
  if not exists (select 1 from public.household_home_details d where d.household_id = p_target) then
    insert into public.household_home_details (household_id, owners, emergency_contacts, home_info)
    select p_target, d.owners, d.emergency_contacts, d.home_info
      from public.household_home_details d
     where d.household_id = v_source;
    delete from public.household_home_details where household_id = v_source;
  end if;

  -- Point the caller's default at the household their data now lives in.
  -- Without this, set_default_household (0006) would keep stamping the old,
  -- now-empty household onto everything they create next.
  update public.settings set primary_household_id = p_target where user_id = auth.uid();

  return query select v_pets, v_guides;
end;
$$;

revoke all on function public.merge_my_household_into(uuid) from public, anon;
grant execute on function public.merge_my_household_into(uuid) to authenticated;
