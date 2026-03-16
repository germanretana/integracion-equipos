create extension if not exists pgcrypto;

create table if not exists admins (
  email text primary key,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null
);

create table if not exists processes (
  process_slug text primary key,
  company_name text not null,
  process_name text not null,
  status text not null check (status in ('EN_PREPARACION', 'EN_CURSO', 'CERRADO')),
  created_at timestamptz not null,
  launched_at timestamptz null,
  closed_at timestamptz null,
  expected_start_at date null,
  expected_end_at date null,
  logo_url text null
);

create table if not exists base_templates (
  domain text not null check (domain in ('questionnaire', 'report')),
  kind text not null check (kind in ('c1', 'c2')),
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (domain, kind)
);

create table if not exists process_templates (
  process_slug text not null references processes(process_slug) on delete cascade,
  domain text not null check (domain in ('questionnaire', 'report')),
  kind text not null check (kind in ('c1', 'c2')),
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (process_slug, domain, kind)
);

create table if not exists participants (
  id text primary key,
  process_slug text not null references processes(process_slug) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  password_hash text null,
  unique (process_slug, email)
);

create index if not exists participants_process_slug_idx
  on participants(process_slug);

create table if not exists response_c1 (
  process_slug text not null references processes(process_slug) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  saved_at timestamptz null,
  submitted_at timestamptz null,
  primary key (process_slug, participant_id)
);

create table if not exists response_c2 (
  process_slug text not null references processes(process_slug) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  peer_id text not null references participants(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  saved_at timestamptz null,
  submitted_at timestamptz null,
  primary key (process_slug, participant_id, peer_id),
  check (participant_id <> peer_id)
);

create index if not exists response_c2_process_slug_participant_id_idx
  on response_c2(process_slug, participant_id);

create table if not exists events (
  id text primary key,
  ts timestamptz not null,
  type text not null,
  process_slug text null references processes(process_slug) on delete cascade,
  participant_id text null references participants(id) on delete set null,
  participant_email text null,
  participant_name text null,
  admin_email text null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists events_process_slug_idx
  on events(process_slug);

create index if not exists events_participant_id_idx
  on events(participant_id);

create index if not exists events_type_idx
  on events(type);

create index if not exists events_ts_idx
  on events(ts desc);
