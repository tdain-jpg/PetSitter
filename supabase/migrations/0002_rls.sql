-- ============================================================================
-- Row-Level Security policies
-- ============================================================================
-- Default deny: every table gets RLS enabled, then per-table policies grant
-- access to owners (auth.uid() = user_id).
-- Anonymous share-link viewers go through the resolve_share() RPC in 0003,
-- which is SECURITY DEFINER and bypasses RLS after validating the code.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policies: insert happens via on_auth_user_created trigger
-- (security definer); delete cascades from auth.users.

-- ----------------------------------------------------------------------------
-- pets
-- ----------------------------------------------------------------------------
alter table public.pets enable row level security;

create policy "pets: owner can crud"
  on public.pets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- guides
-- ----------------------------------------------------------------------------
alter table public.guides enable row level security;

create policy "guides: owner can crud"
  on public.guides for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- task_completions : derived ownership via guides.user_id
-- ----------------------------------------------------------------------------
alter table public.task_completions enable row level security;

create policy "task_completions: guide owner can crud"
  on public.task_completions for all
  using (
    exists (
      select 1 from public.guides g
      where g.id = task_completions.guide_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.guides g
      where g.id = task_completions.guide_id
        and g.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- share_links
-- ----------------------------------------------------------------------------
alter table public.share_links enable row level security;

create policy "share_links: owner can crud"
  on public.share_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- cheat_sheets : ownership via guides.user_id
-- ----------------------------------------------------------------------------
alter table public.cheat_sheets enable row level security;

create policy "cheat_sheets: guide owner can crud"
  on public.cheat_sheets for all
  using (
    exists (
      select 1 from public.guides g
      where g.id = cheat_sheets.guide_id
        and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.guides g
      where g.id = cheat_sheets.guide_id
        and g.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- settings
-- ----------------------------------------------------------------------------
alter table public.settings enable row level security;

create policy "settings: owner can crud"
  on public.settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- onboarding_state
-- ----------------------------------------------------------------------------
alter table public.onboarding_state enable row level security;

create policy "onboarding_state: owner can crud"
  on public.onboarding_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
