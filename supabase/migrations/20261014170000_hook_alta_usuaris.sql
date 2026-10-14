-- Fase 2 · Només els membres poden crear-se un usuari a Auth (D-046).
--
-- L'entrada és per correu amb un codi de 6 xifres (`signInWithOtp`). Amb l'alta pública desactivada només rebria codi qui
-- ja és a `auth.users`, i donar d'alta una persona a `usuaris` hauria de crear-la també a Auth amb una clau
-- d'administrador (codi de servidor). En lloc d'això, l'alta pública s'activa i aquest hook "Before User Created" de
-- Supabase Auth rebutja qualsevol correu que no siga el d'un membre: persona activa de `usuaris` amb almenys un rol. Es
-- compleix el mateix que a `app.es_membre()`, però sobre el correu de la petició d'alta (encara no hi ha JWT).
--
-- El hook s'executa abans de crear l'usuari i abans d'enviar el correu: a qui no és membre no se li envia res (ni es pot
-- fer servir l'SMTP per a enviar correu a tercers). Un membre que perd tots els rols o es desactiva conserva el seu usuari
-- d'Auth, però no hi té cap accés: la identitat de les polítiques (R3) exigeix ser membre.
--
-- Cal registrar-lo al panell: Authentication → Hooks → "Before User Created" → Postgres function → app.hook_alta_usuari.
-- (Un hook només el pot executar el rol de servei d'Auth: ni `authenticated`, ni `anon`, ni `public`.)

create or replace function app.hook_alta_usuari(event jsonb) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(event -> 'user' ->> 'email')), '');
begin
  if v_email is not null and exists (
    select 1
    from public.usuaris u
    join public.usuari_rols ur on ur.usuari_id = u.id
    where u.email = v_email and u.actiu
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Aquest correu no és de cap membre de la falla.'));
end $$;

comment on function app.hook_alta_usuari(jsonb) is
  'Hook "Before User Created" de Supabase Auth: només deixa crear l''usuari d''un membre (D-046).';

revoke all on function app.hook_alta_usuari(jsonb) from public, anon, authenticated;
grant usage on schema app to supabase_auth_admin;
grant execute on function app.hook_alta_usuari(jsonb) to supabase_auth_admin;
