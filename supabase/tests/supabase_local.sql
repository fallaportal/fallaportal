-- Imitació mínima de Supabase per executar les migracions en local (PGlite). NO s'aplica a Supabase:
-- allà ja existeixen els rols anon/authenticated/service_role i l'esquema auth.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Com un projecte de Supabase amb "Automatically expose new tables" marcat (el nostre ho tenia): tot el que es crea a
-- public dona permisos a anon, authenticated i service_role. Les migracions ho han de desfer.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
