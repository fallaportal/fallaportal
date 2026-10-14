-- =====================================================================================================
-- Falla Portal · Fase 1 · 4/4: triggers
--
-- Ordre dels triggers BEFORE (Postgres els executa per ordre alfabètic del nom):
--   t10 autoria · t15 valors per defecte · t20 exercici per la data · t30 columnes permeses
--   t40 exercici tancat · t50 regles d'estat
-- Després de cada canvi: t90 registre d'activitat (AFTER).
-- Les connexions de servei (app.es_servei(): service_role o connexió directa) no passen per les regles
-- d'usuari, però sí per l'autoria i pel registre d'activitat.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- t10 · Autoria: creat_at/creat_per a l'alta, modificat_at/modificat_per als canvis. No es poden falsejar.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_autoria() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if app.es_servei() then
      new.creat_at := coalesce(new.creat_at, now());   -- la migració pot conservar la data original
    else
      new.creat_at := now();
      new.creat_per := app.usuari_id();
      new.modificat_at := null;
      new.modificat_per := null;
    end if;
  else
    new.creat_at := old.creat_at;
    new.creat_per := old.creat_per;
    new.modificat_at := now();
    if not app.es_servei() then
      new.modificat_per := app.usuari_id();
    end if;
  end if;
  return new;
end $$;

do $$
declare
  t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'creat_per'
  loop
    execute format('create trigger t10_autoria before insert or update on public.%I for each row execute function app.t_autoria()', t.table_name);
  end loop;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- t15 · Valors per defecte calculats
-- -----------------------------------------------------------------------------------------------------

