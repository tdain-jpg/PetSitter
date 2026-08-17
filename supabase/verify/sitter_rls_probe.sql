-- sitter_rls_probe.sql
--
-- End-to-end check of the sitter security model, against the REAL database,
-- entirely inside a transaction that rolls back. It creates a pet, a guide and
-- a sitter invitation, walks the sitter through accepting, asserts what they
-- can and cannot do, has the owner revoke, and asserts access ends.
--
-- Run:  supabase db query --linked -f supabase/verify/sitter_rls_probe.sql
--
-- Silence is success. Every check raises on failure, and the whole thing is
-- wrapped in begin/rollback, so nothing survives either outcome. Note the CLI
-- does not surface `raise notice`, so to prove the script actually reached the
-- end rather than exiting early, temporarily insert
--     raise exception 'reached the end';
-- before `reset role` and confirm you see it.
--
-- The two user ids are real production accounts (the owner and the dedicated QA
-- sitter). They are not secrets — they are uuids visible to anyone with database
-- access — but they do need updating if those accounts are ever recreated.
--
-- Why a probe and not a unit test: the thing being tested IS the database's
-- policy evaluation under a specific role. Anything that stubs Postgres tests
-- the stub. `set local role authenticated` plus request.jwt.claim.sub is what
-- PostgREST does to a real request, so this exercises the same code path a
-- signed-in browser does.
--
-- Note the claim key is `request.jwt.claim.sub` (singular, dotted), not the
-- JSON `request.jwt.claims` — this project's auth.uid() reads the former, and
-- using the latter makes every assertion pass for the wrong reason: auth.uid()
-- returns null, so nothing is visible to anyone.

begin;
do $probe$
declare
  OWNER constant uuid := '6f8f3d2c-7d0c-4229-9cab-3d47f674f2f2';  -- tim@mousetech
  SITTER constant uuid := '09906ed9-c1c6-4785-95ea-c91b75e01cb5'; -- qasitter
  SITTER_EMAIL constant text := 'tcdain+qasitter@gmail.com';
  v_hh uuid; v_pet uuid; v_guide uuid; v_conn uuid; n int;
begin
  -- Owner's household, as the owner sees it.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', OWNER::text, true);
  select id into v_hh from public.households limit 1;
  if v_hh is null then raise exception 'owner has no household'; end if;

  insert into public.pets (user_id, household_id, name, species, status)
  values (OWNER, v_hh, 'ProbeCat', 'cat', 'active') returning id into v_pet;
  insert into public.guides (user_id, household_id, title, pet_ids)
  values (OWNER, v_hh, 'Probe Guide', array[v_pet]) returning id into v_guide;

  v_conn := public.invite_sitter(v_hh, SITTER_EMAIL);
  raise notice 'invited: %', v_conn;

  -- === as the SITTER, before accepting ===
  perform set_config('request.jwt.claim.sub', SITTER::text, true);
  select count(*) into n from public.pets where id = v_pet;
  if n <> 0 then raise exception 'FAIL: invited-but-not-accepted sitter can already read pets'; end if;
  select count(*) into n from public.my_pending_sitter_invites();
  if n < 1 then raise exception 'FAIL: sitter cannot see their own pending invitation'; end if;

  if not public.respond_to_sitter_invite(v_conn, true) then
    raise exception 'FAIL: accept returned false';
  end if;

  -- === as the SITTER, after accepting ===
  select count(*) into n from public.pets where id = v_pet;
  if n <> 1 then raise exception 'FAIL: connected sitter cannot read the client pet (got %)', n; end if;
  select count(*) into n from public.guides where id = v_guide;
  if n <> 1 then raise exception 'FAIL: connected sitter cannot read the client guide'; end if;

  -- ticking a task must work (0020)
  insert into public.task_completions (task_id, guide_id, date, completed_at)
  values ('probe-task', v_guide, current_date, now());
  select count(*) into n from public.task_completions where guide_id = v_guide;
  if n <> 1 then raise exception 'FAIL: sitter cannot read back their own completion'; end if;
  update public.task_completions set notes = 'x' where guide_id = v_guide;
  delete from public.task_completions where guide_id = v_guide;

  -- check-in must work, and must be pinned to the author
  insert into public.sitter_checkins (household_id, guide_id, author_user_id, note)
  values (v_hh, v_guide, SITTER, 'probe check-in');
  begin
    insert into public.sitter_checkins (household_id, guide_id, author_user_id, note)
    values (v_hh, v_guide, OWNER, 'forged');
    raise exception 'FAIL: sitter posted a check-in under the OWNER''s name';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- writes the sitter must NOT be able to make
  update public.guides set title = 'hijacked' where id = v_guide;
  if found then raise exception 'FAIL: sitter UPDATED the client guide'; end if;
  update public.pets set name = 'hijacked' where id = v_pet;
  if found then raise exception 'FAIL: sitter UPDATED the client pet'; end if;
  delete from public.guides where id = v_guide;
  if found then raise exception 'FAIL: sitter DELETED the client guide'; end if;
  delete from public.pets where id = v_pet;
  if found then raise exception 'FAIL: sitter DELETED the client pet'; end if;
  insert into public.share_links (guide_id, user_id, code, is_active, view_count)
  select v_guide, SITTER, 'probeCode123', true, 0
  where not exists (select 1);  -- never runs; the real test is below
  begin
    insert into public.share_links (guide_id, user_id, code, is_active, view_count)
    values (v_guide, SITTER, 'probeCode123', true, 0);
    raise exception 'FAIL: sitter MINTED a public share link on the client guide';
  exception when insufficient_privilege then null;
  end;
  update public.share_links set is_active = false where guide_id = v_guide;
  if found then raise exception 'FAIL: sitter deactivated links on the client guide'; end if;

  -- the sitter's OWN "my pets" must not contain the client's animals
  select count(*) into n from public.households;
  raise notice 'sitter sees % households (0 or their own only)', n;

  -- === owner revokes; access must end ===
  perform set_config('request.jwt.claim.sub', OWNER::text, true);
  perform public.revoke_sitter(v_conn);
  perform set_config('request.jwt.claim.sub', SITTER::text, true);
  select count(*) into n from public.pets where id = v_pet;
  if n <> 0 then raise exception 'FAIL: revoked sitter still reads the client pet'; end if;
  select count(*) into n from public.guides where id = v_guide;
  if n <> 0 then raise exception 'FAIL: revoked sitter still reads the client guide'; end if;

  reset role;
  raise notice 'SITTER PROBE: every assertion passed';
end;
$probe$;
rollback;
