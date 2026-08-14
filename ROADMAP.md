# Pawstructions — roadmap

Live at https://pawstructions.com. This is the working punch list; `SETUP.md` covers
infrastructure, `session.md` is the historical log.

Status legend: **[ ]** not started · **[~]** in progress · **[x]** done

---

## 1. Pre-launch blockers

Things that should be fixed before inviting real users.

### [ ] Responsive layout on wide screens
Every screen currently stretches edge-to-edge; at 1280px the login inputs and buttons are
~1248px wide. This is not "add a desktop design" — it is finishing the responsive design.
Plan: a shared `ScreenContainer` that centers content and caps its width by content type
(forms ~520px, reading content ~760px, dashboards ~1100px), applied at the screen root.
On phones the cap never engages, so native builds are unaffected; iPad benefits immediately.

### [ ] Rebuild PetDetail
Users fill in ~30 fields (feeding schedule, medications, vet info, personality, microchip,
insurance, health protocol) and the detail screen shows name, breed, age and three buttons.
Also: "Move to Memorial" is currently the visually heaviest control on the screen — a
semi-destructive, emotionally loaded action rendered as the primary. Rebuild using the
collapsible `SectionHeader` pattern already used by GuideDetail, and demote Memorial.

### [ ] Styled confirm/alert modals
Destructive confirms use raw `window.confirm` on web (native uses `Alert.alert`, which is
correct but visually unrelated). Build one in-app modal component and route `showAlert` plus
all confirm sites through it, so web and native match and both are on-brand.

### [ ] Password recovery
No "forgot password" path exists today — a locked-out user has no way back in. Supabase
provides `resetPasswordForEmail` and the Brevo SMTP path is working, so this is a screen plus
a redirect route, not new infrastructure.

### [ ] Google sign-in
The button exists on both auth screens and errors when clicked ("provider is not enabled").
Needs a Google Cloud OAuth client and the Supabase provider config (steps in SETUP.md §3).
Either finish it or hide the button.

---

## 2. Product features

### [ ] Households (DECIDED: household is the unit of sharing)
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

**What's missing** — none of it is referenced by the built page:
- [ ] `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<meta name="theme-color">`
  and `apple-mobile-web-app-*` tags in `index.html`. Expo's Metro web build generates this
  file, so the reliable approach is a small post-build inject script wired into `build:web`.
- [ ] A service worker. Required for Android's install prompt and for any offline behavior.
  A hand-written cache-first worker for static assets and network-first for navigation is
  enough; no Workbox dependency needed.
- [ ] An **Install** page explaining Add to Home Screen — iOS requires Safari → Share → Add
  to Home Screen, which nobody discovers unaided. Android shows an install prompt.
- [ ] Verify with Lighthouse's installability audit.

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

## 5. Deferred / minor

- **DailyRoutineScreen** keeps private copies of the date helpers now centralized in
  `src/lib/dates.ts` — consolidate.
- **`brevo-test.txt` EHLO oddity** — curl reports the upload filename as the SMTP EHLO name.
  Harmless, noted in case it ever matters.
- **Tagline** — "Where Pets Rule the Kingdom!" carried over from the old brand. Keep or rework.
- **`DogSitterPRD.md`** — original PRD, now largely superseded. Archive or update.
