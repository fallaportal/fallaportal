-- =====================================================================================================
-- Falla Portal · Fase 1 · revisió final de seguretat (2026-10-14, Opus 5.5 · max)
--
-- Troballes R1–R11 de MODEL_DADES §9.7. Cap canvia una casella de la matriu de permisos (D-036): tanquen camins
-- que l'API de Supabase deixava oberts i les pantalles de l'app no. Cada una té els seus tests ("R…" a
-- supabase/tests/casos_rls.mjs), escrits i vistos fallar abans d'aquesta migració.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- R1 · Privilegis de base de dades. El projecte es va crear amb "Automatically expose new tables" i les taules van
-- nàixer amb TRUNCATE, REFERENCES i TRIGGER per a authenticated. TRUNCATE buida una taula sense passar per RLS ni pel
-- registre d'activitat. Ni anon ni authenticated toquen seqüències (la del registre inclosa).
-- -----------------------------------------------------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- -----------------------------------------------------------------------------------------------------
-- R2 · Connexió de servei = claim role 'service_role', o connexió directa sense JWT i sense SET ROLE. Abans, un JWT
-- sense el claim `role` es tractava com a servei i saltava les regles d'usuari (fallava cap al costat obert).
-- current_setting('role') és el rol de la petició també dins de les funcions security definer.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.es_servei() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(app.jwt_claims() ->> 'role', '') = 'service_role'
      or (app.jwt_claims() is null and current_setting('role') = 'none')
$$;

-- -----------------------------------------------------------------------------------------------------
-- R3 · La identitat és la d'un membre: persona activa amb almenys un rol. Abans, qui havia perdut tots els rols
-- conservava la propietat dels seus registres antics (podia crear-hi avançaments o adjuntar-hi justificants).
-- -----------------------------------------------------------------------------------------------------

create or replace function app.usuari_id() returns text
language sql stable security definer
set search_path = ''
as $$
  select u.id from public.usuaris u
  where u.email = app.jwt_email() and u.actiu
    and exists (select 1 from public.usuari_rols ur where ur.usuari_id = u.id)
$$;

create or replace function app.es_membre() returns boolean
language sql stable security definer
set search_path = ''
as $$ select app.usuari_id() is not null $$;

-- -----------------------------------------------------------------------------------------------------
-- R4 · Els moviments i el canvi d'una caixa només s'esborren d'un en un amb r1 (reobrir o eliminar una caixa
-- tancada). Eliminar una caixa oberta se'ls endú per la clau forana, com fa l'app; esborrar-los solts no ho fa.
-- -----------------------------------------------------------------------------------------------------

drop policy moviments_delete on public.moviments;
create policy moviments_delete on public.moviments for delete to authenticated
using (
  (select app.pot_editar('historial'))
  or creat_per = (select app.usuari_id())
  or (caixa_id is not null and (select app.pot_editar('r1')))
);

drop policy caixa_canvis_delete on public.caixa_canvis;
create policy caixa_canvis_delete on public.caixa_canvis for delete to authenticated
  using ((select app.pot_editar('r1')));

