# Gauntlet loop — sitter tools 1 & 2 (designed 2026-09-07, NOT launched)

Item 0 is a hole found on 2026-09-07 and is a PREREQUISITE — do it first.
Items 1 and 2 are the two sitter enhancements Tim picked; ideas 3 and 4 are
parked in `ROADMAP.md` under "Sitter-side enhancements". Items 1 and 2 are not
required by the sitter subscription. Item 0 is.

Launch with `/loop` and the **Loop prompt** at the bottom. Read the decisions
first — two of them change what gets built.

---

## What the code already gives us

- Routine tasks are **not a table**. They live in `guides.daily_routine` (jsonb).
  `task_completions.task_id` is `text` and points into that JSON.
- `task_completions` = `(id, task_id text, guide_id uuid, date, completed_at,
  completed_by text, notes)`.
- `completed_by` is **text** — a display name pinned at completion time
  (migration 0026), not a user id.
- Guides carry nullable `start_date` / `end_date`.
- Sitters already read their clients' guides through RLS (migration 0023), and
  `my_sitter_connections` lists their households.

## Decisions needed before building

**D1 — which guides count as "today"?** `start_date`/`end_date` are both
nullable. A guide with no dates is either "always active" or "not scheduled".
If always-active guides appear, a sitter with five clients sees every routine
they have ever been given, forever, and the feature is noise on day one.
*Recommendation: only guides whose range covers today; guides with no dates are
excluded from Today and reachable from the client list as now. Revisit once
real sitters complain.*

**D2 — is name-only attribution good enough for history?** `completed_by` is a
name. Two sitters called Dana are indistinguishable, and nothing links a row to
an account. For "who fed the dog on the 3rd" that is probably fine. For anything
a sitter might rely on in a dispute — which is half the value of item 2 — it is
not. *Recommendation: add `completed_by_user_id uuid` in the same migration,
populate it going forward, and leave existing rows with a name and a null id.
Never rewrite history from the current profile name: the pinned name is what was
true at the time, and that is the point of pinning it.*

**D3 — where does the owner read the history?** Options: a section on the guide,
a tab on the daily routine, or its own screen. *Recommendation: its own screen
off the guide, because it is the only view that spans dates and the routine
screen is already one day at a time.*

---

## Item 0 — a sitter can actually become one (PREREQUISITE)

**The hole.** A sitter exists only because an owner invited them. There is no
role on the account, nothing in sign-up, and no sitter entry point;
`pendingSitterInvites` is the whole mechanism. So a professional sitter cannot
join, cannot reach Sitter plans, and cannot buy the subscription we now sell —
Settings only reveals the Sitting card once they already have connections.

**Why it is urgent rather than merely missing.** On 2026-09-07 the landing page
gained a section addressed to sitters, quoting $9/month, whose only button
creates an OWNER account. A sitter who reads that pitch lands on a dashboard
asking them to add their pets. We are marketing to an audience that cannot sign
up, for a product they cannot buy.

**Scope — the minimum that closes it:**
- A role on `profiles` (`owner` / `sitter`), remembering the original design's
  point that **a user can be both** — plenty of sitters own pets. Treat it as a
  default landing preference, never as a permission: RLS already decides what
  anyone can see, and a role that grants access would be a second, weaker
  security model competing with the one that works.
