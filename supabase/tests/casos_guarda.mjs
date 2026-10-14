// Casos de prova de public.guarda_canvis (Fase 3, tros 2, D-048): la funció amb què l'app desa canvis per diferències.
// Mateix format que casos_rls.mjs (vegeu la capçalera). Dades: dades_prova.sql. Provador: tools/supabase_tests.mjs.
//
// Una operació és { t: taula, a: 'i'|'u'|'d'|'s', k: {identificació}, f: {columnes} }:
//   i  alta (f)            u  canvi de les columnes de f a la fila que casa amb k
//   d  esborrat (k)        s  alta o canvi (si la fila ja hi és la canvia, si no la crea amb k + f)
// k s'aplica amb IS NOT DISTINCT FROM, de manera que pot ser la clau primària o una clau natural.
//
// El primer bloc és el que demostra el forat: una funció ingènua (un UPDATE o un DELETE sense mirar quantes files toca)
// donaria per bo en silenci un canvi que RLS ha filtrat, perquè RLS no dona error en un UPDATE o un DELETE.

const P = 'president@prova.test';
const T = 'treasury@prova.test';
const A = 'area@prova.test';
const D = 'delegat@prova.test';
const D2 = 'delegat2@prova.test';
const B = 'board@prova.test';
const L = 'lectura@prova.test';
const S = 'sensrol@prova.test';
const N = 'desconegut@prova.test';

const q = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
// La cridada tal com la fa l'app: select public.guarda_canvis(<jsonb>, <motiu>)
const g = (ops, motiu = null) => `select public.guarda_canvis($j$${JSON.stringify(ops)}$j$::jsonb${motiu ? ', ' + q(motiu) : ''})::text`;
// El mateix, però sense que l'error trenque el cas: serveix per comprovar què ha quedat després d'una cridada que falla.
const gSenseError = (ops, motiu = null) => `do $d$ begin perform public.guarda_canvis($j$${JSON.stringify(ops)}$j$::jsonb${motiu ? ', ' + q(motiu) : ''}); exception when others then null; end $d$`;

const altaMov = (id, extra = {}) => ({
  t: 'moviments', a: 'i',
  k: { id },
  f: { id, data: '2091-05-10', tipus: 'despesa', import: 5, compte_id: 't_efectiu', area_id: '91', delegacio_id: '9101', font: 'manual', concepte: 'Prova', ...extra },
});

