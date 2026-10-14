-- =====================================================================================================
-- Falla Portal · Fase 3, tros 2 (D-048): public.guarda_canvis, la funció amb què l'app desa canvis per diferències
--
-- L'app compara el que té en pantalla (DB) amb la foto de l'última lectura i envia només les altes, els canvis i els
-- esborrats, tots junts. Aquesta funció els aplica en ordre dins d'UNA transacció (la cridada de l'API ho és): o es desa
-- tot o no es desa res.
--
--   guarda_canvis(p_canvis jsonb, p_motiu text default null) returns jsonb
--   p_canvis   llista d'operacions { t: taula, a: 'i'|'u'|'d'|'s', k: {identificació}, f: {columnes} }
--                i  alta (f)         u  canvi de les columnes de f a la fila que casa amb k
--                d  esborrat (k)     s  alta o canvi: si la fila ja hi és la canvia, si no la crea amb k + f
--              k s'aplica amb IS NOT DISTINCT FROM: pot ser la clau primària o una clau natural (línies de pressupost,
--              directiva). Una identificació que casa amb més d'una fila es rebutja.
--   p_motiu    motiu de l'excepció en un exercici tancat (D-029); val només dins de la cridada.
--
-- Seguretat
--   * SECURITY INVOKER: s'executa amb els permisos de qui crida. S'apliquen RLS, les columnes permeses, l'exercici
--     tancat i la resta de triggers, exactament com si l'usuari fes l'INSERT/UPDATE/DELETE per l'API. La funció no
--     dona cap permís que l'API no donara ja.
--   * Una modificació o un esborrat que RLS filtra no dona error a Postgres (simplement toca 0 files): aquí es
--     comprova quantes files ha tocat cada operació i, si no n'ha tocat cap perquè no hi ha permís, falla (si la fila
--     ja no existeix, un canvi falla i un esborrat es dona per fet). Sense això, l'app diria «Guardat ✓» d'un canvi que
--     no s'ha desat.
--   * Taules: llista tancada (mai audit_log ni el catàleg de mòduls). Columnes: han d'existir a la taula. Cap nom ve
--     de l'usuari sense passar per aquestes comprovacions i per quote_ident.
--   * L'única variable de sessió que toca és app.motiu (nom fix): només té efecte per a qui té el mòdul `exercicis` en
--     edició (trigger t40). No es posa mai cap altre valor de l'usuari a set_config.
--   * Només l'executa authenticated, i només un membre (persona activa amb algun rol).
-- =====================================================================================================

