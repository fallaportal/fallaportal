-- =====================================================================================================
-- Falla Portal · Fase 1 · 2/4: catàleg de mòduls i rols de sistema amb els permisos d'avui
--
-- La matriu rol × mòdul substitueix els 6 permisos antics (canRegister, canFons, canImport, canConfig,
-- canUsers, viewAll), la visibilitat de mòduls (modulVis) i la de reports (reportVis). Els valors de
-- sota reprodueixen el que l'app v4.0.78 deixa fer a cada rol (MODEL_DADES §9.3). Els rols reals del full
-- (`14 Rols`) els porta l'script de migració de la Fase 5; ací només hi ha els de sistema.
-- =====================================================================================================

insert into public.moduls (id, nom, ordre, admet_edicio, admet_abast, que_permet_edicio) values
  ('dashboard',            'Dashboard',                          10, false, false, null),
  ('moviments',            'Nou moviment',                       20, true,  true,  'Registrar ingressos i despeses. Amb abast "directiva": només a les seues àrees i delegacions i dins de l''exercici actiu.'),
  ('historial',            'Historial',                          30, true,  false, 'Modificar i esborrar moviments de qualsevol persona i canviar-ne l''àrea. Sense edició, cadascú modifica (concepte i import) i esborra només els que ha creat.'),
  ('fons',                 'Fons delegats',                      40, true,  true,  'Lliuraments, devolucions, reintegraments, ingressos de tercers i traspassos banc → caixa; esborrar registres de fons. Amb abast "directiva": només delegats de les seues delegacions.'),
  ('caixa_obrir',          'Caixa d''event: obrir',              50, true,  true,  'Obrir una caixa amb el canvi inicial.'),
  ('caixa',                'Caixa d''event',                     60, true,  true,  'Tancar una caixa oberta, retirar efectiu, ampliar el canvi i eliminar una caixa oberta. Amb abast "directiva": events de les seues delegacions o dels quals és responsable.'),
  ('pressupostos',         'Pressupostos',                       70, true,  true,  'Crear, modificar i esborrar línies mentre el pressupost no està bloquejat. Amb abast "directiva": les seues delegacions.'),
  ('pressupostos_aprovar', 'Pressupostos: aprovar',              80, true,  false, 'Bloquejar i desbloquejar el pressupost d''un exercici.'),
  ('fallesapp',            'Falles.app',                         90, true,  false, 'Importar fitxers de falles.app, registrar el passiu i les bonificacions.'),
  ('importacio',           'Importar extracte',                 100, true,  false, 'Importar extractes bancaris i crear regles des de la importació.'),
  ('resultats',            'Estat de resultats',                110, false, false, null),
  ('flux',                 'Flux d''efectiu',                   120, false, false, null),
  ('r1',                   'Report: tancaments de caixa',       130, true,  false, 'Reobrir i eliminar caixes tancades.'),
  ('r2',                   'Report: fons lliurats',             140, false, false, null),
  ('r3',                   'Report: resultat per event',        150, false, false, null),
  ('r4',                   'Report: despeses sense justificant',160, true,  false, 'Adjuntar justificants a qualsevol despesa manual.'),
  ('configuracio',         'Configuració',                      170, true,  false, 'Tancar, reobrir i activar exercicis; àrees, delegacions, events, comptes, saldos inicials, regles d''importació, justificants; copiar pressupost.'),
  ('rols',                 'Rols i permisos',                   180, true,  false, 'Crear rols i decidir-ne els mòduls (pot donar-se qualsevol permís: tracteu-lo com a administració).'),
  ('usuaris',              'Usuaris',                           190, true,  false, 'Donar d''alta i de baixa persones i assignar-los rols.'),
  ('exercicis',            'Exercicis: crear i eliminar',       200, true,  false, 'Crear i eliminar exercicis i, com a excepció amb motiu, escriure en un exercici tancat o imputar un registre a un exercici diferent del de la data.'),
  ('directiva',            'Directiva',                         210, true,  false, 'Assignar responsables d''àrea i de delegació per exercici.'),
  ('registre',             'Registre d''activitat',             220, true,  false, 'Lectura: veure qui ha fet què. Edició: recuperar el que s''ha esborrat.'),
  ('manual',               'Manual d''usuari',                  230, false, false, null)
on conflict (id) do nothing;

insert into public.rols (id, nom, color, de_sistema) values
  ('president', 'President',        'p-purple', true),
  ('treasury',  'Tresoreria',       'p-info',   true),
  ('area',      'Resp. d''Àrea',    'p-ok',     true),
  ('delegat',   'Resp. Delegació',  'p-warn',   true),
  ('board',     'Junta (lectura)',  'p-gray',   true)
on conflict (id) do nothing;

