-- ============================================================================
-- Public share resolution
-- ============================================================================
-- Anonymous (signed-out) users need to view a guide via its share code without
-- granting them broad SELECT on guides/pets/share_links. We expose ONE
-- SECURITY DEFINER function that:
--   1. Looks up the share_link by code, validates active + not expired
--   2. Increments view_count
--   3. Returns the guide + referenced pets as a single JSONB payload
-- ============================================================================

create or replace function public.resolve_share(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_id    uuid;
  v_guide_id   uuid;
  v_guide      public.guides%rowtype;
  v_pets       jsonb;
begin
  -- Validate share link
  select id, guide_id
    into v_link_id, v_guide_id
    from public.share_links
   where code = p_code
     and is_active = true
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_link_id is null then
    return null;
  end if;

  -- Increment view counter (best-effort; non-blocking)
  update public.share_links
     set view_count = view_count + 1
   where id = v_link_id;

  -- Load guide
  select * into v_guide from public.guides where id = v_guide_id;
  if not found then
    return null;
  end if;

  -- Load referenced pets (only those listed in guide.pet_ids)
  select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb)
    into v_pets
    from public.pets p
   where p.id = any(v_guide.pet_ids);

  return jsonb_build_object(
    'guide', to_jsonb(v_guide),
    'pets',  v_pets
  );
end;
$$;

-- Anyone with the code can resolve it. RLS still protects everything else.
revoke all on function public.resolve_share(text) from public;
grant execute on function public.resolve_share(text) to anon, authenticated;
