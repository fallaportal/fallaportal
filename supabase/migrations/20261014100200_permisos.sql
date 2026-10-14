-- =====================================================================================================
-- Falla Portal · Fase 1 · 3/4: funcions de permisos i polítiques RLS (MODEL_DADES §9)
--
-- Regles (decisions D-035 i D-036):
--   * LECTURA: qualsevol membre (persona activa amb almenys un rol) llig totes les files, com avui.
--     Excepció: audit_log, només amb el mòdul `registre`. Qui no és membre no veu res.
--   * ESCRIPTURA: la decideix la matriu rol × mòdul (rol_moduls). Amb diversos rols val el permís més alt.
--     Abast "directiva" = àrees i delegacions assignades a la directiva de l'exercici actiu
--     (getMyArees/getMyDelegacions de l'app actual).
--   * PROPIETAT: sense edició a Historial, cadascú modifica i esborra només el que ha creat.
--   * Les polítiques criden funcions `security definer` d'`app`, embolicades amb (select ...) perquè
--     Postgres les calcule una vegada per consulta i no per fila.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- Identitat de la petició
-- -----------------------------------------------------------------------------------------------------

create or replace function app.jwt_claims() returns jsonb
language sql stable
set search_path = ''
as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;

create or replace function app.jwt_email() returns text
language sql stable
set search_path = ''
as $$ select nullif(lower(btrim(app.jwt_claims() ->> 'email')), '') $$;

create or replace function app.jwt_sub() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(app.jwt_claims() ->> 'sub', '')::uuid $$;

-- Connexió de servei: service_role (scripts de migració, funcions de servidor) o connexió directa a la
-- base de dades sense JWT (editor SQL, CLI). Els triggers no hi apliquen les regles d'usuari.
create or replace function app.es_servei() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(app.jwt_claims() ->> 'role', 'servei') in ('service_role', 'servei') $$;

create or replace function app.usuari_id() returns text
language sql stable security definer
set search_path = ''
as $$
  select u.id from public.usuaris u
  where u.email = app.jwt_email() and u.actiu
$$;

create or replace function app.es_membre() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuaris u
    join public.usuari_rols ur on ur.usuari_id = u.id
    where u.email = app.jwt_email() and u.actiu
  )
$$;

-- -----------------------------------------------------------------------------------------------------
-- Matriu de permisos
-- -----------------------------------------------------------------------------------------------------

-- Té el mòdul en algun nivell (p_nivell = 'lectura') o en edició (p_nivell = 'edicio').
create or replace function app.pot(p_modul text, p_nivell text default 'lectura') returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuaris u
    join public.usuari_rols ur on ur.usuari_id = u.id
    join public.rol_moduls rm on rm.rol_id = ur.rol_id
    where u.email = app.jwt_email() and u.actiu
      and rm.modul_id = p_modul
      and (p_nivell = 'lectura' or rm.nivell = 'edicio')
  )
$$;

create or replace function app.pot_editar(p_modul text) returns boolean
language sql stable
set search_path = ''
as $$ select app.pot(p_modul, 'edicio') $$;

-- Edició amb abast "tot" en algun dels seus rols.
create or replace function app.pot_editar_tot(p_modul text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuaris u
    join public.usuari_rols ur on ur.usuari_id = u.id
    join public.rol_moduls rm on rm.rol_id = ur.rol_id
    where u.email = app.jwt_email() and u.actiu
      and rm.modul_id = p_modul and rm.nivell = 'edicio' and rm.abast = 'tot'
  )
$$;

-- -----------------------------------------------------------------------------------------------------
-- Abast "directiva" (replica getMyArees() i getMyDelegacions() de l'app: directiva de l'exercici actiu)
-- -----------------------------------------------------------------------------------------------------

create or replace function app.exercici_actiu() returns text
language sql stable security definer
set search_path = ''
as $$ select c.valor #>> '{}' from public.config c where c.clau = 'exercici_actiu' $$;

