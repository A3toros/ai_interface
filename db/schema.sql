-- ai_interface: Neon schema (v2 logging + feedback)

-- Password hashing helpers
create extension if not exists pgcrypto;

-- =========
-- USERS
-- =========
create table if not exists ai_interface_users (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  username text not null unique,
  email text,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'reviewer'))
);

-- Existing DBs from before email column: add column (idempotent)
alter table ai_interface_users add column if not exists email text;
create unique index if not exists ai_interface_users_email_uq on ai_interface_users (email) where email is not null;

-- Seed: admin (set a temporary password, then rotate immediately)
insert into ai_interface_users (username, email, password_hash, role)
values ('admin', 'aetoros@gmail.com', crypt('CHANGE_ME_NOW', gen_salt('bf')), 'admin')
on conflict (username) do update set
  email = excluded.email,
  password_hash = excluded.password_hash,
  role = excluded.role;

-- =========
-- INFERENCES (+ teacher review in same row)
-- =========
create table if not exists inference_log (
  request_id text primary key,
  created_at timestamptz not null default now(),
  user_id text null,
  source text not null default 'ai_interface',
  mode text null,
  text text null,

  accept boolean not null,
  pred_label text not null,
  p_human real not null,
  p_ai real not null,
  p_mt real not null,

  risk real null,
  teacher_uncertainty real null,
  margin_top1_top2 real null,

  tau_risk real null,
  tau_unc real null,
  critic_margin real null,

  model_ref text null,
  text_hash text null,
  raw_json jsonb not null,

  -- Single-teacher review (latest/only)
  teacher_verdict text null check (teacher_verdict in ('correct', 'incorrect', 'unsure')),
  teacher_true_label text null check (teacher_true_label in ('human', 'ai', 'mt', 'ai_mimic_human')),
  teacher_comment text null,
  teacher_user_id text null,
  teacher_reviewed_at timestamptz null
);

create index if not exists inference_log_created_at_idx on inference_log (created_at desc);
create index if not exists inference_log_user_id_idx on inference_log (user_id);
create index if not exists inference_log_teacher_verdict_idx on inference_log (teacher_verdict);

-- Existing DBs from before text column: add column (idempotent)
alter table inference_log add column if not exists text text;

-- Existing DBs from before teacher columns: add columns (idempotent)
alter table inference_log add column if not exists teacher_verdict text;
alter table inference_log add column if not exists teacher_true_label text;
alter table inference_log add column if not exists teacher_comment text;
alter table inference_log add column if not exists teacher_user_id text;
alter table inference_log add column if not exists teacher_reviewed_at timestamptz;