create or replace function public.guarda_canvis(p_canvis jsonb, p_motiu text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_taules constant text[] := array[
    'rols', 'usuaris', 'usuari_rols', 'rol_moduls', 'exercicis', 'arees', 'delegacions', 'directiva', 'events',
    'comptes', 'saldos_inicials', 'operacions', 'regles_importacio', 'caixes', 'caixa_canvis', 'moviments',
    'justificants', 'fons', 'pressupost_linies', 'pressupost_estat', 'pressupost_historial', 'fallesapp_passiu',
    'fallesapp_consums', 'fallesapp_recarregues', 'config'];
  v_op jsonb;
  v_i int := 0;
  v_t text; v_a text; v_k jsonb; v_f jsonb;
  v_valides text[];
  v_cols text; v_set text; v_match text; v_cols_alta text;
  v_files int;
  v_existeix boolean;
  v_missatge text; v_detall text; v_restriccio text; v_codi text;
begin
  if p_canvis is null or jsonb_typeof(p_canvis) <> 'array' then
    raise exception 'La petició ha de ser una llista d''operacions.' using errcode = '22023';
  end if;
  if not app.es_membre() then
    raise exception 'No tens permís: aquest correu no és de cap membre de la falla.' using errcode = '42501';
  end if;
  -- El motiu val només dins d'aquesta cridada (transacció): cada cridada el torna a posar.
  perform set_config('app.motiu', coalesce(btrim(p_motiu), ''), true);

  for v_op in select value from jsonb_array_elements(p_canvis)
  loop
    v_i := v_i + 1;
    begin
      v_t := v_op ->> 't';
      v_a := v_op ->> 'a';
      v_k := coalesce(v_op -> 'k', '{}');
      v_f := coalesce(v_op -> 'f', '{}');

      if v_t is null or v_t <> all (v_taules) then
        raise exception 'La taula «%» no es pot desar des de l''app.', v_t using errcode = '0A000';
      end if;
      if v_a is null or v_a <> all (array['i', 'u', 'd', 's']) then
        raise exception 'Operació desconeguda: %', v_a using errcode = '22023';
      end if;
      if jsonb_typeof(v_k) <> 'object' or jsonb_typeof(v_f) <> 'object' then
        raise exception 'La identificació i les columnes d''una operació han de ser objectes.' using errcode = '22023';
      end if;

      -- Columnes: totes han d'existir a la taula.
      select array_agg(a.attname::text) into v_valides from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(v_t))::regclass and a.attnum > 0 and not a.attisdropped;
      select c into v_cols from jsonb_object_keys(v_k || v_f) c where c <> all (v_valides) limit 1;
      if v_cols is not null then
        raise exception 'La taula % no té la columna «%».', v_t, v_cols using errcode = '42703';
      end if;

      select string_agg(quote_ident(c), ', ') into v_cols from jsonb_object_keys(v_f) c;
      select string_agg(format('%1$I = r.%1$I', c), ', ') into v_set from jsonb_object_keys(v_f) c;
      select string_agg(quote_ident(c), ', ') into v_cols_alta from jsonb_object_keys(v_k || v_f) c;
      select string_agg(format('x.%1$I is not distinct from kr.%1$I', c), ' and ') into v_match from jsonb_object_keys(v_k) c;

      if v_a in ('u', 'd', 's') and v_match is null then
        raise exception 'No es pot identificar la fila a % a %.', case v_a when 'd' then 'esborrar' else 'canviar' end, v_t
          using errcode = '22023';
      end if;

      if v_a = 'i' then
        if v_cols is null then
          raise exception 'Una alta ha de dur columnes.' using errcode = '22023';
        end if;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', v_t, v_cols, v_cols, v_t)
          using v_f;

      elsif v_a in ('u', 's') then
        v_files := 0;
        if v_set is not null then
          execute format('update public.%I x set %s from jsonb_populate_record(null::public.%I, $1) r, jsonb_populate_record(null::public.%I, $2) kr where %s',
                         v_t, v_set, v_t, v_t, v_match) using v_f, v_k;
          get diagnostics v_files = row_count;
        else
          -- Sense columnes a canviar: només cal saber si la fila hi és.
          execute format('select count(*) from public.%I x, jsonb_populate_record(null::public.%I, $1) kr where %s', v_t, v_t, v_match)
            into v_files using v_k;
        end if;
        if v_files > 1 then
          raise exception 'La identificació de la fila no és única a %: casa amb % files.', v_t, v_files using errcode = '21000';
        end if;
        if v_files = 0 then
          -- Tots els membres llegeixen totes les files (D-035): si la fila és visible i no s'ha pogut tocar, ha estat RLS.
          execute format('select exists (select 1 from public.%I x, jsonb_populate_record(null::public.%I, $1) kr where %s)', v_t, v_t, v_match)
            into v_existeix using v_k;
          if v_existeix then
            raise exception 'No tens permís per canviar aquesta fila de %.', v_t using errcode = '42501';
          end if;
          if v_a = 'u' then
            raise exception 'La fila ja no existeix a % (potser l''ha esborrada algú altre): recarrega les dades.', v_t using errcode = 'P0002';
          end if;
          execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', v_t, v_cols_alta, v_cols_alta, v_t)
            using v_k || v_f;
        end if;

      else  -- 'd'
        execute format('delete from public.%I x using jsonb_populate_record(null::public.%I, $1) kr where %s', v_t, v_t, v_match)
          using v_k;
        get diagnostics v_files = row_count;
        if v_files > 1 then
          raise exception 'La identificació de la fila no és única a %: casa amb % files.', v_t, v_files using errcode = '21000';
        end if;
        if v_files = 0 then
          execute format('select exists (select 1 from public.%I x, jsonb_populate_record(null::public.%I, $1) kr where %s)', v_t, v_t, v_match)
            into v_existeix using v_k;
          if v_existeix then
            raise exception 'No tens permís per esborrar aquesta fila de %.', v_t using errcode = '42501';
          end if;
        end if;
        -- Si la fila ja no hi és, algú altre l'ha esborrada: l'estat desitjat ja es compleix.
      end if;

    exception when others then
      get stacked diagnostics v_missatge = message_text, v_detall = pg_exception_detail, v_restriccio = constraint_name,
                              v_codi = returned_sqlstate;
      if v_codi = '42501' and v_missatge not like 'No tens permís%' then
        v_missatge := format('No tens permís per a aquesta operació a %s: %s', v_t, v_missatge);
      end if;
      raise exception '%', format('%s (operació %s: %s a %s)', v_missatge, v_i,
                                  case v_a when 'i' then 'alta' when 'u' then 'canvi' when 'd' then 'esborrat' when 's' then 'alta o canvi' else coalesce(v_a, '?') end,
                                  coalesce(v_t, '?'))
        using errcode = v_codi, detail = v_detall, constraint = v_restriccio;
    end;
  end loop;

  return jsonb_build_object('operacions', v_i);
end $$;

comment on function public.guarda_canvis(jsonb, text) is
  'Aplica en una transacció una llista d''altes, canvis i esborrats amb els permisos de qui crida (RLS i triggers inclosos). Vegeu la capçalera de la migració i D-048.';

revoke all on function public.guarda_canvis(jsonb, text) from public, anon;
grant execute on function public.guarda_canvis(jsonb, text) to authenticated;