-- Delegacions assignades directament + totes les delegacions de les àrees assignades.
create or replace function app.delegacions_meues() returns setof text
language sql stable security definer
set search_path = ''
as $$
  select d.delegacio_id
  from public.directiva d
  where d.usuari_id = app.usuari_id() and d.exercici_id = app.exercici_actiu() and d.delegacio_id is not null
  union
  select dl.id
  from public.directiva d
  join public.delegacions dl on dl.area_id = d.area_id
  where d.usuari_id = app.usuari_id() and d.exercici_id = app.exercici_actiu() and d.area_id is not null
$$;

-- Àrees assignades directament + àrees de les delegacions assignades.
create or replace function app.arees_meues() returns setof text
language sql stable security definer
set search_path = ''
as $$
  select d.area_id
  from public.directiva d
  where d.usuari_id = app.usuari_id() and d.exercici_id = app.exercici_actiu() and d.area_id is not null
  union
  select dl.area_id
  from public.directiva d
  join public.delegacions dl on dl.id = d.delegacio_id
  where d.usuari_id = app.usuari_id() and d.exercici_id = app.exercici_actiu() and d.delegacio_id is not null
$$;

-- Un moviment està dins l'abast si la seua àrea és de les meues i la delegació també (com el formulari
-- de Nou moviment, que exigeix la delegació, i l'Historial de l'app actual).
create or replace function app.dins_abast(p_area text, p_delegacio text) returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(p_area in (select app.arees_meues())
                  and p_delegacio in (select app.delegacions_meues()), false)
$$;

-- Edició d'un mòdul sobre un event: abast tot, o event d'una delegació meua o del qual sóc responsable.
-- Una caixa sense event només és dins l'abast "tot" (com el filtre del rol delegat a l'app actual).
create or replace function app.pot_editar_event(p_modul text, p_event_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.pot_editar_tot(p_modul)
      or (app.pot_editar(p_modul) and exists (
            select 1 from public.events e
            where e.id = p_event_id
              and (e.delegacio_id in (select app.delegacions_meues()) or e.responsable_id = app.usuari_id())))
$$;

create or replace function app.pot_editar_caixa(p_modul text, p_caixa_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select app.pot_editar_event(p_modul, c.event_id) from public.caixes c where c.id = p_caixa_id), false)
$$;

create or replace function app.caixa_oberta(p_caixa_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.caixes c where c.id = p_caixa_id and c.estat = 'oberta') $$;

-- Fons d'un delegat: abast tot, o delegat assignat a una delegació meua (vista del responsable d'àrea).
create or replace function app.pot_editar_fons(p_delegat_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.pot_editar_tot('fons')
      or (app.pot_editar('fons') and exists (
            select 1 from public.directiva d
            where d.usuari_id = p_delegat_id and d.exercici_id = app.exercici_actiu()
              and d.delegacio_id in (select app.delegacions_meues())))
$$;

create or replace function app.pressupost_bloquejat(p_exercici_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.pressupost_estat p where p.exercici_id = p_exercici_id and p.estat = 'bloquejat') $$;

create or replace function app.es_creador_moviment(p_moviment_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.moviments m where m.id = p_moviment_id and m.creat_per = app.usuari_id()) $$;

-- -----------------------------------------------------------------------------------------------------
-- Permisos de rol de base de dades
-- -----------------------------------------------------------------------------------------------------

-- Els permisos es donen a mà, en cada migració. Equival a desmarcar "Automatically expose new tables" al projecte
-- (va quedar marcat en crear-lo): les taules, seqüències i funcions noves de public no donen permisos ni a anon ni a
-- authenticated. service_role (scripts de migració, funcions de servidor) salta RLS però necessita els GRANT, i també
-- executar les funcions d'app que criden els triggers.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
revoke insert, update, delete on public.moduls, public.audit_log from authenticated, service_role;

-- -----------------------------------------------------------------------------------------------------
-- RLS: lectura (D-035)
-- -----------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'rols', 'moduls', 'usuaris', 'usuari_rols', 'rol_moduls', 'exercicis', 'arees', 'delegacions', 'directiva',
    'events', 'comptes', 'saldos_inicials', 'operacions', 'regles_importacio', 'caixes', 'caixa_canvis',
    'moviments', 'justificants', 'fons', 'pressupost_linies', 'pressupost_estat', 'pressupost_historial',
    'fallesapp_passiu', 'fallesapp_consums', 'fallesapp_recarregues', 'config', 'audit_log']
  loop
    -- Sense FORCE: el propietari (postgres) i les funcions security definer en queden fora; si no, les
    -- funcions de permisos que lligen usuaris i rol_moduls cridarien les polítiques que les criden a elles.
    execute format('alter table public.%I enable row level security', t);
    if t <> 'audit_log' then
      execute format('create policy membres_lligen on public.%I for select to authenticated using ((select app.es_membre()))', t);
    end if;
  end loop;
