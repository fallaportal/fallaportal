-- Dades de prova per als tests de RLS. S'insereixen com a servei dins d'una transacció que el
-- provador desfà al final: al projecte de Supabase no queda res. Ids i codis triats per no xocar amb les dades reals
-- (exercicis 90/91–92/93, àrees 91–92, emails @prova.test, prefix t_).
--
-- Persones (email = <id sense t_>@prova.test):
--   t_president  president              t_treasury  treasury
--   t_area       area, directiva àrea 91 (delegacions 9101 i 9102)
--   t_delegat    delegat, delegació 9101  · responsable de l'event t_ev_resp (delegació 9201)
--   t_delegat2   delegat, delegació 9102
--   t_board      board
--   t_multi      delegat (delegació 9201) + board
--   t_lectura    rol t_nomes_lectura (tots els mòduls en lectura)
--   t_inactiu    president però inactiu      t_sensrol  actiu però sense cap rol
--   desconegut@prova.test no és a usuaris (noauth)

insert into public.exercicis (id, data_inici, data_fi, tancat) values
  ('90/91', '2090-04-01', '2091-03-31', true),
  ('91/92', '2091-04-01', '2092-03-31', false),
  ('92/93', '2092-04-01', '2093-03-31', false);

insert into public.config (clau, valor) values ('exercici_actiu', '"91/92"')
  on conflict (clau) do update set valor = excluded.valor;

insert into public.arees (id, nom) values ('91', 'Prova Festejos'), ('92', 'Prova Administració');
insert into public.delegacions (id, area_id, nom) values
  ('9101', '91', 'Prova Dinars'), ('9102', '91', 'Prova Música'), ('9201', '92', 'Prova Tresoreria');

insert into public.rols (id, nom) values ('t_nomes_lectura', 'Prova: només lectura');
insert into public.rol_moduls (rol_id, modul_id, nivell)
  select 't_nomes_lectura', id, 'lectura' from public.moduls;

insert into public.usuaris (id, nom, email, actiu) values
  ('t_president', 'Prova President', 'president@prova.test', true),
  ('t_treasury',  'Prova Tresoreria', 'treasury@prova.test', true),
  ('t_area',      'Prova Àrea', 'area@prova.test', true),
  ('t_delegat',   'Prova Delegat', 'delegat@prova.test', true),
  ('t_delegat2',  'Prova Delegat 2', 'delegat2@prova.test', true),
  ('t_board',     'Prova Junta', 'board@prova.test', true),
  ('t_multi',     'Prova Multirol', 'multi@prova.test', true),
  ('t_lectura',   'Prova Lectura', 'lectura@prova.test', true),
  ('t_inactiu',   'Prova Inactiu', 'inactiu@prova.test', false),
  ('t_sensrol',   'Prova Sense Rol', 'sensrol@prova.test', true);

insert into public.usuari_rols (usuari_id, rol_id) values
  ('t_president', 'president'), ('t_treasury', 'treasury'), ('t_area', 'area'), ('t_delegat', 'delegat'),
  ('t_delegat2', 'delegat'), ('t_board', 'board'), ('t_multi', 'delegat'), ('t_multi', 'board'),
  ('t_lectura', 't_nomes_lectura'), ('t_inactiu', 'president');

insert into public.directiva (exercici_id, usuari_id, area_id, delegacio_id) values
  ('91/92', 't_area', '91', null),
  ('91/92', 't_delegat', null, '9101'),
  ('91/92', 't_delegat2', null, '9102'),
  ('91/92', 't_multi', null, '9201'),
  -- A l'exercici tancat el delegat portava una altra delegació: no ha de comptar (abast = exercici actiu).
  ('90/91', 't_delegat', null, '9201');

insert into public.comptes (id, codi, nom, tipus, iban) values
  ('t_banc', 'T Banc', 'Prova Banc', 'banc', 'ES9121000418450200051332'),
  ('t_efectiu', 'T Efectiu', 'Prova Efectiu', 'efectiu', null);

insert into public.events (id, exercici_id, delegacio_id, nom, responsable_id) values
  ('t_ev1', '91/92', '9101', 'Prova Sopar', null),
  ('t_ev2', '91/92', '9201', 'Prova Assemblea', null),
  ('t_ev3', '91/92', '9101', 'Prova Paella', null),
  ('t_ev_resp', '91/92', '9201', 'Prova Rifa', 't_delegat'),
  ('t_ev_tanc', '91/92', '9101', 'Prova Cloenda', null),
  ('t_ev_ant', '90/91', '9101', 'Prova Antiga', null);

