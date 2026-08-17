# Pawstructions — roadmap

Live at https://pawstructions.com. This is the working punch list; `SETUP.md` covers
infrastructure, `session.md` is the historical log.

Status legend: **[ ]** not started · **[~]** in progress · **[x]** done

---

## 1. Pre-launch blockers

All clear. Everything in this section shipped; it is kept as a record rather than
deleted, because "why does the app look like this" is a question that outlives the
work. Current punch list lives in §4 and §4b.

### [x] Responsive layout on wide screens — SHIPPED 2026-08-14
`ScreenContainer` caps content width by type (form / content / dashboard) and is applied
at every screen root. On phones the cap never engages, so native builds are unchanged.

### [x] Rebuild PetDetail — SHIPPED 2026-08-14
Rebuilt on the collapsible `SectionHeader` pattern, so all ~30 fields are reachable
instead of the three that used to show. "Move to Memorial" is demoted out of the primary
slot — a semi-destructive, emotionally loaded action should not be the heaviest control
on the screen.

### [x] Styled confirm/alert modals — SHIPPED 2026-08-14
`lib/dialogs.ts` routes every alert and confirm through one in-app modal, so web and
native match and neither falls back to `window.confirm`.

### [x] Password recovery — SHIPPED 2026-08-14
`ForgotPasswordScreen` + `ResetPasswordScreen` on Supabase's `resetPasswordForEmail`,
over the working Brevo SMTP path. (This entry read "no forgot-password path exists"
until 2026-08-17 — it had been shipped for three days.)

### [x] Google sign-in — SHIPPED 2026-08-17
The client code has been there since May; what was missing was the Google Cloud OAuth
client and the Supabase provider config, both done 2026-08-17. Verified working end to
end. Steps recorded in SETUP.md §3.

---

## 2. Product features

### [x] Households — SHIPPED 2026-08-15
Live end to end: DB migrations 0006/0007 (applied to prod, 22 adversarial findings closed,
RLS verified by role impersonation), merged-view client, Household screen (rename, members,
invite/revoke/leave with last-owner protection), Home invite banner, Settings entry.
Follow-ups: member display names need a small definer RPC (profiles are RLS-locked to self,
so the members list shows roles + dates, not names); invite notification is in-app only —
emailing invites via Brevo is a natural next step.
The share-link create race noted here originally ("deactivate-then-insert") was reordered
to insert-then-deactivate in slice 7c for a different reason — a caller about to be refused
was firing the destructive half first. A partial unique index `on share_links(guide_id)
where is_active` plus retry-on-conflict would still close the concurrent-create window and
is worth adding; it is not urgent at current traffic.

### ~~Households (original design notes)~~ (DECIDED: household is the unit of sharing)
A couple or family share one set of pets and guides; everyone in the household can edit.
Distinct from the existing share links, which stay exactly as they are — those are for handing
a read-only guide to a sitter or friend who has no account, and that flow is already built.

Shape: a `households` table, a `household_members` join table, and `household_id` on `pets`
and `guides` in place of (or alongside) `user_id`. Every RLS policy moves from
`auth.uid() = user_id` to "caller is a member of the owning household". Every existing row
needs backfilling into a household of one.

This is the largest single change on the list — it touches all eight tables' policies, the
adapter, and the contexts. Worth doing before there are many users, since the migration only
gets harder with real data.

### [x] Loop 4 — invite-first onboarding + welcome journeys — SHIPPED 2026-08-15
Built by a 5-package fleet through 3 gauntlet rounds (13 → 8 → 5 problems, **zero must-fix at
every round**), plus a replacement verification round for two lenses that died on API credits
mid-run. Migrations 0009 (settings.journeys jsonb) and 0010 (backfills pre-existing onboarded users as
founder-welcome:'done', so established accounts never see a welcome checklist) both applied;
RLS re-verified by impersonation — own write reads back, only own row visible. Delivered:
- **Invite gate** (the Dana fix): `HomeScreen`'s replace-to-Onboarding is now guarded on six
  conditions — focused, settings loaded, households/invites *settled*, zero pending invites,
  not mid-accept, and a `joinedViaInvite` latch (set in DataContext the instant any accept
  succeeds) so a failed accept-tail can never dump a joined user into the founder wizard.
  Belated joins self-repair: belonging to a household you did not create is durable proof, so
  Home finishes the interrupted setup instead of routing. Invited signups see "💌 You're invited!" with Accept & Join;
  "Start fresh instead" leaves the invite pending.
- **Journey framework**: `settings.journeys` + version-gated registry (`src/lib/journeys.ts`)
  + `<JourneyCards />`. founder-welcome (live checklist that ticks itself off real data) and
  joiner-welcome (3-card shared-household intro). Skip/done never re-shows unless we bump a
  journey's version.
- **Household invite UX**: "Invites for you" section + honest Resend (revoke + re-invite, so
  the per-invite-id email dedupe actually re-sends; server caps at 5/recipient/day).
- **Crown sample sheet**: Banjo / Marmalade / Tortellini, rendered through the *same*
  `CheatSheetView` component as real sheets (extracted in this loop), reachable from the Crown
  upsell card and Settings. Format-audited: no pipes, no dash rules, no leaked tokens.

**QA on production 2026-08-15 (QA account put into Dana's exact situation — un-onboarded with a
pending invite):** invite gate PASS (gate rendered, no wizard, survived three reloads), accept
+ joiner tour PASS (correct joiner tour, not the founder checklist; no wizard on reload),
stats-flicker fix PASS (verified with a MutationObserver across two Home↔Settings round trips —
counters never blank), Crown sample sheet PASS (0 pipes, 0 dash-rules, 0 leaked tokens),
regression sweep PASS with **zero console messages of any kind**. No blockers, no majors. Two
minors, both pre-existing and already tracked (see 4b and the Loop 2 follow-ups). The real
invite email also delivered end to end via the Loop 3 outbox → Brevo pipeline.

Original problem statement, for the record: no invite email yet (fixed in Loop 3), and
`HomeScreen` replaced itself with the founder pet-wizard the moment `onboarding_completed` was
false — before the pending-invite banner could render. A joiner got a founder's first run.

**A. Invite-aware first run.** Before routing to the wizard, wait for `pendingInvites` too.
- Pending invite exists → show an **invite gate** instead of the wizard: "«Inviter» invited
  you to join «Household»" with Accept / Decline. Accept → mark onboarding complete (the
  household already has pets; never ask a joiner to create their first pet), land on Home
  showing shared content + the joiner journey. Decline → founder wizard as today.
- Invites only match CONFIRMED emails, so the gate must re-evaluate after email confirmation,
  and it adds no failure mode for normal founders (no invite → wizard exactly as today).
