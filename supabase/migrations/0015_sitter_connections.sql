-- 0015_sitter_connections.sql
-- Migration to add sitter connections for Pawstructions app

create table if not exists public.sitter_connections (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  sitter_user_id uuid references auth.users(id) on delete cascade,
  email         text not null,
  status        text not null default 'invited'
                check (status in ('invited','active','revoked','declined')),
  starts_on     date,
  ends_on       date,
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint sitter_connections_date_window
    check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create index if not exists sitter_connections_sitter_status_idx
  on public.sitter_connections (sitter_user_id, status);

create index if not exists sitter_connections_household_id_idx
  on public.sitter_connections (household_id);

-- Partial unique index to prevent multiple live connections for same email in a household
create unique index if not exists sitter_connections_household_email_unique
  on public.sitter_connections (household_id, email)
  where status in ('invited', 'active');

-- Trigger to lowercase and trim email
-- search_path is pinned for the same reason every other function here pins it:
-- an unqualified name inside a function body resolves against the CALLER's
-- search_path unless fixed, and Supabase's linter flags the omission as
-- function_search_path_mutable.
create or replace function public.lowercase_sitter_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

revoke all on function public.lowercase_sitter_email() from public, anon, authenticated;

drop trigger if exists lowercase_sitter_email_trigger on public.sitter_connections;
create trigger lowercase_sitter_email_trigger
  before insert or update on public.sitter_connections
  for each row execute function public.lowercase_sitter_email();

-- Helper function to check if a user is a connected sitter for a household
create or replace function public.is_connected_sitter(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sitter_connections sc
     where sc.household_id = h
       and sc.sitter_user_id = auth.uid()
       and sc.status = 'active'
       and (sc.starts_on is null or sc.starts_on <= current_date)
       and (sc.ends_on is null or current_date <= sc.ends_on)
  );
$$;

revoke all on function public.is_connected_sitter(uuid) from public, anon;
grant execute on function public.is_connected_sitter(uuid) to authenticated;

-- Enable RLS on sitter_connections
alter table public.sitter_connections enable row level security;

-- Policies for sitter_connections
drop policy if exists "sitter_connections: owner, sitter, or invitee can read" on public.sitter_connections;
create policy "sitter_connections: owner, sitter, or invitee can read"
  on public.sitter_connections for select
  using (
    public.is_household_owner(household_id)
    or sitter_user_id = auth.uid()
    or email = public.my_confirmed_email()
  );

-- No insert/update/delete policies for API roles - all writes go through RPCs
-- This is intentional to prevent direct manipulation of connections

-- Policies for pets and guides accessible to connected sitters
drop policy if exists "pets: connected sitter can read" on public.pets;
create policy "pets: connected sitter can read"
  on public.pets for select using (public.is_connected_sitter(household_id));

drop policy if exists "guides: connected sitter can read" on public.guides;
create policy "guides: connected sitter can read"
  on public.guides for select using (public.is_connected_sitter(household_id));

-- Task completion policies for connected sitters
drop policy if exists "task_completions: connected sitter can insert" on public.task_completions;
create policy "task_completions: connected sitter can insert"
  on public.task_completions for insert
  with check (
    -- Delegates to is_connected_sitter rather than restating status and the
    -- date window: three copies of that rule is three places to forget when it
    -- changes. A guide id that resolves to no row yields NULL, and
    -- is_connected_sitter(NULL) is false, so an unknown guide is refused.
    public.is_connected_sitter(
      (select g.household_id from public.guides g where g.id = guide_id)
    )
  );

drop policy if exists "task_completions: connected sitter can delete" on public.task_completions;
create policy "task_completions: connected sitter can delete"
  on public.task_completions for delete
  using (
    -- Delegates to is_connected_sitter rather than restating status and the
    -- date window: three copies of that rule is three places to forget when it
    -- changes. A guide id that resolves to no row yields NULL, and
    -- is_connected_sitter(NULL) is false, so an unknown guide is refused.
    public.is_connected_sitter(
      (select g.household_id from public.guides g where g.id = guide_id)
    )
  );

-- RPC: invite_sitter
create or replace function public.invite_sitter(h uuid, sitter_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_household_owner(h) then
    raise exception 'not authorized';
  end if;

  if not (sitter_email ~ '^[^@\s]+@[^@\s]+$') then
    raise exception 'invalid email format';
  end if;

  -- Check for existing live connection
  if exists (
    select 1 from public.sitter_connections sc
     where sc.household_id = h
       and sc.email = lower(trim(sitter_email))
       and sc.status in ('invited', 'active')
  ) then
    raise exception 'already connected';
  end if;

  insert into public.sitter_connections (
    household_id, email, invited_by
  ) values (
    h, lower(trim(sitter_email)), auth.uid()
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.invite_sitter(uuid, text) from public, anon;
grant execute on function public.invite_sitter(uuid, text) to authenticated;

-- RPC: respond_to_sitter_invite
create or replace function public.respond_to_sitter_invite(connection uuid, accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row sitter_connections%rowtype;
begin
  if public.my_confirmed_email() is null then
    raise exception 'your account has no confirmed email address';
  end if;

  select * into invite_row
  from public.sitter_connections sc
  where sc.id = connection
  for update;

  if not found or invite_row.email != public.my_confirmed_email() then
    raise exception 'invite not found';
  end if;

  if invite_row.status != 'invited' then
    raise exception 'invite not found';
  end if;

  if accept then
    update public.sitter_connections sc
    set status = 'active',
        sitter_user_id = auth.uid(),
        responded_at = now()
    where sc.id = connection;
  else
    update public.sitter_connections sc
    set status = 'declined',
        responded_at = now()
    where sc.id = connection;
  end if;

  return accept;
end;
$$;

revoke all on function public.respond_to_sitter_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_sitter_invite(uuid, boolean) to authenticated;

-- RPC: revoke_sitter
create or replace function public.revoke_sitter(connection uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  household_id uuid;
begin
  select sc.household_id into household_id
  from public.sitter_connections sc
  where sc.id = connection;

  if household_id is null or not public.is_household_owner(household_id) then
    raise exception 'not found';
  end if;

  update public.sitter_connections sc
  set status = 'revoked',
      responded_at = now()
  where sc.id = connection and sc.status != 'revoked';

  return found;
end;
$$;

revoke all on function public.revoke_sitter(uuid) from public, anon;
grant execute on function public.revoke_sitter(uuid) to authenticated;

-- RPC: my_sitter_connections
create or replace function public.my_sitter_connections()
returns table (
  id uuid,
  household_id uuid,
  household_name text,
  status text,
  starts_on date,
  ends_on date
)
language sql
security definer
set search_path = public
as $$
  select sc.id, sc.household_id, h.name, sc.status, sc.starts_on, sc.ends_on
  from public.sitter_connections sc
  join public.households h on h.id = sc.household_id
  where sc.sitter_user_id = auth.uid()
  order by h.name;
$$;

revoke all on function public.my_sitter_connections() from public, anon;
grant execute on function public.my_sitter_connections() to authenticated;
