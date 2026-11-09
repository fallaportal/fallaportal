-- =====================================================================================================
-- Falla Portal · WS-PREVISIO, fase 1 (D-054, D-058): compromisos, terminis, saldos d'extracte i paràmetres de la previsió
--
-- Què és cada cosa:
--   · `compromisos` / `compromis_terminis`: el que ja se sap que entrarà o eixirà, cadascun amb els seus terminis (data prevista + import).
--     `sentit` = `despesa` (contractes signats: monument, música, carpa; i els recurrents: lloguers, llum, aigua) o `ingres` (quotes de fallers,
--     subvencions concedides: ingressos segurs encara que entren en remeses). Un termini està complit quan té un moviment vinculat (`moviment_id`,
--     únic: un moviment no complix dos terminis; una despesa per a una despesa i un ingrés per a un ingrés). L'app només veu el que ja ha passat;
--     això li diu el que falta.
--   · `extractes_saldos`: el saldo i la data de l'última línia de cada extracte importat (Caixabank i Caixa Popular porten la columna
--     de saldo). Serveix per comprovar que el saldo de l'app coincideix amb el del banc.
--   · `config` `previsio`: reserva mínima, dies d'avís d'extracte antic, factor de prudència dels ingressos d'events, fallers en actiu i
--     percentatge de seguretat dels ingressos compromesos (quotes: es compten al 95 %, per les devolucions).
--
-- Qui hi accedeix (D-054 punt 4: President i Tresoreria): mòdul nou `compromisos`. Qui el té en lectura veu els compromisos, els saldos
-- d'extracte i la targeta de diners lliures; en edició, els crea i els canvia. A diferència de la resta de dades (D-035), les files
-- d'estes taules només les llig qui té el mòdul: són imports de contractes. Els saldos d'extracte els escriu qui importa extractes.
--
-- L'app les llig i les escriu directament (com `fallesapp_alies`), no per `guarda_canvis`: no formen part de les pestanyes del full.
-- La còpia de seguretat les porta a `tools/supabase_exporta_xlsx.mjs` (pestanyes pròpies).
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Catàleg i matriu
-- ---------------------------------------------------------------------------------------------------

insert into public.moduls (id, nom, ordre, admet_edicio, admet_abast, que_permet_edicio) values
  ('compromisos', 'Compromisos i diners lliures', 125, true, false,
   'Introduir i canviar els contractes signats pendents de pagar, els seus terminis i els paràmetres de la previsió (reserva mínima, fallers en actiu…); vincular un pagament a un termini.')
on conflict (id) do nothing;

insert into public.rol_moduls (rol_id, modul_id, nivell, abast, barra) values
  ('president', 'compromisos', 'edicio', 'tot', false),
  ('treasury',  'compromisos', 'edicio', 'tot', false)
on conflict (rol_id, modul_id) do nothing;

-- ---------------------------------------------------------------------------------------------------
-- Paràmetres (config)
-- ---------------------------------------------------------------------------------------------------

alter table public.config drop constraint config_clau_check;
alter table public.config add constraint config_clau_check
  check (clau in ('exercici_actiu', 'justificant', 'carrega_definitiva', 'recarregues_desti', 'previsio'));

comment on table public.config is 'exercici_actiu: exercici obert per defecte (avui global, A-02/D-034). justificant: {mode, llindar}. carrega_definitiva: data de la càrrega real del dia del tall (les eines es neguen a buidar). recarregues_desti: {area_id, delegacio_id} on van els ingressos de les recàrregues que declaren els delegats (D-057). previsio: {reserva_minima, dies_avis_extracte, factor_prudencia_events, fallers_actius} de la previsió de tresoreria (D-054, D-058).';

-- La reserva mínima la fixa la junta (PLA §8.1): comença a 0 i Tresoreria la canvia des de Compromisos.
insert into public.config (clau, valor) values
  ('previsio', '{"reserva_minima": 0, "dies_avis_extracte": 30, "factor_prudencia_events": 0.9, "fallers_actius": 762, "seguretat_ingressos": 0.95}'::jsonb)
on conflict (clau) do nothing;

