-- =====================================================================================================
-- Falla Portal · D-057 (ampliació): el delegat pot corregir o esborrar una recàrrega que ha declarat malament
--
-- Decisió d'Emilio (2026-11-09): «errar és humà». Abans (20261109120000) una recàrrega declarada només la podien tocar Tresoreria o
-- President. Ara qui l'ha declarada la pot corregir (import i concepte, com qualsevol moviment seu) o esborrar MENTRE NO S'HAGUE
-- REGISTRAT cap devolució d'aquell delegat posterior a la declaració. Des que Tresoreria registra la devolució dels diners, la
-- recàrrega queda bloquejada per al delegat: canviar-la o esborrar-la després d'entregar els diners deixaria el seu saldo
-- desquadrat (en negatiu), i llavors només la corregeixen Tresoreria o President (Historial en edició).
--
--   · Corregir l'import de l'ingrés fa que el fons lligat el seguisca (trigger t80): el delegat no pot tocar el fons directament.
--   · Esborrar l'ingrés esborra el fons per la clau forana.
-- =====================================================================================================

-- Una recàrrega declarada és «tancada» si, després de declarar-la, s'ha registrat una devolució al mateix delegat.
create or replace function app.recarrega_tancada(p_moviment_id text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fons f
    join public.fons d on d.delegat_id = f.delegat_id and d.tipus = 'devolucio' and d.creat_at >= f.creat_at
    where f.moviment_id = p_moviment_id and f.tipus = 'lliurament' and f.origen = 'tercer'
  )
$$;

revoke all on function app.recarrega_tancada(text) from public, anon;
grant execute on function app.recarrega_tancada(text) to authenticated, service_role;

-- Esborrar: Historial en edició, o el creador (llevat d'una recàrrega declarada ja tancada), o una caixa tancada amb r1.
drop policy moviments_delete on public.moviments;
create policy moviments_delete on public.moviments for delete to authenticated
using (
  (select app.pot_editar('historial'))
  or (creat_per = (select app.usuari_id())
      and not (app.es_recarrega_declarada(id) and app.recarrega_tancada(id)))
  or (caixa_id is not null and (select app.pot_editar('r1')))
);

-- Canviar: el trigger de columnes ja limita el creador a concepte i import; una recàrrega tancada no la toca.
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
  if app.es_recarrega_declarada(old.id) and app.recarrega_tancada(old.id) then
    raise exception 'Aquesta recàrrega ja té una devolució registrada: només la pot corregir Tresoreria o President.'
      using errcode = 'insufficient_privilege';
  end if;
  v_canvis := app.canvis_fora_de(to_jsonb(old), to_jsonb(new), array['concepte', 'import']);
  if cardinality(v_canvis) > 0 then
    raise exception 'Només pots canviar el concepte i l''import dels moviments que has registrat (has intentat canviar: %).',
      array_to_string(v_canvis, ', ') using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- El fons lligat a una recàrrega declarada segueix l'import de l'ingrés (com ja feia amb una despesa amb fons o un avançament).
create or replace function app.t_moviments_sync_fons() returns trigger
language plpgsql
security definer  -- el fons pot ser d'un altre delegat; el canvi ja l'ha autoritzat el moviment
set search_path = ''
as $$
begin
  update public.fons set import = new.import
  where moviment_id = new.id
    and (tipus in ('despesa_fons', 'avancament') or (tipus = 'lliurament' and origen = 'tercer'))
    and import is distinct from new.import;
  return null;
end $$;