end $$;

create policy registre_llig on public.audit_log for select to authenticated
  using ((select app.pot('registre')));

-- -----------------------------------------------------------------------------------------------------
-- RLS: escriptura de configuració
-- -----------------------------------------------------------------------------------------------------

-- Mòdul que governa l'escriptura de cada taula de configuració.
do $$
declare
  r record;
begin
  for r in select * from (values
      ('arees', 'configuracio'), ('delegacions', 'configuracio'), ('events', 'configuracio'),
      ('comptes', 'configuracio'), ('config', 'configuracio'),
      ('rols', 'rols'), ('rol_moduls', 'rols'),
      ('usuaris', 'usuaris'), ('usuari_rols', 'usuaris'),
      ('directiva', 'directiva'),
      ('pressupost_estat', 'pressupostos_aprovar'),
      ('fallesapp_passiu', 'fallesapp'), ('fallesapp_consums', 'fallesapp'), ('fallesapp_recarregues', 'fallesapp')
    ) as x(taula, modul)
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app.pot_editar(%L)))',
                   'edicio_' || r.modul || '_insert', r.taula, r.modul);
    execute format('create policy %I on public.%I for update to authenticated using ((select app.pot_editar(%L))) with check ((select app.pot_editar(%L)))',
                   'edicio_' || r.modul || '_update', r.taula, r.modul, r.modul);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app.pot_editar(%L)))',
                   'edicio_' || r.modul || '_delete', r.taula, r.modul);
  end loop;
end $$;

-- Els rols de sistema no s'esborren (protecció de l'app actual).
create policy rols_sistema_no_s_esborren on public.rols as restrictive for delete to authenticated
  using (not de_sistema);

-- Exercicis: crear i eliminar amb `exercicis`; tancar, reobrir i data d'obertura amb `configuracio`.
-- L'exercici actiu no es pot eliminar.
create policy exercicis_insert on public.exercicis for insert to authenticated
  with check ((select app.pot_editar('exercicis')));
create policy exercicis_update on public.exercicis for update to authenticated
  using ((select app.pot_editar('configuracio')) or (select app.pot_editar('exercicis')))
  with check ((select app.pot_editar('configuracio')) or (select app.pot_editar('exercicis')));
create policy exercicis_delete on public.exercicis for delete to authenticated
  using ((select app.pot_editar('exercicis')) and id is distinct from (select app.exercici_actiu()));

-- Saldos inicials: Configuració (comptes) i Exercicis (el nou exercici arrossega els saldos).
create policy saldos_escriure on public.saldos_inicials for all to authenticated
  using ((select app.pot_editar('configuracio')) or (select app.pot_editar('exercicis')))
  with check ((select app.pot_editar('configuracio')) or (select app.pot_editar('exercicis')));