export const casos = [
  // ---------------------------------------------------------------- El forat: RLS filtra en silenci
  { nom: 'guarda: un canvi que RLS filtra no es dona per bo en silenci (update d\'un moviment aliè)', com: D, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_area' }, f: { concepte: 'Robat' } }]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: un esborrat que RLS filtra no es dona per bo en silenci (moviment aliè)', com: D, sql: g([{ t: 'moviments', a: 'd', k: { id: 't_m_area' } }]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: un canvi filtrat no deixa res fet (el moviment aliè continua igual)', com: D, sql: [gSenseError([{ t: 'moviments', a: 'u', k: { id: 't_m_area' }, f: { concepte: 'Robat' } }]), "select concepte from public.moviments where id = 't_m_area'"], espera: { valor: 'Prova de l\'àrea' } },
  { nom: 'guarda: un canvi a la fila d\'un altre dins d\'un lot desfà tot el lot', com: D, sql: [gSenseError([altaMov('t_g1'), { t: 'moviments', a: 'u', k: { id: 't_m_area' }, f: { concepte: 'Robat' } }]), "select count(*) from public.moviments where id = 't_g1'"], espera: { valor: 0 } },
  { nom: 'guarda: un esborrat filtrat dins d\'un lot desfà tot el lot', com: D, sql: [gSenseError([{ t: 'moviments', a: 'd', k: { id: 't_m_del' } }, { t: 'moviments', a: 'd', k: { id: 't_m_area' } }]), "select count(*) from public.moviments where id = 't_m_del'"], espera: { valor: 1 } },

  // ---------------------------------------------------------------- La funció no és una porta al costat de RLS
  { nom: 'guarda: sense sessió (anon) no es pot executar', com: 'anon', sql: g([altaMov('t_g1')]), espera: 'error' },
  { nom: 'guarda: qui no és membre no escriu', com: N, sql: g([altaMov('t_g1')]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: qui no té cap rol no escriu', com: S, sql: g([altaMov('t_g1')]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: rol només lectura no escriu', com: L, sql: g([altaMov('t_g1')]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: s\'executa amb els permisos de qui crida (security invoker), no amb els del propietari', com: 'servei', sql: "select p.prosecdef::text || ' · ' || coalesce(array_to_string(p.proconfig, ','), 'sense search_path') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'guarda_canvis'", espera: { valor: 'false · search_path=""' } },
  { nom: 'guarda: només authenticated l\'executa (ni anon ni public)', com: 'servei', sql: "select has_function_privilege('authenticated', 'public.guarda_canvis(jsonb,text)', 'execute')::text || has_function_privilege('anon', 'public.guarda_canvis(jsonb,text)', 'execute')::text || has_function_privilege('public', 'public.guarda_canvis(jsonb,text)', 'execute')::text", espera: { valor: 'truefalsefalse' } },
  { nom: 'guarda: no toca taules que no són de dades (audit_log)', com: P, sql: g([{ t: 'audit_log', a: 'i', k: {}, f: { taula: 'x', fila_id: 'x', accio: 'insert' } }]), espera: { error: 'no es pot desar' } },
  { nom: 'guarda: no toca el catàleg de mòduls', com: P, sql: g([{ t: 'moduls', a: 'u', k: { id: 'dashboard' }, f: { nom: 'x' } }]), espera: { error: 'no es pot desar' } },
  { nom: 'guarda: no toca taules d\'altres esquemes', com: P, sql: g([{ t: 'auth.users', a: 'd', k: { id: '00000000-0000-4000-8000-000000000000' } }]), espera: { error: 'no es pot desar' } },
  { nom: 'guarda: una columna que no existeix es rebutja', com: T, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_del' }, f: { no_existeix: 1 } }]), espera: { error: 'no té la columna' } },
  { nom: 'guarda: el nom de la taula no pot dur injecció de SQL', com: P, sql: g([{ t: 'moviments; drop table public.moviments', a: 'd', k: { id: 'x' } }]), espera: { error: 'no es pot desar' } },
  { nom: 'guarda: el nom d\'una columna no pot dur injecció de SQL', com: T, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_del' }, f: { 'concepte = 1; drop table public.moviments; --': 'x' } }]), espera: { error: 'no té la columna' } },
  { nom: 'guarda: la petició ha de ser una llista', com: T, sql: "select public.guarda_canvis('{\"t\":\"moviments\"}'::jsonb)", espera: { error: 'ha de ser una llista' } },
  { nom: 'guarda: una operació desconeguda es rebutja', com: T, sql: g([{ t: 'moviments', a: 'x', k: { id: 't_m_del' } }]), espera: { error: 'Operació desconeguda' } },
  { nom: 'guarda: sense identificació no es canvia ni s\'esborra (evita tocar totes les files)', com: T, sql: g([{ t: 'moviments', a: 'u', k: {}, f: { concepte: 'x' } }]), espera: { error: 'identificar' } },

  // ---------------------------------------------------------------- Altes, canvis i esborrats que sí que es poden fer
  { nom: 'guarda: el delegat dona d\'alta un moviment a la seua delegació', com: D, sql: g([altaMov('t_g1')]), verifica: "select concepte from public.moviments where id = 't_g1'", espera: { valor: 'Prova' } },
  { nom: 'guarda: l\'alta porta l\'autoria del servidor (creat_per) i la conciliació calculada', com: D, sql: g([altaMov('t_g1', { creat_per: 't_area', conciliacio: 'conciliat' })]), verifica: "select creat_per || ' · ' || conciliacio from public.moviments where id = 't_g1'", espera: { valor: 't_delegat · no_aplica' } },
  { nom: 'guarda: l\'exercici ve de la data encara que el client en diga un altre', com: D, sql: g([altaMov('t_g1', { exercici_id: '92/93' })]), verifica: "select exercici_id from public.moviments where id = 't_g1'", espera: { valor: '91/92' } },
  { nom: 'guarda: el delegat no dona d\'alta fora de la seua delegació', com: D, sql: g([altaMov('t_g1', { delegacio_id: '9102' })]), espera: { error: 'row-level security' } },
  { nom: 'guarda: el delegat canvia el concepte i l\'import del seu moviment', com: D, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_del' }, f: { concepte: 'Nou', import: 12.5 } }]), verifica: "select concepte || ' · ' || import::text from public.moviments where id = 't_m_del'", espera: { valor: 'Nou · 12.50' } },
  { nom: 'guarda: el delegat no canvia l\'àrea del seu moviment', com: D, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_del' }, f: { delegacio_id: '9102' } }]), espera: { error: 'Només pots canviar el concepte' } },
  { nom: 'guarda: tresoreria canvia l\'àrea i la delegació de qualsevol moviment', com: T, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_del' }, f: { area_id: '92', delegacio_id: '9201' } }]), verifica: "select delegacio_id from public.moviments where id = 't_m_del'", espera: { valor: '9201' } },
  { nom: 'guarda: el delegat esborra el seu moviment', com: D, sql: g([{ t: 'moviments', a: 'd', k: { id: 't_m_del' } }]), verifica: "select count(*) from public.moviments where id = 't_m_del'", espera: { valor: 0 } },
  { nom: 'guarda: esborrar un moviment ja esborrat no és un error (idempotent)', com: D, sql: g([{ t: 'moviments', a: 'd', k: { id: 't_no_hi_es' } }]), espera: { files: 1 } },
  { nom: 'guarda: canviar una fila que ja no existeix és un error (algú l\'ha esborrada)', com: T, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_no_hi_es' }, f: { concepte: 'x' } }]), espera: { error: 'ja no existeix' } },
  { nom: 'guarda: torna el nombre d\'operacions fetes', com: T, sql: g([altaMov('t_g1', { area_id: '92', delegacio_id: '9201' }), { t: 'moviments', a: 'd', k: { id: 't_m_tres' } }]), espera: { valor: '{"operacions": 2}' } },
  { nom: 'guarda: una llista buida no fa res i no falla', com: T, sql: g([]), espera: { valor: '{"operacions": 0}' } },

  // ---------------------------------------------------------------- Tot o res i ordre
  { nom: 'guarda: si una operació falla no en queda cap (atomicitat)', com: T, sql: [gSenseError([altaMov('t_g1', { area_id: '92', delegacio_id: '9201' }), altaMov('t_g2', { import: 0, area_id: '92', delegacio_id: '9201' })]), "select count(*) from public.moviments where id in ('t_g1', 't_g2')"], espera: { valor: 0 } },
  { nom: 'guarda: executa en l\'ordre indicat (la caixa abans que el seu canvi)', com: T, sql: g([
    { t: 'caixes', a: 'i', k: { id: 't_cx9' }, f: { id: 't_cx9', event_id: 't_ev3', data: '2091-07-01' } },
    { t: 'caixa_canvis', a: 'i', k: { id: 't_cc9' }, f: { id: 't_cc9', caixa_id: 't_cx9', data: '2091-07-01', tipus: 'lliurament', import: 50 } },
  ]), verifica: "select count(*) from public.caixa_canvis where id = 't_cc9'", espera: { valor: 1 } },
  { nom: 'guarda: en l\'ordre equivocat falla (el canvi abans que la caixa)', com: T, sql: g([
    { t: 'caixa_canvis', a: 'i', k: { id: 't_cc9' }, f: { id: 't_cc9', caixa_id: 't_cx9', data: '2091-07-01', tipus: 'lliurament', import: 50 } },
    { t: 'caixes', a: 'i', k: { id: 't_cx9' }, f: { id: 't_cx9', event_id: 't_ev3', data: '2091-07-01' } },
  ]), espera: { error: 'caixa_canvis' } },
  { nom: 'guarda: tancar una caixa (devolució del canvi, moviments i estat) en un sol lot', com: T, sql: g([
    { t: 'moviments', a: 'i', k: { id: 't_g1' }, f: { id: 't_g1', data: '2091-06-01', tipus: 'ingres', import: 30, compte_id: 't_efectiu', area_id: '91', delegacio_id: '9101', event_id: 't_ev1', caixa_id: 't_cx1', font: 'tancament_caixa', concepte: 'Vendes efectiu' } },
    { t: 'caixa_canvis', a: 'i', k: { id: 't_g2' }, f: { id: 't_g2', caixa_id: 't_cx1', data: '2091-06-01', tipus: 'devolucio', import: 100 } },
    { t: 'caixes', a: 'u', k: { id: 't_cx1' }, f: { estat: 'tancada', efectiu: 130, tpv: 0, pagaments: 0 } },
  ]), verifica: "select estat || ' · ' || (select count(*) from public.moviments where id = 't_g1') || ' · ' || (select count(*) from public.caixa_canvis where id = 't_g2') from public.caixes where id = 't_cx1'", espera: { valor: 'tancada · 1 · 1' } },

  // ---------------------------------------------------------------- Despesa amb fons (R5) i cascades
  { nom: 'guarda: una despesa amb fons i el seu registre de fons, en un sol lot', com: D, sql: g([
    altaMov('t_g1', { import: 7, pagament_efectiu: 'fons_lliurats' }),
    { t: 'fons', a: 'i', k: { id: 't_g2' }, f: { id: 't_g2', data: '2091-05-10', tipus: 'despesa_fons', delegat_id: 't_delegat', import: 7, moviment_id: 't_g1' } },
  ]), verifica: "select import::text from public.fons where id = 't_g2'", espera: { valor: '7.00' } },
  { nom: 'guarda: el registre de fons ve després de la despesa (en l\'ordre contrari falla)', com: D, sql: g([
    { t: 'fons', a: 'i', k: { id: 't_g2' }, f: { id: 't_g2', data: '2091-05-10', tipus: 'despesa_fons', delegat_id: 't_delegat', import: 7, moviment_id: 't_g1' } },
    altaMov('t_g1', { import: 7, pagament_efectiu: 'fons_lliurats' }),
  ]), espera: { error: 'fons' } },
  { nom: 'guarda: esborrar la despesa amb fons s\'emporta el registre de fons (cascada)', com: D, sql: g([{ t: 'moviments', a: 'd', k: { id: 't_m_fons' } }]), verifica: "select count(*) from public.fons where id = 't_f_desp'", espera: { valor: 0 } },
  { nom: 'guarda: el delegat no esborra directament el registre de fons de la seua despesa', com: D, sql: g([{ t: 'fons', a: 'd', k: { id: 't_f_desp' } }]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: el canvi d\'import d\'una despesa es porta el del fons (el manté la base de dades)', com: D, sql: g([{ t: 'moviments', a: 'u', k: { id: 't_m_fons' }, f: { import: 33 } }]), verifica: "select import::text from public.fons where id = 't_f_desp'", espera: { valor: '33.00' } },
  { nom: 'guarda: eliminar una caixa oberta s\'emporta els seus moviments i el seu canvi', com: T, sql: g([{ t: 'caixes', a: 'd', k: { id: 't_cx1' } }]), verifica: "select (select count(*) from public.moviments where caixa_id = 't_cx1') + (select count(*) from public.caixa_canvis where caixa_id = 't_cx1')", espera: { valor: 0 } },

  // ---------------------------------------------------------------- Exercici tancat (D-029): el motiu viatja amb el lot
  { nom: 'guarda: escriure en un exercici tancat demana motiu', com: T, sql: g([altaMov('t_g1', { data: '2090-05-01' })]), espera: { error: 'cal indicar-ne el motiu' } },
  { nom: 'guarda: amb motiu, tresoreria escriu en un exercici tancat i queda marcat', com: T, sql: g([altaMov('t_g1', { data: '2090-05-01' })], 'Factura arribada tard'), verifica: "select imputacio_excepcional::text || ' · ' || motiu_imputacio from public.moviments where id = 't_g1'", espera: { valor: 'true · Factura arribada tard' } },
  { nom: 'guarda: el motiu queda al registre d\'activitat', com: T, sql: g([altaMov('t_g1', { data: '2090-05-01' })], 'Factura arribada tard'), verifica: "select motiu from public.audit_log where taula = 'moviments' and fila_id = 't_g1'", espera: { valor: 'Factura arribada tard' } },
  { nom: 'guarda: el delegat no escriu en un exercici tancat ni amb motiu', com: D, sql: g([altaMov('t_g1', { data: '2090-05-01' })], 'Vull'), espera: { error: 'està tancat' } },
  { nom: 'guarda: esborrar en un exercici tancat també demana motiu', com: T, sql: g([{ t: 'moviments', a: 'd', k: { id: 't_m_ant' } }]), espera: { error: 'cal indicar-ne el motiu' } },
  { nom: 'guarda: el motiu d\'un lot no passa al següent (cada cridada el torna a posar)', com: T, sql: [g([altaMov('t_g1', { area_id: '92', delegacio_id: '9201' })], 'Motiu'), g([altaMov('t_g2', { data: '2090-05-01' })])], espera: { error: 'cal indicar-ne el motiu' } },
  { nom: 'guarda: tancar l\'exercici (configuració) i reobrir-lo', com: T, sql: g([{ t: 'exercicis', a: 'u', k: { id: '92/93' }, f: { tancat: true, data_tancament: '2093-03-31' } }]), verifica: "select tancat::text from public.exercicis where id = '92/93'", espera: { valor: 'true' } },

  // ---------------------------------------------------------------- Configuració i claus naturals
  { nom: 'guarda: alta o canvi (s) crea la fila si no hi és (bloqueig de pressupost)', com: T, sql: g([{ t: 'pressupost_estat', a: 's', k: { exercici_id: '91/92' }, f: { estat: 'bloquejat' } }]), verifica: "select estat from public.pressupost_estat where exercici_id = '91/92'", espera: { valor: 'bloquejat' } },
  { nom: 'guarda: alta o canvi (s) canvia la fila si ja hi és', com: T, prep: "insert into public.pressupost_estat (exercici_id, estat) values ('91/92', 'bloquejat')", sql: g([{ t: 'pressupost_estat', a: 's', k: { exercici_id: '91/92' }, f: { estat: 'obert' } }]), verifica: "select estat from public.pressupost_estat where exercici_id = '91/92'", espera: { valor: 'obert' } },
  { nom: 'guarda: el delegat no bloqueja el pressupost', com: D, sql: g([{ t: 'pressupost_estat', a: 's', k: { exercici_id: '91/92' }, f: { estat: 'bloquejat' } }]), espera: { error: 'row-level security' } },
  { nom: 'guarda: un canvi a una línia amb el pressupost bloquejat no es dona per bo', com: T, prep: "insert into public.pressupost_estat (exercici_id, estat) values ('91/92', 'bloquejat')", sql: g([{ t: 'pressupost_linies', a: 'u', k: { id: 't_p1' }, f: { import: 600 } }]), espera: { error: 'No tens permís' } },
  { nom: 'guarda: una línia de pressupost es troba per la clau natural (exercici, delegació, event, concepte)', com: T, sql: g([{ t: 'pressupost_linies', a: 'u', k: { exercici_id: '91/92', delegacio_id: '9101', event_id: 't_ev1', concepte: null }, f: { import: 650 } }]), verifica: "select import::text from public.pressupost_linies where id = 't_p1'", espera: { valor: '650.00' } },
  { nom: 'guarda: una línia nova de pressupost sense id rep un id del servidor', com: D, sql: g([{ t: 'pressupost_linies', a: 'i', k: { exercici_id: '91/92', delegacio_id: '9101', event_id: null, concepte: 'Cadires' }, f: { exercici_id: '91/92', delegacio_id: '9101', concepte: 'Cadires', tipus: 'concepte', import: 100 } }]), verifica: "select length(id) > 10 from public.pressupost_linies where concepte = 'Cadires'", espera: { valor: 'true' } },
  { nom: 'guarda: una regla d\'importació amb llista de patrons', com: T, sql: g([{ t: 'regles_importacio', a: 'i', k: { id: 't_r1' }, f: { id: 't_r1', compte_id: 't_banc', patrons: ['HIDRAQUA', 'AIGUA'], tipus: 'assignar', sentit: 'despesa', area_id: '92', delegacio_id: '9201', concepte: 'Aigua', prioritat: 1, activa: true } }]), verifica: "select array_to_string(patrons, '+') from public.regles_importacio where id = 't_r1'", espera: { valor: 'HIDRAQUA+AIGUA' } },
  { nom: 'guarda: la configuració de justificants (jsonb)', com: T, sql: g([{ t: 'config', a: 's', k: { clau: 'justificant' }, f: { valor: { mode: 'import', llindar: 50 } } }]), verifica: "select valor ->> 'llindar' from public.config where clau = 'justificant'", espera: { valor: '50' } },
  { nom: 'guarda: canviar l\'exercici actiu (jsonb text)', com: T, sql: g([{ t: 'config', a: 'u', k: { clau: 'exercici_actiu' }, f: { valor: '92/93' } }]), verifica: "select valor #>> '{}' from public.config where clau = 'exercici_actiu'", espera: { valor: '92/93' } },
  { nom: 'guarda: l\'exercici actiu ha d\'existir', com: T, sql: g([{ t: 'config', a: 'u', k: { clau: 'exercici_actiu' }, f: { valor: '99/00' } }]), espera: { error: 'no existeix' } },
  { nom: 'guarda: directiva per clau natural (exercici, persona, àrea, delegació)', com: T, sql: [g([{ t: 'directiva', a: 'i', k: { exercici_id: '91/92', usuari_id: 't_delegat2', area_id: null, delegacio_id: '9201' }, f: { exercici_id: '91/92', usuari_id: 't_delegat2', delegacio_id: '9201' } }]), g([{ t: 'directiva', a: 'd', k: { exercici_id: '91/92', usuari_id: 't_delegat', area_id: null, delegacio_id: '9101' } }])], verifica: "select (select count(*) from public.directiva where usuari_id = 't_delegat2' and delegacio_id = '9201') || ' · ' || (select count(*) from public.directiva where usuari_id = 't_delegat' and exercici_id = '91/92')", espera: { valor: '1 · 0' } },
  { nom: 'guarda: dos events per defecte al mateix exercici no es poden marcar alhora (índex únic)', com: T, sql: g([
    { t: 'events', a: 'u', k: { id: 't_ev1' }, f: { per_defecte: true } },
    { t: 'events', a: 'u', k: { id: 't_ev3' }, f: { per_defecte: true } },
  ]), espera: { error: 'events_un_per_defecte' } },
  { nom: 'guarda: ... però desmarcar l\'antic abans de marcar el nou sí que funciona', com: T, prep: "update public.events set per_defecte = true where id = 't_ev1'", sql: g([
    { t: 'events', a: 'u', k: { id: 't_ev1' }, f: { per_defecte: false } },
    { t: 'events', a: 'u', k: { id: 't_ev3' }, f: { per_defecte: true } },
  ]), verifica: "select id from public.events where per_defecte and exercici_id = '91/92'", espera: { valor: 't_ev3' } },
  { nom: 'guarda: un error d\'integritat diu quina operació l\'ha provocat', com: T, sql: g([{ t: 'delegacions', a: 'd', k: { id: '9101' } }]), espera: { error: 'delegacions' } },
];
