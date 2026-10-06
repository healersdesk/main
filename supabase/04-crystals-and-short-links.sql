-- =====================================================================
--  HEALER'S DESK — update 4: crystals + shorter progress-report links
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  (Safe to run again. Existing data and existing report links keep working.)
-- =====================================================================

-- 1. CRYSTALS — each healer's crystals & tools and when they were cleansed / recharged
create table if not exists public.crystals (
  id             uuid primary key default gen_random_uuid(),
  healer_id      uuid not null default auth.uid() references public.desks(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  category       text not null check (category in ('Laser healing crystal','Activator','Knife','Disintegrator','Extractor',
                   'Black tourmaline','KS activator','Laying pebbles/tumbles','Bracelet','Pendant/ring','Pyramid/tower',
                   'Cleansing spray','Salt & oils','Others')),
  patient_id     uuid references public.patients(id) on delete set null,   -- empty = the healer's own
  last_cleansed  date,
  cycle_days     int not null default 7 check (cycle_days between 1 and 365),
  history        jsonb not null default '[]'::jsonb,
  notes          text check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now()
);
create index if not exists crystals_healer_idx on public.crystals(healer_id);
alter table public.crystals enable row level security;
drop policy if exists "crystals: own" on public.crystals;
create policy "crystals: own" on public.crystals
  for all to authenticated using (healer_id = auth.uid())
  with check (healer_id = auth.uid() and (patient_id is null or public.owns_patient(patient_id)));

-- 2. SHORTER REPORT LINKS — new links use a 10-character code; old long links still work
create or replace function public.get_shared_report(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare pt public.patients; d public.desks; res json;
begin
  if p_token is null or length(p_token) < 8 then return null; end if;
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

create or replace function public.submit_feedback(p_token text, p_symptoms jsonb, p_impact int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare pt public.patients; syms jsonb;
begin
  if p_token is null or length(p_token) < 8 then raise exception 'Invalid link'; end if;
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

revoke all on function public.get_shared_report(text) from public;
revoke all on function public.submit_feedback(text,jsonb,int,text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;
grant execute on function public.submit_feedback(text,jsonb,int,text) to anon, authenticated;

-- Done. 💎
