-- Clinic Companion database schema (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;

-- ───────────────────────── Clinic settings (single row) ─────────────────────────
create table if not exists public.clinic_settings (
  id                        int primary key default 1 check (id = 1),
  clinic_name               text not null default 'Riverside Veterinary Clinic',
  clinic_phone              text not null default '(555) 010-2000',
  timezone                  text not null default 'America/New_York',
  open_hour                 smallint not null default 8  check (open_hour between 0 and 23),
  close_hour                smallint not null default 18 check (close_hour between 0 and 24),
  quiet_start               smallint not null default 21 check (quiet_start between 0 and 23),
  quiet_end                 smallint not null default 8  check (quiet_end between 0 and 23),
  booking_url               text,
  er_name                   text,
  er_phone                  text,
  er_address                text,
  clinic_lat                double precision,
  clinic_lon                double precision,
  on_duty_telegram_chat_id  text
);
insert into public.clinic_settings (id) values (1) on conflict do nothing;

-- ───────────────────────── Staff ─────────────────────────
create table if not exists public.staff (
  user_id       uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ───────────────────────── Owners and pets ─────────────────────────
create table if not exists public.owners (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null,
  phone_enc            text,            -- AES-256-GCM, encrypted by the backend
  email_enc            text,            -- AES-256-GCM, encrypted by the backend
  preferred_channel    text not null default 'telegram' check (preferred_channel in ('telegram', 'email')),
  telegram_chat_id     text unique,
  telegram_link_token  text unique not null default encode(gen_random_bytes(12), 'hex'),
  opted_in             boolean not null default false,
  opted_out_at         timestamptz,
  created_at           timestamptz not null default now()
);

create table if not exists public.pets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.owners on delete cascade,
  name        text not null,
  species     text not null,
  breed       text,
  birth_date  date,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.vaccinations (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets on delete cascade,
  vaccine    text not null,
  given_on   date,
  due_on     date not null,
  completed  boolean not null default false
);

create table if not exists public.procedures (
  id            uuid primary key default gen_random_uuid(),
  pet_id        uuid not null references public.pets on delete cascade,
  kind          text not null,
  performed_at  timestamptz not null default now(),
  notes         text,
  created_by    uuid references auth.users,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Outbound schedule ─────────────────────────
-- Every planned message is a row. dedupe_key makes duplicates impossible,
-- even if a job retries or two runs overlap.
create table if not exists public.scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.owners on delete cascade,
  pet_id      uuid references public.pets on delete cascade,
  kind        text not null check (kind in ('vaccine_reminder', 'vaccine_followup', 'postop_day1', 'postop_day3')),
  related_id  uuid,                      -- vaccination or procedure id
  send_at     timestamptz not null,
  status      text not null default 'pending'
              check (status in ('pending', 'sending', 'sent', 'skipped', 'cancelled', 'failed')),
  dedupe_key  text unique not null,
  body        text,
  error       text,
  claimed_at  timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists scheduled_messages_due on public.scheduled_messages (status, send_at);

-- ───────────────────────── Conversation log and alerts ─────────────────────────
create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.owners on delete cascade,
  pet_id                uuid references public.pets on delete set null,
  direction             text not null check (direction in ('inbound', 'outbound')),
  channel               text not null check (channel in ('telegram', 'email')),
  body                  text,
  photo_path            text,
  scheduled_message_id  uuid references public.scheduled_messages on delete set null,
  telegram_update_id    bigint unique,   -- makes webhook retries harmless
  created_at            timestamptz not null default now()
);
create index if not exists messages_owner on public.messages (owner_id, created_at desc);

create table if not exists public.alerts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.owners on delete cascade,
  pet_id           uuid references public.pets on delete set null,
  message_id       uuid references public.messages on delete set null,
  urgency          text not null check (urgency in ('urgent', 'callback')),
  source           text not null check (source in ('keyword', 'ai', 'both', 'fallback')),
  summary          text,
  matched_terms    text[] not null default '{}',
  status           text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by      uuid references auth.users,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now()
);
create index if not exists alerts_open on public.alerts (status, created_at desc);

-- ───────────────────────── Audit tables ─────────────────────────
create table if not exists public.ai_events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  model       text,
  input       text,
  output      jsonb,
  error       text,
  latency_ms  int,
  created_at  timestamptz not null default now()
);

create table if not exists public.contact_access_log (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.owners on delete cascade,
  staff_user_id  uuid not null references auth.users,
  accessed_at    timestamptz not null default now()
);

-- ───────────────────────── Post-op check-ins ─────────────────────────
-- Logging a procedure schedules check-ins at 10:00 clinic time on day 1 and day 3.
create or replace function public.schedule_postop_checkins() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz text;
  owner uuid;
  local_day timestamp;
begin
  select timezone into tz from clinic_settings where id = 1;
  select owner_id into owner from pets where id = new.pet_id;
  local_day := date_trunc('day', new.performed_at at time zone tz);

  insert into scheduled_messages (owner_id, pet_id, kind, related_id, send_at, dedupe_key)
  values
    (owner, new.pet_id, 'postop_day1', new.id,
     (local_day + interval '1 day 10 hours') at time zone tz, 'postop:' || new.id || ':day1'),
    (owner, new.pet_id, 'postop_day3', new.id,
     (local_day + interval '3 days 10 hours') at time zone tz, 'postop:' || new.id || ':day3')
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists procedures_schedule_checkins on public.procedures;
create trigger procedures_schedule_checkins
  after insert on public.procedures
  for each row execute function public.schedule_postop_checkins();

-- ───────────────────────── Row-level security ─────────────────────────
-- The backend uses the service-role key (bypasses RLS). The dashboard signs in
-- as staff, who can read everything and change only what their screens need.
alter table public.clinic_settings    enable row level security;
alter table public.staff              enable row level security;
alter table public.owners             enable row level security;
alter table public.pets               enable row level security;
alter table public.vaccinations       enable row level security;
alter table public.procedures         enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.messages           enable row level security;
alter table public.alerts             enable row level security;
alter table public.ai_events          enable row level security;
alter table public.contact_access_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clinic_settings','staff','owners','pets','vaccinations','procedures',
                           'scheduled_messages','messages','alerts','ai_events','contact_access_log']
  loop
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

drop policy if exists staff_update on public.clinic_settings;
create policy staff_update on public.clinic_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_write on public.pets;
create policy staff_write on public.pets for insert to authenticated with check (public.is_staff());

drop policy if exists staff_insert on public.vaccinations;
create policy staff_insert on public.vaccinations for insert to authenticated with check (public.is_staff());
drop policy if exists staff_update on public.vaccinations;
create policy staff_update on public.vaccinations for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_insert on public.procedures;
create policy staff_insert on public.procedures for insert to authenticated with check (public.is_staff());

drop policy if exists staff_update on public.scheduled_messages;
create policy staff_update on public.scheduled_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_update on public.alerts;
create policy staff_update on public.alerts for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ───────────────────────── Photo storage (private bucket) ─────────────────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
drop policy if exists staff_read_photos on storage.objects;
create policy staff_read_photos on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_staff());

-- ───────────────────────── Realtime: push new alerts to the dashboard ─────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.alerts;
exception when duplicate_object then null;
end $$;
