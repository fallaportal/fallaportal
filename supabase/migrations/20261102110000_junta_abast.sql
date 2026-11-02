-- =====================================================================================================
-- Falla Portal · D-053: Junta no veu tot
--
-- Decisió d'Emilio (2026-11-02): «Junta veu el que volem, no tot». Al full real Junta tenia `viewAll = false`, i la matriu inicial (que
-- partia dels valors per defecte del codi) li donava abast «tot». Aquesta migració porta la matriu al que feia l'app en producció:
--   · Dashboard, Historial, Resultats i reports r1–r3 amb abast `directiva` (com Àrea i Delegat: només les seues àrees i delegacions)
--   · sense Flux d'efectiu (a l'app antiga només el veia qui tenia `viewAll`)
-- El que Junta veu de veres es pot canviar a Configuració → Rols i permisos, sense tocar l'SQL. Els permisos d'escriptura no canvien (D-038).
-- =====================================================================================================

update public.rol_moduls set abast = 'directiva'
where rol_id = 'board' and modul_id in ('dashboard', 'historial', 'resultats', 'r1', 'r2', 'r3');

delete from public.rol_moduls where rol_id = 'board' and modul_id = 'flux';
