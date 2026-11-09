-- =====================================================================================================
-- Falla Portal · D-057: els delegats declaren les recàrregues de falles.app en efectiu
--
-- Decisió d'Emilio (2026-11-09): qui cobra recàrregues en efectiu a falles.app (3 o 4 delegats que no són de Tresoreria) les
-- declara ell mateix. Cada declaració crea, en una sola alta de l'app:
--   · un ingrés en efectiu a l'àrea i la delegació de destí (Administració · Tresoreria), font `ingres_tercer`, i
--   · un fons `lliurament` (origen `tercer`) a nom del mateix delegat, lligat a l'ingrés (`moviment_id`).
-- Els diners els té el delegat fins que els lliura físicament; la devolució (`fons` tipus `devolucio`) només la registren
-- Tresoreria o President, que són els qui tenen Fons delegats en edició.
--
-- Seguretat (res no es dona de manera ampla):
--   · Mòdul nou `recarregues`, apart de `fons` i de `moviments`: donar edició de Fons a un delegat li deixaria lliurar-se fons
--     sense cap ingrés. Aquí només es pot fer la parella ingrés + fons, amb aquestes condicions.
--   · L'ingrés: efectiu, destí fix (config `recarregues_desti`), exercici actiu, sense event ni caixa, a nom de qui el crea.
--   · El fons: lliurament d'origen `tercer` a nom de qui el crea, lligat a un ingrés seu del mateix import i exercici.
--   · Una recàrrega declarada (ingrés amb fons lligat) no la canvia ni l'esborra qui la va declarar: només Tresoreria o President
--     (Historial en edició). Sense això, es podria esborrar l'ingrés després d'entregar els diners i deixar el saldo en negatiu.
--
-- A més, `fallesapp_recarregues` guarda qui autoritza cada recàrrega («Autorizado por» del fitxer de falles.app) i una empremta
-- per no duplicar en tornar a importar el mateix fitxer: és el control per quadrar el declarat amb el que diu falles.app.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Catàleg i matriu
-- ---------------------------------------------------------------------------------------------------

insert into public.moduls (id, nom, ordre, admet_edicio, admet_abast, que_permet_edicio) values
  ('recarregues', 'Declarar recàrregues', 55, true, false,
   'Declarar les recàrregues de falles.app en efectiu que has cobrat: crea l''ingrés en efectiu a Administració · Tresoreria i un fons a nom teu fins que els lliures a Tresoreria.')
on conflict (id) do nothing;

insert into public.rol_moduls (rol_id, modul_id, nivell, abast, barra) values
  ('president', 'recarregues', 'edicio', 'tot', false),
  ('treasury',  'recarregues', 'edicio', 'tot', false),
  ('area',      'recarregues', 'edicio', 'tot', false),
  ('delegat',   'recarregues', 'edicio', 'tot', false)
on conflict (rol_id, modul_id) do nothing;

-- ---------------------------------------------------------------------------------------------------
-- Destí de l'ingrés (àrea i delegació), a config
-- ---------------------------------------------------------------------------------------------------

alter table public.config drop constraint config_clau_check;
alter table public.config add constraint config_clau_check
  check (clau in ('exercici_actiu', 'justificant', 'carrega_definitiva', 'recarregues_desti'));

comment on table public.config is 'exercici_actiu: exercici obert per defecte (avui global, A-02/D-034). justificant: {mode, llindar}. carrega_definitiva: data de la càrrega real del dia del tall (les eines es neguen a buidar). recarregues_desti: {area_id, delegacio_id} on van els ingressos de les recàrregues que declaren els delegats (D-057).';

-- Només si l'àrea i la delegació existeixen (a la base de dades real: Administració · Tresoreria). Als tests el posen les dades de prova.
insert into public.config (clau, valor)
select 'recarregues_desti', jsonb_build_object('area_id', d.area_id, 'delegacio_id', d.id)
from public.delegacions d where d.id = '0102' and d.area_id = '01'
on conflict (clau) do nothing;

-- ---------------------------------------------------------------------------------------------------
-- Funcions
-- ---------------------------------------------------------------------------------------------------

create or replace function app.es_desti_recarregues(p_area text, p_delegacio text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.config c
    where c.clau = 'recarregues_desti'
      and c.valor ->> 'area_id' = p_area and c.valor ->> 'delegacio_id' = p_delegacio
  )
$$;

-- L'ingrés al qual es lliga el fons: seu, d'ingrés de tercer, al destí i de l'import i l'exercici del fons.
create or replace function app.es_recarrega_meua(p_moviment_id text, p_import numeric, p_exercici text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.moviments m
    where m.id = p_moviment_id
      and m.font = 'ingres_tercer' and m.tipus = 'ingres'
      and m.creat_per = app.usuari_id()
      and m.import = p_import and m.exercici_id = p_exercici
      and app.es_desti_recarregues(m.area_id, m.delegacio_id)
  )
$$;

-- Un ingrés que té un fons `lliurament` lligat és una recàrrega declarada.
create or replace function app.es_recarrega_declarada(p_moviment_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fons f
    where f.moviment_id = p_moviment_id and f.tipus = 'lliurament' and f.origen = 'tercer'
  )
