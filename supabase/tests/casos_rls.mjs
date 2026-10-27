// Casos de prova de l'esquema i de les polítiques RLS. Dades: dades_prova.sql. Provador: tools/supabase_tests.mjs.
//
// Cada cas: { nom, com, sql, espera, prep?, motiu?, verifica? }
//   com      email de la persona (JWT), 'anon' (sense sessió), 'service_role' (clau de servei: scripts de migració)
//            o 'servei' (connexió directa com a postgres)
//   sql      una sentència o una llista; es compara el resultat de l'última
//   prep     sentències prèvies executades com a servei (p. ex. bloquejar el pressupost)
//   motiu    valor de app.motiu (excepció en un exercici tancat)
//   verifica consulta final com a servei; si hi és, l'espera es compara amb el seu resultat
//   jwt      claims del JWT en lloc dels per defecte ({role: 'authenticated', email: com, sub})
//   espera   'error' | { error: 'text' } | { files: n } | { valor: 'x' } (primera columna de la primera fila)
// Les sentències porten `returning 1` (mai una columna: amb `returning id` Postgres exigeix poder llegir la fila nova
// i un no-membre semblaria bloquejat quan no ho està). RLS no dona error en un UPDATE/DELETE: simplement no hi
// troba files. 0 files = no l'ha deixat.

const P = 'president@prova.test';
const T = 'treasury@prova.test';
const A = 'area@prova.test';
const D = 'delegat@prova.test';
const D2 = 'delegat2@prova.test';
const B = 'board@prova.test';
const M = 'multi@prova.test';
const L = 'lectura@prova.test';
const I = 'inactiu@prova.test';
const S = 'sensrol@prova.test';
const N = 'desconegut@prova.test';

const q = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

function mov(o = {}) {
  const c = {
    id: o.id ?? null, data: '2091-05-10', tipus: 'despesa', import: 5, compte_id: 't_efectiu',
    area_id: '91', delegacio_id: '9101', font: 'manual', concepte: 'Prova', ...o,
  };
  if (c.id === null) delete c.id;
  const cols = Object.keys(c);
  return `insert into public.moviments (${cols.join(', ')}) values (${cols.map((k) => q(c[k])).join(', ')}) returning 1`;
}

function fons(o = {}) {
  const c = { data: '2091-05-10', tipus: 'lliurament', delegat_id: 't_delegat', import: 25, ...o };
  const cols = Object.keys(c);
  return `insert into public.fons (${cols.join(', ')}) values (${cols.map((k) => q(c[k])).join(', ')}) returning 1`;
}

const comptaMov = "select count(*) from public.moviments where id like 't\\_%'";


const hook = (email) => "select app.hook_alta_usuari('" + JSON.stringify({ user: { email } }).replace(/'/g, "''") + "'::jsonb)::text";
const hookErr = (email) => "select app.hook_alta_usuari('" + JSON.stringify({ user: { email } }).replace(/'/g, "''") + "'::jsonb) -> 'error' ->> 'http_code'";

