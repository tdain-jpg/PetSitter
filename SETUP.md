# Pawstructions — production setup

This guide walks through creating the Supabase backend, configuring auth
providers, and deploying the web build to Cloudflare Pages at
`pawstructions.com`. (The app previously deployed at `petsitter.timdain.work`,
which remains as the legacy domain.)

Estimated time: ~30 minutes the first time.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Pick a region close to your users; save the database password somewhere safe.
3. Wait for the project to finish provisioning (~2 min).
4. Open **Settings → API** and copy:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **Project API keys → anon public** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The anon key is safe to ship in the client bundle. Row-Level Security policies
(applied below) are what actually protect data.

---

## 2. Apply the database migrations

Migrations live in [`supabase/migrations/`](./supabase/migrations) and must be
applied in order. There are 22:

| # | File | Purpose |
|---|------|---------|
| 0001 | `schema.sql` | Tables, indexes, profile-on-signup trigger, updated_at trigger |
| 0002 | `rls.sql` | Row-Level Security policies |
| 0003 | `share_rpc.sql` | `resolve_share(code)` for anonymous share-link viewers |
| 0004 | `fixes.sql` | Task-completion scoping corrections |
| 0005 | `hardening.sql` | Pinned `search_path` on every function; grants tightened |
| 0006 | `households.sql` | Households, members, email invites |
| 0007 | `household_rls.sql` | RLS rewritten around household membership |
| 0008 | `crown_photos_outbox.sql` | Crown entitlement, pet photos, notification outbox |
| 0009 | `journeys.sql` | First-run journey state |
| 0010 | `journeys_backfill.sql` | Backfill for existing accounts |
| 0011 | `primary_household.sql` | Explicit default household per user |
| 0012 | `crown_purchases.sql` | Purchase ledger + `grant_crown()` |
| 0013 | `crown_revoke_and_free_gen_guard.sql` | Refund path; closes a free-Crown INSERT hole |
| 0014 | `ai_generation_ledger.sql` | Free AI generations keyed on `auth.uid()` |
| 0015 | `sitter_connections.sql` | The sitter relationship and its RPCs |
| 0016 | `my_pending_sitter_invites.sql` | Lets an invited sitter find their invitation |
| 0017 | `sitter_checkins.sql` | Immutable sitter check-in log |
| 0018 | `my_crown_receipt.sql` | Receipt lookup for the buyer |
| 0019 | `invite_sitter_guards.sql` | Refuses inviting an existing household member |
| 0020 | `sitter_task_completions.sql` | Sitters can tick tasks |
| 0021 | `email_shape.sql` | Rejects `a@b`-shaped addresses |
| 0022 | `rls_initplan.sql` | Hoists `auth.uid()` out of per-row policy evaluation |

### ⚠️ Do not run `supabase db push` against the existing production project

Production's migration history does not match this directory, and has not for a
while. The schema is fully up to date — every file above is applied — but the
history table records eight of them under CLI-generated timestamp versions
(`20260813013903` … `20260815192648`) and the remaining fourteen not at all,
because they were applied directly rather than pushed.

`db push` reads that table, concludes 0001–0022 have never run, and tries to
replay all of them over a database that already has every object. Use
`supabase db query --linked -f <file>` to apply a single migration instead — it
executes the file and touches no history.

**To repair the history** (bookkeeping only — writes to
`supabase_migrations.schema_migrations`, runs no DDL). Mark this directory as
applied:

```bash
supabase migration repair --linked --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019 0020 0021 0022
```

Then drop the eight duplicate timestamp rows, which record the same work under
different names:

```bash
supabase migration repair --linked --status reverted 20260813013903 20260813013937 20260814185153 20260814185328 20260814232114 20260815154805 20260815160618 20260815192648
```

After both, `supabase migration list --linked` should show every row matched in
both columns, and `db push` becomes safe (and a no-op) again.

### Verify

