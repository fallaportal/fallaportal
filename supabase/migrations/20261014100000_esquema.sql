-- =====================================================================================================
-- Falla Portal · Fase 1 de PLA_MIGRACIO_SUPABASE.md · 1/4: esquema
-- Model: MODEL_DADES.md (§4) i §9 (permisos). Sense dades reals ni claus: el repositori és públic.
--
-- Convencions
--   * Els id existents es conserven com a text; les files noves reben gen_random_uuid()::text.
--   * Imports numeric(12,2) i dates date: mai text.
--   * Totes les taules (menys el catàleg `moduls` i `audit_log`) porten l'autoria:
--       creat_at, creat_per, modificat_at, modificat_per (les omple app.t_autoria, migració 3).
--   * Les enumeracions són text + CHECK (més fàcils d'ampliar que els tipus enum).
--   * Les claus foranes cap a l'exercici són `on delete cascade`: eliminar un exercici n'esborra les dades
--     (A-25); ho pot fer només el mòdul `exercicis` en edició i ho deixa tot al registre d'activitat (D-028).
-- =====================================================================================================

create schema if not exists app;
comment on schema app is 'Funcions internes de Falla Portal (permisos, triggers). No s''exposa a l''API.';

-- -----------------------------------------------------------------------------------------------------
-- Persones i permisos (MODEL_DADES §4.4, §9)
-- -----------------------------------------------------------------------------------------------------

create table public.rols (
  id            text primary key check (id ~ '^[a-z0-9_]+$'),
  nom           text not null unique,
  color         text,
  de_sistema    boolean not null default false,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.rols is 'Rols que dissenya l''administrador. Els de sistema no es poden esborrar.';

-- Catàleg fix de mòduls (el defineix el codi de l'app, no l'usuari).
create table public.moduls (
  id                 text primary key,
  nom                text not null,
  ordre              int not null,
  admet_edicio       boolean not null,
  admet_abast        boolean not null default false,
  que_permet_edicio  text
);
comment on table public.moduls is 'Catàleg de mòduls de l''app. Un rol hi té lectura (veu la pantalla) o edició (crea, modifica i esborra).';

create table public.usuaris (
  id            text primary key default gen_random_uuid()::text,
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  nom           text not null,
  email         text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  actiu         boolean not null default true,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.usuaris is 'Membres. L''email és la identitat (en minúscules, immutable). Un usuari amb historial es desactiva en lloc d''esborrar-se.';

create table public.usuari_rols (
  usuari_id     text not null references public.usuaris (id) on delete cascade,
  rol_id        text not null references public.rols (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  primary key (usuari_id, rol_id)
);
comment on table public.usuari_rols is 'Una persona té d''1 a N rols. Sense cap rol (o inactiva) no és membre: no veu res.';

create table public.rol_moduls (
  rol_id        text not null references public.rols (id) on delete cascade,
  modul_id      text not null references public.moduls (id),
  nivell        text not null check (nivell in ('lectura', 'edicio')),
  abast         text not null default 'tot' check (abast in ('tot', 'directiva')),
  barra         boolean not null default false,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  primary key (rol_id, modul_id)
);
comment on table public.rol_moduls is 'Matriu rol × mòdul. Sense fila = cap accés. abast=directiva: només les àrees i delegacions assignades a la directiva de l''exercici actiu. barra: apareix a la barra inferior del mòbil.';

-- -----------------------------------------------------------------------------------------------------
-- Exercici i organització (§4.1)
-- -----------------------------------------------------------------------------------------------------

create table public.exercicis (
  id             text primary key check (id ~ '^\d{2}/\d{2}$'),
  data_inici     date not null,
  data_fi        date not null,
  data_obertura  date,
  tancat         boolean not null default false,
  data_tancament date,
  es_prova       boolean not null default false,
  creat_at       timestamptz not null default now(),
  creat_per      text,
  modificat_at   timestamptz,
  modificat_per  text,
  check (data_fi > data_inici),
  -- Cada data pertany com a molt a un exercici: l'exercici d'un registre es calcula per la data (D-029).
  constraint exercicis_sense_solapament exclude using gist (daterange(data_inici, data_fi, '[]') with &&)
);
comment on table public.exercicis is 'Exercicis fiscals, de l''01/04 al 31/03 (D-026). Tancat = no accepta canvis llevat d''excepció amb motiu (D-029).';

create table public.arees (
  id            text primary key check (id ~ '^\d{2}$'),
  nom           text not null unique,
  color         text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  ordre         int,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);

create table public.delegacions (
  id            text primary key,
  area_id       text not null references public.arees (id) on update cascade,
  nom           text not null,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  unique (id, area_id)  -- destí de les FK compostes (delegacio_id, area_id): la delegació sempre és de l'àrea
);

create table public.directiva (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  usuari_id     text not null references public.usuaris (id),
  area_id       text references public.arees (id),
  delegacio_id  text references public.delegacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  check (num_nonnulls(area_id, delegacio_id) = 1),
  unique nulls not distinct (exercici_id, usuari_id, area_id, delegacio_id)
);
comment on table public.directiva is 'Qui és responsable de cada àrea o delegació en cada exercici. Decideix l''abast "directiva" dels permisos.';

create table public.events (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  delegacio_id  text not null references public.delegacions (id),
  nom           text not null,
  data_inici    date,
  hora_inici    time,
  data_fi       date,
  hora_fi       time,
  responsable_id text references public.usuaris (id),
  per_defecte   boolean not null default false,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.events is 'Activitats per exercici. L''estat (pendent, en curs, fet) es calcula per les dates, com ara.';
create unique index events_un_per_defecte on public.events (exercici_id) where per_defecte;
create index events_delegacio on public.events (delegacio_id);

-- -----------------------------------------------------------------------------------------------------
-- Diners (§4.2)
-- -----------------------------------------------------------------------------------------------------

create table public.comptes (
  id            text primary key,
  codi          text not null unique,
  nom           text not null,
  tipus         text not null check (tipus in ('banc', 'efectiu', 'tpv', 'virtual')),
  iban          text check (iban is null or replace(iban, ' ', '') ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  als_informes  boolean not null default true,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  -- Un banc o TPV sense IBAN fa que l'extracte s'importe al compte equivocat (A-18, 11/10/2026).
  check ((tipus in ('banc', 'tpv')) = (iban is not null))
);
comment on table public.comptes is 'Bancs, efectiu, TPV i el compte virtual de bonificacions. Substitueix el camp de text `via`.';

create table public.saldos_inicials (
  compte_id     text not null references public.comptes (id),
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  import        numeric(12,2) not null,
  data          date,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  primary key (compte_id, exercici_id)
);

create table public.operacions (
  id            text primary key default gen_random_uuid()::text,
  tipus         text not null check (tipus in (
                  'moviment_manual', 'despesa_amb_fons', 'avancament', 'lliurament', 'devolucio', 'reintegrament',
                  'ingres_tercer', 'traspas_banc_caixa', 'obrir_caixa', 'ampliar_canvi', 'retirada_caixa',
                  'tancar_caixa', 'importacio_extracte', 'importacio_csv', 'importacio_fallesapp',
                  'passiu_fallesapp', 'migracio')),
  exercici_id   text references public.exercicis (id) on delete cascade,
  fitxer_nom    text,
  iban_detectat text,
  resum         jsonb,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.operacions is 'Agrupa tot el que crea una acció de l''usuari per esborrar-la, desfer-la o auditar-la junta (D-027).';

create table public.regles_importacio (
  id            text primary key default gen_random_uuid()::text,
  compte_id     text references public.comptes (id) on delete cascade,
  patrons       text[] not null check (cardinality(patrons) > 0),
  tipus         text not null default 'assignar' check (tipus in ('assignar', 'tpv', 'ignorar')),
  sentit        text not null default 'qualsevol' check (sentit in ('ingres', 'despesa', 'qualsevol')),
  area_id       text references public.arees (id),
  delegacio_id  text,
  concepte      text,
  prioritat     int not null default 100,
  activa        boolean not null default true,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  foreign key (delegacio_id, area_id) references public.delegacions (id, area_id),
  check (delegacio_id is null or area_id is not null)
);
comment on column public.regles_importacio.compte_id is 'null = la regla val per a tots els comptes.';

create table public.caixes (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  imputacio_excepcional boolean not null default false,
  motiu_imputacio text,
  event_id      text references public.events (id),
  descripcio    text,
  data          date not null,
  estat         text not null default 'oberta' check (estat in ('oberta', 'tancada')),
  efectiu       numeric(12,2) check (efectiu >= 0),
  tpv           numeric(12,2) check (tpv >= 0),
  pagaments     numeric(12,2) check (pagaments >= 0),
  area_id       text references public.arees (id),
  delegacio_id  text,
  notes         text,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  foreign key (delegacio_id, area_id) references public.delegacions (id, area_id),
  check (delegacio_id is null or area_id is not null),
  check (event_id is not null or coalesce(btrim(descripcio), '') <> ''),
  check (not imputacio_excepcional or coalesce(btrim(motiu_imputacio), '') <> '')
);
comment on table public.caixes is 'Caixa d''un event, o "sense event" amb descripció (A-05). El canvi i les retirades es calculen de caixa_canvis i moviments. tpv no genera moviment: arriba per l''extracte (A-23).';
comment on column public.caixes.efectiu is 'Efectiu abans de pagar = efectiu final + pagaments (v4.0.73).';
create unique index caixes_una_per_event on public.caixes (event_id) where event_id is not null;

create table public.caixa_canvis (
  id            text primary key default gen_random_uuid()::text,
  caixa_id      text not null references public.caixes (id) on delete cascade,
  data          date not null,
  tipus         text not null check (tipus in ('lliurament', 'ampliacio', 'devolucio')),
  import        numeric(12,2) not null check (import > 0),
  operacio_id   text references public.operacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.caixa_canvis is 'Canvi lliurat a una caixa, ampliacions i devolució en tancar. Avui són `fons` amb delegat `_event` (A-05).';

create table public.moviments (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  imputacio_excepcional boolean not null default false,
  motiu_imputacio text,
  data          date not null,
  tipus         text not null check (tipus in ('ingres', 'despesa')),
  import        numeric(12,2) not null check (import > 0),
  compte_id     text not null references public.comptes (id),
  area_id       text references public.arees (id),
  delegacio_id  text,
  event_id      text references public.events (id),
  caixa_id      text references public.caixes (id) on delete cascade,
  operacio_id   text references public.operacions (id),
  font          text not null check (font in (
                  'manual', 'ingres_tercer', 'traspas_banc_caixa', 'extracte', 'csv_generic',
                  'fallesapp_transaccions', 'fallesapp_bonificacio', 'tancament_caixa', 'retirada_caixa')),
  pagament_efectiu text check (pagament_efectiu in ('caixa', 'fons_lliurats', 'avancament')),
  concepte      text,
  establiment   text,
  notes         text,
  responsable_id text references public.usuaris (id),
  responsable_extern text,
  conciliacio   text not null check (conciliacio in ('pendent', 'conciliat', 'no_aplica')),
  empremta      text,
  regla_id      text references public.regles_importacio (id) on delete set null,
  motiu_sense_justificant text,
  creat_at      timestamptz not null default now(),
  creat_per     text not null,
  modificat_at  timestamptz,
  modificat_per text,
  foreign key (delegacio_id, area_id) references public.delegacions (id, area_id),
  check (delegacio_id is null or area_id is not null),
  check (not imputacio_excepcional or coalesce(btrim(motiu_imputacio), '') <> ''),
  check (pagament_efectiu is null or tipus = 'despesa'),
  check ((caixa_id is not null) = (font in ('tancament_caixa', 'retirada_caixa')))
);
comment on table public.moviments is 'Llibre major: un ingrés o una despesa per fila. Els consums de falles.app no hi són (D-031).';
comment on column public.moviments.empremta is 'Antic bankHash. No és únic: hi ha duplicats legítims (A-04).';
comment on column public.moviments.creat_per is 'Qui l''ha entrat o importat (D-030).';
comment on column public.moviments.responsable_id is 'Qui ha fet el pagament o cobrament; buit als importats (D-030).';
create index moviments_exercici_data on public.moviments (exercici_id, data);
create index moviments_empremta on public.moviments (compte_id, empremta);
create index moviments_event on public.moviments (event_id);
create index moviments_caixa on public.moviments (caixa_id);
create index moviments_operacio on public.moviments (operacio_id);
create index moviments_delegacio on public.moviments (delegacio_id);
create index moviments_creat_per on public.moviments (creat_per);

create table public.justificants (
  id            text primary key default gen_random_uuid()::text,
  moviment_id   text not null references public.moviments (id) on delete cascade,
  storage_path  text unique,
  nom_fitxer    text,
  tipus_mime    text,
  mida          bigint check (mida >= 0),
  url_drive_original text,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  check (storage_path is not null or url_drive_original is not null)
);
create index justificants_moviment on public.justificants (moviment_id);

create table public.fons (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  imputacio_excepcional boolean not null default false,
  motiu_imputacio text,
  data          date not null,
  tipus         text not null check (tipus in (
                  'lliurament', 'regularitzacio', 'despesa_fons', 'devolucio', 'avancament', 'reintegrament')),
  delegat_id    text not null references public.usuaris (id),
  import        numeric(12,2) not null check (import > 0),
  origen        text check (origen in ('caixa', 'tercer', 'banc')),
  moviment_id   text references public.moviments (id) on delete cascade,
  operacio_id   text references public.operacions (id),
  nota          text,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  check (tipus not in ('despesa_fons', 'avancament') or moviment_id is not null),
  check (origen is null or tipus in ('lliurament', 'reintegrament')),
  check (not imputacio_excepcional or coalesce(btrim(motiu_imputacio), '') <> '')
);
comment on table public.fons is 'Diners en mans de persones (D-022). Esborrar la despesa esborra el seu registre de fons (A-24).';
comment on column public.fons.creat_per is 'Antic registratPer (avui un nom, A-07).';
create index fons_delegat on public.fons (delegat_id, exercici_id);
create index fons_moviment on public.fons (moviment_id);

-- -----------------------------------------------------------------------------------------------------
-- Planificació (§4.3)
-- -----------------------------------------------------------------------------------------------------

create table public.pressupost_linies (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  delegacio_id  text not null references public.delegacions (id),
  event_id      text references public.events (id),
  concepte      text,
  tipus         text not null check (tipus in ('event', 'concepte', 'varis')),
  import        numeric(12,2) not null check (import > 0 or tipus = 'varis'),
  notes         text,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  unique nulls not distinct (exercici_id, delegacio_id, event_id, concepte),
  check (tipus <> 'concepte' or coalesce(btrim(concepte), '') <> ''),
  check (tipus = 'varis' or lower(btrim(coalesce(concepte, ''))) <> 'varis')  -- paraula reservada
);

create table public.pressupost_estat (
  exercici_id   text primary key references public.exercicis (id) on delete cascade,
  estat         text not null check (estat in ('obert', 'bloquejat')),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.pressupost_estat is 'Bloqueig del pressupost per exercici (A-11). Sense fila = obert.';

create table public.pressupost_historial (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  accio         text not null check (accio in ('bloquejat', 'desbloquejat')),
  motiu         text,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  check (accio <> 'desbloquejat' or coalesce(btrim(motiu), '') <> '')
);

-- -----------------------------------------------------------------------------------------------------
-- Falles.app (§4.5)
-- -----------------------------------------------------------------------------------------------------

create table public.fallesapp_passiu (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  data          date not null,
  total         numeric(12,2) not null check (total >= 0),
  fallers       int check (fallers >= 0),
  operacio_id   text references public.operacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);

create table public.fallesapp_consums (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  event_id      text references public.events (id),
  area_id       text references public.arees (id),
  delegacio_id  text,
  import        numeric(12,2) not null check (import >= 0),
  consums       int check (consums >= 0),
  periode_inici date,
  periode_fi    date,
  operacio_id   text references public.operacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text,
  foreign key (delegacio_id, area_id) references public.delegacions (id, area_id),
  check (delegacio_id is null or area_id is not null),
  check (periode_fi is null or periode_inici is null or periode_fi >= periode_inici)
);
comment on table public.fallesapp_consums is 'Consums per event: estadística per atribuir ingressos als events (r3). No són diners que entren (D-031).';

create table public.fallesapp_recarregues (
  id            text primary key default gen_random_uuid()::text,
  exercici_id   text not null references public.exercicis (id) on delete cascade,
  data_hora     timestamptz not null,
  tipus         text not null check (tipus in ('efectiu', 'tpv', 'devolucio')),
  import        numeric(12,2) not null check (import > 0),
  comanda_redsys text,
  operacio_id   text references public.operacions (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.fallesapp_recarregues is 'Recàrregues i devolucions del fitxer de transaccions, per quadrar falles.app amb l''efectiu i els bancs.';

-- -----------------------------------------------------------------------------------------------------
-- Sistema (§4.6)
-- -----------------------------------------------------------------------------------------------------

create table public.config (
  clau          text primary key check (clau in ('exercici_actiu', 'justificant')),
  valor         jsonb not null,
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.config is 'exercici_actiu: exercici obert per defecte (avui global, A-02/D-034). justificant: {mode, llindar}.';

create table public.audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  auth_uid      uuid,
  usuari_id     text,          -- sense FK: el registre ha de sobreviure a l'usuari
  email         text,
  taula         text not null,
  fila_id       text not null,
  accio         text not null check (accio in ('insert', 'update', 'delete')),
  abans         jsonb,
  despres       jsonb,
  operacio_id   text,          -- sense FK: l'operació pot haver-se esborrat
  motiu         text
);
comment on table public.audit_log is 'Registre d''activitat (D-024). L''omplin els triggers; ningú no el pot modificar ni esborrar. Els esborrats es recuperen del valor "abans" (D-028).';
create index audit_log_fila on public.audit_log (taula, fila_id);
create index audit_log_at on public.audit_log (at);
create index audit_log_usuari on public.audit_log (usuari_id);
create index audit_log_operacio on public.audit_log (operacio_id);

-- -----------------------------------------------------------------------------------------------------
-- Autoria: creat_per i modificat_per apunten a usuaris (no es poden esborrar usuaris amb historial)
-- -----------------------------------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'creat_per'
  loop
    execute format('alter table public.%I add constraint %I foreign key (creat_per) references public.usuaris (id)',
                   t.table_name, t.table_name || '_creat_per_fkey');
    execute format('alter table public.%I add constraint %I foreign key (modificat_per) references public.usuaris (id)',
                   t.table_name, t.table_name || '_modificat_per_fkey');
  end loop;
end $$;
