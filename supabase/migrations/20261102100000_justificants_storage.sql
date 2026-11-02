-- =====================================================================================================
-- Falla Portal · Fase 4: justificants a Supabase Storage (D-051)
--
-- Els fitxers viuen al bucket privat `justificants`, a la ruta «XX-YY/<id del moviment>.<extensió>» (XX-YY = exercici amb guionet:
-- l'exercici 26/27 és la carpeta 26-27). La taula `justificants` (moviment, ruta, nom, tipus, mida) els lliga als moviments. Ningú no
-- llig un fitxer sense una URL signada que demana l'app i que caduca en minuts; el bucket no és públic.
--
-- Qui pot què (les mateixes regles que les polítiques de la taula `justificants`, perquè el fitxer i la fila no puguen divergir):
--   · veure: qualsevol membre (D-035)
--   · pujar o substituir: qui té Historial en edició, qui ha creat el moviment, o qui té r4 en edició si el moviment és una despesa manual
--   · esborrar: qui té Historial en edició o qui ha creat el moviment
-- El moviment d'un fitxer es dedueix de la ruta, i una fila de `justificants` ha de dur la ruta del seu moviment (no es pot apuntar
-- a un fitxer d'un altre).
-- =====================================================================================================

-- Bucket privat, 10 MB com a màxim per fitxer, només imatges i PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificants', 'justificants', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- L'id del moviment d'una ruta de fitxer; nul si la ruta no té la forma «XX-YY/<id>.<extensió>».
create or replace function app.moviment_de_ruta(p_ruta text) returns text
language sql immutable
set search_path = ''
as $$
  select case when p_ruta ~ '^[0-9]{2}-[0-9]{2}/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$'
              then regexp_replace(split_part(p_ruta, '/', 2), '\.[A-Za-z0-9]+$', '')
         end
$$;

-- Pot adjuntar (pujar o substituir) un justificant a aquest moviment?
create or replace function app.pot_adjuntar(p_moviment_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_moviment_id is not null
    and exists (select 1 from public.moviments m where m.id = p_moviment_id)   -- cap fitxer orfe: el moviment ha d'existir
    and (
    app.pot_editar('historial')
    or app.es_creador_moviment(p_moviment_id)
    or (app.pot_editar('r4') and exists (
          select 1 from public.moviments m where m.id = p_moviment_id and m.font = 'manual' and m.tipus = 'despesa'))
  )
$$;

-- Pot esborrar el justificant d'aquest moviment?
create or replace function app.pot_esborrar_justificant(p_moviment_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_moviment_id is not null and (app.pot_editar('historial') or app.es_creador_moviment(p_moviment_id))
$$;

-- Polítiques sobre els fitxers (storage.objects), només del bucket de justificants.
create policy justificants_llegeix on storage.objects for select to authenticated
  using (bucket_id = 'justificants' and (select app.es_membre()));

create policy justificants_puja on storage.objects for insert to authenticated
  with check (bucket_id = 'justificants' and app.pot_adjuntar(app.moviment_de_ruta(name)));

-- Substituir un fitxer (upsert): les mateixes condicions que pujar-lo.
create policy justificants_substitueix on storage.objects for update to authenticated
  using (bucket_id = 'justificants' and app.pot_adjuntar(app.moviment_de_ruta(name)))
  with check (bucket_id = 'justificants' and app.pot_adjuntar(app.moviment_de_ruta(name)));

create policy justificants_esborra on storage.objects for delete to authenticated
  using (bucket_id = 'justificants' and app.pot_esborrar_justificant(app.moviment_de_ruta(name)));

-- Una fila de `justificants` ha de dur la ruta del seu propi moviment (el servei, és a dir la migració, no hi passa).
create or replace function app.t_justificants_ruta() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.es_servei() or new.storage_path is null
     or (tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
         and new.moviment_id is not distinct from old.moviment_id) then
    return new;
  end if;
  if app.moviment_de_ruta(new.storage_path) is distinct from new.moviment_id then
    raise exception 'La ruta del fitxer ha de ser «XX-YY/<id del moviment>.<extensió>» i correspondre al moviment del justificant.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t51_ruta before insert or update on public.justificants
  for each row execute function app.t_justificants_ruta();

-- Només les funcions que criden les polítiques (no un «grant … on all functions»: tornaria a obrir el hook d'alta, que només el rol d'Auth pot executar).
revoke all on function app.moviment_de_ruta(text), app.pot_adjuntar(text), app.pot_esborrar_justificant(text) from public, anon;
grant execute on function app.moviment_de_ruta(text), app.pot_adjuntar(text), app.pot_esborrar_justificant(text) to authenticated, service_role;
