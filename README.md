# Healer's Desk — v4 (app.healersdesk.com)

**www.healersdesk.com** · Help: healersdesk@gmail.com

## What's new in v4
- The app lives at **app.healersdesk.com** (desk, intake forms, progress reports). www.healersdesk.com stays the home page; old links redirect automatically.
- Crystals section: record crystals & tools by category, who they're used for, last cleansing/recharging and how often.
- Shorter progress-report links: app.healersdesk.com/r/<healer-link>/<first-name>-<code>.
- Desktop: menu on the left as a sidebar. Settings: copy-link icon.
- Run `supabase/04-crystals-and-short-links.sql` once.

## What was new in v3
- Google sign-in also asks for Google Calendar permission, so the calendar connects automatically.
- Dark mode (Settings → Appearance: Auto / Light / Dark, Auto by default).
- Email alert to each healer's own sign-in email when a new intake form arrives (sent through Google Apps Script from healersdesk@gmail.com).
- Healings tab: List or month Calendar view. "Today" / "Tomorrow" labels everywhere.
- Bitter font for headings, bigger logo, more breathing space on phones, sign-out moved into Settings on phones.

## What was new in v2
- New logo everywhere (long logo in headers, square logo as favicon and phone app icon).
- New light, premium violet-and-gold theme, built phone-first (cards instead of wide tables, big thumb-friendly buttons, one consistent style for every dropdown, date and number field).
- **Google Calendar sync**: each healer can connect their Google Calendar from Desk settings. Healings are added to a calendar called **"Healer's Desk"** in their Google Calendar and update automatically when a session is scheduled, moved, completed, cancelled or deleted.

## Folder map
| Path | What it is |
|---|---|
| `index.html` | Home page |
| `desk/` | My Healing Desk (dashboard) + phone app icons |
| `intake/`, `report/`, `policy/` | Intake form, progress report, policies |
| `api/` | **New.** Small server programs for Google Calendar (run on Vercel automatically) |
| `assets/brand/` | Logos, icons, favicon sizes, social share image |
| `favicon.ico`, `apple-touch-icon.png` | Browser tab icon and iPhone home-screen icon |
| `supabase/02-google-calendar.sql` | Database update 2 (calendar) — already run |
| `supabase/03-email-alerts.sql` | **New.** Database update 3 (email alerts) — run once, before uploading |
| `config.example.js` | Example only. Keep your existing `config.js` on GitHub |

## Update steps (short version — the chat has the 10-year-old version)
1. **GitHub:** upload everything in this folder into your `healersdesk` repo (replace when asked). Do not delete your existing `config.js`.
2. **Supabase:** SQL Editor → paste `supabase/02-google-calendar.sql` → Run.
3. **Google Cloud** (project used for Google sign-in):
   - APIs & Services → Library → **Google Calendar API** → Enable.
   - Google Auth Platform → **Data Access** → Add or remove scopes → add
     `https://www.googleapis.com/auth/calendar.app.created` → Update → Save.
   - Google Auth Platform → **Clients** → your web client → Authorised redirect URIs → add
     `https://www.healersdesk.com/api/gcal/callback` (keep the Supabase one) → Save.
   - Branding → upload the new logo `assets/brand/icon-512.png` (resize to 120×120 if asked).
4. **Vercel** → Project → Settings → Environment Variables (all environments):
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://vlhfgjkbuwhcfchjwnbh.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (legacy tab) or a **Secret key** |
   | `GOOGLE_CLIENT_ID` | from Google Cloud → Clients |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud → Clients |
   | `HD_SECRET` | any long random text (40+ letters and numbers). Never change it later. |
   | `SITE_URL` | `https://app.healersdesk.com` |
   | `APPS_SCRIPT_URL` | the Web app URL from your Apps Script deployment (ends in `/exec`) |
   | `APPS_SCRIPT_SECRET` | the same long secret you put in the Apps Script's Script Properties |
   Then Deployments → ⋯ on the latest → **Redeploy**.
5. Open My Healing Desk → ⚙️ Settings → **Connect Google Calendar**.

## Google verification
Google may show "Google hasn't verified this app" on the calendar permission screen and limit you
to 100 users until the app is verified. To remove it: Google Auth Platform → **Verification Center** →
submit. You'll need the privacy policy link (`/policy#privacy`, already updated with Google's
Limited Use wording), your domain verified in Google Search Console, and a short screen recording
showing a healer connecting Google Calendar and a healing appearing in it.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Server setup: missing …" | That environment variable isn't set in Vercel, or you didn't redeploy |
| Google says `redirect_uri_mismatch` | Add `https://www.healersdesk.com/api/gcal/callback` to the client (step 3) |
| Google says "access_denied" / app blocked | Publish the app (Audience → Publish) or add yourself as a test user |
| "Please allow calendar access" toast | On Google's screen, tick the calendar box before Continue |
| "Needs reconnecting" in Settings | The healer removed access in Google — tap Reconnect |
| Old logo still showing on phone | Delete the home-screen icon, open /desk in the browser, add it again |
