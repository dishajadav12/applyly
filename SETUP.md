# Setup

One-time setup for Supabase and Google Cloud. Takes about 20 minutes. All secrets go in `.env.local`, which is git-ignored. Never paste them into tracked files, issues or chat.

Start from the template:

```bash
cp .env.example .env.local
```

## 1. Supabase project

1. Go to https://supabase.com/dashboard and sign in.
2. Click **New project**. Pick an organization, name it (for example `applyly`), set a database password (save it in a password manager), choose the region closest to you, and click **Create new project**. Wait for provisioning to finish.
3. Note the **project ref**: the subdomain in your project URL (`https://<project-ref>.supabase.co`). You need it for the Google redirect URI and for `supabase link`.
4. Open **Project Settings** (gear icon) → **API Keys**.
5. Copy the values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key** (`sb_secret_…`; click **Reveal**) → `SUPABASE_SECRET_KEY`

   Use these new keys, not the legacy `anon` / `service_role` keys. The secret key bypasses row-level security and must only be used on the server.

Free projects pause after about a week of inactivity. Restore from the dashboard if that happens.

## 2. Google Cloud: Gmail API and OAuth client

### 2a. Project and API
1. Go to https://console.cloud.google.com.
2. Click the project picker (top bar) → **New project**. Name it (for example `applyly`) and click **Create**. Make sure it is selected afterwards.
3. Open **APIs & Services** → **Library**, search for **Gmail API**, open it and click **Enable**.

### 2b. OAuth consent screen
1. Open **APIs & Services** → **OAuth consent screen** (in newer consoles: **Google Auth Platform** → **Branding / Audience / Data Access**).
2. Click **Get started** (or **Configure**). Enter an app name (for example `Applyly`) and your email as the support email.
3. Audience / user type: choose **External**.
4. Add your email as the developer contact, accept the policy and click **Create**.
5. Add the scope: **Data Access** (or **Scopes** step) → **Add or remove scopes**. Find or paste `https://www.googleapis.com/auth/gmail.readonly` and tick it. Also keep the default `openid`, `email` and `profile` scopes. Do **not** add any other Gmail scope. Click **Update**, then **Save**.
6. Add yourself as a test user: **Audience** (or **Test users**) → **Add users** → enter the Gmail address you will sign in with → **Save**.

**Testing mode is the default (D17).** Leave **Publishing status** as **Testing**. In Testing, Google issues refresh tokens that expire after 7 days. When that happens the app shows a one-click **Reconnect Gmail** banner that reruns consent. This is used because `gmail.readonly` is a restricted scope, and unverified production apps show an "unsafe app" warning, are capped at 100 users, and depend on Google policy that can change.

**Optional: In production (unverified).** Under **Audience**, click **Publish app**. Consent then shows "Google hasn't verified this app" (click **Advanced** → **Go to … (unsafe)**). This avoids the weekly reconnect for a single personal user, but it is not guaranteed to keep working, and nothing in the app depends on it. If you switch, sign in again afterwards to get a non-expiring refresh token.

### 2c. OAuth client
1. Open **APIs & Services** → **Credentials** (or **Google Auth Platform** → **Clients**).
2. Click **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**. Name it (for example `Applyly web`).
4. Under **Authorized redirect URIs** click **Add URI** and enter exactly:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   Replace `<project-ref>` with your ref from step 1.3. Leave **Authorized JavaScript origins** empty.
5. Click **Create**. Copy the **Client ID** and **Client secret**.

The client secret is not an API key. This app does not use a Google API key.

## 3. Supabase: enable Google sign-in

1. In the Supabase dashboard open **Authentication** → **Sign In / Providers** (or **Providers**) → **Google**.
2. Toggle **Enable Sign in with Google**, paste the **Client ID** and **Client secret** from 2c, and click **Save**.
3. Open **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: click **Add URL** and add `http://localhost:3000/auth/callback`
   - Add your production URL and its `/auth/callback` later, when you deploy.
4. Click **Save**.

## 4. Remaining `.env.local` values

Put these in `.env.local`:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID from 2c |
| `GOOGLE_CLIENT_SECRET` | Client secret from 2c |
| `TOKEN_ENCRYPTION_KEY` | Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |

`TOKEN_ENCRYPTION_KEY` encrypts stored Google refresh tokens. Back it up: if you lose it, stored tokens become unreadable and you have to reconnect Gmail. Never change it casually.

Validate everything:

```bash
npm run check:env
```

It prints `check:env OK` or lists each missing or invalid variable. It never prints values.

## 5. Link the Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

`login` opens a browser to authorize the CLI. `link` asks for the database password from step 1.2. Confirm with:

```bash
npx supabase projects list
```

Your project should be marked as linked.

## 6. Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket), then go to https://vercel.com/new and import it. Framework preset: **Next.js** (auto-detected).
2. Before the first deploy, open **Environment Variables** and add every value from `.env.local` for the **Production** environment:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | same as local |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same as local |
   | `SUPABASE_SECRET_KEY` | same as local — server only, never exposed to the browser |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | same as local |
   | `TOKEN_ENCRYPTION_KEY` | same as local. **Reuse the local value** — a different key can't decrypt refresh tokens already stored by local testing, and everyone would need to reconnect Gmail |
   | `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://applyly.vercel.app` (or a custom domain) |

3. Click **Deploy**. Note the assigned `*.vercel.app` URL (or attach a custom domain under **Settings → Domains** first).
4. Add the production URL to Supabase: **Authentication → URL Configuration → Redirect URLs**, add `https://<your-vercel-url>/auth/callback`. Leave the `localhost:3000` entry in place so local dev keeps working. (**Site URL** can stay `http://localhost:3000`; only the redirect URL allowlist matters for sign-in to succeed.)
5. If `NEXT_PUBLIC_SITE_URL` changed after the first deploy (e.g. you attached a custom domain), update the env var in Vercel and redeploy — it's baked in at build time.
6. Visit the production URL, sign in with Google, and run a scan to confirm everything is wired up end to end.

Every subsequent `git push` to the production branch redeploys automatically. Preview deployments (PRs, other branches) get their own URL but share the same env vars unless overridden per-environment; since Google's OAuth client only allow-lists specific redirect URIs, sign-in will only work on origins added to both Supabase's redirect URLs **and**, if you lock it down, Google's own "Authorized redirect URIs" (step 2c) — the Supabase callback URI there does not need to change per deploy, since Google always redirects to Supabase first.

## Troubleshooting

- **`redirect_uri_mismatch` at sign-in:** the redirect URI in Google must match `https://<project-ref>.supabase.co/auth/v1/callback` exactly, including `https` and no trailing slash.
- **"Access blocked: app has not completed verification":** your Gmail address is not listed as a test user (step 2b.6).
- **No refresh token returned:** revoke the app at https://myaccount.google.com/permissions and sign in again with consent.
- **`check:env` fails:** it names the variable. Keys must start with `sb_publishable_` / `sb_secret_`, and `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes.

## Database and RLS sanity checklist (Phase 3)

Apply the schema with `npx supabase db push`, then regenerate types with `npm run db:types`. Run these in **Supabase → SQL Editor**.

1. **All 7 tables exist with RLS on.** Expect 7 rows, all `true`:
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
   ```
2. **Policies exist for 6 tables and none for `gmail_connections`.** Expect 4 rows (select, insert, update, delete) for each of `applications`, `email_events`, `processed_messages`, `scan_items`, `scans`, `user_settings`, and nothing for `gmail_connections`:
   ```sql
   select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 3;
   ```
3. **Browser roles cannot touch `gmail_connections`.** Expect `false` for both:
   ```sql
   select has_table_privilege('anon', 'public.gmail_connections', 'select') as anon,
          has_table_privilege('authenticated', 'public.gmail_connections', 'select') as authenticated;
   ```
4. **The RPCs are security invoker** (`prosecdef` = `false`, so RLS applies):
   ```sql
   select proname, prosecdef from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('claim_scan_lease', 'delete_application');
   ```
5. **Signup trigger creates `user_settings`.** Authentication → Users → **Add user** → `test@example.com` (tick auto-confirm). Then:
   ```sql
   select * from public.user_settings;   -- one row for the new user
   ```
6. **One active scan per user.** Run this twice; the second run must fail with a unique violation:
   ```sql
   insert into public.scans (user_id, range_start, range_end, status)
   select id, now(), now(), 'processing' from auth.users where email = 'test@example.com';
   ```
7. **Cross-user isolation.** As the test user (replace the id), you should see only your own rows:
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims', '{"sub":"<test-user-uuid>"}', true);
   select count(*) from public.scans;   -- only the test user's scans
   rollback;
   ```
8. **Clean up.** Authentication → Users → delete `test@example.com`. Its rows cascade away.