- A sitter path into sign-up. Either a question on the form ("Are you setting up
  care for your own pets, or sitting for someone else?") or a distinct entry
  point the landing page's sitter section points at. Do NOT leave that section
  pointing at "Get Started Free".
- A sitter with zero clients lands on `SitterHome`, not the owner dashboard.
  Its empty state already exists and already reads well; the routing does not.
- Settings shows the Sitting card for a sitter-role account with no connections.
- Sitter plans reachable from the sitter side without needing a client first,
  so the subscription can actually be bought.

**Explicitly OUT of scope here** (do not let it swallow the item): the
sitter→owner invite direction. The original design calls it the best
distribution idea on the roadmap and it deserves its own slice, with its own
thinking about what an owner receives and what they are agreeing to. Getting a
sitter into the product at all comes first.

**Verify:** sign up fresh choosing the sitter path → land on SitterHome with the
empty state, reach Sitter plans, and see the Sitting card in Settings, all with
zero connections. Then accept an invite and confirm the existing flow is
unchanged. An owner-role account must see none of it. Confirm an existing
invited sitter — a user who predates the role column — still works, since every
sitter today has no role at all.

## Item 1 — one "Today" across all clients (sitter side)

The daily routine is per-guide, so a sitter with four clients opens four guides
to find out what is due. Merge them into one list ordered by time of day, each
row naming the household.

**Server.** A `my_sitter_today()` RPC returning a flattened row per task for
every ACTIVE client household whose guide covers today: household id and name,
guide id, task id, label, time-of-day bucket, and whether it is already
completed today. Flatten the jsonb server-side with `jsonb_array_elements` —
doing it client-side means N round trips and N parsers, and the sitter is on a
phone outside somebody's house. `security definer`, caller-scoped via
`auth.uid()`, takes no user argument so it cannot be pointed at another sitter.

**Client.** A `SitterToday` screen, the sitter's landing tab. Grouped by
time-of-day bucket, not by household — the sitter's real question is "what is
next", not "what does the Patel house need". Household name on every row.
Ticking a task writes the same `task_completions` row the per-guide screen does,
through the same code path, so the two views cannot disagree.

**Empty states, all three distinct:** no clients yet; clients but nothing
scheduled today; everything done today. The third should read like a win.

**Verify:** with a sitter holding 2+ client households with overlapping
routines, the merged list contains every task from both, ordered by bucket;
ticking one there marks it done on the per-guide screen too, and vice versa;
a household the sitter is NOT connected to never appears (check by impersonating
in SQL, not by looking at the screen).

## Item 2 — visit history the owner can see

Completions already record what was done, when, and by whom. Nothing surfaces
it. Turn it into a log: the sitter gets proof of service, and the owner stops
sending the "everything ok?" text.

**Server.** Migration adds `completed_by_user_id` per D2. A
`guide_visit_history(p_guide uuid, p_from date, p_to date)` RPC returning
completions grouped by date, readable by household members AND by the connected
sitter — both already have RLS reads on the guide, so the function must not
widen access to either.

**Client.** A `VisitHistory` screen off the guide: newest day first, each day
listing what was done, at what time, by whom. The sitter reaches the same screen
for their own work.

**Verify:** an owner sees a sitter's completions; a sitter sees their own; a
DIFFERENT sitter connected to a DIFFERENT household sees none of it; a revoked
sitter loses the read. All four by impersonation in SQL.

---

## Hard constraints

- **Stripe is LIVE.** No Stripe API writes. Do not click Crown/checkout/subscribe
  buttons in any role. Do not touch `create-checkout-session`, `stripe-webhook`,
  or `sitter-billing` — nothing here needs them.
- The sitter subscription gates client COUNT only. **Neither of these features is
  behind the paywall.** Every sitter gets both, free. Charging for them would
  contradict what `/faq`, the landing page and Sitter plans all now say in
  public.
- Migrations: dry-run inside `begin; … rollback;` with `raise exception`
  assertions and a final `raise exception 'HARNESS REACHED THE END'` to prove the
  script reached the end. Apply with
  `supabase db query --linked -f <file>` — never `db push`.
- Verify RLS by impersonation (`set local role authenticated` +
  `set_config('request.jwt.claim.sub', <uuid>, true)`), never by trusting a
  screen.
- `npx tsc --noEmit` in `petsitter/` before every commit. `deno check` any edge
  function.
- Browser checks: FRONT the pane first — a hidden pane reports `innerWidth: 0`
  and gives confident wrong geometry. Use a FRESH tab; a tab with a scripted
  history produces phantom navigation errors.
- Write all code yourself. No local-model drafting.
- Commit each slice with a real explanation. **Do NOT push — Tim pushes.**
- Never call anything "production ready": that gate is Tim's human QA pass.

## Loop prompt

> Build the sitter work specified in `SITTER-TOOLS-LOOP.md`, in order: item 0
> (a sitter can actually become one — this is a prerequisite and ships first),
> then item 1 (one "Today" across all clients), then item 2 (visit history the
> owner can see). Follow the recommendations for D1, D2 and D3 unless the code
> contradicts them, and say so if it does. Honour every hard constraint in that
> file. Commit each slice separately with a real explanation, do not push, and
> when both are done run a qa-tester pass and fix what it surfaces. Then stop and
> report: what shipped, what you could not verify, and what is left to choose
> from.