export const casos = [
  // ---------------------------------------------------------------- Seguretat de l'esquema (substitueixen les opcions
  // "Enable automatic RLS" i "Automatically expose new tables" del projecte: fallen si una taula nova se'n queda fora)
  { nom: 'esquema: totes les taules tenen RLS activat', com: 'servei', sql: "select coalesce(string_agg(tablename, ', '), 'cap') from pg_tables where schemaname = 'public' and not rowsecurity", espera: { valor: 'cap' } },
  { nom: 'esquema: qui no ha iniciat sessió (anon) no té cap permís sobre cap taula', com: 'servei', sql: "select coalesce(string_agg(distinct table_name, ', '), 'cap') from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'", espera: { valor: 'cap' } },
  { nom: 'esquema: una taula nova de public no dona permisos a ningú per defecte', com: 'servei', sql: ["create table public.t_taula_nova (id int)", "select coalesce(string_agg(distinct grantee, ', '), 'cap') from information_schema.role_table_grants where table_schema = 'public' and table_name = 't_taula_nova' and grantee in ('anon', 'authenticated')"], espera: { valor: 'cap' } },

  // ---------------------------------------------------------------- Identitat i lectura (D-035)
  { nom: 'lectura: noauth no veu cap moviment', com: N, sql: comptaMov, espera: { valor: 0 } },
  { nom: 'lectura: noauth no veu cap usuari', com: N, sql: 'select id from public.usuaris', espera: { files: 0 } },
  { nom: 'lectura: usuari inactiu no veu res', com: I, sql: comptaMov, espera: { valor: 0 } },
  { nom: 'lectura: usuari actiu sense rol no veu res', com: S, sql: comptaMov, espera: { valor: 0 } },
  { nom: 'lectura: sense sessió (anon) no té accés', com: 'anon', sql: 'select id from public.moviments', espera: 'error' },
  { nom: 'lectura: delegat llig tots els moviments (com ara)', com: D, sql: comptaMov, espera: { valor: 9 } },
  { nom: 'lectura: junta llig tots els moviments', com: B, sql: comptaMov, espera: { valor: 9 } },
  { nom: 'lectura: delegat llig tots els fons', com: D, sql: "select count(*) from public.fons where id like 't\\_%'", espera: { valor: 3 } },
  { nom: 'lectura: delegat no veu el registre d\'activitat', com: D, sql: 'select id from public.audit_log limit 1', espera: { files: 0 } },
  { nom: 'lectura: amb el mòdul registre en lectura es veu el registre', com: L, sql: 'select count(*) > 0 from public.audit_log', espera: { valor: 'true' } },
  { nom: 'lectura: tresoreria veu el registre d\'activitat', com: T, sql: [mov({ compte_id: 't_banc', area_id: '92', delegacio_id: '9201' }), "select count(*) > 0 from public.audit_log where taula = 'moviments'"], espera: { valor: 'true' } },

  // ---------------------------------------------------------------- Nou moviment (abast i exercici)
  { nom: 'moviment: delegat registra a la seua delegació', com: D, sql: mov(), espera: { files: 1 } },
  { nom: 'moviment: delegat no registra en una altra delegació de la mateixa àrea', com: D, sql: mov({ delegacio_id: '9102' }), espera: 'error' },
  { nom: 'moviment: delegat no registra sense delegació', com: D, sql: mov({ delegacio_id: null }), espera: 'error' },
  { nom: 'moviment: delegat no usa la directiva d\'un exercici que no és l\'actiu', com: D, sql: mov({ area_id: '92', delegacio_id: '9201' }), espera: 'error' },
  { nom: 'moviment: responsable d\'àrea registra en qualsevol delegació de la seua àrea', com: A, sql: mov({ delegacio_id: '9102' }), espera: { files: 1 } },
  { nom: 'moviment: responsable d\'àrea no registra en una altra àrea', com: A, sql: mov({ area_id: '92', delegacio_id: '9201' }), espera: 'error' },
  { nom: 'moviment: junta no registra', com: B, sql: mov(), espera: 'error' },
  { nom: 'moviment: rol només lectura no registra', com: L, sql: mov(), espera: 'error' },
  { nom: 'moviment: noauth no registra', com: N, sql: mov(), espera: 'error' },
  { nom: 'moviment: tresoreria registra en qualsevol àrea', com: T, sql: mov({ area_id: '92', delegacio_id: '9201' }), espera: { files: 1 } },
  { nom: 'moviment: delegat no registra fora de l\'exercici actiu (92/93 obert)', com: D, sql: mov({ data: '2092-05-01' }), espera: 'error' },
  { nom: 'moviment: tresoreria sí que registra a 92/93 (abast tot)', com: T, sql: mov({ data: '2092-05-01' }), espera: { files: 1 } },
  { nom: 'moviment: data fora de tot exercici', com: T, sql: mov({ data: '2095-05-01' }), espera: { error: 'no és dins de cap exercici' } },
  { nom: 'moviment: l\'exercici ve de la data, no del que envia el client', com: D, sql: mov({ id: 't_nou', exercici_id: '92/93' }), verifica: "select exercici_id from public.moviments where id = 't_nou'", espera: { valor: '91/92' } },
  { nom: 'moviment: creat_per no es pot falsejar', com: D, sql: mov({ id: 't_nou', creat_per: 't_area' }), verifica: "select creat_per from public.moviments where id = 't_nou'", espera: { valor: 't_delegat' } },
  { nom: 'moviment: el responsable és qui el registra', com: D, sql: mov({ id: 't_nou' }), verifica: "select responsable_id from public.moviments where id = 't_nou'", espera: { valor: 't_delegat' } },
  { nom: 'moviment: el responsable el posa el servidor, encara que el client n\'envie un altre', com: D, sql: mov({ id: 't_nou', responsable_id: 't_area' }), verifica: "select responsable_id from public.moviments where id = 't_nou'", espera: { valor: 't_delegat' } },
  { nom: 'moviment: delegat no importa extractes', com: D, sql: mov({ font: 'extracte', compte_id: 't_banc' }), espera: 'error' },
  { nom: 'moviment: tresoreria importa extractes', com: T, sql: mov({ font: 'extracte', compte_id: 't_banc' }), espera: { files: 1 } },
  { nom: 'moviment: delegat no fa traspassos banc → caixa', com: D, sql: mov({ font: 'traspas_banc_caixa' }), espera: 'error' },
  { nom: 'moviment: tresoreria fa traspassos banc → caixa', com: T, sql: mov({ font: 'traspas_banc_caixa', area_id: '92', delegacio_id: '9201' }), espera: { files: 1 } },
  { nom: 'moviment: conciliació d\'un manual de banc = pendent', com: T, sql: mov({ id: 't_nou', compte_id: 't_banc' }), verifica: "select conciliacio from public.moviments where id = 't_nou'", espera: { valor: 'pendent' } },
  { nom: 'moviment: conciliació d\'efectiu = no_aplica', com: T, sql: mov({ id: 't_nou' }), verifica: "select conciliacio from public.moviments where id = 't_nou'", espera: { valor: 'no_aplica' } },
  { nom: 'moviment: conciliació d\'extracte = conciliat', com: T, sql: mov({ id: 't_nou', compte_id: 't_banc', font: 'extracte' }), verifica: "select conciliacio from public.moviments where id = 't_nou'", espera: { valor: 'conciliat' } },
  { nom: 'moviment: un manual no es pot donar per conciliat des del client', com: T, sql: mov({ id: 't_nou', compte_id: 't_banc', conciliacio: 'conciliat' }), verifica: "select conciliacio from public.moviments where id = 't_nou'", espera: { valor: 'pendent' } },
  { nom: 'moviment: import zero no s\'accepta', com: T, sql: mov({ import: 0 }), espera: 'error' },
  { nom: 'moviment: delegació que no és de l\'àrea', com: T, sql: mov({ area_id: '92', delegacio_id: '9101' }), espera: 'error' },

  // ---------------------------------------------------------------- Exercici tancat (D-029)
  { nom: 'tancat: delegat no registra a l\'exercici tancat', com: D, sql: mov({ data: '2090-05-01' }), espera: { error: 'està tancat' } },
  { nom: 'tancat: tresoreria tampoc sense motiu', com: T, sql: mov({ data: '2090-05-01' }), espera: { error: 'cal indicar-ne el motiu' } },
  { nom: 'tancat: tresoreria amb motiu sí, i queda marcat com a excepció', com: T, motiu: 'Factura arribada tard', sql: mov({ id: 't_nou', data: '2090-05-01' }), verifica: "select imputacio_excepcional::text || ' · ' || motiu_imputacio from public.moviments where id = 't_nou'", espera: { valor: 'true · Factura arribada tard' } },
  { nom: 'tancat: el motiu queda al registre d\'activitat', com: T, motiu: 'Factura arribada tard', sql: mov({ id: 't_nou', data: '2090-05-01' }), verifica: "select motiu from public.audit_log where taula = 'moviments' and fila_id = 't_nou'", espera: { valor: 'Factura arribada tard' } },
  { nom: 'tancat: delegat no modifica el seu moviment antic', com: D, sql: "update public.moviments set concepte = 'x' where id = 't_m_ant' returning 1", espera: { error: 'està tancat' } },
  { nom: 'tancat: tresoreria no esborra sense motiu', com: T, sql: "delete from public.moviments where id = 't_m_ant' returning 1", espera: { error: 'cal indicar-ne el motiu' } },
  { nom: 'tancat: tresoreria esborra amb motiu', com: T, motiu: 'Duplicat', sql: "delete from public.moviments where id = 't_m_ant' returning 1", espera: { files: 1 } },
  { nom: 'tancat: imputar a un altre exercici és cosa de qui gestiona exercicis', com: D, sql: mov({ imputacio_excepcional: true, motiu_imputacio: 'x', exercici_id: '92/93' }), espera: 'error' },
  { nom: 'tancat: tresoreria imputa a un altre exercici amb motiu', com: T, sql: mov({ id: 't_nou', imputacio_excepcional: true, motiu_imputacio: 'Factura del 92/93', exercici_id: '92/93' }), verifica: "select exercici_id from public.moviments where id = 't_nou'", espera: { valor: '92/93' } },
  { nom: 'tancat: tresoreria no tanca una caixa de l\'exercici tancat sense motiu', com: T, sql: "update public.caixes set notes = 'x' where id = 't_cx_ant' returning 1", espera: { error: 'cal indicar-ne el motiu' } },

  // ---------------------------------------------------------------- Modificar i esborrar moviments (propietat)
  { nom: 'editar: delegat canvia el concepte del seu', com: D, sql: "update public.moviments set concepte = 'Nou' where id = 't_m_del' returning 1", espera: { files: 1 } },
  { nom: 'editar: delegat canvia l\'import del seu', com: D, sql: "update public.moviments set import = 12.5 where id = 't_m_del' returning 1", espera: { files: 1 } },
  { nom: 'editar: delegat no canvia l\'àrea ni la delegació del seu', com: D, sql: "update public.moviments set delegacio_id = '9102' where id = 't_m_del' returning 1", espera: { error: 'Només pots canviar el concepte' } },
  { nom: 'editar: delegat no canvia la data del seu', com: D, sql: "update public.moviments set data = '2091-05-20' where id = 't_m_del' returning 1", espera: { error: 'Només pots canviar el concepte' } },
  { nom: 'traspàs: delegat no marca el seu moviment com a traspàs (D-049)', com: D, sql: "update public.moviments set traspas = true where id = 't_m_del' returning 1", espera: { error: 'Només pots canviar el concepte' } },
  { nom: 'traspàs: tresoreria marca un moviment com a traspàs (D-049)', com: T, sql: "update public.moviments set traspas = true where id = 't_m_del' returning 1", verifica: "select traspas::text from public.moviments where id = 't_m_del'", espera: { valor: 'true' } },
  { nom: 'traspàs: un moviment nou no és traspàs si no ho diu (D-049)', com: T, sql: mov({ id: 't_nou' }), verifica: "select traspas::text from public.moviments where id = 't_nou'", espera: { valor: 'false' } },
  { nom: 'editar: delegat no toca el d\'un altre', com: D, sql: "update public.moviments set concepte = 'x' where id = 't_m_area' returning 1", espera: { files: 0 } },
  { nom: 'editar: responsable d\'àrea no toca el del delegat', com: A, sql: "update public.moviments set concepte = 'x' where id = 't_m_del' returning 1", espera: { files: 0 } },
  { nom: 'editar: tresoreria canvia la delegació de qualsevol', com: T, sql: "update public.moviments set delegacio_id = '9102' where id = 't_m_del' returning 1", espera: { files: 1 } },
  { nom: 'editar: modificat_per és qui modifica', com: T, sql: "update public.moviments set concepte = 'x' where id = 't_m_del' returning 1", verifica: "select modificat_per from public.moviments where id = 't_m_del'", espera: { valor: 't_treasury' } },
  { nom: 'esborrar: delegat esborra el seu', com: D, sql: "delete from public.moviments where id = 't_m_del' returning 1", espera: { files: 1 } },
  { nom: 'esborrar: delegat no esborra el d\'un altre', com: D, sql: "delete from public.moviments where id = 't_m_area' returning 1", espera: { files: 0 } },
  { nom: 'esborrar: la despesa amb fons s\'emporta el seu registre de fons (A-24)', com: D, sql: "delete from public.moviments where id = 't_m_fons' returning 1", verifica: "select count(*) from public.fons where id = 't_f_desp'", espera: { valor: 0 } },
  { nom: 'esborrar: tresoreria esborra el de qualsevol', com: T, sql: "delete from public.moviments where id = 't_m_area' returning 1", espera: { files: 1 } },
  { nom: 'esborrar: queda al registre amb el valor d\'abans (D-028)', com: D, sql: "delete from public.moviments where id = 't_m_del' returning 1", verifica: "select (abans ->> 'concepte') || ' · ' || usuari_id from public.audit_log where taula = 'moviments' and fila_id = 't_m_del' and accio = 'delete'", espera: { valor: 'Prova del delegat · t_delegat' } },

  // ---------------------------------------------------------------- Justificants
  { nom: 'justificant: delegat n\'adjunta al seu moviment', com: D, sql: "insert into public.justificants (moviment_id, storage_path) values ('t_m_del', '91-92/t_m_del.jpg') returning 1", espera: { files: 1 } },
  { nom: 'justificant: r4 deixa adjuntar-ne a una despesa manual d\'un altre (com ara)', com: D, sql: "insert into public.justificants (moviment_id, storage_path) values ('t_m_tres', '91-92/t_m_tres.jpg') returning 1", espera: { files: 1 } },
  { nom: 'justificant: no a un moviment d\'extracte d\'un altre', com: D, sql: "insert into public.justificants (moviment_id, storage_path) values ('t_m_ext', '91-92/t_m_ext.jpg') returning 1", espera: 'error' },
  { nom: 'justificant: rol només lectura no n\'adjunta', com: L, sql: "insert into public.justificants (moviment_id, storage_path) values ('t_m_tres', '91-92/x.jpg') returning 1", espera: 'error' },

  // ---------------------------------------------------------------- Fons delegats (D-022)
  { nom: 'fons: delegat no es lliura fons', com: D, sql: fons(), espera: 'error' },
  { nom: 'fons: tresoreria lliura fons', com: T, sql: fons(), espera: { files: 1 } },
  { nom: 'fons: responsable d\'àrea lliura a un delegat de la seua àrea (com ara, pendent de decidir)', com: A, sql: fons(), espera: { files: 1 } },
  { nom: 'fons: responsable d\'àrea no lliura a un delegat d\'una altra àrea', com: A, sql: fons({ delegat_id: 't_multi' }), espera: 'error' },
  { nom: 'fons: delegat registra una despesa amb els seus fons', com: D, sql: [mov({ id: 't_nou', pagament_efectiu: 'fons_lliurats' }), fons({ tipus: 'despesa_fons', moviment_id: 't_nou', import: 5 })], espera: { files: 1 } },
  { nom: 'fons: delegat no lliga la despesa amb fons a un moviment d\'un altre', com: D, sql: fons({ tipus: 'despesa_fons', moviment_id: 't_m_area' }), espera: 'error' },
  { nom: 'fons: delegat no posa la despesa amb fons a nom d\'un altre', com: D, sql: [mov({ id: 't_nou' }), fons({ tipus: 'avancament', delegat_id: 't_delegat2', moviment_id: 't_nou' })], espera: 'error' },
  { nom: 'fons: delegat canvia l\'import de la seua despesa amb fons', com: D, sql: "update public.fons set import = 22 where id = 't_f_desp' returning 1", espera: { files: 1 } },
  { nom: 'fons: delegat no canvia la nota de la seua despesa amb fons', com: D, sql: "update public.fons set nota = 'x' where id = 't_f_desp' returning 1", espera: { error: 'Només pots canviar l\'import' } },
  { nom: 'fons: delegat no esborra registres de fons', com: D, sql: "delete from public.fons where id = 't_f_desp' returning 1", espera: { files: 0 } },
  { nom: 'fons: tresoreria esborra registres de fons', com: T, sql: "delete from public.fons where id = 't_f_ll' returning 1", espera: { files: 1 } },
  { nom: 'fons: origen només en lliuraments i reintegraments', com: T, sql: fons({ tipus: 'devolucio', origen: 'banc' }), espera: 'error' },

  // ---------------------------------------------------------------- Caixes d'event
  { nom: 'caixa: tresoreria obri caixa', com: T, sql: "insert into public.caixes (event_id, data) values ('t_ev3', '2091-07-01') returning 1", espera: { files: 1 } },
  { nom: 'caixa: tresoreria obri caixa sense event', com: T, sql: "insert into public.caixes (descripcio, data) values ('Sopar improvisat', '2091-07-01') returning 1", espera: { files: 1 } },
  { nom: 'caixa: sense event cal descripció', com: T, sql: "insert into public.caixes (data) values ('2091-07-01') returning 1", espera: 'error' },
  { nom: 'caixa: delegat no obri caixa', com: D, sql: "insert into public.caixes (event_id, data) values ('t_ev3', '2091-07-01') returning 1", espera: 'error' },
  { nom: 'caixa: una sola caixa per event', com: T, sql: "insert into public.caixes (event_id, data) values ('t_ev1', '2091-07-01') returning 1", espera: 'error' },
  { nom: 'caixa: delegat tanca la caixa d\'un event de la seua delegació', com: D, sql: "update public.caixes set estat = 'tancada', efectiu = 100 where id = 't_cx1' returning 1", espera: { files: 1 } },
  { nom: 'caixa: delegat tanca la caixa d\'un event del qual és responsable', com: D, sql: "update public.caixes set estat = 'tancada' where id = 't_cx_resp' returning 1", espera: { files: 1 } },
  { nom: 'caixa: delegat no tanca la caixa d\'un event d\'una altra delegació', com: D, sql: "update public.caixes set estat = 'tancada' where id = 't_cx2' returning 1", espera: { files: 0 } },
  { nom: 'caixa: delegat no tanca una caixa sense event', com: D, sql: "update public.caixes set estat = 'tancada' where id = 't_cx_se' returning 1", espera: { files: 0 } },
  { nom: 'caixa: responsable d\'àrea tanca qualsevol caixa (com ara)', com: A, sql: "update public.caixes set estat = 'tancada' where id = 't_cx2' returning 1", espera: { files: 1 } },
  { nom: 'caixa: junta tanca caixes (com ara, pendent de decidir)', com: B, sql: "update public.caixes set estat = 'tancada' where id = 't_cx2' returning 1", espera: { files: 1 } },
  { nom: 'caixa: rol només lectura no tanca', com: L, sql: "update public.caixes set estat = 'tancada' where id = 't_cx2' returning 1", espera: { files: 0 } },
  { nom: 'caixa: delegat no reobri una caixa tancada', com: D, sql: "update public.caixes set estat = 'oberta' where id = 't_cx_tanc' returning 1", espera: { files: 0 } },
  { nom: 'caixa: tresoreria reobri una caixa tancada (r1)', com: T, sql: "update public.caixes set estat = 'oberta' where id = 't_cx_tanc' returning 1", espera: { files: 1 } },
  { nom: 'caixa: delegat registra una retirada de la seua caixa', com: D, sql: mov({ font: 'retirada_caixa', tipus: 'ingres', caixa_id: 't_cx1' }), espera: { files: 1 } },
  { nom: 'caixa: els moviments del tancament poden anar a qualsevol àrea (com ara)', com: D, sql: mov({ font: 'tancament_caixa', tipus: 'ingres', caixa_id: 't_cx1', area_id: '92', delegacio_id: '9201' }), espera: { files: 1 } },
  { nom: 'caixa: delegat no registra una retirada d\'una caixa aliena', com: D, sql: mov({ font: 'retirada_caixa', tipus: 'ingres', caixa_id: 't_cx2' }), espera: 'error' },
  { nom: 'caixa: no es registren moviments en una caixa tancada', com: T, sql: mov({ font: 'tancament_caixa', tipus: 'ingres', caixa_id: 't_cx_tanc' }), espera: 'error' },
  { nom: 'caixa: un moviment de caixa ha de dir de quina caixa és', com: T, sql: mov({ font: 'tancament_caixa', tipus: 'ingres' }), espera: 'error' },
  { nom: 'caixa: delegat amplia el canvi de la seua caixa', com: D, sql: "insert into public.caixa_canvis (caixa_id, data, tipus, import) values ('t_cx1', '2091-06-01', 'ampliacio', 20) returning 1", espera: { files: 1 } },
  { nom: 'caixa: delegat no fa el lliurament inicial de canvi', com: D, sql: "insert into public.caixa_canvis (caixa_id, data, tipus, import) values ('t_cx1', '2091-06-01', 'lliurament', 20) returning 1", espera: 'error' },
  { nom: 'caixa: delegat elimina la seua caixa oberta i els seus moviments', com: D, sql: "delete from public.caixes where id = 't_cx1' returning 1", verifica: "select count(*) from public.moviments where id = 't_m_cx1'", espera: { valor: 0 } },
  { nom: 'caixa: delegat no elimina una caixa tancada', com: D, sql: "delete from public.caixes where id = 't_cx_tanc' returning 1", espera: { files: 0 } },
  { nom: 'caixa: tresoreria elimina una caixa tancada (r1)', com: T, sql: "delete from public.caixes where id = 't_cx_tanc' returning 1", espera: { files: 1 } },

  // ---------------------------------------------------------------- Pressupostos
  { nom: 'pressupost: delegat afegeix línies a la seua delegació', com: D, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, concepte, tipus, import) values ('91/92', '9101', 'Cadires', 'concepte', 100) returning 1", espera: { files: 1 } },
  { nom: 'pressupost: delegat no en afegeix a una altra delegació', com: D, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, concepte, tipus, import) values ('91/92', '9102', 'Cadires', 'concepte', 100) returning 1", espera: 'error' },
  { nom: 'pressupost: junta n\'afegeix (com ara, pendent de decidir)', com: B, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, concepte, tipus, import) values ('91/92', '9201', 'Cadires', 'concepte', 100) returning 1", espera: { files: 1 } },
  { nom: 'pressupost: "Varis" és paraula reservada', com: T, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, concepte, tipus, import) values ('91/92', '9101', 'varis', 'concepte', 100) returning 1", espera: 'error' },
  { nom: 'pressupost: bloquejat, ningú no hi escriu', com: T, prep: "insert into public.pressupost_estat (exercici_id, estat) values ('91/92', 'bloquejat')", sql: "update public.pressupost_linies set import = 600 where id = 't_p1' returning 1", espera: { files: 0 } },
  { nom: 'pressupost: el bloqueig és per exercici (A-11)', com: T, prep: "insert into public.pressupost_estat (exercici_id, estat) values ('92/93', 'bloquejat')", sql: "update public.pressupost_linies set import = 600 where id = 't_p1' returning 1", espera: { files: 1 } },
  { nom: 'pressupost: delegat no el bloqueja', com: D, sql: "insert into public.pressupost_estat (exercici_id, estat) values ('91/92', 'bloquejat') returning 1", espera: 'error' },
  { nom: 'pressupost: tresoreria el bloqueja', com: T, sql: "insert into public.pressupost_estat (exercici_id, estat) values ('91/92', 'bloquejat') returning 1", espera: { files: 1 } },
  { nom: 'pressupost: desbloquejar demana motiu', com: T, sql: "insert into public.pressupost_historial (exercici_id, accio) values ('91/92', 'desbloquejat') returning 1", espera: 'error' },
  { nom: 'pressupost: l\'historial no s\'esborra', com: T, sql: "delete from public.pressupost_historial where id = 't_ph1' returning 1", espera: { files: 0 } },

  // ---------------------------------------------------------------- Configuració, usuaris i rols
  { nom: 'config: responsable d\'àrea no toca àrees', com: A, sql: "update public.arees set nom = 'x' where id = '91' returning 1", espera: { files: 0 } },
  { nom: 'config: tresoreria toca àrees', com: T, sql: "update public.arees set nom = 'Prova Festes' where id = '91' returning 1", espera: { files: 1 } },
  { nom: 'config: l\'exercici actiu ha d\'existir', com: T, sql: "update public.config set valor = '\"99/00\"' where clau = 'exercici_actiu' returning 1", espera: 'error' },
  { nom: 'config: no s\'elimina l\'exercici actiu', com: T, sql: "delete from public.exercicis where id = '91/92' returning 1", espera: { files: 0 } },
  { nom: 'config: delegat no crea exercicis', com: D, sql: "insert into public.exercicis (id, data_inici, data_fi) values ('93/94', '2093-04-01', '2094-03-31') returning 1", espera: 'error' },
  { nom: 'config: tresoreria crea exercicis', com: T, sql: "insert into public.exercicis (id, data_inici, data_fi) values ('93/94', '2093-04-01', '2094-03-31') returning 1", espera: { files: 1 } },
  { nom: 'config: dos exercicis no es poden solapar', com: T, sql: "insert into public.exercicis (id, data_inici, data_fi) values ('93/94', '2092-06-01', '2093-05-31') returning 1", espera: 'error' },
  { nom: 'usuaris: tresoreria no dona d\'alta persones (com ara)', com: T, sql: "insert into public.usuaris (nom, email) values ('Nova', 'nova@prova.test') returning 1", espera: 'error' },
  { nom: 'usuaris: president dona d\'alta persones', com: P, sql: "insert into public.usuaris (nom, email) values ('Nova', 'nova@prova.test') returning 1", espera: { files: 1 } },
  { nom: 'usuaris: l\'email es desa en minúscules', com: P, sql: "insert into public.usuaris (id, nom, email) values ('t_nova', 'Nova', 'Nova.Persona@Prova.TEST') returning 1", verifica: "select email from public.usuaris where id = 't_nova'", espera: { valor: 'nova.persona@prova.test' } },
  { nom: 'usuaris: l\'email no es pot canviar', com: P, sql: "update public.usuaris set email = 'altre@prova.test' where id = 't_delegat' returning 1", espera: { error: 'no es pot canviar' } },
  { nom: 'usuaris: president assigna rols', com: P, sql: "insert into public.usuari_rols (usuari_id, rol_id) values ('t_sensrol', 'delegat') returning 1", espera: { files: 1 } },
  { nom: 'usuaris: no es pot deixar la falla sense ningú que gestione usuaris', com: P, sql: "update public.rol_moduls set nivell = 'lectura' where modul_id = 'usuaris' returning 1", espera: { error: 'sense ningú que puga gestionar usuaris' } },
  { nom: 'rols: no es pot deixar la falla sense ningú que dissenye rols', com: P, sql: "update public.rol_moduls set nivell = 'lectura' where modul_id = 'rols' returning 1", espera: { error: 'sense ningú que puga dissenyar rols' } },
  { nom: 'rols: es pot llevar a Tresoreria si President el conserva (D-041)', com: P, sql: "update public.rol_moduls set nivell = 'lectura' where rol_id = 'treasury' and modul_id = 'rols' returning 1", espera: { files: 1 } },
  { nom: 'rols: els rols de sistema no s\'esborren', com: T, sql: "delete from public.rols where id = 'board' returning 1", espera: { files: 0 } },
  { nom: 'rols: un mòdul de només lectura no admet edició', com: T, sql: "insert into public.rol_moduls (rol_id, modul_id, nivell) values ('board', 'flux', 'edicio') on conflict (rol_id, modul_id) do update set nivell = 'edicio' returning 1", espera: { error: 'només admet lectura' } },
  { nom: 'rols: delegat no es dona permisos', com: D, sql: "update public.rol_moduls set nivell = 'edicio' where rol_id = 'delegat' and modul_id = 'historial' returning 1", espera: { files: 0 } },
  { nom: 'directiva: tresoreria assigna responsables', com: T, sql: "insert into public.directiva (exercici_id, usuari_id, delegacio_id) values ('91/92', 't_delegat2', '9201') returning 1", espera: { files: 1 } },
  { nom: 'directiva: responsable d\'àrea no assigna (no hi arriba a l\'app actual)', com: A, sql: "insert into public.directiva (exercici_id, usuari_id, delegacio_id) values ('91/92', 't_delegat2', '9101') returning 1", espera: 'error' },
  { nom: 'directiva: un canvi de directiva canvia l\'abast a l\'acte', com: D2, prep: "insert into public.directiva (exercici_id, usuari_id, delegacio_id) values ('91/92', 't_delegat2', '9201')", sql: mov({ area_id: '92', delegacio_id: '9201' }), espera: { files: 1 } },

  // ---------------------------------------------------------------- Diversos rols (val el permís més alt)
  { nom: 'multirol: registra a la seua delegació (rol delegat)', com: M, sql: mov({ area_id: '92', delegacio_id: '9201' }), espera: { files: 1 } },
  { nom: 'multirol: tanca qualsevol caixa (rol junta, abast tot)', com: M, sql: "update public.caixes set estat = 'tancada' where id = 't_cx1' returning 1", espera: { files: 1 } },
  { nom: 'multirol: no registra fora de la seua delegació', com: M, sql: mov(), espera: 'error' },

  // ---------------------------------------------------------------- Clau de servei (script de migració de la Fase 5)
  { nom: 'servei: service_role llig totes les dades', com: 'service_role', sql: comptaMov, espera: { valor: 9 } },
  { nom: 'servei: service_role carrega un moviment amb el creador original', com: 'service_role', sql: mov({ id: 't_nou', creat_per: 't_area', area_id: '92', delegacio_id: '9201' }), verifica: "select creat_per from public.moviments where id = 't_nou'", espera: { valor: 't_area' } },
  { nom: 'servei: service_role carrega dades d\'un exercici tancat (migració 1:1)', com: 'service_role', sql: mov({ data: '2090-05-01', creat_per: 't_delegat' }), espera: { files: 1 } },
  { nom: 'servei: la càrrega de service_role també queda al registre', com: 'service_role', sql: mov({ id: 't_nou', creat_per: 't_area' }), verifica: "select count(*) from public.audit_log where taula = 'moviments' and fila_id = 't_nou'", espera: { valor: 1 } },
  { nom: 'servei: service_role no escriu al registre', com: 'service_role', sql: "insert into public.audit_log (taula, fila_id, accio) values ('x', 'x', 'insert') returning 1", espera: 'error' },
  { nom: 'servei: service_role no modifica el registre', com: 'service_role', sql: 'update public.audit_log set email = null returning 1', espera: 'error' },

  // ---------------------------------------------------------------- Registre d'activitat (D-024)
  { nom: 'registre: guarda qui ha fet l\'alta', com: D, sql: mov({ id: 't_nou' }), verifica: "select usuari_id || ' · ' || email || ' · ' || accio from public.audit_log where taula = 'moviments' and fila_id = 't_nou'", espera: { valor: 't_delegat · delegat@prova.test · insert' } },
  { nom: 'registre: guarda el valor d\'abans i el de després', com: D, sql: "update public.moviments set concepte = 'Canviat' where id = 't_m_del' returning 1", verifica: "select (abans ->> 'concepte') || ' → ' || (despres ->> 'concepte') from public.audit_log where taula = 'moviments' and fila_id = 't_m_del' and accio = 'update'", espera: { valor: 'Prova del delegat → Canviat' } },
  { nom: 'registre: les claus compostes es guarden', com: P, sql: "insert into public.usuari_rols (usuari_id, rol_id) values ('t_sensrol', 'delegat') returning 1", verifica: "select fila_id from public.audit_log where taula = 'usuari_rols' and accio = 'insert' and fila_id like 't\\_sensrol%'", espera: { valor: 't_sensrol|delegat' } },
  { nom: 'registre: un usuari no hi escriu', com: T, sql: "insert into public.audit_log (taula, fila_id, accio) values ('x', 'x', 'insert') returning 1", espera: 'error' },
  { nom: 'registre: un usuari no el modifica', com: T, sql: 'update public.audit_log set email = null returning 1', espera: 'error' },
  { nom: 'registre: ni el servei el modifica', com: 'servei', sql: 'update public.audit_log set email = null returning 1', espera: { error: 'no es pot modificar' } },
  { nom: 'registre: ni el servei l\'esborra', com: 'servei', sql: 'delete from public.audit_log returning 1', espera: { error: 'no es pot modificar' } },

  // ---------------------------------------------------------------- Revisió final de seguretat (2026-10-14, MODEL_DADES §9.7)
  // R1 · Privilegis de base de dades
  { nom: 'R1 privilegis: authenticated només pot llegir, afegir, modificar i esborrar (cap TRUNCATE, TRIGGER, REFERENCES)', com: 'servei', sql: "select coalesce(string_agg(distinct privilege_type, ', '), 'cap') from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')", espera: { valor: 'cap' } },
  { nom: 'R1 privilegis: ni anon ni authenticated toquen el comptador del registre', com: 'servei', sql: "select coalesce(string_agg(c.relname, ', '), 'cap') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('authenticated', c.oid, 'USAGE,UPDATE,SELECT') or has_sequence_privilege('anon', c.oid, 'USAGE,UPDATE,SELECT'))", espera: { valor: 'cap' } },
  // R2 · Un JWT sense el claim `role` no és una connexió de servei
  { nom: 'R2 identitat: un JWT sense rol no salta les regles d\'usuari (columnes)', com: D, jwt: { email: D }, sql: "update public.moviments set delegacio_id = '9102' where id = 't_m_del' returning 1", espera: 'error' },
  { nom: 'R2 identitat: un JWT sense rol no salta el bloqueig de l\'exercici tancat', com: D, jwt: { email: D }, sql: "update public.moviments set concepte = 'x' where id = 't_m_ant' returning 1", espera: 'error' },
  // R3 · Qui no té cap rol no és ningú, tampoc per als seus registres antics
  { nom: 'R3 membres: un usuari sense rol no crea avançaments lligats a moviments seus antics', com: S, sql: fons({ tipus: 'avancament', delegat_id: 't_sensrol', moviment_id: 't_m_sensrol' }), espera: 'error' },
  { nom: 'R3 membres: un usuari sense rol no adjunta justificants', com: S, sql: "insert into public.justificants (moviment_id, storage_path) values ('t_m_sensrol', '91-92/t_m_sensrol.jpg') returning 1", espera: 'error' },
  { nom: 'R3 membres: un usuari sense rol no modifica els seus moviments antics', com: S, sql: "update public.moviments set concepte = 'x' where id = 't_m_sensrol' returning 1", espera: { files: 0 } },
  // R4 · Els moviments i el canvi d'una caixa no s'esborren d'un en un sense r1 (eliminar la caixa sencera sí)
  { nom: 'R4 caixa: delegat no esborra d\'un en un els moviments de caixa d\'un altre', com: D, sql: "delete from public.moviments where id = 't_m_cx1' returning 1", espera: { files: 0 } },
  { nom: 'R4 caixa: delegat no esborra el canvi que va lliurar Tresoreria', com: D, sql: "delete from public.caixa_canvis where id = 't_cc1' returning 1", espera: { files: 0 } },
  // R5 · Fons: una despesa amb fons o un avançament no pot inflar el que la falla deu
  { nom: 'R5 fons: un sol registre de fons per moviment', com: D, sql: fons({ tipus: 'despesa_fons', moviment_id: 't_m_fons' }), espera: 'error' },
  { nom: 'R5 fons: l\'import d\'una despesa amb fons és sempre el del moviment', com: D, sql: "update public.fons set import = 999 where id = 't_f_desp' returning 1", verifica: "select import::text from public.fons where id = 't_f_desp'", espera: { valor: '20.00' } },
  { nom: 'R5 fons: un avançament no val més que la seua despesa', com: D, sql: [mov({ id: 't_nou', import: 5, pagament_efectiu: 'avancament' }), fons({ tipus: 'avancament', moviment_id: 't_nou', import: 500 })], verifica: "select import::text from public.fons where moviment_id = 't_nou'", espera: { valor: '5.00' } },
  { nom: 'R5 fons: en canviar l\'import de la despesa canvia el del fons', com: D, sql: "update public.moviments set import = 25 where id = 't_m_fons' returning 1", verifica: "select import::text from public.fons where id = 't_f_desp'", espera: { valor: '25.00' } },
  { nom: 'R5 fons: un avançament va lligat a una despesa pagada amb avançament', com: D, sql: [mov({ id: 't_nou', pagament_efectiu: 'caixa' }), fons({ tipus: 'avancament', moviment_id: 't_nou' })], espera: 'error' },
  { nom: 'R5 fons: un lliurament no va lligat a cap moviment', com: T, sql: fons({ moviment_id: 't_m_tres' }), espera: 'error' },
  // R6 · Ningú no fica registres dins d'una operació d'un altre
  { nom: 'R6 operacions: delegat no fica un moviment dins d\'una importació de Tresoreria', com: D, sql: mov({ operacio_id: 't_op1' }), espera: 'error' },
  { nom: 'R6 operacions: dins d\'una operació pròpia sí', com: D, sql: ["insert into public.operacions (id, tipus) values ('t_op_d', 'moviment_manual') returning 1", mov({ operacio_id: 't_op_d' })], espera: { files: 1 } },
  // R7 · L'event ha de ser de la delegació (moviments i pressupost) i el pressupost, de l'exercici actiu
  { nom: 'R7 moviment: l\'event ha de ser de la mateixa delegació', com: D, sql: mov({ event_id: 't_ev2' }), espera: 'error' },
  { nom: 'R7 moviment: un event de la seua delegació sí', com: D, sql: mov({ event_id: 't_ev1' }), espera: { files: 1 } },
  { nom: 'R7 pressupost: l\'event de la línia ha de ser de la seua delegació', com: D, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, event_id, tipus, import) values ('91/92', '9101', 't_ev2', 'event', 100) returning 1", espera: 'error' },
  { nom: 'R7 pressupost: sense abast "tot", només a l\'exercici actiu', com: D, sql: "insert into public.pressupost_linies (exercici_id, delegacio_id, concepte, tipus, import) values ('92/93', '9101', 'Cadires', 'concepte', 100) returning 1", espera: 'error' },
  // R8 · Camps que no posa l'usuari
  { nom: 'R8 moviment: l\'empremta bancària no la posa l\'usuari', com: D, sql: mov({ id: 't_nou', empremta: 'falsa' }), verifica: "select coalesce(empremta, 'cap') from public.moviments where id = 't_nou'", espera: { valor: 'cap' } },
  { nom: 'R8 moviment: no s\'accepta un responsable extern des de l\'app', com: D, sql: mov({ id: 't_nou', responsable_extern: 'Algú' }), verifica: "select coalesce(responsable_extern, 'cap') || ' · ' || coalesce(responsable_id, 'cap') from public.moviments where id = 't_nou'", espera: { valor: 'cap · t_delegat' } },
  // R9 · Els moviments d'una caixa d'event són d'efectiu
  { nom: 'R9 caixa: una retirada de caixa no pot anar al banc', com: D, sql: mov({ font: 'retirada_caixa', tipus: 'ingres', caixa_id: 't_cx1', compte_id: 't_banc' }), espera: 'error' },
  // R10 · L'enllaç antic de Drive només el porta la migració
  { nom: 'R10 justificant: un usuari no hi posa enllaços externs', com: D, sql: "insert into public.justificants (moviment_id, storage_path, url_drive_original) values ('t_m_del', '91-92/t_m_del.jpg', 'https://exemple.test/x') returning 1", espera: 'error' },
  // R11 · Dades que no canvien
  { nom: 'R11 config: les dates d\'un exercici no es canvien (D-026)', com: T, sql: "update public.exercicis set data_fi = '2093-03-30' where id = '92/93' returning 1", espera: 'error' },
  { nom: 'R11 rols: un rol de sistema no deixa de ser-ho', com: T, sql: "update public.rols set de_sistema = false where id = 'board' returning 1", espera: 'error' },

  // ---------------------------------------------------------------- Fase 2 · hook "Before User Created" (D-046)
  { nom: 'hook alta: un membre actiu amb rol pot crear-se l\'usuari', com: 'servei', sql: hook(P), espera: { valor: '{}' } },
  { nom: 'hook alta: el correu es compara sense majúscules ni espais', com: 'servei', sql: hook('  President@Prova.TEST '), espera: { valor: '{}' } },
  { nom: 'hook alta: un membre amb diversos rols també', com: 'servei', sql: hook(M), espera: { valor: '{}' } },
  { nom: 'hook alta: un correu desconegut es rebutja', com: 'servei', sql: hookErr(N), espera: { valor: '403' } },
  { nom: 'hook alta: un membre inactiu es rebutja', com: 'servei', sql: hookErr(I), espera: { valor: '403' } },
  { nom: 'hook alta: una persona sense cap rol es rebutja', com: 'servei', sql: hookErr(S), espera: { valor: '403' } },
  { nom: 'hook alta: una petició sense correu es rebutja', com: 'servei', sql: "select app.hook_alta_usuari('{\"user\":{}}'::jsonb) -> 'error' ->> 'http_code'", espera: { valor: '403' } },
  { nom: 'hook alta: un correu buit es rebutja', com: 'servei', sql: hookErr(''), espera: { valor: '403' } },
  { nom: 'hook alta: el rebuig porta un missatge', com: 'servei', sql: "select app.hook_alta_usuari('{\"user\":{\"email\":\"" + N + "\"}}'::jsonb) -> 'error' ->> 'message'", espera: { valor: 'Aquest correu no és de cap membre de la falla.' } },
  { nom: 'hook alta: un rol que s\'esborra a mitges no deixa passar (sense usuari_rols)', com: 'servei', prep: "delete from public.usuari_rols where usuari_id = 't_president'", sql: hookErr(P), espera: { valor: '403' } },
  { nom: 'hook alta: només el rol d\'Auth pot executar-lo', com: 'servei', sql: "select has_function_privilege('supabase_auth_admin', 'app.hook_alta_usuari(jsonb)', 'execute') and has_schema_privilege('supabase_auth_admin', 'app', 'usage') and not has_function_privilege('anon', 'app.hook_alta_usuari(jsonb)', 'execute') and not has_function_privilege('authenticated', 'app.hook_alta_usuari(jsonb)', 'execute') and not has_function_privilege('public', 'app.hook_alta_usuari(jsonb)', 'execute')", espera: { valor: 'true' } },
  { nom: 'hook alta: un membre no pot provar correus des de l\'API', com: D, sql: hookErr(N), espera: 'error' },
];