$$;

revoke all on function app.es_desti_recarregues(text, text), app.es_recarrega_meua(text, numeric, text), app.es_recarrega_declarada(text) from public, anon;
grant execute on function app.es_desti_recarregues(text, text), app.es_recarrega_meua(text, numeric, text), app.es_recarrega_declarada(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- Polítiques
-- ---------------------------------------------------------------------------------------------------

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
    -- Recàrregues de falles.app declarades pel delegat (D-057): ingrés en efectiu al destí fix, sense event ni caixa.
    or (font = 'ingres_tercer' and tipus = 'ingres'
        and (select app.pot_editar('recarregues'))
        and app.es_compte_efectiu(compte_id)
        and app.es_desti_recarregues(area_id, delegacio_id)
        and event_id is null and caixa_id is null
        and exercici_id = (select app.exercici_actiu()))
    -- Caixa d'event: retirada i tancament, en efectiu, d'una caixa oberta que puc operar (qualsevol àrea, com avui).
    or (font in ('tancament_caixa', 'retirada_caixa')
        and app.es_compte_efectiu(compte_id)
        and app.pot_editar_caixa('caixa', caixa_id) and app.caixa_oberta(caixa_id))
    -- Importacions.
    or (font in ('extracte', 'csv_generic') and (select app.pot_editar('importacio')))
    or (font in ('fallesapp_transaccions', 'fallesapp_bonificacio') and (select app.pot_editar('fallesapp')))
  )
);

-- Esborrar (R4): Historial en edició, o el creador (llevat d'una recàrrega declarada), o una caixa tancada amb r1.
drop policy moviments_delete on public.moviments;
create policy moviments_delete on public.moviments for delete to authenticated
using (
  (select app.pot_editar('historial'))
  or (creat_per = (select app.usuari_id()) and not app.es_recarrega_declarada(id))
  or (caixa_id is not null and (select app.pot_editar('r1')))
);

-- Un lliurament no va lligat a cap moviment (R5), llevat d'una recàrrega declarada: el fons va lligat al seu ingrés (D-057), de
-- manera que esborrar l'ingrés (Tresoreria o President) esborra també el fons, per la clau forana.
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
  elsif new.moviment_id is not null and not (new.tipus = 'lliurament' and new.origen is not distinct from 'tercer') then
    raise exception 'Una devolució, un reintegrament o una regularització no van lligats a cap moviment, ni un lliurament que no siga una recàrrega declarada.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop policy fons_insert on public.fons;
create policy fons_insert on public.fons for insert to authenticated
with check (
  creat_per = (select app.usuari_id())
  and (
    (tipus in ('lliurament', 'regularitzacio', 'devolucio', 'reintegrament') and app.pot_editar_fons(delegat_id))
    -- Despesa amb fons lliurats o avançament: la registra el mateix delegat amb el seu moviment.
    or (tipus in ('despesa_fons', 'avancament')
        and delegat_id = (select app.usuari_id())
        and app.es_creador_moviment(moviment_id))
    -- Recàrrega declarada (D-057): el fons del mateix delegat, lligat a l'ingrés que acaba de crear.
    or (tipus = 'lliurament' and origen = 'tercer'
        and delegat_id = (select app.usuari_id())
        and (select app.pot_editar('recarregues'))
        and app.es_recarrega_meua(moviment_id, import, exercici_id))
  )
);

-- Sense Historial en edició, el creador no toca una recàrrega declarada (el trigger limita ja les columnes a concepte i import).
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
  if app.es_recarrega_declarada(old.id) then
    raise exception 'Una recàrrega declarada només la pot corregir Tresoreria o President.'
      using errcode = 'insufficient_privilege';
  end if;
  v_canvis := app.canvis_fora_de(to_jsonb(old), to_jsonb(new), array['concepte', 'import']);
  if cardinality(v_canvis) > 0 then
    raise exception 'Només pots canviar el concepte i l''import dels moviments que has registrat (has intentat canviar: %).',
      array_to_string(v_canvis, ', ') using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Control de falles.app: qui autoritza cada recàrrega i una empremta per no duplicar en reimportar
-- ---------------------------------------------------------------------------------------------------

alter table public.fallesapp_recarregues
  add column autoritzat_per text,
  add column empremta text;
comment on column public.fallesapp_recarregues.autoritzat_per is '«Autorizado por» del fitxer de falles.app: qui va cobrar la recàrrega. Serveix per quadrar-la amb el que declara cada delegat (D-057).';
comment on column public.fallesapp_recarregues.empremta is 'Hash de la fila del fitxer (faller, data, import, tipus, autoritzador): tornar a importar el mateix fitxer no duplica.';
create unique index fallesapp_recarregues_empremta on public.fallesapp_recarregues (empremta);   -- sense predicat: l'app fa upsert amb ON CONFLICT (empremta); els NULL no xoquen entre ells
create index fallesapp_recarregues_autoritzat on public.fallesapp_recarregues (autoritzat_per);
