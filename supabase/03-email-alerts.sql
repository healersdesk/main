-- =====================================================================
--  HEALER'S DESK — update 3: email alerts for new intake forms
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  (Safe to run again. Run it BEFORE uploading the new website files.)
-- =====================================================================

-- healers can switch intake emails on/off in Desk settings (on by default)
alter table public.desks add column if not exists notify_intake boolean not null default true;

-- remembers that the "new intake form" email was already sent for this client
alter table public.patients add column if not exists notified_at timestamptz;

-- Done. ✉️