-- Conciliació (calcConciliacio de l'app) i responsable dels moviments manuals (qui el registra, D-030).
-- A l'alta, la conciliació la calcula sempre el servidor (la migració de la Fase 5 pot portar la desada);
-- després només la canvia qui té Historial en edició (trigger de columnes).
create or replace function app.t_moviments_defectes() returns trigger
language plpgsql
security definer  -- llig exercicis, caixes i comptes encara que qui escriu no els puga llegir
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
  if new.font = 'manual' and new.responsable_id is null and new.responsable_extern is null then
    new.responsable_id := new.creat_per;
  end if;
  return new;
end $$;

create trigger t15_defectes before insert on public.moviments
  for each row execute function app.t_moviments_defectes();

-- Emails en minúscules (A-30: el mateix delegat apareixia amb majúscules i minúscules).
create or replace function app.t_usuaris_email() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  if tg_op = 'UPDATE' and new.email is distinct from old.email and not app.es_servei() then
    raise exception 'L''email d''un usuari no es pot canviar: dona d''alta un usuari nou.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t15_email before insert or update on public.usuaris
  for each row execute function app.t_usuaris_email();

-- -----------------------------------------------------------------------------------------------------
-- t20 · L'exercici es calcula per la data (D-029). Imputar-lo a un altre és una excepció amb motiu.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_exercici_per_data() returns trigger
language plpgsql
security definer  -- llig exercicis, caixes i comptes encara que qui escriu no els puga llegir
set search_path = ''
as $$
declare
  v_exercici text;
begin
  if tg_op = 'UPDATE'
     and new.data is not distinct from old.data
     and new.exercici_id is not distinct from old.exercici_id
     and new.imputacio_excepcional is not distinct from old.imputacio_excepcional
     and new.motiu_imputacio is not distinct from old.motiu_imputacio then
    return new;
  end if;

  select e.id into v_exercici from public.exercicis e where new.data between e.data_inici and e.data_fi;

  if new.imputacio_excepcional then
    if not app.es_servei() and not app.pot_editar('exercicis') then
      raise exception 'Només qui pot gestionar exercicis pot imputar un registre a un exercici diferent del de la seua data.'
        using errcode = 'insufficient_privilege';
    end if;
    new.exercici_id := coalesce(new.exercici_id, v_exercici);
  else
    if v_exercici is null then
      raise exception 'La data % no és dins de cap exercici.', new.data using errcode = 'check_violation';
    end if;
    new.exercici_id := v_exercici;
  end if;
  return new;
end $$;

create trigger t20_exercici before insert or update on public.moviments
  for each row execute function app.t_exercici_per_data();
create trigger t20_exercici before insert or update on public.fons
  for each row execute function app.t_exercici_per_data();
create trigger t20_exercici before insert or update on public.caixes
  for each row execute function app.t_exercici_per_data();

-- -----------------------------------------------------------------------------------------------------
-- t30 · Columnes que pot canviar qui no té el permís complet
-- (pg_trigger_depth() > 1: canvis fets per una clau forana, p. ex. `on delete set null`, no per l'usuari)
-- -----------------------------------------------------------------------------------------------------

create or replace function app.canvis_fora_de(p_old jsonb, p_new jsonb, p_permeses text[]) returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array_agg(k order by k), '{}')
  from jsonb_object_keys(p_new) k
  where k <> all (p_permeses || array['modificat_at', 'modificat_per'])
    and p_new -> k is distinct from p_old -> k
$$;

-- Sense edició a Historial, el creador només canvia el concepte i l'import (modal d'edició de l'app;
-- l'àrea i la delegació només les canvien President i Tresoreria).
create or replace function app.t_moviments_columnes() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_canvis text[];
begin
  if app.es_servei() or pg_trigger_depth() > 1 or app.pot_editar('historial') then
    return new;
  end if;
  v_canvis := app.canvis_fora_de(to_jsonb(old), to_jsonb(new), array['concepte', 'import']);
  if cardinality(v_canvis) > 0 then
    raise exception 'Només pots canviar el concepte i l''import dels moviments que has registrat (has intentat canviar: %).',
      array_to_string(v_canvis, ', ') using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger t30_columnes before update on public.moviments
  for each row execute function app.t_moviments_columnes();

-- Sense edició a Fons, el creador d'una despesa amb fons només en canvia l'import (en editar el moviment).
create or replace function app.t_fons_columnes() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_canvis text[];
begin
  if app.es_servei() or pg_trigger_depth() > 1 or app.pot_editar_fons(old.delegat_id) then
    return new;
  end if;
  v_canvis := app.canvis_fora_de(to_jsonb(old), to_jsonb(new), array['import']);
  if cardinality(v_canvis) > 0 then
    raise exception 'Només pots canviar l''import d''un registre de fons teu (has intentat canviar: %).',
      array_to_string(v_canvis, ', ') using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger t30_columnes before update on public.fons
  for each row execute function app.t_fons_columnes();

-- -----------------------------------------------------------------------------------------------------
-- t40 · Exercici tancat (D-029): no accepta altes, canvis ni esborrats, llevat d'excepció amb motiu
-- de qui té el mòdul `exercicis` en edició. El motiu arriba al registre o a la variable de sessió
-- app.motiu (set_config('app.motiu', '...', true), que posaran les funcions de la Fase 3).
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_exercici_tancat() returns trigger
language plpgsql
security definer  -- llig exercicis, caixes i comptes encara que qui escriu no els puga llegir
set search_path = ''
as $$
declare
  v_ex_nou text;
  v_ex_vell text;
  v_tancat text;
  v_motiu text := nullif(btrim(current_setting('app.motiu', true)), '');
  v_imputacio boolean := tg_table_name in ('moviments', 'fons', 'caixes');
begin
  if app.es_servei() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'caixa_canvis' then
    if tg_op <> 'DELETE' then select c.exercici_id into v_ex_nou from public.caixes c where c.id = new.caixa_id; end if;
    if tg_op <> 'INSERT' then select c.exercici_id into v_ex_vell from public.caixes c where c.id = old.caixa_id; end if;
  else
    if tg_op <> 'DELETE' then v_ex_nou := new.exercici_id; end if;
    if tg_op <> 'INSERT' then v_ex_vell := old.exercici_id; end if;
  end if;

  select min(e.id) into v_tancat from public.exercicis e where e.tancat and e.id in (v_ex_nou, v_ex_vell);
  if v_tancat is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if not app.pot_editar('exercicis') then
    raise exception 'L''exercici % està tancat: no s''hi poden fer canvis. Parla amb Tresoreria.', v_tancat
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op <> 'DELETE' and v_imputacio then
    if v_motiu is not null then
      new.imputacio_excepcional := true;
      new.motiu_imputacio := v_motiu;
    elsif not (new.imputacio_excepcional
               and coalesce(btrim(new.motiu_imputacio), '') <> ''
               and (tg_op = 'INSERT' or new.motiu_imputacio is distinct from old.motiu_imputacio)) then
      raise exception 'L''exercici % està tancat: escriure-hi és una excepció i cal indicar-ne el motiu.', v_tancat
        using errcode = 'check_violation';
    end if;
  elsif v_motiu is null then
    raise exception 'L''exercici % està tancat: escriure-hi és una excepció i cal indicar-ne el motiu.', v_tancat
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['moviments', 'fons', 'caixes', 'caixa_canvis', 'fallesapp_consums', 'fallesapp_recarregues']
  loop
    execute format('create trigger t40_exercici_tancat before insert or update or delete on public.%I for each row execute function app.t_exercici_tancat()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- t50 · Regles d'estat
-- -----------------------------------------------------------------------------------------------------

-- Una caixa tancada només es reobri o es modifica amb el mòdul r1 (resetTancament de l'app).
create or replace function app.t_caixes_estat() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.es_servei() and old.estat = 'tancada' and not app.pot_editar('r1') then
    raise exception 'Aquesta caixa ja està tancada: només es pot reobrir des del report de tancaments.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger t50_estat before update on public.caixes
  for each row execute function app.t_caixes_estat();

-- Un mòdul només admet edició o abast "directiva" si el catàleg ho diu.
create or replace function app.t_rol_moduls_valid() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m public.moduls;
begin
  select * into m from public.moduls where id = new.modul_id;
  if new.nivell = 'edicio' and not m.admet_edicio then
    raise exception 'El mòdul % només admet lectura.', m.nom using errcode = 'check_violation';
  end if;
  if new.abast = 'directiva' and not m.admet_abast and new.nivell = 'edicio' then
    raise exception 'El mòdul % no admet abast per directiva en edició.', m.nom using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t50_valid before insert or update on public.rol_moduls
  for each row execute function app.t_rol_moduls_valid();

-- L'exercici actiu ha d'existir.
create or replace function app.t_config_valid() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clau = 'exercici_actiu' and not exists (select 1 from public.exercicis e where e.id = new.valor #>> '{}') then
    raise exception 'L''exercici % no existeix.', new.valor #>> '{}' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger t50_valid before insert or update on public.config
  for each row execute function app.t_config_valid();

-- Sempre ha de quedar algú actiu que puga gestionar usuaris i algú que puga dissenyar rols (substitueix el
-- "primer usuari és president" i l'administrador fix it.fallaportal@gmail.com de l'app actual). Amb D-041 només
-- President dissenya rols: sense aquesta protecció, un canvi de matriu podria deixar-los sense ningú.
create or replace function app.t_algu_administra() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modul text;
begin
  if app.es_servei() then
    return null;
  end if;
  foreach v_modul in array array['usuaris', 'rols']
  loop
    if not exists (
      select 1 from public.usuaris u
      join public.usuari_rols ur on ur.usuari_id = u.id
      join public.rol_moduls rm on rm.rol_id = ur.rol_id
      where u.actiu and rm.modul_id = v_modul and rm.nivell = 'edicio'
    ) then
      raise exception 'Aquest canvi deixaria la falla sense ningú que puga %.',
        case v_modul when 'usuaris' then 'gestionar usuaris' else 'dissenyar rols' end
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['usuaris', 'usuari_rols', 'rol_moduls', 'rols']
  loop
    execute format('create trigger t60_algu_administra after update or delete on public.%I for each statement execute function app.t_algu_administra()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- t90 · Registre d'activitat (D-024): qui, quan, taula, fila, abans i després. Inesborrable.
-- -----------------------------------------------------------------------------------------------------

create or replace function app.t_audit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abans jsonb;
  v_despres jsonb;
  v_fila text;
begin
  if tg_op <> 'INSERT' then v_abans := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_despres := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_abans = v_despres then
    return null;
  end if;
  select string_agg(coalesce(v_despres, v_abans) ->> c, '|' order by ord) into v_fila
  from unnest(tg_argv) with ordinality as x(c, ord);

  insert into public.audit_log (auth_uid, usuari_id, email, taula, fila_id, accio, abans, despres, operacio_id, motiu)
  values (app.jwt_sub(), app.usuari_id(), app.jwt_email(), tg_table_name, v_fila, lower(tg_op), v_abans, v_despres,
          coalesce(v_despres, v_abans) ->> 'operacio_id',
          nullif(btrim(current_setting('app.motiu', true)), ''));
  return null;
end $$;

-- Un trigger per taula, amb les columnes de la clau primària com a arguments.
do $$
declare
  t record;
begin
  for t in
    select c.relname as taula,
           (select string_agg(quote_literal(a.attname), ', ' order by k.ord)
            from unnest(con.conkey) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum) as pk
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_constraint con on con.conrelid = c.oid and con.contype = 'p'
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('audit_log', 'moduls')
  loop
    execute format('create trigger t90_audit after insert or update or delete on public.%I for each row execute function app.t_audit(%s)',
                   t.taula, t.pk);
  end loop;
end $$;

-- Ningú, tampoc el servei, modifica ni esborra el registre.
create or replace function app.t_audit_inalterable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registre d''activitat no es pot modificar ni esborrar.' using errcode = 'insufficient_privilege';
end $$;

create trigger t00_inalterable before update or delete on public.audit_log
  for each row execute function app.t_audit_inalterable();
create trigger t00_inalterable_truncate before truncate on public.audit_log
  for each statement execute function app.t_audit_inalterable();
