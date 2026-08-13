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
applied in order:

| # | File | Purpose |
|---|------|---------|
| 1 | `0001_schema.sql` | Tables, indexes, profile-on-signup trigger, updated_at trigger |
| 2 | `0002_rls.sql` | Row-Level Security policies |
| 3 | `0003_share_rpc.sql` | `resolve_share(code)` RPC for anonymous share-link viewers |

**Easiest path:** Supabase dashboard → **SQL Editor → New query** → paste each
file in order → **Run**.

**Alternative (CLI):**

```bash
brew install supabase/tap/supabase
supabase link --project-ref <your-project-ref>
supabase db push   # if you've initialized a local supabase/ config
# Or just:
psql "<your db connection string>" -f supabase/migrations/0001_schema.sql
psql "<your db connection string>" -f supabase/migrations/0002_rls.sql
psql "<your db connection string>" -f supabase/migrations/0003_share_rpc.sql
```

### Verify

In **SQL Editor**, run:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;
```

You should see 8 tables: `cheat_sheets`, `guides`, `onboarding_state`, `pets`,
`profiles`, `settings`, `share_links`, `task_completions`.

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
