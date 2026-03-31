-- Run in Neon SQL Editor if login fails (forces admin password to match seed).
-- Password: Catmin_465

create extension if not exists pgcrypto;

update ai_interface_users
set password_hash = crypt('Catmin_465', gen_salt('bf'))
where username = 'admin';

-- If no row exists yet, use schema.sql insert instead.
