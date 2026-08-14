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

### [ ] Shared / linked accounts
A couple or family should both be able to edit the same pets and guides. Options, roughly in
order of effort:
1. **Household model** — a `households` table, membership rows, and RLS keyed on household
   rather than `user_id`. The clean long-term answer; touches every policy and every query.
2. **Guide-level collaborators** — share individual guides with another account, read/write.
   Narrower blast radius, but pets stay single-owner, which is probably the wrong seam.
3. **Shared login** — no code, but no audit trail and bad security hygiene. Not recommended.
Decision needed before building: is the unit of sharing the *household* or the *guide*?

### [ ] Pro tier + system-wide AI
Today each user pastes their own Gemini key into Settings (stored unencrypted). Replace with
a single server-side key in a Supabase Edge Function, and gate cheat-sheet generation behind a
paid tier. Remove the per-user AI settings entirely.

**Naming** (tagline is "Where Pets Rule the Kingdom", brand is castle/coastal):
- **Crown** — "Pawstructions Crown", members are "Crown members". Short, regal, fits.
- **Royal Treatment** — warmer, more descriptive, longer.
- **Keeper** / **Castle Keeper** — evokes stewardship over showing off.
- **Concierge** — accurate to the value (done-for-you), but off-theme.

**⚠️ App Store constraint:** Apple requires In-App Purchase for digital subscriptions, taking
15–30%. A Stripe-based web subscription that unlocks features inside the iOS app violates
guideline 3.1.1. Options: IAP on iOS (with Stripe on web), or web-only paid signup with no
in-app purchase path. Decide before building the billing flow, not after.

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
Settings has a `notifications_enabled` toggle that currently controls nothing — no
notifications are delivered anywhere.

**Recommendation: push, not SMS.** Since native apps are planned, Expo push notifications are
free and unlimited; SMS costs ~$0.008/message (Twilio) or ~$0.006 (Amazon SNS) and needs
10DLC registration in the US for application traffic — real setup cost and ongoing per-message
spend for something push does better. Email (already working via Brevo) covers web users.
Suggested plan: push for native, email for web, revisit SMS only if users ask for it.
Worth defining *what* notifications exist first — reminders before a trip? A nudge when a
sitter opens a shared guide? Daily checklist reminders while a sitter is active?

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

### [ ] iOS / Android simulator testing
Nothing has ever run on a real device or simulator — the app has only been exercised as web.
Before store submission: build with EAS, test on the iOS simulator and an Android emulator,
and check the native-only paths (expo-print, expo-sharing, expo-image-picker, deep links via
the `pawstructions://` scheme).

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
