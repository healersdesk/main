# Healer's Desk — setup guide

**www.healersdesk.com** · Help: healersdesk@gmail.com · +91-950-983-1551

Healer's Desk lets any healer sign in with Google and get their own private
**My Healing Desk**: client intake forms, energy scans, healings, energy exchange
and shareable progress reports.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | Home page (www.healersdesk.com) |
| `desk/` | **My Healing Desk** — the dashboard (www.healersdesk.com/desk) |
| `intake/` | Each healer's intake form (www.healersdesk.com/i/their-link) |
| `report/` | Shared progress report clients open from WhatsApp |
| `policy/` | Privacy Policy, Terms & Conditions, Refund & Cancellation |
| `assets/` | Logo files (`logo.svg`, `mark.svg`, app icon) |
| `config.js` | Your Supabase details — **the one file you must edit** |
| `supabase/schema.sql` | Database setup — run once in Supabase |
| `vercel.json` | Short links (`/i/...`), redirects and security headers |
| `desk-sw.js` | Lets My Healing Desk install as a phone app |

---

## Step 1 — Supabase database (5 minutes)

1. Open your project: https://supabase.com/dashboard/project/vlhfgjkbuwhcfchjwnbh
2. Go to **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**.
   You should see "Success. No rows returned".
3. Go to **Project Settings → API**. Copy the **anon public** key.
4. Open `config.js` and replace `PASTE_YOUR_SUPABASE_ANON_KEY_HERE` with it.
   ⚠️ Use the **anon** key only. Never put the `service_role` key in any website file.

## Step 2 — Google sign-in (10 minutes)

**In Google Cloud** (https://console.cloud.google.com, signed in as healersdesk@gmail.com):

1. Create a project called **Healer's Desk**.
2. **APIs & Services → OAuth consent screen**: choose **External**.
   - App name: `Healer's Desk`
   - Support email: `healersdesk@gmail.com`
   - App logo: upload `desk/icons/icon-512.png`
   - App home page: `https://www.healersdesk.com`
   - Privacy policy: `https://www.healersdesk.com/policy#privacy`
   - Terms of service: `https://www.healersdesk.com/policy#terms`
   - Authorised domains: `healersdesk.com` and `vlhfgjkbuwhcfchjwnbh.supabase.co`
   - Scopes: only `email`, `profile`, `openid` (the defaults)
3. **Publish** the app (Audience → Publish app) so anyone can sign in,
   not just test users. Basic scopes don't need Google's review.
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorised JavaScript origins: `https://www.healersdesk.com`
   - Authorised redirect URI: `https://vlhfgjkbuwhcfchjwnbh.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.

**In Supabase:**

6. **Authentication → Sign In / Providers → Google**: turn it on, paste the Client ID
   and Client secret, Save.
7. **Authentication → URL Configuration**:
   - Site URL: `https://www.healersdesk.com`
   - Redirect URLs — add both:
     - `https://www.healersdesk.com/desk`
     - `https://healersdesk.com/desk`

## Step 3 — GitHub

1. Create a new repository, e.g. `healersdesk`.
2. Upload **everything in this folder** (keep the folder structure) and commit.
   On github.com: *Add file → Upload files*, drag the contents in.

## Step 4 — Vercel and your domain

1. Vercel → **Add New → Project** → import the `healersdesk` repo.
   Framework preset: **Other**. No build command. Deploy.
2. Project → **Settings → Domains**: add `www.healersdesk.com` and `healersdesk.com`
   (set `healersdesk.com` to redirect to `www`).
3. At your domain registrar, add the DNS records Vercel shows you
   (usually an `A` record for `@` → `76.76.21.21` and a `CNAME` for `www` → `cname.vercel-dns.com`).

## Step 5 — Try it

1. Open https://www.healersdesk.com → **Continue with Google**.
2. Set up your desk (name, WhatsApp, practice name, intake link).
3. Patients → **Copy Intake Form Link** → open it on your phone and fill it in.
4. The client appears on My Healing Desk. Open them → **Share Progress Report**.

---

## Good to know

- **Privacy:** every healer only sees their own clients. This is enforced by the
  database itself (Row Level Security), not just the website.
- **Photos** are stored privately in Supabase Storage in a folder per healer.
- **Healers can delete their own desk** (Desk settings → Delete my desk) and
  **download all their data** as a file.
- **Phone app:** on iPhone, open /desk in Safari → Share → Add to Home Screen.
  On Android, Chrome shows an Install button on My Healing Desk.
- **Moving from The Prana Space:** this is a fresh database. Old Prana Space data
  isn't copied over automatically — ask if you want to bring Mamta's records in.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Add your Supabase anon key to config.js" | Step 1.4 not done, or not committed to GitHub |
| Google says `redirect_uri_mismatch` | Check Step 2.4 redirect URI exactly |
| After Google, you land on the home page instead of the desk | Add `/desk` URLs in Step 2.7 |
| "Access blocked: app not verified" for other people | Publish the consent screen (Step 2.3) |
| Intake photo doesn't upload | Re-run `schema.sql` (it sets up the photo folder rules) |
