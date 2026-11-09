-- Dia del tall (2026-11-09): `tools/supabase_carrega.mjs --definitiu` desa la marca `carrega_definitiva` a `config`,
-- però la restricció de clau només admetia `exercici_actiu` i `justificant` (els assajos no usaven --definitiu).
-- La marca la llegeixen `supabase_carrega.mjs` i `supabase_buida.mjs` per negar-se a esborrar les dades reals.

alter table public.config drop constraint config_clau_check;
alter table public.config add constraint config_clau_check
  check (clau in ('exercici_actiu', 'justificant', 'carrega_definitiva'));

comment on table public.config is 'exercici_actiu: exercici obert per defecte (avui global, A-02/D-034). justificant: {mode, llindar}. carrega_definitiva: data de la càrrega real del dia del tall (les eines es neguen a buidar).';