- Existing-account invitees keep the Home banner; the invite email's CTA can deep-link home
  (Loop 3's restore replays the URL after sign-in). HouseholdScreen should also list invites
  you've RECEIVED, not just sent.
- Inviter side: re-invites DO re-email (dedupe is per-invite-id), bounded by a per-recipient
  cap of 5 invite emails/day across all households. The UI can offer an honest "Resend
  invite" (revoke + re-invite) and should surface when the daily cap has been hit.

**B. Journey framework (one system, many journeys).** Card banners rendered inline at the top
of a host screen (same visual pattern as the pending-invite banner — never blocking modals).
- State: `journeys jsonb not null default '{}'` on `settings` (migration 0009), shape
  `{ "<key>": { status: done|skipped, version, at } }` — per-user and cross-device. Code
  declares each journey with a `version`; show when there is no entry or the stored version
  is older. Bumping the version re-shows a changed journey; skip records skipped+version and
  never shows again (Tim's rule).
- Cards are **state-aware checklists** where possible: "Add your first pet" completes itself
  when `activePets.length > 0`, not when tapped.

**C. Crown sample cheat sheet (added 2026-08-15, Tim).** Since Crown will be paid, non-Crown
users get a "See a sample" path: a static, fully-rendered example sheet (dog **Banjo**, cat
**Marmalade**, turtle **Tortellini** — realistic fake codes filled in, SAMPLE-badged)
reachable from the Crown upsell card and the Settings Crown card. Rendered through the same
component as real sheets so it always previews the true experience.

**Journeys to ship first:**
1. `founder-welcome` (Home): Add a pet → Create a guide → Share it with a sitter (no account
   needed) → Invite family. Auto-completes off real data.
2. `joiner-welcome` (Home, after accepting an invite): "You're in «X»'s household — pets and
   guides here are shared" / "Anything you edit updates for everyone" / "Sitters don't need
   accounts — share links do that".
Later candidates: `guide-editing` (first GuideForm open — explains autosave + Done),
`crown-intro` (when Crown ships), a localStorage-only hint on the sitter share view.

### [ ] Sitter accounts (second persona)
Sitters today are anonymous link-openers with no account and no history. Give them a real
account that lists every client they sit for, keeps those clients on their profile, and lets
them invite clients into the app — or ask an existing owner to share a pet profile with them.

**Three access levels, not two.** The anonymous share link must survive; plenty of sitters are
a neighbour who will never sign up.
1. **Anonymous link** — read-only, no account. Already built, unchanged.
2. **Connected sitter** — has an account, sees all their clients in one place, can tick off
   checklist tasks. Access granted by the household and revocable.
3. **Household member** — full edit rights. See households above.

**Data shape:** a role on `profiles` (owner / sitter — a user could be both), plus a
`sitter_connections` table joining a sitter to a *household* with a status
(invited / active / revoked) and optionally a date window. Attaching connections to the
household rather than to individual pets is what makes "all my clients" a single query.

**Why this is the best distribution idea on this list:** a professional sitter with twenty
clients who invites them is twenty qualified signups, from someone with a direct financial
interest in their clients being organised. That is a far stronger loop than social posting.
The invite has to work in both directions — owner invites sitter, sitter invites owner.

**Sequencing — do this after launch, but design for it now.** It is the largest item here:
a second onboarding, a second home screen, a second navigation tree, and an invitation system
with accept/decline/revoke. Building a two-sided network before validating that side one wants
the product is the classic way to spend six months on nothing.

What it *does* demand today: build **households first**, and make sure the ownership model is
"pets and guides belong to a household" rather than "to a user". Sitter connections then
attach to households later with no second migration. Getting that seam right now is cheap;
retrofitting it after real data exists is not.

### [ ] Crown (Pro tier) + system-wide AI — DECIDED
Paid tier is named **Crown**; members are "Crown members". Annual fee, disclosed as covering
the cost of the AI features.

Today each user pastes their own Gemini key into Settings (stored unencrypted). Replace with a
single server-side key in a Supabase Edge Function, gate cheat-sheet generation behind Crown,
and remove the per-user AI settings entirely.

**Billing: Stripe on the web.** With the PWA-first decision below there is no App Store
binary, so Apple's IAP rules do not apply and Stripe is unconstrained. If native apps ship
later, iOS would need In-App Purchase alongside Stripe — a reason to keep the entitlement
check server-side and payment-provider-agnostic from day one.

### [ ] Amazon affiliate store
A small in-app "recommended gear" section framed around peace of mind while away. Suggested
categories, each mapping to an anxiety the app already addresses:
- **Pet cameras with treat dispensers** — the "let me see them" itch
- **Automatic feeders** — pairs directly with the feeding-schedule feature
- **GPS collar trackers** — escape anxiety
- **Pet first-aid kits** — pairs with the symptom checker
- **Calming aids** (pheromone diffusers, anxiety wraps) — separation stress
- **Key lockboxes / smart locks** — sitter access, pairs with home info
- **Travel crates and carriers** — for boarding instead of sitting
- **Litter robots / auto waste** — long-trip hygiene
Requirements: Amazon Associates account, visible affiliate disclosure, no link cloaking.
Physical goods are exempt from Apple's IAP rules, so this is safe for the app stores.

**🔴 Blocker found in the 2026-08-15 research — check before building anything Amazon.**
Amazon's Program Policies prohibit Special Links "in connection with any printed material,
ebook, mailing." Pawstructions' core artifact is a **printable, shareable care guide**. If a
guide carrying Amazon links can be exported to PDF or printed, that is a policy violation.
Audit the export/print path first and design around it. Rate is **3.00% on Pets Products**
(verified on Amazon's fee schedule, no printed effective date — Amazon revises unilaterally).
Cookie window was not researched. Insurance click-out links carry no equivalent constraint.

### [ ] Direct gear partnerships instead of Amazon (Tim, 2026-08-16)
Three items Tim names as the must-haves for a pet that might get loose while the owner is away:
**Furbo** (pet camera), **Fi collar** (GPS tracker), **microchip**. He asks whether to go direct
for referral/reseller terms rather than through Amazon Associates.

**Go direct — the case is stronger than "better rates".**
1. Amazon pays **3% on Pets Products** (verified). A Furbo is ~$200 and a Fi ~$150 plus a
   subscription; a direct hardware program in the 5-10% range, or a flat bounty, is several
   times Amazon on the same sale.
2. 🔴 **Amazon's printed-material prohibition is a live problem for THIS app specifically.**
   Their Program Policies bar Special Links "in connection with any printed material, ebook,
   mailing" — and Pawstructions' core artifact is a printable, shareable care guide. Direct
   programs carry no equivalent constraint. This alone probably decides it.
3. Three hand-picked items we actually believe in is defensible editorially in a way a
   generated storefront is not, and a direct relationship can become a real partnership.

**These three are NOT the same kind of thing — do not build one flow for all of them.**
Furbo and Fi are hardware with real affiliate/referral programs (check Impact and ShareASale
first, then their own sites). A **microchip is a vet procedure**, not a product: there is no
one to affiliate with. It is still the single most valuable of the three to a lost pet, so it
belongs as CONTENT, not a link — and there is a natural home for it, since `microchip_id` is
already a field on the pet profile. An empty one is an honest moment to say why it matters.
(Chip REGISTRY services do have affiliate programs; that is a different thing from the implant
and worth a look separately.)

**IMPORTANT — the legal constraint that killed the personalised insurance idea does NOT apply
here.** That was insurance-specific: producer licensing, solicitation, per-policy commission.
Recommending retail hardware carries none of it. What still applies is **FTC disclosure**
(16 CFR § 255.0(f), § 255.5(a)): adjacent to the link, in-flow, unavoidable — and it must
render in the **sitter view of a shared guide** too, which is a separate code path and easy to
miss.

### [ ] Future ideas (Tim, 2026-08-16) — parked, not scheduled
- **Pet-friendly hotels along a drive route or at a destination.** BringFido is the obvious
  partner (affiliate programme plus an API) rather than building a directory. Genuine risk to
  name: this is a TRAVEL PLANNING product, not a pet-care one, and it is the kind of adjacent
  idea that quietly doubles a roadmap. Worth doing only once the core is earning.
- **Donate to a rescue at Crown checkout.** Lovely, on-brand, and Stripe can carry it. ⚠️ Flag
  before building: collecting money "for" a charity has real rules — who is the merchant of
  record, is it a donation or a pass-through, what does the customer's receipt say, and what
  are the tax implications for a sole proprietorship. Cheapest honest version is a LINK to the
  rescue's own donation page after purchase, which sidesteps all of it. Ask an accountant
  before taking a cent on someone else's behalf.
- **Social presence** — already tracked in §3.

### [ ] Pet insurance affiliate — RESEARCHED 2026-08-15, do NOT build yet
Full brief in the workflow output; the load-bearing conclusions:

**Trupanion: yes, you can use the company you actually like.** Public, self-serve, live today
on Impact. Two caveats: the rate is unpublished (the widely-repeated "$25/policy, 30-day
cookie" traces to a 2020 SEO blog post and appears on **zero** primary sources — treat as
folklore), and their better long-term door is the **Partner API** (quotes/enrollments,
verified live), which is BD-gated and worth pitching only once we have users.

**🔴 The legal constraint is real and it removes the best idea.** Two state-law safe harbors
exist: *advertising* (no compensation restriction) and *referral* (fee must NOT depend on
whether a purchase results — so per-policy commission fails outright). Which one applies is
decided by **our UI copy, not our contract**.

Without an insurance producer license we CAN: display carrier-supplied creative, link out,
take per-click/flat-fee compensation. We CANNOT: explain/compare/recommend policies
editorially, discuss coverage or pricing, host any part of the application, or **personalize
using the user's stored insurance data**.

That last one kills the placement I originally proposed. The empty `insurance provider` field
on the pet profile is the highest-intent moment in the app — and targeting an offer off stored
policy data converts a passive ad into individualized advice. **The most valuable version is
the least defensible one.**

Also: "We use Trupanion and recommend it" maps almost verbatim onto the statutory definition
of *solicit*. Single-carrier personal endorsement is the highest-risk framing available.

**FTC disclosure** (16 CFR § 255.0(f), § 255.5(a)) must be adjacent to the link, in-flow, and
unavoidable — not a footer or a /disclosures page. **And it must render in the sitter view of
any shared guide containing the link** — an easy-to-miss code path and a live compliance gap
if we forget it.

**Plan: apply now, build later.** Applying is free, needs no code, and is the only way to get
real numbers. Building needs rates *and* a written opinion.
1. One afternoon on **Impact**: apply to Embrace, Trupanion, Healthy Paws, Pets Best (Pets Best
   has a 90-day cookie — the only window verified on a primary source in the whole set).
2. Fallback if Impact stalls: **Spot via Sovrn** (only listing explicitly marked open).
3. Two emails, not applications: **Lemonade** (solicits "Embedded Partners", offers APIs) and
   **ASPCA** (pre-launch, recruiting early adopters to help shape commission structure).
4. Skip: ManyPets (exited US), Prudent Pet (licensed agents only), Nationwide, Figo, Pumpkin.
5. Do NOT build on Trupanion refer-a-friend — $100/yr cap, clawback rights.

**Safest launch shape:** per-click or flat fee, carrier creative, multiple carriers presented
neutrally, no targeting off stored data, written legal opinion before any per-policy deal.
Enforcement here is triggered by **competitor complaints**, not consumer harm — "we're small"
is a weak shield. NerdWallet is licensed in all 50 states; Policygenius is a licensed agency.

⚠️ Programs churn fast (ManyPets: active → fully exited in ~14 months). Re-verify before
signing. All checks made 2026-08-15.

### [ ] About Us page
Staff page with in-universe titles:
- **Clark** (dog) — Chief Executive Pawficer
- **Lillee** (dog) — Marketing Megamut
- **Dana** — Head Caretaker
- **Tim** — Technical Orchestrator
Needs photos and a short bio each.

### [ ] Notifications
Settings has a `notifications_enabled` toggle that currently controls nothing.

**Channel: email first.** Brevo already works, costs nothing at this volume, and reaches
people who never install anything — including sitters, who by design have no account. Web push
is a later addition (see PWA section); SMS is not recommended (~$0.008/message plus US 10DLC
registration, for events that are not urgent enough to justify interrupting someone).

**Proposed events**, ordered by how clearly they earn their interruption:

*To the owner — high value:*
1. **Sitter opened your guide for the first time** — confirms the link worked and the sitter is
   engaged. This is the "did they get it?" anxiety the whole product exists to solve.
2. **Trip starts tomorrow, and your guide looks incomplete** — no emergency contact, no vet,
   no feeding schedule. Actionable, time-bound, prevents the actual failure case.
3. **Share link expires in 2 days while your trip is still running** — the guide is about to go
   dark on the sitter mid-stay.

*To the owner — medium:*
4. **Daily checklist summary while a sitter is active** — "3 of 5 tasks done today." Reassuring,
   but only if checklists are actually being used; opt-in, daily digest, never per-task.
5. **Medication was due and is unchecked** — genuinely useful for pets on meds, but risks
   nagging. Gate on the pet actually having medications.

*To the sitter (email only — they have no account):*
6. **Guide updated while you're sitting** — the owner changed the feeding amount after handing
   over the link. Currently there is no way for the sitter to know.
7. **Daily checklist reminder each morning** — opt-in when the link is shared.

*Deliberately not notifying:* account changes, new pet added, guide created, anything the user
just did themselves. Nothing that says "we miss you."

**Recommended first slice:** #1 and #2 only. Both are single scheduled jobs, both map to
anxieties the product already names, and neither needs push. Prove they land before building
a preference matrix — the current single on/off toggle is enough for two events.

---

## 3. Growth

### [ ] Social presence and community
Mirror the MouseTech Studios setup: n8n workflows that draft posts and publish to Facebook,
Instagram and Pinterest. Pawstructions is visual (pets) and evergreen (care advice), which
suits Instagram and Pinterest especially.
Simplest viable plan:
1. Pick two platforms, not four — Instagram and Pinterest.
2. One content pillar to start: practical pet-sitting prep tips.
3. n8n on a weekly cron: draft → human review queue → publish.
4. Every post links back to a free guide-template page on the site.
Defer a real "community" (forum, groups) until there is an audience to host.

---

## 4. Testing and quality

### [ ] Playwright
Not installed. The QA agent currently drives the app through programmatic DOM clicks because
synthetic pointer events do not reach it — so real click targets, hover states and focus rings
are unverified. Playwright would give genuine pointer input, plus repeatable regression runs
in CI.

### [ ] iOS / Android simulator testing — deferred with the native builds
Nothing has ever run on a device or simulator; the app has only been exercised as web. Not
needed while PWA-first (below), but the native paths still exist in the codebase
(expo-print, expo-sharing, expo-image-picker, the `pawstructions://` scheme) and would need
testing before any store submission.

---

## 4a. Distribution: PWA-first — DECIDED

Ship as an installable web app. No App Store or Play Store binary for now, so Stripe handles
billing with no platform cut, and releases stay `git push`.

**What's already done:** `public/site.webmanifest` with correct name, colors and start_url,
plus all six icon sizes in `public/icons/` (192, 512, maskable 512, apple-touch 180, favicons).

**What's missing:** nothing — all four shipped 2026-08-14/15 and are verified in the
deployed build:
- [x] `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<meta name="theme-color">`
  and the `apple-mobile-web-app-*` tags. Expo's Metro web build owns `index.html`, so they
  are injected afterwards by `scripts/postbuild-web.js`, wired into `build:web`.
- [x] A service worker (`public/sw.js`) — cache-first for static assets, network-first for
  navigation. No Workbox dependency.
- [x] An **Install** page at `/install`, registered outside the isAuthenticated branch so it
  resolves signed out. iOS needs Safari → Share → Add to Home Screen, which nobody discovers
  unaided.
- [x] Confirmed present in the built `dist/index.html`: manifest link, apple-touch-icon,
  theme-color, all three `apple-mobile-web-app-*` tags, and the service-worker registration.
  A full Lighthouse installability run has not been done since — worth one before launch.

**Web push** becomes possible once the service worker exists — iOS 16.4+ supports it, but only
for PWAs the user has installed to the Home Screen and then granted permission. That is enough
friction that email should stay the primary channel.

**Revisiting native:** the Expo codebase still builds for iOS and Android, so this is
reversible. The trigger to reconsider is App Store discovery mattering more than the 15% cut
and the two review pipelines — realistically once there is an audience, not before.

### [x] Automated QA agent
`.claude/agents/qa-tester.md` — drives the live site and reports defects with repro steps.
First run found five real defects, two already fixed.

---

## 4b. Known issues (from the 2026-08-14 full QA pass)

### [ ] Pet photos were never persisted — needs Supabase Storage
PhotoPicker stores the picker's transient URI verbatim in `pets.photo_url`. On web that is a
`blob:` object URL that dies with the browser session (Clark's was
`blob:http://localhost:8081/...` — it only ever rendered in the session that picked it); on
native it would be a device-local `file://` path. So photos have never survived to any other
device or session. The dangling URL also made the UI lie: cards reserved blank image space and
PhotoPicker showed "Remove" for an unrenderable photo. Broken rows have been nulled in prod
(2026-08-14) so the paw-print placeholder shows.

Fix design:
1. Supabase Storage bucket `pet-photos`; path `{user_id}/{pet_id}.jpg`.
2. Storage RLS: owner write/delete; public read (photos surface in anonymous shared guides —
   pet photos are low-sensitivity, but note the tradeoff vs signed URLs).
3. PhotoPicker: on pick, fetch the blob → upload → store the permanent public URL; on remove,
   delete the storage object too. Resize client-side (~800px) before upload.
4. Applies to both the web blob path and native file path.

### [ ] Browser back bypasses the unsaved-changes guard on web
React Navigation's `beforeRemove` does not intercept browser history navigation on web —
popstate moves the stack before the listener can block it, so a dirty create-form discards
silently on browser back (the in-app Cancel path confirms correctly, and refresh/close are
covered by `beforeunload`). Hacking popstate directly conflicts with React Navigation's own
history sync. **Planned fix: create-mode draft persistence** — save form drafts to
localStorage as the user types and offer "Resume draft?" on next open, which makes any exit
path harmless rather than fighting the router. QA repro: Add Pet → type name → browser back.
**Re-confirmed still live in the 2026-08-15 Loop 5 QA pass** — and confirmed armed, not
missing: the same form state raised the dialog correctly via the in-app Cancel immediately
before browser Back discarded it. Suspect site is `PetFormScreen.tsx` (~line 513), where the
guard hangs off the header control rather than a `beforeRemove` / `popstate` listener.

### [ ] A dead session renders a normal signed-in Home with ZERO counts 🔴
Found 2026-08-15 (Loop 5 QA). After an auth failure that occurs *post-mount*, Home renders as
fully signed in — "Welcome, Tcdain!" — with **0 Pets, 0 Guides** and the "Add your first pet"
empty state. It is pixel-indistinguishable from a wiped account. Console shows 401s and
`permission denied for function my_pending_invites`. Signing back in restores everything, so
nothing is actually lost — but a user seeing this has every reason to believe their data is
gone, and that is a support incident (or a churn event) rather than a cosmetic bug.
Honest caveat from the QA agent: this was induced artificially (`localStorage.clear()` in a
second tab), **not** reproduced from a natural refresh-token expiry. The failure mode is
generic to any post-mount auth failure, so treat it as plausible-in-the-wild rather than
observed-in-the-wild. Fix direction: treat a 401 from the data layer as a session-expired
signal — route to sign-in or render an explicit expired state, never an empty-but-happy Home.

### [ ] Authenticated deep links don't survive reload
Hard-loading `/Main/PetForm?...` or `/Main/DailyRoutine?...` lands on Home after session
restore — the navigator mounts before the session resolves, dropping the initial URL. Public
routes (/share/:code, /install) are unaffected. Fix direction: defer NavigationContainer
render until `isLoading` resolves AND feed it the initial URL, or persist/replay the intended
route. Matters for a PWA where users bookmark and refresh.

### [ ] Stacked screens stay focusable on web
Previous screens in the native-stack remain mounted with tabbable controls (QA counted five
"Go back" buttons live in the DOM), so keyboard order can reach invisible screens. Needs
`aria-hidden`/inert on non-focused routes or detachInactiveScreens tuning on web.

## Loop 3 — SHIPPED 2026-08-14 (activation gated on Round-4 pastes)

All six packages built by a 3-round gauntlet (21 agents), re-verified by a final 3-lens
adversarial round (9 findings, 0 must-fix, all fixed pre-deploy), live-probed in prod, and
QA-passed on production (all journeys green, zero blockers):

- [x] **Crown** — `households.crown_until` + membership-gated `has_crown()` (migration 0008
  applied); `generate-cheat-sheet` Edge Function (caller-RLS, redacts every house-opening
  code AND spare-key location from Gemini prompts; wifi stays — stance to re-confirm below);
  per-user Gemini key UI removed; friendly Crown upsell verified in prod (402 path).
- [x] **Invite emails + notifications #1/#2** — service-role-only `notifications_outbox`,
  invite + first-share-view triggers, daily incomplete-guide scan with missed-run catch-up;
  `notify` Edge Function (verify_jwt OFF per supabase/config.toml — its auth is the
  x-cron-secret header) drains via Brevo on a 15-min GH cron; pre-activation 503s are green
  no-ops. Anti-bombing: 5 invite emails/recipient/day cap + per-invite dedupe.
- [x] **Pet photos** — hardened public bucket (5MB, images only), per-user-folder policies,
  PhotoPicker uploads permanent URLs, friendly size guard. QA note: the OS file dialog is
  un-automatable — needs ONE manual upload check (Round 4).
- [x] **Deep links survive reload** — /Main/* restore after auth; loading gates on all 10
  restore-reachable screens (no "not found" flash, no empty-form clobber). All 6 deep-link
  journeys + bogus-id case verified on prod.
- [x] **Polish** — Done buttons + bottom save indicator on edit forms; household error copy.

New minors from the post-deploy QA (parked in §5): share-link Copy button needs a clipboard
fallback; expo-image-picker MediaTypeOptions deprecation.

## Round 4 — gated on Tim

- [x] **Three secret pastes — ALL DONE 2026-08-15, every Loop 3 server feature is live.**
  `CRON_SECRET` ✅ (cron auth verified), `BREVO_API_KEY` ✅ (first real notification email
  delivered), `ANTHROPIC_API_KEY` ✅ (Claude `claude-opus-5` — Tim's call, replacing Gemini;
  full Crown path verified end-to-end: temp crown on the QA household, real generation in
  13s, door code redacted, wifi/address/meds intact, row persisted, fixtures cleaned, crown
  revoked). Granting a founder's Crown to Tim's household is a one-line update whenever he
  says the word.
- [ ] **Manual photo-upload check** (~1 min): edit a pet, add a real photo, reload — it should
  persist. QA's browser harness cannot drive the OS file dialog. Context from Tim's report
  2026-08-15: Clark's photo was a dead legacy `blob:` URL (added via the old client before
  the storage fix) rendering as a blank box — row nulled in prod, and all photo render
  sites now treat legacy `blob:`/`file:` URLs as absent (`displayablePhotoUrl`). Re-adding
  via Edit Pet → photo picker persists to storage for good.
- [x] **Sensitive-value stance RESOLVED 2026-08-15 — zero-credential prompts via
  render-time token substitution.** The cheat-sheet prompt now carries `[[TOKEN]]`
  placeholders for EVERY sensitive value (all house codes, spare-key location, AND the wifi
  password); the stored cheat sheet contains only tokens, and the app fills in real values
  at display time (`src/lib/cheatSheetTokens.ts` ↔ Edge Function token names in sync;
  screen render, clipboard copy, and PDF embed all substitute). Verified end-to-end: model
  preserved all tokens verbatim, zero planted secrets in the AI output, all values present
  in the rendered result. Sitters get complete sheets; Anthropic gets nothing that opens
  the house or joins the network.
- [ ] **Stripe** — account + product setup, then the Crown billing flow (webhook →
  `crown_until`).
- [ ] **Amazon store** — needs the Associates account first.
- [ ] **About Us** — needs photos + a line each for Clark, Lillee, Dana, Tim.
- [x] **Custom icon set — assets delivered 2026-08-14.** All 53 SVGs + PNG 24/48/96 verified
  against `brand/icon-inventory.md`; committed to `brand/assets/icons/` (catalog page renders)
  and staged in `petsitter/assets/icons/`. Remaining engineering (no human gate): Icon
  component + incremental emoji replacement — runs after Loop 3 lands, since the loop's
  agents own most screen files.
- [ ] **Google OAuth** — Cloud Console client (SETUP.md §3), or remove the button.
- [ ] **Social/n8n** — Tim's n8n instance; plan in §3.

## 4b. Joiner's new pets land in their PRIVATE household — ✅ FIXED (Loop 5, 2026-08-15)

**Fixed by migration 0011 (applied to prod 2026-08-15) + the default-household UI.** Dana's
explicit pointer now names The Dain Family; the dry run showed she was the ONLY affected user,
and no other user's effective default moved. Re-running the backfill is a verified no-op.

Chosen fix was candidate 3 below (**explicit user-visible default**), not 1 or 2 — dropping or
reordering households guesses at intent, and the whole failure mode here was a silent guess.

Two bugs the verification rounds caught that are worth remembering, because both were created
*by the fix* and neither showed up in three earlier rounds:
- **Emptiness is not vestigial-ness.** The first draft adopted away from any empty household.
  That re-homed an invite-first FOUNDER — her household is empty precisely *because* she invited
  her partner before adding a pet — sending her first pet somewhere the partner can't see it.
  Silently, at deploy time. The test is now **empty AND solo**: a household with a second member
  is somebody's family, not a signup artefact. Reproduced and fixed against a real Postgres 16
  with the full 0001→0010 chain applied.
- **A migration can make a dormant bug lethal.** `importData`'s pre-wipe guard only fired for
  non-empty backups, so an EMPTY backup reached `clearAllData` and restored nothing. Harmless
  while everyone's default was their own empty household — catastrophic once 0011 repoints
  people at the SHARED family one. Export on day one, join a family, import that file months
  later, and twelve pets are gone for every member. Guard now refuses any backup with nothing
  to restore.

Known limit, stated plainly: users already stranded who have **since added a pet or guide** are
deliberately NOT repointed — from the database, "solo household holding data" is indistinguishable
from a genuine founder. They're covered by the Household screen's default control and Pet Detail's
move action instead. Same for anyone whose current default has other members.

<details><summary>Original bug report (kept for context)</summary>

`handle_new_user` gives every signup a personal "My Household" they OWN. `primary_household_of`
orders by `(role='owner') desc, created_at asc`, and the pets/guides BEFORE INSERT trigger
stamps `household_id = primary_household_of(auth.uid())`. So for someone who signed up and
*then* joined a family, their own empty household still wins — **every pet or guide they create
silently lands there, invisible to the household they think they're contributing to.**

Verified in production: Dana belongs to The Dain Family, but `primary_household_of` returns her
own "My Household" (0 pets, 1 member). If she adds a pet, Tim will not see it.

Loop 4 shipped honest joiner copy as a stopgap (the tour now promises only that you can *see
and edit* what's already there — see the comment on the `shared` card in `src/lib/journeys.ts`),
but the underlying behavior is still wrong.

**The UX face of this bug** (found by the same QA pass): a joiner's Household screen lists TWO
household cards — the family's and their own personal one — with no indication of which is
active and no switcher, and each card carries its own "Send Invite" composer. That ambiguity is
a symptom of the same root cause; fixing the primary-household model should fix the screen too
(or at minimum the screen needs to name the active household explicitly).

Candidate fixes, in preference order:
1. **Drop the empty solo household on accept** — in `respond_to_invite`, if the accepting user's
   own household has zero pets, zero guides, and only them as a member, delete it. Their primary
   then becomes the joined household naturally. Must handle: what happens if they later leave
   the joined household and have none left (`primary_household_of` → null makes pet creation
   fail — check whether that hole already exists today).
2. **Change `primary_household_of` ordering** to prefer a household with other members or
   existing data over an empty solo one. Simpler, but changes behavior for every user.
3. **Let the user choose** a "default household" explicitly (most flexible, most UI).

Deliberately NOT rushed into the Loop 4 checkpoint: it's a DB-semantics change that deserves
its own migration, adversarial round, and RLS re-verification.

</details>

## Loop 6 — monetization spine + trust pages — PLANNED 2026-08-15

**Decisions locked with Tim (2026-08-15):**
- **Crown = $5 one-time, per household, permanent.** Not a subscription. `crown_until` is set
  far-future rather than a renewal date. One purchase covers every member of the household,
  which is deliberate: a couple sharing pets pays once. Framed as "founding" so the price can
  rise later with early buyers grandfathered.
- **Crown is bought by the OWNER.** The sitter subscription (§2 "Sitter accounts") is a
  separate product for people doing this professionally — do not conflate the two.
- **Free tier = one watermarked generation per guide.** Regenerating that guide needs Crown.
  Generous enough that a new trip or a new pet earns another free look, while keeping AI spend
  from scaling with the free tier.
- **Watermark says PREVIEW, not SAMPLE.** Heavy repeated diagonal PREVIEW plus the
  Pawstructions mark and a footer unlock CTA. "Preview" describes the *feature state*;
  "sample" would imply the *content* is fabricated, and a sitter must never hesitate over a
  medication dose because the page looks like demo data. This is a safety constraint, not a
  style preference.
- **Legal pages ship WITH Stripe, not after.** Stripe will not activate a live account without
  a public site carrying a service description, pricing, terms, privacy policy, refund policy,
  and contact info. They are on the critical path.

### Package A — payments backend
- **Migration 0012:**
  - `crown_purchases` table (stripe_event_id UNIQUE, checkout_session_id, household_id,
    amount_cents, currency, created_at) — service-role only, RLS on with no policies, matching
    the `notifications_outbox` pattern. The UNIQUE event id is the idempotency key.
  - `households.crown_source text` + `crown_granted_at` — distinguishes 'stripe' / 'founder' /
    'promo' so the founder grant and paid grants stay auditable.
  - `guides.free_generation_used_at timestamptz` — the per-guide free allowance marker.
    **Server-authoritative:** written only by the Edge Function, never trusted from the client,
    or the allowance is trivially replayable.
- **Edge Function `create-checkout-session`** (verify_jwt=true). Must verify the caller is a
  member of the target household via `is_household_member` before creating the session —
  otherwise it leaks household existence. Sets `client_reference_id` = household_id.
- **Edge Function `stripe-webhook`** (verify_jwt=false, pinned in `config.toml`). Stripe cannot
  present a Supabase JWT, so auth is `Stripe-Signature` HMAC verification — the same shape as
  `notify`'s `x-cron-secret`. **Gotcha: in Deno you must use
  `stripe.webhooks.constructEventAsync()`**; the sync `constructEvent()` needs Node crypto and
  will fail on Edge. Handles `checkout.session.completed`, idempotent on event id, writes
  `crown_until`.
- **`generate-cheat-sheet` gains the paywall.** Three outcomes: Crown → full sheet; no Crown but
  guide's free generation unused → generate, mark used, return with `watermark: true`; otherwise
  → 402. Entitlement stays server-side and provider-agnostic so a future iOS IAP path can grant
  the same entitlement.

### Package B — paywall + watermark UI
- `CheatSheetView` gains a `watermarked` prop → tiled diagonal PREVIEW layer + footer CTA.
  It is already the shared component behind both the real and sample sheets, so this is one
  change covering every surface.
- **Sheets are stored unwatermarked.** The watermark is applied at render time only, so
  unlocking is instant with no regeneration and no second AI charge.
- PDF export carries the watermark. Clipboard copy cannot be visually watermarked — it gets a
  text footer line instead.
- `UnlockCrownScreen`: price, what you get, checkout button, and a "refresh entitlement" path
  for when the webhook lands after the user returns.
- Stripe success/cancel returns ride the existing Loop 3 deep-link infrastructure.
- **Honest limitation:** the watermark is a conversion nudge, not DRM. A determined user can
  strip it client-side. That is acceptable and not worth engineering against.

### Package C — trust and legal pages
Four public screens, reachable **without login** (Stripe's reviewer has no account), linked
from `LandingScreen`:
- **About Us** — the in-universe staff page already specced in §2 (Clark, Lillee, Dana, Tim).
- **Privacy** — must state the token-substitution model explicitly: home access codes and WiFi
  passwords are replaced with placeholders before any prompt leaves our infrastructure, so the
  AI provider never receives them. This is a genuine differentiator, not boilerplate.
- **Terms** and **Refund** — for a $5 one-time digital purchase, a plain 14-day
  no-questions refund is simplest and reduces dispute risk.
- ⚠️ Drafted from common patterns, **not legal advice** — worth a real review given the app
  stores home access codes.

### Package D — verification
tsc, web build, RLS probes on the new tables, and a full Stripe **test-mode** purchase →
webhook → entitlement → watermark-disappears run before anything goes live.

### Stripe account facts (settled 2026-08-15)
- **Legal entity: Dana's sole proprietorship**, using the EIN already associated with
  Castles and Currents. A sole proprietor gets ONE EIN covering all their businesses, so
  nothing new is filed. MouseTech Studios is a 4-founder LLC and is deliberately NOT the
  entity here — that would commingle with three other people's business.
- Stripe login is `tcdain@gmail.com` (Tim is the developer); **Dana is the account owner and
  must be the responsible party at activation** — her identity verification, her bank account.
  Add her as an Administrator; disputes and payout failures go to account users.
- **Sandbox product id: `prod_V4zp7GWD8ggqhM`** ($5.00 USD one-off, "Pawstructions Crown").
  Sandbox objects do NOT carry to live — the live product gets a different id, so this is a
  config value (`STRIPE_PRODUCT_ID`), never baked into code. `STRIPE_PRICE_ID` is supported as
  a direct override; when unset the function resolves the product's default price.
- ⚠️ **UNRESOLVED:** the account is named "Castles and Cruise…" and holds an `Annual
  Subscription` ($49.99/yr) created 2025-11-09 — nine months before the account was supposedly
  created. Either a fossil of the original annual-fee Crown plan (§2 still describes Crown that
  way) or evidence this is a PRE-EXISTING account, in which case Pawstructions revenue shares a
  balance and payout with Castles and Currents and the separation goal fails. Must be settled
  before any live payment. Also rename the public business name + statement descriptor to
  PAWSTRUCTIONS — an unrecognised descriptor is the top cause of chargebacks, and a $15
  chargeback on a $5 sale costs 3x the sale.
- **Venmo was considered and rejected**: no checkout API and no webhooks, so nothing can tell
  the app a payment happened — it would mean granting Crown by hand. Venmo is reachable via
  PayPal Checkout, but that costs ~$0.66/sale vs Stripe's ~$0.45 and drops Apple/Google Pay.
  Revisit only if real customers ask.

### Human-gated (Tim / Dana)
1. ~~Create the Stripe account~~ DONE (sandbox).
2. ~~Create the product + $5 price~~ DONE — `prod_V4zp7GWD8ggqhM`.
3. Resolve the Annual Subscription / account-provenance question above; archive the stray product.
4. Rename business name + statement descriptor to PAWSTRUCTIONS.
5. Paste `STRIPE_SECRET_KEY` (sandbox `sk_test_…`) and `STRIPE_WEBHOOK_SECRET` into Supabase secrets.
6. Point the Stripe webhook endpoint at the deployed function URL.
7. Tell me Dana's exact registered business name for the legal pages — Stripe's reviewer
   compares the site against the account, and a mismatch is a rejection.
8. Activate live mode once the legal pages are deployed, then redo 2/5/6 with live values.

### Deferred to Loop 7
Google OAuth (independent; its consent screen has its own verification lag) and the first
affiliate integration (blocked on the research run plus an approval timeline outside our
control). **Reminder for whichever affiliate lands: Amazon prohibits affiliate links in
email**, which directly constrains the `notify` pipeline.

## Known: `Cannot read properties of undefined (reading 'routes')`

An uncaught TypeError that appears in the console a handful of times per long
session. No functional impact has been observed — three QA passes drove the whole
app and never saw a screen break — but it is real, and two of them could not
reproduce it deliberately. What follows is a read of the code, not a repro.

React Navigation's popstate handler ends with:

```js
const state = getStateFromPathRef.current(path, configRef.current)
if (state) { ...normal handling... }
else {
  // if current path didn't return any state, we should revert to initial state
  navigation.resetRoot(state)   // state is undefined here
}
```
(`@react-navigation/native@7.1.26`, `src/useLinking.tsx:263`)

`resetRoot(undefined)` reads `state.routes` and throws. `getStateFromPath`
returns undefined for any path the linking config does not describe — and
`App.tsx` describes only the six public routes, so **every `/Main/*` URL is
undefined to it**. Those screens are restored by RootNavigator's
`RESTORABLE_MAIN_ROUTES` instead, which is why the app keeps working.

The proper fix is to describe the Main routes in the linking config, which would
also retire `RESTORABLE_MAIN_ROUTES` entirely — deep-link restore would become
React Navigation's job rather than ours. That is a genuine improvement and a
genuine risk: it changes URL generation for every screen, and the Stripe return
URL (`/Main/UnlockCrown?checkout=success`) and share links depend on the current
shape. Not something to change days before taking payments.

Do it in the next loop, with the Stripe return URL and a hard reload of every
deep link on the test list.

---

## Launch gate — the only thing left that is not code

**Stripe is still in TEST mode.** Everything about Crown works end to end; it just works
against test money. The only real row in `crown_purchases` carries a `cs_test_...` session.
This is invisible from the code — the functions read `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
`STRIPE_PRODUCT_ID` and `STRIPE_WEBHOOK_SECRET` from Edge Function secrets and neither know
nor care which mode they name — which is exactly why it is worth writing down. In test mode
the app looks finished because it *is* finished.

Four actions in Stripe, in this order:

1. **Activate the account.** The reviewer has no login, which is why /about, /terms,
   /privacy and /refunds are registered outside the authenticated stack.
2. **Create the live product and the $5 price.** Live mode has its own object ids; the
   sandbox `prod_`/`price_` do not carry over.
3. **Create a LIVE webhook endpoint** subscribed to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `charge.refunded` and
   `charge.dispute.closed`.
4. **Update the four secrets** (`supabase secrets set`).

Step 3 before step 4 matters: the signing secret is per-endpoint, so the live endpoint has a
different `whsec_` than the sandbox one. Swapping the API key without it leaves every live
event failing signature verification, and Stripe retrying each for about three days.

Also outstanding and not code: the migration-history repair (SETUP §2), and a Lighthouse
installability run (§4a). `debug-env` is still deployed as an inert 410 stub and can be
deleted whenever.

---

## Loop 7 — planned

### [ ] Crown status line in Settings (agreed 2026-08-16)
Tim asked where users see their spend history. Deliberately NOT a history screen: Crown is one
$5 purchase, once, permanent — a ledger view would render a single row forever, and sitters
have nothing to spend on yet because that product does not exist. What answers the real
question ("did I already pay for this?") is one line on the Crown card Settings already shows:

> 👑 **Crown active** — purchased Aug 16, 2026

Implementation is fixed by 0012's own header, which anticipated this: a **membership-gated
SECURITY DEFINER RPC**, NOT an RLS read policy on `crown_purchases`. A read policy would expose
purchase dates, amounts and Stripe ids over REST when the app only ever needs a boolean plus a
date. Shape it like `my_primary_household()` — no arguments, reads `auth.uid()`, revoked from
anon. Return status + date only; do NOT return who paid: `crown_purchases.user_id` is derived
as the household OWNER, not the actual buyer, so surfacing it would assert something untrue.
Must also tell the truth after a refund (0013's `revoke_crown` sets `crown_until` null and
writes a reversal row) — "Crown was refunded on X", never a stale "active".

**Free wins to take instead of building more:**
- **Stripe emails receipts automatically** — a toggle in Stripe Settings for successful
  payments. A real receipt from the processor beats anything we would render. Turn it on.
- **When the sitter subscription ships, use Stripe's Customer Portal**, not a bespoke billing
  screen. Subscriptions need cancel / update-card / invoice-download self-service, Stripe hosts
  all of it, and building it by hand is weeks of work thrown away. Noted now so the billing UI
  is not built twice.

### [ ] SITTER ACCOUNTS — the second persona (decided 2026-08-16) 🔴 LAUNCH IS GATED ON THIS
Tim moved this into Loop 7 and made going live conditional on it: *"Once we have the full user
and petsitter experience in the app we'll go live."*

⚠️ Stated once and accepted: §2 argues this belongs AFTER launch, because building a two-sided
network before validating side one is how six months disappear. Tim's counter is that a
pet-care app whose sitter experience is a read-only link is half a product, and you get one
first impression. Both are reasonable; the mitigation is to build it LEAN — see the four
decisions below, all of which were chosen to keep this in weeks rather than months.

Architecture is unchanged from §2 and needs no re-litigating: three access levels with the
anonymous share link surviving untouched, a `sitter_connections` table joining a sitter to a
HOUSEHOLD (not to pets — that is what makes "all my clients" one query), invites working in
both directions. Loops 2 and 5 built the household seam this depends on.

**D1 — What a connected sitter can DO:** see every client in one place, tick off checklist
tasks, and **post a check-in photo + note back to the owner**. The photo is the load-bearing
part: it is what makes a sitter account valuable to the OWNER, and therefore why an owner
pushes their sitter to sign up. Ticking boxes alone gives the owner nothing a share link did
not. Deliberately NOT in v1: two-way messaging (notifications, read state, moderation, support
burden — add only if asked for), and sitter edit rights on pets/guides (collapses the
sitter/member distinction, and an owner returning to a rewritten guide is a trust problem).

**D2 — Sitters are FREE in Loop 7, and told plainly that they will not always be.** A sitter
with twenty clients who invites them is twenty qualified signups from someone with a direct
financial interest in those clients being organised — worth more right now than subscription
revenue. Keeps Loop 7 to ONE payment integration.

  * **Price when it lands: $9/month or $90/year** (two months free), **free forever up to 3
    clients**. Benchmarked deliberately: Time To Pet / Precise Petcare / Scout run $30-50/mo
    but are full business software (scheduling, invoicing, client billing, staff). Pawstructions
    is the care-instructions layer their clients already use — a lighter product, and pricing
    near them would be a promise we would have to keep. At $9 a professional charging $25-75
    per visit covers it with a third of one visit.
  * **Founding rate $6/month locked for as long as they stay**, for sitters who join during the
    free period. Turns "we will charge you eventually" from a warning into a reason to join now.
  * The 3-client free tier keeps the neighbour and the hobbyist in the app permanently. They
    will never pay and they are still part of the loop.

**D2b — Disclosure, sitters ONLY.** Owners must never see sitter pricing: someone paying $5
once should not be reading about a $9/month plan, it makes the product look more expensive
than it is. Placements: (1) one unmissable card during SITTER onboarding, before they invest
effort; (2) a "Sitter plans" screen in the sitter navigation, always reachable, never nagging.
NOT on the landing page, NOT in the owner app, NOT in /terms yet. Include a **feedback link** —
it is not decoration: launch is gated on this persona and there is currently no sitter telling
us what they need. Draft copy is in the 2026-08-16 conversation; keep its tone (plain, warm,
non-coy) rather than rewriting it as marketing.

**D3 — Sensitive data: same as the share link.** Masked, tap to reveal. Consistent with what
anonymous sitters already get, no second security model to reason about, and the existing
SecurityNote copy already explains it. Masking is deliberate — it stops codes being
shoulder-surfed or screenshotted casually while staying one tap from the door.

**D4 — Access is permanent by default, with an OPTIONAL date window.** Matches reality: most
owners have one regular sitter they do not want to re-invite every trip, but a one-off sitter
should not hold a door code forever. Owner can revoke at any time. Always-expire was rejected
on a specific failure mode — a sitter locked out mid-trip is a real emergency with an animal
waiting.

### [ ] Daily digest: "here's what your sitter did today" (Tim's idea, 2026-08-16)
An end-of-day email to the OWNER listing the checklist tasks the sitter completed. Strong
because it makes the sitter's work VISIBLE: today ticking a box is invisible labour with no
payoff, and this turns it into credit. Owner gets the reassurance they actually wanted; sitter
gets a reason to use the app through the day rather than at the end.

**DEPENDS ON SITTER ACCOUNTS — cannot ship before them.** Verified 2026-08-16: the
`task_completions` policies cover household MEMBERS (0007) and, once applied, connected sitters
(0015). Nothing covers an anonymous share-link opener. So checklists are currently an
owner-only tool and a digest today would report the owner's own ticks back to them.

**Infrastructure is ~80% built:** `notifications_outbox` already has a `kind` check constraint
(`invite`, `share_opened`, `trip_incomplete`), the `notify` Edge Function drains it, Brevo
sends, and `.github/workflows/notify-cron.yml` runs it. Adding a kind is a constraint change
plus a template, not new plumbing.

**Design decisions to settle before building:**
1. 🔴 **THE "NOTHING LOGGED" CASE — get this right or do not ship it.** A sitter who did
   everything but never opened the app is indistinguishable from a sitter who did not show up.
   An email reading "0 of 8 tasks completed" would send an owner into a panicked call from
   another country about nothing. Copy must describe what was LOGGED, never what was DONE, and
   a day with no activity should probably send NOTHING rather than an alarming zero.
2. **Timezone.** "Today" means the pet's day, not the owner's — they may be eight hours away.
   We do not currently store a household timezone; `travel_itinerary.timezone_difference` is
   free text and not usable for scheduling. Needs a real field.
3. **Volume.** Only during a trip (guide start/end dates), never year-round, and opt-out via
   the existing `notifications_enabled` setting.

**FREE vs CROWN — the split that matters:** the daily digest is FREE. It is the engagement
loop, and gating it repeats the mistake of paywalling checklists (see below). CROWN gets the
**history and export** — the durable record across trips, "proof your sitter did every task,
every day". Additive rather than subtractive: the paid thing is the archive, not the live loop.

### ~~Put Daily Checklists behind Crown~~ — REJECTED 2026-08-16
Considered and rejected, recorded so it is not re-proposed. Three reasons: (1) the person
ticking a checklist is the SITTER, so the owner would pay for a tool someone else uses;
(2) checklists are the only feature that brings a user back DAILY, and gating the sole
recurring-engagement mechanic behind a one-time $5 gets the incentive backwards; (3) it
collides with the sitter acquisition loop — if ticking a task needs the owner to have bought
Crown, the sitter-invites-their-clients flywheel is gated behind a purchase the sitter cannot
make. Also: $5 is an impulse price that does not need more justification, and no one has yet
declined to buy Crown because no one has been offered it. Find out whether it converts before
making the free tier worse to protect it.

### Going live — the 3-step swap (deferred until the sitter experience ships)
Everything in Supabase currently points at the SANDBOX and that is correct. When flipping:
1. Create the $5 one-off product in the LIVE account → new price/product ids.
2. Create the LIVE webhook endpoint at the same function URL → new signing secret.
3. Replace `STRIPE_SECRET_KEY` (sk_live…), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
   `STRIPE_PRODUCT_ID`. Nothing charges anyone until all three are done.
Live account is already activated, branded (icon + white wordmark, brand `#3C6779`, accent
`#1E3A5F` — the exact colours of the Brevo email button and headings), descriptor
`PAWSTRUCTIONS`, legal entity Timathy Dain sole proprietorship trading as Pawstructions.

### [ ] Date picker everywhere a date is entered (Tim, 2026-08-16)
Dates are free-text inputs today. Tim asked for a real picker "here and everywhere else a date
might be required". Sites to cover: guide start/end, trip wizard, memorial date, sitter access
window (starts_on / ends_on, new in 0015), travel itinerary departure/return, and anywhere
DailyRoutine surfaces a date.

Two things that must not regress, both already paid for in bugs:
  * The stored format is 'YYYY-MM-DD' and the app parses it with parseLocalDate. A picker that
    hands back a Date and gets serialised with toISOString() reintroduces the memorial bug —
    the date rendered a day early for every user west of UTC.
  * todayLocal() exists for the same reason; a picker defaulting to `new Date()` in UTC can
    preselect tomorrow for someone late in the evening.
Prefer one shared component so the timezone handling is written once, not per screen.

## 5. Deferred / minor

- **Share-link Copy button (Loop 3 QA):** "Failed to copy link" alert in the QA browser pane —
  likely a clipboard-permission artifact of the embedded pane, but add a fallback anyway
  (legacy execCommand or select-the-text) and friendlier copy. Verify once in normal Chrome.
- **expo-image-picker deprecation (Loop 3 QA):** `MediaTypeOptions` → `MediaType` in the
  PhotoPicker call site before the next Expo SDK upgrade.
- **Crown-gate console noise:** the intentional 402 logs `Failed to load resource` in devtools;
  harmless, documented here so nobody chases it.
- **Household polish (from the 2026-08-15 QA pass):** map raw RPC error strings to
  sentence-case copy in HouseholdScreen alerts ("invalid email" → "That doesn't look like an
  email address."); add a space after the emoji in the info-card header; "Joined" dates for
  migration-backfilled members show the migration date — accepted semantics (it is when the
  household was created), revisit only if users find it confusing.
- **Edit-form closure (polish):** duplicate the SaveStatusIndicator at the BOTTOM of
  PetForm/GuideForm edit modes and add a single "Done" button that flushes any pending
  autosave (the hook's unused `saveNow()`) and navigates back. Deliberately NO "Save"
  button — a save button beside working autosave manufactures doubt — and the saved state
  is never styled red (red is reserved for the error state the indicator already has).

- **DailyRoutineScreen** keeps private copies of the date helpers now centralized in
  `src/lib/dates.ts` — consolidate. (MemorialScreen had the same problem and shipped a
  user-visible bug because of it: `new Date('YYYY-MM-DD')` parses as UTC midnight, so every
  user west of UTC saw the deceased date a day early. Fixed in Loop 5 by switching to
  `formatDate`. Worth auditing for any remaining bare `new Date(someDateString)`.)
- **Emoji still in avatar-shaped circles (Loop 5 QA):** the commissioned icons replaced the
  species ladders, but `OnboardingScreen.tsx` (~line 293) still renders 🐕 at `text-4xl`
  inside a `w-20 h-20 rounded-full` circle — the same avatar treatment — directly above copy
  reading "furry (or scaly) friend". Also `HomeScreen.tsx` (~536) 🐾 and Memorial's 🌈 empty
  state, while `icon-paw` and `icon-memorial-rainbow` both exist in the delivered set.
- **`Unexpected text node` dev warning (Loop 5 QA):** logged twice per session, React Native
  Web. QA could not pin it to a screen — a DOM walk for text nodes parented to `css-view-*`
  came back empty everywhere they looked. Recorded so it isn't lost, not localized.
- **`brevo-test.txt` EHLO oddity** — curl reports the upload filename as the SMTP EHLO name.
  Harmless, noted in case it ever matters.
- **Tagline** — "Where Pets Rule the Kingdom!" carried over from the old brand. Keep or rework.
- **`DogSitterPRD.md`** — original PRD, now largely superseded. Archive or update.