-- Un valor de `previsio` mal format (text on va un número) trencaria la targeta de diners lliures.
create or replace function app.valida_config_previsio() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clau = 'previsio' then
    if jsonb_typeof(new.valor) <> 'object'
       or jsonb_typeof(new.valor -> 'reserva_minima') is distinct from 'number'
       or jsonb_typeof(new.valor -> 'dies_avis_extracte') is distinct from 'number'
       or jsonb_typeof(new.valor -> 'factor_prudencia_events') is distinct from 'number'
       or jsonb_typeof(new.valor -> 'fallers_actius') is distinct from 'number'
       or jsonb_typeof(new.valor -> 'seguretat_ingressos') is distinct from 'number' then
      raise exception 'La configuració de la previsió ha de dur reserva_minima, dies_avis_extracte, factor_prudencia_events, fallers_actius i seguretat_ingressos com a números.' using errcode = '23514';
    end if;
    if (new.valor ->> 'reserva_minima')::numeric < 0 or (new.valor ->> 'dies_avis_extracte')::numeric < 1
       or (new.valor ->> 'factor_prudencia_events')::numeric not between 0 and 1 or (new.valor ->> 'fallers_actius')::numeric < 1
       or (new.valor ->> 'seguretat_ingressos')::numeric not between 0 and 1 then
      raise exception 'Valors fora de rang a la configuració de la previsió (reserva ≥ 0, dies ≥ 1, factor i seguretat entre 0 i 1, fallers ≥ 1).' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger t05_valida_previsio before insert or update on public.config for each row execute function app.valida_config_previsio();

-- Qui canvia la configuració: la política de `config` d'avui (configuracio en edició). Tresoreria i President la tenen; no s'amplia ací.

-- ---------------------------------------------------------------------------------------------------
-- Compromisos i terminis
-- ---------------------------------------------------------------------------------------------------

create table public.compromisos (
  id               text primary key default gen_random_uuid()::text,
  exercici_id      text not null references public.exercicis (id),
  delegacio_id     text references public.delegacions (id),
  event_id         text references public.events (id),
  sentit           text not null default 'despesa' check (sentit in ('despesa', 'ingres')),
  proveidor        text not null check (btrim(proveidor) <> ''),
  concepte         text not null check (btrim(concepte) <> ''),
  import           numeric(12,2) not null check (import > 0),
  data_signatura   date,
  estat            text not null default 'viu' check (estat in ('viu', 'tancat', 'cancellat')),
  notes            text,
  creat_at         timestamptz not null default now(),
  creat_per        text,
  modificat_at     timestamptz,
  modificat_per    text
);
comment on table public.compromisos is 'El que ja se sap que eixirà (`sentit` despesa: contractes signats i recurrents) o entrarà (`ingres`: quotes, subvencions concedides) (D-054, D-058). Només el que té un compromís real: no és el pressupost. `estat`: viu (compta a la previsió), tancat (complit del tot o resolt) o cancellat.';
create index compromisos_exercici on public.compromisos (exercici_id, estat);
create index compromisos_delegacio on public.compromisos (delegacio_id) where delegacio_id is not null;

create table public.compromis_terminis (
  id             text primary key default gen_random_uuid()::text,
  compromis_id   text not null references public.compromisos (id) on delete cascade,
  data_prevista  date not null,
  import         numeric(12,2) not null check (import > 0),
  moviment_id    text references public.moviments (id) on delete set null,
  creat_at       timestamptz not null default now(),
  creat_per      text,
  modificat_at   timestamptz,
  modificat_per  text
);
comment on table public.compromis_terminis is 'Terminis d''un compromís. Un termini està complit quan té `moviment_id` (la despesa que l''ha pagat o l''ingrés que l''ha cobrat); un moviment només complix un termini.';
create unique index compromis_terminis_moviment on public.compromis_terminis (moviment_id) where moviment_id is not null;
create index compromis_terminis_compromis on public.compromis_terminis (compromis_id, data_prevista);

-- El moviment vinculat ha de ser del mateix sentit que el compromís: una despesa per a una despesa i un ingrés per a un ingrés.
create or replace function app.valida_termini() returns trigger
language plpgsql
set search_path = ''
as $$
declare v_tipus text; v_esperat text;
begin
  if new.moviment_id is not null then
    select tipus into v_tipus from public.moviments where id = new.moviment_id;
    -- (un CASE dins l'IF faria que plpgsql prenguera el seu THEN com el de l'IF)
    select case sentit when 'ingres' then 'ingres' else 'despesa' end into v_esperat from public.compromisos where id = new.compromis_id;
    if v_tipus is distinct from v_esperat then
      raise exception 'El moviment d''un termini ha de ser %.', case v_esperat when 'ingres' then 'un ingrés' else 'una despesa' end using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger t05_valida before insert or update on public.compromis_terminis for each row execute function app.valida_termini();