insert into public.caixes (id, event_id, descripcio, data, estat, creat_per) values
  ('t_cx1', 't_ev1', null, '2091-06-01', 'oberta', 't_treasury'),
  ('t_cx2', 't_ev2', null, '2091-06-02', 'oberta', 't_treasury'),
  ('t_cx_resp', 't_ev_resp', null, '2091-06-03', 'oberta', 't_treasury'),
  ('t_cx_se', null, 'Prova sense event', '2091-06-04', 'oberta', 't_treasury'),
  ('t_cx_tanc', 't_ev_tanc', null, '2091-06-05', 'tancada', 't_treasury'),
  ('t_cx_ant', 't_ev_ant', null, '2090-06-01', 'tancada', 't_treasury');

insert into public.caixa_canvis (id, caixa_id, data, tipus, import, creat_per) values
  ('t_cc1', 't_cx1', '2091-06-01', 'lliurament', 100, 't_treasury');

insert into public.moviments (id, data, tipus, import, compte_id, area_id, delegacio_id, font, concepte, creat_per, caixa_id, pagament_efectiu) values
  ('t_m_del',   '2091-05-01', 'despesa', 10.00, 't_efectiu', '91', '9101', 'manual', 'Prova del delegat', 't_delegat', null, 'caixa'),
  ('t_m_fons',  '2091-05-02', 'despesa', 20.00, 't_efectiu', '91', '9101', 'manual', 'Prova amb fons', 't_delegat', null, 'fons_lliurats'),
  ('t_m_area',  '2091-05-03', 'despesa', 30.00, 't_banc',    '91', '9102', 'manual', 'Prova de l''àrea', 't_area', null, null),
  ('t_m_tres',  '2091-05-04', 'despesa', 40.00, 't_banc',    '92', '9201', 'manual', 'Prova de tresoreria', 't_treasury', null, null),
  ('t_m_ext',   '2091-05-05', 'ingres',  50.00, 't_banc',    '92', '9201', 'extracte', 'Prova extracte', 't_treasury', null, null),
  ('t_m_ant',   '2090-05-01', 'despesa', 60.00, 't_efectiu', '91', '9101', 'manual', 'Prova antiga', 't_delegat', null, 'caixa'),
  ('t_m_cx1',   '2091-06-01', 'ingres',  70.00, 't_efectiu', '91', '9101', 'retirada_caixa', 'Prova retirada', 't_treasury', 't_cx1', null),
  ('t_m_tanc',  '2091-06-05', 'ingres',  80.00, 't_efectiu', '91', '9101', 'tancament_caixa', 'Prova vendes', 't_treasury', 't_cx_tanc', null),
  -- Moviment antic de t_sensrol, de quan tenia rol (ara no en té cap).
  ('t_m_sensrol','2091-05-06','despesa', 15.00, 't_efectiu', '91', '9101', 'manual', 'Prova d''un exdelegat', 't_sensrol', null, 'avancament');

insert into public.operacions (id, tipus, exercici_id, creat_per) values
  ('t_op1', 'importacio_extracte', '91/92', 't_treasury');

insert into public.fons (id, data, tipus, delegat_id, import, origen, moviment_id, creat_per) values
  ('t_f_ll',   '2091-04-15', 'lliurament',   't_delegat', 100.00, 'caixa', null,      't_treasury'),
  ('t_f_desp', '2091-05-02', 'despesa_fons', 't_delegat',  20.00, null,    't_m_fons', 't_delegat'),
  ('t_f_multi','2091-04-15', 'lliurament',   't_multi',    50.00, 'caixa', null,      't_treasury');

insert into public.pressupost_linies (id, exercici_id, delegacio_id, event_id, concepte, tipus, import, creat_per) values
  ('t_p1', '91/92', '9101', 't_ev1', null, 'event', 500, 't_treasury');

insert into public.pressupost_historial (id, exercici_id, accio, motiu, creat_per) values
  ('t_ph1', '91/92', 'bloquejat', null, 't_treasury');
