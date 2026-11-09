-- =====================================================================================================
-- Falla Portal · D-057, fase 2: àlies del nom de falles.app per quadrar les recàrregues
--
-- El fitxer de transaccions de falles.app diu qui ha autoritzat cada recàrrega («Autorizado por», el nom d'usuari de falles.app) i la
-- importació el guarda a `fallesapp_recarregues.autoritzat_per`. Per quadrar-lo amb el que declara cada delegat (`fons` d'origen
-- `tercer` lligat a un ingrés) cal saber de quina persona de l'app és eixe nom: l'àlies lliga un nom de falles.app amb un usuari.
-- La comparació dels noms (sense accents, majúscules ni ordre) la fa l'app; ací només es guarda la parella i s'evita repetir-la.
--
-- Escriuen qui té Falles.app en edició (President i Tresoreria); qualsevol membre llig (D-035).
-- =====================================================================================================

create table public.fallesapp_alies (
  id            text primary key default gen_random_uuid()::text,
  nom_fallesapp text not null check (btrim(nom_fallesapp) <> ''),
  usuari_id     text not null references public.usuaris (id),
  creat_at      timestamptz not null default now(),
  creat_per     text,
  modificat_at  timestamptz,
  modificat_per text
);
comment on table public.fallesapp_alies is 'Nom d''usuari de falles.app («Autorizado por») → persona de l''app, per quadrar les recàrregues declarades amb el fitxer (D-057).';
create unique index fallesapp_alies_nom on public.fallesapp_alies (lower(btrim(nom_fallesapp)));
create index fallesapp_alies_usuari on public.fallesapp_alies (usuari_id);

alter table public.fallesapp_alies enable row level security;
create policy membres_lligen on public.fallesapp_alies for select to authenticated using ((select app.es_membre()));
create policy edicio_fallesapp_insert on public.fallesapp_alies for insert to authenticated with check ((select app.pot_editar('fallesapp')));
create policy edicio_fallesapp_update on public.fallesapp_alies for update to authenticated
  using ((select app.pot_editar('fallesapp'))) with check ((select app.pot_editar('fallesapp')));
create policy edicio_fallesapp_delete on public.fallesapp_alies for delete to authenticated using ((select app.pot_editar('fallesapp')));

grant select, insert, update, delete on public.fallesapp_alies to authenticated, service_role;

create trigger t10_autoria before insert or update on public.fallesapp_alies for each row execute function app.t_autoria();
create trigger t90_audit after insert or update or delete on public.fallesapp_alies for each row execute function app.t_audit('id');
