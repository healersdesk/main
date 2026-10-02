-- =====================================================================
--  HEALER'S DESK — complete database setup
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  Project: https://vlhfgjkbuwhcfchjwnbh.supabase.co
--
--  Every healer who signs in with Google gets their own private desk.
--  Row Level Security makes sure a healer only ever sees their own clients.
--  Safe to re-run: it uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- One row per healer (= one Google account). id is the Supabase auth user id.
create table if not exists public.desks (
  id                 uuid primary key references auth.users(id) on delete cascade,
  healer_name        text not null check (char_length(healer_name) between 1 and 80),
  practice_name      text not null check (char_length(practice_name) between 1 and 100),
  whatsapp           text,
  contact_email      text,
  city               text,
  slug               text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  intake_open        boolean not null default true,
  terms_accepted_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.patients (
  id               uuid primary key default gen_random_uuid(),
  healer_id        uuid not null default auth.uid() references public.desks(id) on delete cascade,
  created_at       timestamptz not null default now(),
  source           text not null default 'manual' check (source in ('manual','web_form')),
  full_name        text not null,
  whatsapp         text not null,
  email            text,
  dob              date,
  gender           text,
  occupation       text,
  address          text,
  primary_concerns text[] not null default '{}',
  concern_other    text,
  heal_goal        text,
  symptoms         jsonb not null default '[]'::jsonb,
  impact_score     int check (impact_score between 1 and 10),
  medical_history  text,
  photo_path       text,
  heard_from       text,
  heard_other      text,
  consent          boolean not null default false,
  consent_at       timestamptz,
  status           text not null default 'Active' check (status in ('Active','Inactive')),
  category         text not null default 'Normal',
  case_fees        numeric(12,2) check (case_fees >= 0),
  admin_notes      text,
  healer_comments  jsonb not null default '[]'::jsonb,
  share_comments   boolean not null default true,
  share_token      text unique
);
create index if not exists patients_healer_idx on public.patients(healer_id, created_at desc);

create table if not exists public.healings (
  id            uuid primary key default gen_random_uuid(),
  healer_id     uuid not null default auth.uid() references public.desks(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  healing_date  date not null,
  healing_time  time,
  status        text not null default 'Pending' check (status in ('Pending','Complete','Cancelled')),
  notes         text,
  series_id     uuid,
  created_at    timestamptz not null default now()
);
create index if not exists healings_healer_idx on public.healings(healer_id, healing_date);
create index if not exists healings_patient_idx on public.healings(patient_id);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  healer_id   uuid not null default auth.uid() references public.desks(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  mode        text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists payments_healer_idx on public.payments(healer_id, paid_on desc);

create table if not exists public.scans (
  id               uuid primary key default gen_random_uuid(),
  healer_id        uuid not null default auth.uid() references public.desks(id) on delete cascade,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  scan_date        date not null default current_date,
  avg_aura         numeric(8,2),
  aura_unit        text default 'Inches',
  avg_activation   numeric(8,2),
  activation_unit  text default 'Inches',
  major_chakras    jsonb not null default '{}'::jsonb,
  minor_chakras    jsonb not null default '[]'::jsonb,
  organs           jsonb not null default '[]'::jsonb,
  emotions         jsonb not null default '[]'::jsonb,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists scans_patient_idx on public.scans(patient_id, scan_date);

create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  healer_id      uuid not null references public.desks(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  symptoms       jsonb not null default '[]'::jsonb,
  impact_before  int,
  impact_now     int check (impact_now between 1 and 10),
  note           text check (char_length(note) <= 2000),
  seen           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists feedback_healer_idx on public.feedback(healer_id, seen);

-- ---------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — each healer sees only their own desk
-- ---------------------------------------------------------------------
alter table public.desks    enable row level security;
alter table public.patients enable row level security;
alter table public.healings enable row level security;
alter table public.payments enable row level security;
alter table public.scans    enable row level security;
alter table public.feedback enable row level security;

-- helper: does this client belong to the signed-in healer?
create or replace function public.owns_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.patients where id = p_patient and healer_id = auth.uid());
$$;

drop policy if exists "desk: own row" on public.desks;
create policy "desk: own row" on public.desks
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "patients: own" on public.patients;
create policy "patients: own" on public.patients
  for all to authenticated using (healer_id = auth.uid()) with check (healer_id = auth.uid());

drop policy if exists "healings: own" on public.healings;
create policy "healings: own" on public.healings
  for all to authenticated using (healer_id = auth.uid())
  with check (healer_id = auth.uid() and public.owns_patient(patient_id));

drop policy if exists "payments: own" on public.payments;
create policy "payments: own" on public.payments
  for all to authenticated using (healer_id = auth.uid())
  with check (healer_id = auth.uid() and public.owns_patient(patient_id));

drop policy if exists "scans: own" on public.scans;
create policy "scans: own" on public.scans
  for all to authenticated using (healer_id = auth.uid())
  with check (healer_id = auth.uid() and public.owns_patient(patient_id));

-- feedback is written only by submit_feedback(); healers can read / mark seen / delete
drop policy if exists "feedback: read own" on public.feedback;
create policy "feedback: read own" on public.feedback for select to authenticated using (healer_id = auth.uid());
drop policy if exists "feedback: update own" on public.feedback;
create policy "feedback: update own" on public.feedback for update to authenticated using (healer_id = auth.uid()) with check (healer_id = auth.uid());
drop policy if exists "feedback: delete own" on public.feedback;
create policy "feedback: delete own" on public.feedback for delete to authenticated using (healer_id = auth.uid());

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists desks_touch on public.desks;
create trigger desks_touch before update on public.desks for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. PUBLIC FUNCTIONS (used by the intake form and the shared report)
-- ---------------------------------------------------------------------

-- Is a desk slug free? (used while a healer sets up their desk)
create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists(select 1 from public.desks where slug = lower(p_slug) and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid));
$$;

-- What the public intake page needs to know about a desk — nothing private.
create or replace function public.get_desk_public(p_slug text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', id, 'healer_name', healer_name, 'practice_name', practice_name,
                           'whatsapp', whatsapp, 'intake_open', intake_open)
  from public.desks where slug = lower(p_slug);
$$;

-- Storage helper: may an anonymous visitor upload an intake photo into this desk's folder?
create or replace function public.desk_accepts_intake(p_desk text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.desks where id::text = p_desk and intake_open);
$$;

-- A client submits the intake form for a healer.
create or replace function public.submit_intake(p_slug text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d   public.desks;
  pid uuid := coalesce(nullif(p->>'id','')::uuid, gen_random_uuid());
  photo text := nullif(p->>'photo_path','');
begin
  select * into d from public.desks where slug = lower(p_slug);
  if d.id is null or not d.intake_open then raise exception 'This intake form is not accepting responses.'; end if;
  if coalesce(trim(p->>'full_name'),'') = '' or coalesce(trim(p->>'whatsapp'),'') = '' then
    raise exception 'Name and WhatsApp number are required.';
  end if;
  if (select count(*) from public.patients where healer_id = d.id and source = 'web_form'
        and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many forms right now. Please try again later.';
  end if;
  -- the photo must sit inside this desk's folder for this client
  if photo is not null and photo not like d.id::text || '/' || pid::text || '/%' then photo := null; end if;

  insert into public.patients (id, healer_id, source, full_name, whatsapp, email, dob, gender, occupation, address,
    primary_concerns, concern_other, heal_goal, symptoms, impact_score, medical_history, photo_path,
    heard_from, heard_other, consent, consent_at)
  values (pid, d.id, 'web_form',
    left(trim(p->>'full_name'),120), left(trim(p->>'whatsapp'),30), left(nullif(trim(p->>'email'),''),160),
    nullif(p->>'dob','')::date, left(nullif(p->>'gender',''),40), left(nullif(trim(p->>'occupation'),''),120),
    left(nullif(trim(p->>'address'),''),160),
    coalesce(array(select left(jsonb_array_elements_text(coalesce(p->'primary_concerns','[]'::jsonb)),80)), '{}'),
    left(nullif(trim(p->>'concern_other'),''),300), left(p->>'heal_goal',3000),
    coalesce(p->'symptoms','[]'::jsonb), nullif(p->>'impact_score','')::int, left(p->>'medical_history',5000), photo,
    left(nullif(p->>'heard_from',''),60), left(nullif(trim(p->>'heard_other'),''),160),
    coalesce((p->>'consent')::boolean,false), case when coalesce((p->>'consent')::boolean,false) then now() end);
  return pid;
end $$;

-- The shared progress report — only safe fields, never medical history, notes, phone or fees.
create or replace function public.get_shared_report(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare pt public.patients; d public.desks; res json;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into pt from public.patients where share_token = p_token;
  if pt.id is null then return null; end if;
  select * into d from public.desks where id = pt.healer_id;
  select json_build_object(
    'first_name', split_part(trim(pt.full_name),' ',1),
    'healer_name', d.healer_name,
    'practice_name', d.practice_name,
    'healer_whatsapp', d.whatsapp,
    'healings_done', (select count(*) from public.healings h where h.patient_id = pt.id and h.status = 'Complete'),
    'first_healing', (select min(healing_date) from public.healings h where h.patient_id = pt.id and h.status = 'Complete'),
    'impact_score', pt.impact_score,
    'symptoms', coalesce((select json_agg(json_build_object('name', s->>'name', 'intensity', (s->>'intensity')::int))
                          from jsonb_array_elements(pt.symptoms) s where coalesce(s->>'name','') <> ''), '[]'::json),
    'comments', case when pt.share_comments then pt.healer_comments else '[]'::jsonb end,
    'scans', coalesce((select json_agg(json_build_object(
                 'scan_date', sc.scan_date, 'avg_aura', sc.avg_aura, 'aura_unit', sc.aura_unit,
                 'avg_activation', sc.avg_activation, 'activation_unit', sc.activation_unit,
                 'major_chakras', (select coalesce(jsonb_object_agg(k, jsonb_build_object('energy', v->>'energy', 'activation', v->>'activation')), '{}'::jsonb)
                                   from jsonb_each(sc.major_chakras) as e(k, v)))
               order by sc.scan_date) from public.scans sc where sc.patient_id = pt.id), '[]'::json)
  ) into res;
  return res;
end $$;

-- A client sends feedback from their shared report (max 5 per day).
create or replace function public.submit_feedback(p_token text, p_symptoms jsonb, p_impact int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare pt public.patients; syms jsonb;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'Invalid link'; end if;
  select * into pt from public.patients where share_token = p_token;
  if pt.id is null then raise exception 'This report link is no longer active.'; end if;
  if (select count(*) from public.feedback where patient_id = pt.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many feedback messages today.';
  end if;
  if p_impact is not null and (p_impact < 1 or p_impact > 10) then p_impact := null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', left(x->>'name',120),
           'now', least(greatest((x->>'now')::int,0),10),
           'before', (select (s->>'intensity')::int from jsonb_array_elements(pt.symptoms) s where s->>'name' = x->>'name' limit 1))), '[]'::jsonb)
    into syms from jsonb_array_elements(coalesce(p_symptoms,'[]'::jsonb)) x;
  insert into public.feedback (healer_id, patient_id, symptoms, impact_before, impact_now, note)
  values (pt.healer_id, pt.id, syms, pt.impact_score, p_impact, left(nullif(trim(p_note),''),2000));
end $$;

-- A healer permanently deletes their desk, all client records and their sign-in.
-- (The app removes stored photos first, then calls this.)
create or replace function public.delete_my_desk()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.desks where id = uid;          -- cascades to every client table
  delete from auth.users where id = uid;            -- removes the login itself
end $$;

-- Who may call what
revoke all on function public.submit_intake(text,jsonb) from public;
revoke all on function public.get_shared_report(text) from public;
revoke all on function public.submit_feedback(text,jsonb,int,text) from public;
revoke all on function public.delete_my_desk() from public;
revoke all on function public.slug_available(text) from public;
revoke all on function public.get_desk_public(text) from public;
grant execute on function public.submit_intake(text,jsonb)                to anon, authenticated;
grant execute on function public.get_shared_report(text)                  to anon, authenticated;
grant execute on function public.submit_feedback(text,jsonb,int,text)     to anon, authenticated;
grant execute on function public.get_desk_public(text)                    to anon, authenticated;
grant execute on function public.slug_available(text)                     to authenticated;
grant execute on function public.delete_my_desk()                         to authenticated;
grant execute on function public.desk_accepts_intake(text)                to anon, authenticated;
grant execute on function public.owns_patient(uuid)                       to authenticated;

-- ---------------------------------------------------------------------
-- 4. PHOTO STORAGE — private bucket, one folder per healer: <healer_id>/<client_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-photos', 'patient-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hd photos: intake upload" on storage.objects;
create policy "hd photos: intake upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'patient-photos' and public.desk_accepts_intake((storage.foldername(name))[1]));

drop policy if exists "hd photos: healer read" on storage.objects;
create policy "hd photos: healer read" on storage.objects for select to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hd photos: healer upload" on storage.objects;
create policy "hd photos: healer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hd photos: healer update" on storage.objects;
create policy "hd photos: healer update" on storage.objects for update to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hd photos: healer delete" on storage.objects;
create policy "hd photos: healer delete" on storage.objects for delete to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 5. GOOGLE CALENDAR (same as 02-google-calendar.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. EMAIL ALERTS (same as 03-email-alerts.sql)
-- ---------------------------------------------------------------------
-- healers can switch intake emails on/off in Desk settings (on by default)
alter table public.desks add column if not exists notify_intake boolean not null default true;

-- remembers that the "new intake form" email was already sent for this client
alter table public.patients add column if not exists notified_at timestamptz;

-- Done. 🌿