-- -----------------------------------------------------------------------------------------------------
-- R5 · Fons. Una despesa amb fons o un avançament va lligat a la seua despesa en efectiu (pagada amb fons lliurats o
-- amb avançament), n'hi ha un per despesa i val el mateix que la despesa. Abans, un delegat podia afegir avançaments
-- repetits o canviar-ne l'import, i inflar el que la falla li deu. L'import el manté la base de dades: quan canvia
-- el de la despesa, canvia el del fons (l'app ja no l'ha d'actualitzar a part).
-- -----------------------------------------------------------------------------------------------------

create unique index fons_un_per_moviment on public.fons (moviment_id) where moviment_id is not null;

create or replace function app.t_fons_moviment() returns trigger
language plpgsql
security definer  -- llig la despesa i el compte encara que qui escriu no els puga llegir
set search_path = ''
as $$
declare
  m public.moviments;
begin
  if app.es_servei() then
    return new;
  end if;
  if new.tipus in ('despesa_fons', 'avancament') then
    select * into m from public.moviments where id = new.moviment_id;
    if not found
       or m.tipus <> 'despesa'
       or m.pagament_efectiu is distinct from (case new.tipus when 'despesa_fons' then 'fons_lliurats' else 'avancament' end)
       or not exists (select 1 from public.comptes c where c.id = m.compte_id and c.tipus = 'efectiu') then
      raise exception 'Una despesa amb fons o un avançament va lligat a la seua despesa en efectiu, pagada amb fons lliurats o amb avançament.'
        using errcode = 'check_violation';
    end if;
    new.import := m.import;
  elsif new.moviment_id is not null then
    raise exception 'Un lliurament, una devolució, un reintegrament o una regularització no van lligats a cap moviment.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t25_moviment before insert or update on public.fons
  for each row execute function app.t_fons_moviment();

create or replace function app.t_moviments_sync_fons() returns trigger
language plpgsql
security definer  -- el fons pot ser d'un altre delegat; el canvi ja l'ha autoritzat la despesa
set search_path = ''
as $$
begin
  update public.fons set import = new.import
  where moviment_id = new.id and tipus in ('despesa_fons', 'avancament') and import is distinct from new.import;
  return null;
end $$;

create trigger t80_sync_fons after update of import on public.moviments
  for each row when (new.import is distinct from old.import) execute function app.t_moviments_sync_fons();

-- -----------------------------------------------------------------------------------------------------
-- R6 · Ningú no fica registres dins d'una operació d'un altre (llevat d'Historial en edició). Abans, un delegat podia
-- ficar un moviment dins d'una importació de Tresoreria, i "desfer la importació" se l'hauria endut.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_operacio_propia() returns trigger
language plpgsql
security definer  -- llig operacions encara que qui escriu no les puga llegir
set search_path = ''
as $$
begin
  if app.es_servei() or new.operacio_id is null
     or (tg_op = 'UPDATE' and new.operacio_id is not distinct from old.operacio_id)
     or app.pot_editar('historial') then
    return new;
  end if;
  if not exists (select 1 from public.operacions o where o.id = new.operacio_id and o.creat_per = app.usuari_id()) then
    raise exception 'No pots afegir registres a una operació que no és teua.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['moviments', 'fons', 'caixa_canvis', 'fallesapp_passiu', 'fallesapp_consums', 'fallesapp_recarregues']
  loop
    execute format('create trigger t35_operacio before insert or update of operacio_id on public.%I for each row execute function app.t_operacio_propia()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- R7 · L'event d'un moviment manual i el d'una línia de pressupost han de ser de la seua delegació (les pantalles
-- només ofereixen eixos events; abans, un delegat podia inflar el resultat o el pressupost d'un event aliè a r3).
-- Sense abast "tot", el pressupost només es toca a l'exercici actiu (com els moviments).
-- R9 · Els moviments d'una caixa d'event són d'efectiu (l'app sempre els crea així).
-- -----------------------------------------------------------------------------------------------------

create or replace function app.event_de_delegacio(p_event_id text, p_delegacio_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.events e where e.id = p_event_id and e.delegacio_id = p_delegacio_id) $$;

create or replace function app.es_compte_efectiu(p_compte_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.comptes c where c.id = p_compte_id and c.tipus = 'efectiu') $$;

drop policy moviments_insert on public.moviments;
create policy moviments_insert on public.moviments for insert to authenticated
with check (
  creat_per = (select app.usuari_id())
  and (
    -- Nou moviment: dins l'abast i, sense abast "tot", a l'exercici actiu (regla 11 de l'inventari). L'event, de la
    -- mateixa delegació. El responsable el posa el servidor (t15).
    (font = 'manual'
      and coalesce(responsable_id, creat_per) = creat_per
      and (event_id is null or app.event_de_delegacio(event_id, delegacio_id))
      and ((select app.pot_editar_tot('moviments'))
           or ((select app.pot_editar('moviments'))
               and app.dins_abast(area_id, delegacio_id)
               and exercici_id = (select app.exercici_actiu()))))
    -- Fons delegats: ingrés d'un tercer i traspàs banc → caixa (D-022).
    or (font in ('ingres_tercer', 'traspas_banc_caixa') and (select app.pot_editar('fons')))
    -- Caixa d'event: retirada i tancament, en efectiu, d'una caixa oberta que puc operar (qualsevol àrea, com avui).
    or (font in ('tancament_caixa', 'retirada_caixa')
        and app.es_compte_efectiu(compte_id)
        and app.pot_editar_caixa('caixa', caixa_id) and app.caixa_oberta(caixa_id))
    -- Importacions.
    or (font in ('extracte', 'csv_generic') and (select app.pot_editar('importacio')))
    or (font in ('fallesapp_transaccions', 'fallesapp_bonificacio') and (select app.pot_editar('fallesapp')))
  )
);

drop policy pressupost_linies_escriure on public.pressupost_linies;
create policy pressupost_linies_escriure on public.pressupost_linies for all to authenticated
using (
  not app.pressupost_bloquejat(exercici_id)
  and ((select app.pot_editar_tot('pressupostos'))
       or (select app.pot_editar('configuracio'))
       or ((select app.pot_editar('pressupostos'))
           and delegacio_id in (select app.delegacions_meues())
           and exercici_id = (select app.exercici_actiu())))
)
with check (
  not app.pressupost_bloquejat(exercici_id)
  and (event_id is null or app.event_de_delegacio(event_id, delegacio_id))
  and ((select app.pot_editar_tot('pressupostos'))
       or (select app.pot_editar('configuracio'))
       or ((select app.pot_editar('pressupostos'))
           and delegacio_id in (select app.delegacions_meues())
           and exercici_id = (select app.exercici_actiu())))
);

-- -----------------------------------------------------------------------------------------------------
-- R8 · Camps d'un moviment que no posa l'usuari: el responsable (qui el registra; els importats no en tenen, D-030),
-- l'empremta bancària i la regla d'importació (només la importació). Abans, un delegat podia falsejar l'empremta
-- d'un apunt del banc que encara havia d'arribar i fer que la importació el donara per duplicat.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_moviments_defectes() returns trigger
language plpgsql
security definer  -- llig el compte encara que qui escriu no el puga llegir
set search_path = ''
as $$
declare
  v_tipus_compte text;
begin
  if new.conciliacio is null or not app.es_servei() then
    select c.tipus into v_tipus_compte from public.comptes c where c.id = new.compte_id;
    new.conciliacio := case
      when v_tipus_compte = 'efectiu' then 'no_aplica'
      when new.font in ('extracte', 'csv_generic') then 'conciliat'
      when v_tipus_compte = 'banc' then 'pendent'
      else 'no_aplica' end;
  end if;
  if app.es_servei() then
    if new.font = 'manual' and new.responsable_id is null and new.responsable_extern is null then
      new.responsable_id := new.creat_per;
    end if;
  else
    new.responsable_extern := null;
    new.responsable_id := case when new.font in ('extracte', 'csv_generic', 'fallesapp_transaccions') then null
                               else new.creat_per end;
    if new.font not in ('extracte', 'csv_generic', 'fallesapp_transaccions') then
      new.empremta := null;
    end if;
    if new.font not in ('extracte', 'csv_generic') then
      new.regla_id := null;
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- R10 · L'enllaç antic de Drive d'un justificant només el posa la migració (Fase 4). Abans, un usuari podia penjar
-- un enllaç extern qualsevol que els altres obririen com a justificant.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_justificants_url() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.es_servei()
     and new.url_drive_original is distinct from (case when tg_op = 'UPDATE' then old.url_drive_original end) then
    raise exception 'L''enllaç antic de Drive només el posa la migració dels justificants.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger t50_url before insert or update on public.justificants
  for each row execute function app.t_justificants_url();

-- -----------------------------------------------------------------------------------------------------
-- R11 · Dades que no canvien: les dates d'un exercici (01/04–31/03, D-026; canviar-les desquadraria l'exercici dels
-- registres ja desats) i la marca de rol de sistema (un rol de sistema no s'esborra).
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_exercicis_dates() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.es_servei() and (new.data_inici is distinct from old.data_inici or new.data_fi is distinct from old.data_fi) then
    raise exception 'Les dates d''un exercici no es canvien (de l''01/04 al 31/03, D-026).' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t50_dates before update on public.exercicis
  for each row execute function app.t_exercicis_dates();

create or replace function app.t_rols_sistema() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.es_servei() and new.de_sistema is distinct from old.de_sistema then
    raise exception 'Un rol de sistema no deixa de ser-ho.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t50_sistema before update on public.rols
  for each row execute function app.t_rols_sistema();

-- -----------------------------------------------------------------------------------------------------
-- Funcions noves: només per a qui té sessió i per al servei.
-- -----------------------------------------------------------------------------------------------------

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