-- Un compromís amb terminis ja vinculats no pot canviar de sentit (els moviments vinculats deixarien de ser del tipus que toca).
create or replace function app.valida_sentit_compromis() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sentit is distinct from old.sentit
     and exists (select 1 from public.compromis_terminis where compromis_id = new.id and moviment_id is not null) then
    raise exception 'No es pot canviar el tipus d''un compromís que ja té terminis vinculats a moviments.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger t05_valida_sentit before update on public.compromisos for each row execute function app.valida_sentit_compromis();

-- ---------------------------------------------------------------------------------------------------
-- Saldos d'extracte
-- ---------------------------------------------------------------------------------------------------

create table public.extractes_saldos (
  id            text primary key default gen_random_uuid()::text,
  compte_id     text not null references public.comptes (id),
  data          date not null,
  saldo         numeric(14,2) not null,
  operacio_id   text references public.operacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.extractes_saldos is 'Saldo del banc a la data de l''última línia de cada extracte importat (D-058). Una fila per compte i dia: tornar a importar el mateix dia la substitueix.';
create unique index extractes_saldos_compte_data on public.extractes_saldos (compte_id, data);

-- ---------------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------------

alter table public.compromisos enable row level security;
alter table public.compromis_terminis enable row level security;
alter table public.extractes_saldos enable row level security;

create policy modul_llig on public.compromisos for select to authenticated using ((select app.pot('compromisos')));
create policy edicio_insert on public.compromisos for insert to authenticated with check ((select app.pot_editar('compromisos')));
create policy edicio_update on public.compromisos for update to authenticated
  using ((select app.pot_editar('compromisos'))) with check ((select app.pot_editar('compromisos')));
create policy edicio_delete on public.compromisos for delete to authenticated using ((select app.pot_editar('compromisos')));

create policy modul_llig on public.compromis_terminis for select to authenticated using ((select app.pot('compromisos')));
create policy edicio_insert on public.compromis_terminis for insert to authenticated with check ((select app.pot_editar('compromisos')));
create policy edicio_update on public.compromis_terminis for update to authenticated
  using ((select app.pot_editar('compromisos'))) with check ((select app.pot_editar('compromisos')));
create policy edicio_delete on public.compromis_terminis for delete to authenticated using ((select app.pot_editar('compromisos')));

-- Els saldos els llig qui veu la previsió i els escriu qui importa extractes (el mòdul `importacio`, que té President i Tresoreria).
create policy modul_llig on public.extractes_saldos for select to authenticated using ((select app.pot('compromisos')));
create policy importacio_insert on public.extractes_saldos for insert to authenticated with check ((select app.pot_editar('importacio')));
create policy importacio_update on public.extractes_saldos for update to authenticated
  using ((select app.pot_editar('importacio'))) with check ((select app.pot_editar('importacio')));
create policy importacio_delete on public.extractes_saldos for delete to authenticated using ((select app.pot_editar('importacio')));

grant select, insert, update, delete on public.compromisos, public.compromis_terminis, public.extractes_saldos to authenticated, service_role;

create trigger t10_autoria before insert or update on public.compromisos for each row execute function app.t_autoria();
create trigger t10_autoria before insert or update on public.compromis_terminis for each row execute function app.t_autoria();
create trigger t10_autoria before insert or update on public.extractes_saldos for each row execute function app.t_autoria();
create trigger t90_audit after insert or update or delete on public.compromisos for each row execute function app.t_audit('id');
create trigger t90_audit after insert or update or delete on public.compromis_terminis for each row execute function app.t_audit('id');
create trigger t90_audit after insert or update or delete on public.extractes_saldos for each row execute function app.t_audit('id');

-- ---------------------------------------------------------------------------------------------------
-- Realtime (a Supabase; al PGlite dels tests no hi ha publicació)
-- ---------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['compromisos', 'compromis_terminis', 'extractes_saldos']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
