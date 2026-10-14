-- =====================================================================================================
-- Falla Portal · Fase 3, tros 2 (D-048): Realtime en lloc del polling
--
-- L'app es subscriu als canvis de les taules de dades i, quan en rep un, torna a llegir (amb una pausa perquè un guardat de
-- diverses files siga un sol refresc). Realtime aplica RLS: cadascú només rep canvis de files que pot llegir (tots els
-- membres les llegeixen totes, D-035). audit_log i el catàleg de mòduls no hi són.
--
-- La publicació `supabase_realtime` existeix a Supabase; al PGlite dels tests no, i aleshores no es fa res.
-- =====================================================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'rols', 'usuaris', 'usuari_rols', 'rol_moduls', 'exercicis', 'arees', 'delegacions', 'directiva', 'events', 'comptes',
    'saldos_inicials', 'operacions', 'regles_importacio', 'caixes', 'caixa_canvis', 'moviments', 'justificants', 'fons',
    'pressupost_linies', 'pressupost_estat', 'pressupost_historial', 'fallesapp_passiu', 'fallesapp_consums',
    'fallesapp_recarregues', 'config']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