In **SQL Editor**, run:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
```

You should see 16 tables: `ai_free_generations`, `cheat_sheets`,
`crown_purchases`, `guides`, `household_invites`, `household_members`,
`households`, `notifications_outbox`, `onboarding_state`, `pets`, `profiles`,
`settings`, `share_links`, `sitter_checkins`, `sitter_connections`,
`task_completions`.

---

## 3. Configure auth providers

In **Authentication → Providers**:

### Email
- Enable **Email** (already on by default).
- **Confirm email**: your call. If ON, new signups get a verification email
  before they can log in. If OFF, they're signed in immediately. Recommend ON
  for a public deploy.

### Google OAuth
1. Go to <https://console.cloud.google.com/apis/credentials>.
2. **Create credentials → OAuth client ID → Web application**.
3. **Authorized JavaScript origins**: `https://pawstructions.com`
4. **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows this URL in its Google provider config — copy from there.)
5. Save → copy the **Client ID** and **Client secret**.
6. Back in Supabase, **Authentication → Providers → Google**: paste them, enable, save.

### Magic link
Uses the same email provider. No extra config needed.

### Redirect URLs (important!)
**Authentication → URL Configuration → Redirect URLs**: add
- `https://pawstructions.com`
- `https://pawstructions.com/*`
- `http://localhost:8081` (for local dev)

Set **Site URL** to `https://pawstructions.com`.

---

## 4. Local development

```bash
cd petsitter
cp .env.example .env
# Edit .env, paste your Supabase URL + anon key
npm install
npm run web    # opens http://localhost:8081
```

Create an account (signup or Google), then create a pet to confirm data
roundtrips through Supabase. Open **Table Editor → pets** in the dashboard —
you should see your row.

---

## 5. Deploy to Cloudflare Pages

### One-time setup

1. Push this repo to GitHub.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo, then configure the build:

   | Field | Value |
   |---|---|
   | Production branch | `main` (or whichever) |
   | Build command | `npm install && npm run build:web` |
   | Build output directory | `dist` |
   | Root directory | `petsitter` |

4. **Environment variables** (Production *and* Preview):
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `NODE_VERSION` = `20` (or `22`)

5. **Save and deploy**. First build takes ~3–5 minutes.

The `public/_redirects` file in this repo handles SPA fallback (`/* → /index.html`),
which Cloudflare Pages copies into the deploy automatically.

### Custom domain

In Pages → **Custom domains → Set up a domain**: enter `pawstructions.com`.
Cloudflare auto-creates the CNAME if `pawstructions.com` is on Cloudflare DNS.
SSL provisions in a minute or two.

Once live, update **Site URL** in Supabase Auth settings to match.

---

## 6. Post-deploy checklist

- [ ] Sign up with email/password — receive confirmation (if enabled)
- [ ] Sign in with Google — redirects back to app, you're signed in
- [ ] Sign in with magic link — email arrives, link signs you in
- [ ] Create a pet → reload → still there
- [ ] Create a guide → share it → open the share URL in an incognito window —
      shared guide loads without sign-in
- [ ] Sign out — protected screens redirect to Login

---

## Troubleshooting

**"Invalid login credentials"** — Supabase doesn't auto-confirm emails. Either
disable email confirmation in dashboard or check the inbox for the verification
link.

**OAuth redirects to `localhost` in production** — You forgot to add the
production URL to Supabase **Redirect URLs**. Add `https://pawstructions.com/*`.

**"new row violates row-level security policy"** — The user isn't authenticated,
or there's a column mismatch. Check the browser console for the failing query
and verify `auth.uid()` is non-null in SQL editor: `select auth.uid();` (run as
the user via the JS Console using the same session).

**Shared guide returns null** — The share link is inactive or expired. Check
`share_links` in Table Editor.

**Build fails on Cloudflare** — Usually a missing env var. Cloudflare must have
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` set at build time
(they're inlined into the bundle).
