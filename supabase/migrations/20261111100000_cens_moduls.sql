-- =====================================================================================================
-- Falla Portal · Mòduls de permisos de "Gestió de Cens" (app del cens, esquema `cens` del mateix projecte)
--
-- Els usuaris i els rols del cens són els de Gestió; el cens només hi afegeix 4 mòduls al catàleg de permisos.
-- Mateix patró que `recarregues` (20261109120000) i `compromisos` (20261110100000): una inserció al catàleg
-- (`moduls`) i els permisos inicials a la matriu (`rol_moduls`). Idempotent (`on conflict do nothing`).
--
-- El catàleg és una llista plana: "Gestió de Cens" és el prefix comú dels noms i de l'ordre (300–330), no una fila pare.
-- Els mòduls de només lectura (`admet_edicio = false`) no admeten edició (trigger t50_valid).
-- Cap mòdul admet abast per directiva: és cosa de tresoreria, no del cens.
--
-- Permisos inicials: només President, per no deixar el cens sense ningú que hi puga entrar. La resta de rols es
-- decideix després a l'editor de "Rols i permisos" de Gestió (D-041: només President dissenya rols); no cal migració.
-- Les polítiques RLS de l'esquema `cens` decidiran amb aquests ids de mòdul. Cap pantalla ni política de Gestió no els usa.
-- =====================================================================================================

insert into public.moduls (id, nom, ordre, admet_edicio, admet_abast, que_permet_edicio) values
  ('cens_manteniment',  'Gestió de Cens - Manteniment',  300, true,  false,
   'Cens de falleros, famílies i assignació de càrrecs: crear, modificar, donar de baixa, reactivar i eliminar (només amb les condicions del cens).'),
  ('cens_reports',      'Gestió de Cens - Reports',      310, false, false, null),
  ('cens_configuracio', 'Gestió de Cens - Configuració', 320, true,  false,
   'Mestre d''exercicis del cens (obrir i tancar), de càrrecs i de tarifes, i paràmetres globals.'),
  ('cens_manual',       'Gestió de Cens - Manual',       330, false, false, null)
on conflict (id) do nothing;

insert into public.rol_moduls (rol_id, modul_id, nivell, abast, barra) values
  ('president', 'cens_manteniment',  'edicio',  'tot', false),
  ('president', 'cens_reports',      'lectura', 'tot', false),
  ('president', 'cens_configuracio', 'edicio',  'tot', false),
  ('president', 'cens_manual',       'lectura', 'tot', false)
on conflict (rol_id, modul_id) do nothing;
