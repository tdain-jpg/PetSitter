-- ============================================================================
-- Pet Sitter Pro — initial schema
-- ============================================================================
-- Notes:
--   * Nested types (HealthProtocol, FeedingSchedule[], EmergencyContact[],
--     HomeInfo, TravelItinerary, DailyRoutine, HomeCare, etc.) are stored as
--     JSONB to match the existing TypeScript types verbatim. This keeps the
--     adapter layer trivial; query patterns are always row-by-id, so no joins
--     are needed.
--   * UUIDs for top-level rows; child entities inside JSONB keep their existing
--     string IDs (generated client-side).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles : 1:1 with auth.users, populated via trigger on signup
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Auto-create profile row when a user signs up (email/password, OAuth, magic link)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- pets
-- ----------------------------------------------------------------------------
create table public.pets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  species               text not null,
  breed                 text,
  sex                   text,
  is_neutered           boolean,
  nicknames             text,
  age                   numeric,
  weight                numeric,
  weight_unit           text,
  color_markings        text,
  microchip_id          text,
  license_tag           text,
  photo_url             text,
  personality           jsonb,
  medical_notes         text,
  vet_info              jsonb,
  insurance             jsonb,
  health_protocol       jsonb,
  feeding_schedule      jsonb not null default '[]'::jsonb,
  medications           jsonb not null default '[]'::jsonb,
  behavioral_notes      text,
  special_instructions  text,
  status                text not null default 'active',
  deceased_date         date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index pets_user_id_idx on public.pets (user_id);
create index pets_status_idx  on public.pets (user_id, status);

-- ----------------------------------------------------------------------------
-- guides
-- ----------------------------------------------------------------------------
create table public.guides (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null,
  pet_ids             uuid[] not null default '{}'::uuid[],
  start_date          date,
  end_date            date,
  emergency_contacts  jsonb not null default '[]'::jsonb,
  home_info           jsonb not null default '{}'::jsonb,
  travel_itinerary    jsonb,
  daily_routine       jsonb,
  home_care           jsonb,
  additional_notes    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index guides_user_id_idx on public.guides (user_id);

-- ----------------------------------------------------------------------------
-- task_completions
-- ----------------------------------------------------------------------------
create table public.task_completions (
  id            uuid primary key default gen_random_uuid(),
  task_id       text not null,
  guide_id      uuid not null references public.guides(id) on delete cascade,
  date          date not null,
  completed_at  timestamptz,
  completed_by  text,
  notes         text,
  unique (task_id, date)
);
create index task_completions_guide_date_idx on public.task_completions (guide_id, date);

-- ----------------------------------------------------------------------------
-- share_links
-- ----------------------------------------------------------------------------
create table public.share_links (
  id           uuid primary key default gen_random_uuid(),
  guide_id     uuid not null references public.guides(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  code         text not null unique,
  expires_at   timestamptz,
  is_active    boolean not null default true,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index share_links_code_idx     on public.share_links (code) where is_active;
create index share_links_user_id_idx  on public.share_links (user_id);

-- ----------------------------------------------------------------------------
-- cheat_sheets : one per guide
-- ----------------------------------------------------------------------------
create table public.cheat_sheets (
  id            uuid primary key default gen_random_uuid(),
  guide_id      uuid not null unique references public.guides(id) on delete cascade,
  content       text not null,
  generated_at  timestamptz not null default now(),
  model_used    text
);

-- ----------------------------------------------------------------------------
-- settings : one per user
-- ----------------------------------------------------------------------------
create table public.settings (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  theme                  text not null default 'system',
  gemini_api_key         text,
  notifications_enabled  boolean not null default true,
  auto_save_enabled      boolean not null default true,
  onboarding_completed   boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- onboarding_state : one per user, deleted on completion
-- ----------------------------------------------------------------------------
create table public.onboarding_state (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  current_step      text not null default 'welcome',
  completed_steps   text[] not null default '{}',
  first_pet_id      uuid,
  first_guide_id    uuid,
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pets_set_updated_at              before update on public.pets              for each row execute function public.set_updated_at();
create trigger guides_set_updated_at            before update on public.guides            for each row execute function public.set_updated_at();
create trigger settings_set_updated_at          before update on public.settings          for each row execute function public.set_updated_at();
create trigger onboarding_state_set_updated_at  before update on public.onboarding_state  for each row execute function public.set_updated_at();
