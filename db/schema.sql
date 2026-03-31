-- ai_interface: Neon schema (v2 logging + feedback)

-- Password hashing helpers
create extension if not exists pgcrypto;

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

-- Seed: admin (password + email — rotate password in production via UPDATE)
insert into ai_interface_users (username, email, password_hash, role)
values ('admin', 'aetoros@gmail.com', crypt('Catmin_465', gen_salt('bf')), 'admin')
on conflict (username) do update set
  email = excluded.email,
  password_hash = excluded.password_hash,
  role = excluded.role;

create table if not exists inference_log (
  request_id text primary key,
  created_at timestamptz not null default now(),
  user_id text null,
  source text not null default 'ai_interface',
  mode text null,

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
  raw_json jsonb not null
);

create index if not exists inference_log_created_at_idx on inference_log (created_at desc);
create index if not exists inference_log_user_id_idx on inference_log (user_id);

create table if not exists teacher_feedback (
  request_id text primary key references inference_log(request_id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id text null,
  verdict text not null check (verdict in ('correct', 'incorrect', 'unsure')),
  true_label text null check (true_label in ('human', 'ai', 'mt')),
  comment text null
);

create index if not exists teacher_feedback_created_at_idx on teacher_feedback (created_at desc);