-- Regles: Configuració, o Importar (crear una regla des d'una excepció de la importació).
create policy regles_escriure on public.regles_importacio for all to authenticated
  using ((select app.pot_editar('configuracio')) or (select app.pot_editar('importacio')))
  with check ((select app.pot_editar('configuracio')) or (select app.pot_editar('importacio')));

-- Historial de bloquejos: només s'hi afegeix.
create policy pressupost_historial_insert on public.pressupost_historial for insert to authenticated
  with check ((select app.pot_editar('pressupostos_aprovar')));

-- -----------------------------------------------------------------------------------------------------
-- RLS: operacions (agrupen una acció; els permisos reals són a les files que agrupen)
-- -----------------------------------------------------------------------------------------------------

create policy operacions_insert on public.operacions for insert to authenticated
  with check ((select app.es_membre()) and creat_per = (select app.usuari_id()));
create policy operacions_update on public.operacions for update to authenticated
  using (creat_per = (select app.usuari_id()) or (select app.pot_editar('historial')))
  with check (creat_per = (select app.usuari_id()) or (select app.pot_editar('historial')));
create policy operacions_delete on public.operacions for delete to authenticated
  using (creat_per = (select app.usuari_id()) or (select app.pot_editar('historial')));

-- -----------------------------------------------------------------------------------------------------
-- RLS: moviments
-- -----------------------------------------------------------------------------------------------------

create policy moviments_insert on public.moviments for insert to authenticated
with check (
  creat_per = (select app.usuari_id())
  and (
    -- Nou moviment: dins l'abast i, sense abast "tot", a l'exercici actiu (regla 11 de l'inventari).
    -- El responsable és qui el registra.
    (font = 'manual'
      and coalesce(responsable_id, creat_per) = creat_per
      and ((select app.pot_editar_tot('moviments'))
           or ((select app.pot_editar('moviments'))
               and app.dins_abast(area_id, delegacio_id)
               and exercici_id = (select app.exercici_actiu()))))
    -- Fons delegats: ingrés d'un tercer i traspàs banc → caixa (D-022).
    or (font in ('ingres_tercer', 'traspas_banc_caixa') and (select app.pot_editar('fons')))
    -- Caixa d'event: retirada i tancament d'una caixa oberta que puc operar (qualsevol àrea, com avui).
    or (font in ('tancament_caixa', 'retirada_caixa')
        and app.pot_editar_caixa('caixa', caixa_id) and app.caixa_oberta(caixa_id))
    -- Importacions.
    or (font in ('extracte', 'csv_generic') and (select app.pot_editar('importacio')))
    or (font in ('fallesapp_transaccions', 'fallesapp_bonificacio') and (select app.pot_editar('fallesapp')))
  )
);

-- Modificar: Historial en edició, o el creador (només concepte i import: ho limita el trigger
-- app.t_moviments_columnes).
create policy moviments_update on public.moviments for update to authenticated
  using ((select app.pot_editar('historial')) or creat_per = (select app.usuari_id()))
  with check ((select app.pot_editar('historial')) or creat_per = (select app.usuari_id()));

create policy moviments_delete on public.moviments for delete to authenticated
using (
  (select app.pot_editar('historial'))
  or creat_per = (select app.usuari_id())
  -- Reobrir o eliminar una caixa (r1), o eliminar una caixa oberta (Caixa d'event).
  or (caixa_id is not null
      and ((select app.pot_editar('r1'))
           or (app.pot_editar_caixa('caixa', caixa_id) and app.caixa_oberta(caixa_id))))
);

-- -----------------------------------------------------------------------------------------------------
-- RLS: justificants
-- -----------------------------------------------------------------------------------------------------

create policy justificants_insert on public.justificants for insert to authenticated
with check (
  (select app.pot_editar('historial'))
  or app.es_creador_moviment(moviment_id)
  or ((select app.pot_editar('r4')) and exists (
        select 1 from public.moviments m where m.id = moviment_id and m.font = 'manual' and m.tipus = 'despesa'))
);
create policy justificants_update on public.justificants for update to authenticated
  using ((select app.pot_editar('historial')))
  with check ((select app.pot_editar('historial')));
create policy justificants_delete on public.justificants for delete to authenticated
  using ((select app.pot_editar('historial')) or app.es_creador_moviment(moviment_id));

-- -----------------------------------------------------------------------------------------------------
-- RLS: fons
-- -----------------------------------------------------------------------------------------------------

create policy fons_insert on public.fons for insert to authenticated
with check (
  creat_per = (select app.usuari_id())
  and (
    (tipus in ('lliurament', 'regularitzacio', 'devolucio', 'reintegrament') and app.pot_editar_fons(delegat_id))
    -- Despesa amb fons lliurats o avançament: la registra el mateix delegat amb el seu moviment.
    or (tipus in ('despesa_fons', 'avancament')
        and delegat_id = (select app.usuari_id())
        and app.es_creador_moviment(moviment_id))
  )
);
-- El creador d'una despesa amb fons en pot canviar l'import en editar el moviment (trigger de columnes).
create policy fons_update on public.fons for update to authenticated
  using (app.pot_editar_fons(delegat_id)
         or (creat_per = (select app.usuari_id()) and tipus in ('despesa_fons', 'avancament')))
  with check (app.pot_editar_fons(delegat_id)
              or (creat_per = (select app.usuari_id()) and tipus in ('despesa_fons', 'avancament')));
-- Esborrar directament: només Fons en edició. El creador l'esborra esborrant el moviment (cascada).
create policy fons_delete on public.fons for delete to authenticated
  using (app.pot_editar_fons(delegat_id));

-- -----------------------------------------------------------------------------------------------------
-- RLS: caixes d'event
-- -----------------------------------------------------------------------------------------------------

-- app.pot_editar_event amb event nul només deixa passar l'abast "tot" (caixes sense event).
create policy caixes_insert on public.caixes for insert to authenticated
  with check (app.pot_editar_event('caixa_obrir', event_id));
-- Tancar una caixa oberta: Caixa d'event. Reobrir o modificar una caixa tancada: r1 (trigger d'estat).
create policy caixes_update on public.caixes for update to authenticated
  using ((select app.pot_editar('r1')) or (estat = 'oberta' and app.pot_editar_event('caixa', event_id)))
  with check ((select app.pot_editar('r1')) or app.pot_editar_event('caixa', event_id));
create policy caixes_delete on public.caixes for delete to authenticated
  using ((select app.pot_editar('r1')) or (estat = 'oberta' and app.pot_editar_event('caixa', event_id)));

create policy caixa_canvis_insert on public.caixa_canvis for insert to authenticated
with check (
  (tipus = 'lliurament' and app.pot_editar_caixa('caixa_obrir', caixa_id))
  or (tipus in ('ampliacio', 'devolucio') and app.caixa_oberta(caixa_id) and app.pot_editar_caixa('caixa', caixa_id))
);
create policy caixa_canvis_update on public.caixa_canvis for update to authenticated
  using ((select app.pot_editar('r1'))) with check ((select app.pot_editar('r1')));
create policy caixa_canvis_delete on public.caixa_canvis for delete to authenticated
  using ((select app.pot_editar('r1'))
         or (app.caixa_oberta(caixa_id) and app.pot_editar_caixa('caixa', caixa_id)));

-- -----------------------------------------------------------------------------------------------------
-- RLS: pressupost
-- -----------------------------------------------------------------------------------------------------

-- Línies: Pressupostos dins l'abast mentre no estiga bloquejat; Configuració per a "Copiar pressupost".
create policy pressupost_linies_escriure on public.pressupost_linies for all to authenticated
using (
  not app.pressupost_bloquejat(exercici_id)
  and ((select app.pot_editar_tot('pressupostos'))
       or (select app.pot_editar('configuracio'))
       or ((select app.pot_editar('pressupostos')) and delegacio_id in (select app.delegacions_meues())))
)
with check (
  not app.pressupost_bloquejat(exercici_id)
  and ((select app.pot_editar_tot('pressupostos'))
       or (select app.pot_editar('configuracio'))
       or ((select app.pot_editar('pressupostos')) and delegacio_id in (select app.delegacions_meues())))
);
