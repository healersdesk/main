-- =====================================================================
--  HEALER'S DESK — update 2: Google Calendar
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  (Safe to run again. It does not touch any existing client data.)
-- =====================================================================

-- remember which Google event belongs to which healing
alter table public.healings add column if not exists gcal_event_id text;

-- one row per healer who connected Google Calendar.
-- The Google permission token is stored ENCRYPTED and is only ever read by the
-- server (Vercel functions with the service key). Browsers can't read this table.
create table if not exists public.calendar_connections (
  healer_id          uuid primary key references public.desks(id) on delete cascade,
  google_email       text,
  refresh_token_enc  text not null,
  calendar_id        text,
  timezone           text not null default 'Asia/Kolkata',
  duration_min       int  not null default 30 check (duration_min between 10 and 240),
  reminder_min       int  not null default 15 check (reminder_min between 0 and 1440),
  connected_at       timestamptz not null default now(),
  last_error         text
);
alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated;

-- what the desk is allowed to know about the connection (never the token)
create or replace function public.get_calendar_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('connected', true, 'google_email', google_email, 'duration_min', duration_min,
                           'reminder_min', reminder_min, 'timezone', timezone,
                           'needs_reconnect', coalesce(last_error = 'reconnect', false), 'connected_at', connected_at)
  from public.calendar_connections where healer_id = auth.uid();
$$;

create or replace function public.set_calendar_prefs(p_duration int, p_reminder int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.calendar_connections
     set duration_min = greatest(10, least(240, coalesce(p_duration, 30))),
         reminder_min = greatest(0, least(1440, coalesce(p_reminder, 15)))
   where healer_id = auth.uid();
end $$;

revoke all on function public.get_calendar_status() from public;
revoke all on function public.set_calendar_prefs(int,int) from public;
grant execute on function public.get_calendar_status() to authenticated;
grant execute on function public.set_calendar_prefs(int,int) to authenticated;

-- Done. 📅
