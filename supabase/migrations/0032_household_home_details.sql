-- 0032 Home details: the facts about a household that every guide repeats.
--
-- Until now the address, the owners' phone numbers, the emergency contacts and
-- the door codes lived only on each guide, so every new trip started blank and
-- an owner typed the same things again. QA on Tim's own account (2026-10-04):
-- "Why doesn't any of this information auto populate from our account?"
--
-- One row per household, entered once (at sign-up, or later from Household),
-- and copied INTO each new guide, where it can still be changed per trip. The
-- guide stays the thing a sitter sees: nothing here is ever shown to a sitter
-- directly.
--
-- A separate table rather than columns on households, because of who can read
-- what. This holds door, alarm and gate codes. Sitters can learn a household's
-- name through the sitter RPCs; a code must never ride along with that. Here
-- the policy is simply "members of the household", and a sitter is not one.
-- Codes reach a sitter only the way they always have: inside a guide the owner
-- chose to share.
--
-- Shapes match the guide's own columns exactly, so the copy is a plain
-- assignment:
--   emergency_contacts  EmergencyContact[]   (same as guides.emergency_contacts)
--   home_info           HomeInfo             (same as guides.home_info)
--   owners              [{ name, phone, email? }]  the people the sitter calls first

create table if not exists public.household_home_details (
  household_id        uuid primary key references public.households (id) on delete cascade,
  owners              jsonb not null default '[]'::jsonb,
  emergency_contacts  jsonb not null default '[]'::jsonb,
  home_info           jsonb not null default '{}'::jsonb,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  constraint household_home_details_owners_array check (jsonb_typeof(owners) = 'array'),
  constraint household_home_details_contacts_array check (jsonb_typeof(emergency_contacts) = 'array'),
  constraint household_home_details_home_info_object check (jsonb_typeof(home_info) = 'object')
);

alter table public.household_home_details enable row level security;

-- Members only, for every operation. Delete is included so Clear All Data can
-- remove it; the row also goes with its household via the cascade.
drop policy if exists household_home_details_select on public.household_home_details;
create policy household_home_details_select on public.household_home_details
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists household_home_details_insert on public.household_home_details;
create policy household_home_details_insert on public.household_home_details
  for insert to authenticated
  with check (public.is_household_member(household_id));

drop policy if exists household_home_details_update on public.household_home_details;
create policy household_home_details_update on public.household_home_details
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists household_home_details_delete on public.household_home_details;
create policy household_home_details_delete on public.household_home_details
  for delete to authenticated
  using (public.is_household_member(household_id));

revoke all on public.household_home_details from anon;
grant select, insert, update, delete on public.household_home_details to authenticated;

-- Who changed it and when, pinned by the server so a client cannot claim
-- someone else made the edit.
create or replace function public.household_home_details_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists household_home_details_stamp on public.household_home_details;
create trigger household_home_details_stamp
  before insert or update on public.household_home_details
  for each row execute function public.household_home_details_stamp();

-- Existing households start from what they already typed: the most recent
-- guide that has an address, a code or a contact in it. Owners cannot be
-- recovered from a guide (contacts there have no "this is the owner" marker
-- worth trusting), so they start empty. A household with nothing on any guide
-- gets no row, which reads as "not set up yet".
insert into public.household_home_details (household_id, emergency_contacts, home_info)
select distinct on (g.household_id)
       g.household_id,
       coalesce(g.emergency_contacts, '[]'::jsonb),
       coalesce(g.home_info, '{}'::jsonb)
  from public.guides g
 where g.household_id is not null
   and (
     coalesce(g.home_info, '{}'::jsonb) <> '{}'::jsonb
     or jsonb_array_length(coalesce(g.emergency_contacts, '[]'::jsonb)) > 0
   )
 order by g.household_id, g.updated_at desc
on conflict (household_id) do nothing;