-- Matriu d'avui (l = lectura, e = edició; d = abast directiva; b = barra inferior del mòbil).
-- Font: DEFAULT_ROLES, getDefaultModulVis(), getDefaultReportVis() i les comprovacions per nom de rol
-- d'index.html v4.0.78. Les marcades amb (*) són permisos que avui existeixen però que probablement no són
-- volguts. Emilio ja els ha decidit (D-038–D-041) i canvien a la matriu després del tall (D-025), no ara.
insert into public.rol_moduls (rol_id, modul_id, nivell, abast, barra)
select r.rol_id, r.modul_id, r.nivell, r.abast, r.barra
from (values
  -- President: tot, sempre
  ('president','dashboard','lectura','tot',true),   ('president','moviments','edicio','tot',true),
  ('president','historial','edicio','tot',false),   ('president','fons','edicio','tot',true),
  ('president','caixa_obrir','edicio','tot',false), ('president','caixa','edicio','tot',true),
  ('president','pressupostos','edicio','tot',false),('president','pressupostos_aprovar','edicio','tot',false),
  ('president','fallesapp','edicio','tot',false),   ('president','importacio','edicio','tot',false),
  ('president','resultats','lectura','tot',false),  ('president','flux','lectura','tot',false),
  ('president','r1','edicio','tot',false),          ('president','r2','lectura','tot',false),
  ('president','r3','lectura','tot',false),         ('president','r4','edicio','tot',false),
  ('president','configuracio','edicio','tot',false),('president','rols','edicio','tot',false),
  ('president','usuaris','edicio','tot',false),     ('president','exercicis','edicio','tot',false),
  ('president','directiva','edicio','tot',false),   ('president','registre','edicio','tot',false),
  ('president','manual','lectura','tot',false),
  -- Tresoreria: com President, sense Usuaris (canUsers=false)
  ('treasury','dashboard','lectura','tot',true),    ('treasury','moviments','edicio','tot',true),
  ('treasury','historial','edicio','tot',false),    ('treasury','fons','edicio','tot',true),
  ('treasury','caixa_obrir','edicio','tot',false),  ('treasury','caixa','edicio','tot',true),
  ('treasury','pressupostos','edicio','tot',false), ('treasury','pressupostos_aprovar','edicio','tot',false),
  ('treasury','fallesapp','edicio','tot',false),    ('treasury','importacio','edicio','tot',false),
  ('treasury','resultats','lectura','tot',false),   ('treasury','flux','lectura','tot',false),
  ('treasury','r1','edicio','tot',false),           ('treasury','r2','lectura','tot',false),
  ('treasury','r3','lectura','tot',false),          ('treasury','r4','edicio','tot',false),
  ('treasury','configuracio','edicio','tot',false), ('treasury','rols','edicio','tot',false),  -- (*) D-041: lectura després del tall
  ('treasury','exercicis','edicio','tot',false),    ('treasury','directiva','edicio','tot',false),
  ('treasury','registre','edicio','tot',false),     ('treasury','manual','lectura','tot',false),
  -- Responsable d'àrea
  ('area','dashboard','lectura','directiva',true),  ('area','moviments','edicio','directiva',true),
  ('area','historial','lectura','directiva',false), ('area','fons','edicio','directiva',true),      -- (*) botó a la targeta del delegat; D-039: lectura després del tall
  ('area','caixa','edicio','tot',true),             -- tanca qualsevol caixa oberta
  ('area','pressupostos','edicio','directiva',false),
  ('area','resultats','lectura','directiva',false), ('area','r1','lectura','directiva',false),
  ('area','r2','lectura','directiva',false),        ('area','r3','lectura','directiva',false),
  ('area','r4','edicio','tot',false),               -- (*) adjunta justificants a qualsevol despesa; D-040: lectura després del tall
  ('area','manual','lectura','tot',false),
  -- Responsable de delegació
  ('delegat','dashboard','lectura','directiva',true),('delegat','moviments','edicio','directiva',true),
  ('delegat','historial','lectura','directiva',false),('delegat','fons','lectura','directiva',true),
  ('delegat','caixa','edicio','directiva',true),
  ('delegat','pressupostos','edicio','directiva',false),
  ('delegat','resultats','lectura','directiva',false),('delegat','r1','lectura','directiva',false),
  ('delegat','r2','lectura','directiva',false),     ('delegat','r3','lectura','directiva',false),
  ('delegat','r4','edicio','tot',false),            -- (*) D-040: lectura després del tall
  ('delegat','manual','lectura','tot',false),
  -- Junta: avui també pot tancar caixes, editar pressupost i adjuntar justificants (*).
  -- D-038: passarà a només lectura en aquests tres mòduls després del tall (D-025).
  ('board','dashboard','lectura','tot',true),       ('board','historial','lectura','tot',false),
  ('board','caixa','edicio','tot',true),            -- (*)
  ('board','pressupostos','edicio','tot',false),    -- (*)
  ('board','resultats','lectura','tot',false),      ('board','flux','lectura','tot',false),
  ('board','r1','lectura','tot',false),             ('board','r2','lectura','tot',false),
  ('board','r3','lectura','tot',false),             ('board','r4','edicio','tot',false),  -- (*)
  ('board','manual','lectura','tot',false)
) as r(rol_id, modul_id, nivell, abast, barra)
on conflict (rol_id, modul_id) do nothing;
