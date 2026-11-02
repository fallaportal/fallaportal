// Pont local per a les proves d'acceptació de la Fase 6: l'app REAL (index.html al navegador) contra la base de dades REAL de Supabase, amb els
// permisos reals (RLS, triggers, guarda_canvis) de la persona que es vulga provar, sense necessitat de rebre cap codi per correu.
//
//   node tools/f6_pont.mjs        (deixa'l obert; escolta només a 127.0.0.1:8898)
//
// Com funciona: el navegador carrega `tools/f6_client.js`, que substitueix els mètodes de `sb` (supabase-js) per crides a aquest pont. Cada «sessió» obri una
// connexió i UNA transacció amb `set local role authenticated` i els claims JWT del correu de la persona: tot el que fa l'app s'hi executa com si fóra ella
// (les polítiques RLS i els triggers s'apliquen de veres) i la transacció es DESFÀ en tancar la sessió: la base de dades no canvia mai.
// Seguretat: només escolta a localhost, només accepta peticions del navegador des de http://localhost:8899 i amb el token que imprimeix en arrancar.
// La cadena de connexió no surt d'aquest procés. Storage no s'hi simula del tot: pujar un fitxer comprova la política de `storage.objects` (insert dins de la
// transacció) però no desa cap fitxer.

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { connectaRemot } from './connexio.mjs';

const PORT = 8898;
const ORIGEN = 'http://localhost:8899';
const TOKEN = randomBytes(12).toString('hex');
const sessions = new Map();
let seguent = 1;

const nom = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('Nom no vàlid: ' + s); return s; };
const claims = (email) => JSON.stringify({ role: 'authenticated', email, sub: '00000000-0000-4000-8000-000000000001' });

// Obri una sessió. `perRol`: tria un membre real amb aquest rol (el que té més assignacions a la directiva de l'exercici actiu). `crea`: crea, DINS de la
// transacció (es desfà), una persona de prova amb els rols i l'abast indicats: { rols: ['board'], delegacions: ['0101'], arees: [] }.
async function obri(c) {
  let email = String(c.email || '').toLowerCase();
  const db = await connectaRemot();
  await db.exec('begin');
  if (c.perRol) {
    const r = await db.query(`select u.email from public.usuaris u join public.usuari_rols ur on ur.usuari_id = u.id and ur.rol_id = $1
      where u.actiu order by (select count(*) from public.directiva d where d.usuari_id = u.id and d.exercici_id = (select valor #>> '{}' from public.config where clau = 'exercici_actiu')) desc, u.email limit 1`, [c.perRol]);
    if (!r.length) { await db.exec('rollback'); await db.tanca(); throw new Error('No hi ha cap membre amb el rol ' + c.perRol); }
    email = r[0].email;
  }
  if (c.crea) {
    const id = 'f6_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);   // únic: una sessió penjada no pot bloquejar les altres
    email = 'prova.' + (c.crea.rols || []).join('.') + '.' + id + '@prova.test';
    await db.query('insert into public.usuaris (id, nom, email) values ($1, $2, $3)', [id, 'Prova ' + (c.crea.rols || []).join('+'), email]);
    for (const r of c.crea.rols || []) await db.query('insert into public.usuari_rols (usuari_id, rol_id) values ($1, $2)', [id, r]);
    const ex = (await db.query("select valor #>> '{}' v from public.config where clau = 'exercici_actiu'"))[0].v;
    for (const d of c.crea.delegacions || []) await db.query('insert into public.directiva (exercici_id, usuari_id, delegacio_id) values ($1, $2, $3)', [ex, id, d]);
    for (const a of c.crea.arees || []) await db.query('insert into public.directiva (exercici_id, usuari_id, area_id) values ($1, $2, $3)', [ex, id, a]);
  }
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claims', $1, true)", [claims(email)]);
  const id = String(seguent++);
  sessions.set(id, { db, email });
  return { id, email };
}
async function tanca(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try { await s.db.exec('rollback'); } catch { /* ja tancada */ }
  await s.db.tanca();
}

// Una sentència de la sessió dins d'un savepoint: si falla, la transacció continua viva (com cada petició independent d'una API).
async function executa(s, sql, params) {
  await s.db.exec('savepoint pont');
  try {
    const r = await s.db.query(sql, params);
    await s.db.exec('release savepoint pont');
    return { data: r, error: null };
  } catch (e) {
    await s.db.exec('rollback to savepoint pont');
    return { data: null, error: { message: e.message, code: e.code } };
  }
}

function columnes(cols) {
  // '*' o una llista; admet l'embed `usuari_rols!usuari_id(rol_id)` que fa servir carregaMembre.
  if (!cols || cols === '*') return { sql: 'to_jsonb(t)', embed: false };
  const parts = [];
  let nivell = 0, cur = '';
  for (const ch of cols) { if (ch === '(') nivell++; if (ch === ')') nivell--; if (ch === ',' && !nivell) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  const out = parts.map((p) => {
    p = p.trim();
    const m = p.match(/^usuari_rols!usuari_id\(rol_id\)$/);
    if (m) return "'usuari_rols', (select coalesce(jsonb_agg(jsonb_build_object('rol_id', ur.rol_id)), '[]'::jsonb) from public.usuari_rols ur where ur.usuari_id = t.id)";
    return `'${nom(p)}', t.${nom(p)}`;
  });
  return { sql: `jsonb_build_object(${out.join(', ')})` };
}

function filtres(f, params) {
  return (f || []).map(([c, v]) => { params.push(v); return `t.${nom(c)} = $${params.length}`; });
}

async function peticio(c) {
  if (c.op === 'sessio') { try { return { data: await obri(c), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } }
  if (c.op === 'tanca') { await tanca(c.sessio); return { data: true, error: null }; }
  const s = sessions.get(c.sessio);
  if (!s) return { data: null, error: { message: 'Sessió desconeguda' } };
  const params = [];
  if (c.op === 'rpc') {
    if (c.nom !== 'guarda_canvis') return { data: null, error: { message: 'Només guarda_canvis' } };
    return executa(s, 'select public.guarda_canvis($1::jsonb, $2) as r', [JSON.stringify(c.args.p_canvis), c.args.p_motiu ?? null])
      .then((r) => (r.error ? r : { data: r.data[0].r, error: null }));
  }
  if (c.op === 'storage_up') {
    const r = await executa(s, "insert into storage.objects (bucket_id, name) values ('justificants', $1)", [c.ruta]);
    return r.error ? r : { data: { path: c.ruta }, error: null };
  }
  if (c.op === 'storage_rm') return { data: [], error: null };   // Storage no deixa esborrar per SQL; la política d'esborrat es prova a supabase_tests
  const t = nom(c.taula);
  if (c.op === 'select') {
    const col = columnes(c.cols);
    const w = filtres(c.filtres, params);
    const ord = (c.ordre || []).map(([k, asc]) => `t.${nom(k)} ${asc === false ? 'desc' : 'asc'}`);
    let sql = `select ${col.sql} as j from public.${t} t${w.length ? ' where ' + w.join(' and ') : ''}${ord.length ? ' order by ' + ord.join(', ') : ''}`;
    if (c.rang) sql += ` limit ${Number(c.rang[1]) - Number(c.rang[0]) + 1} offset ${Number(c.rang[0])}`;
    else if (c.limit) sql += ` limit ${Number(c.limit)}`;
    const r = await executa(s, sql, params);
    return r.error ? r : { data: r.data.map((x) => x.j), error: null };
  }
  if (c.op === 'insert') {
    const files = [].concat(c.dades);
    const cols = Object.keys(files[0]).map(nom);
    const vals = files.map((f) => '(' + cols.map((k) => { params.push(f[k] === undefined ? null : f[k]); return '$' + params.length; }).join(', ') + ')');
    return executa(s, `insert into public.${t} (${cols.join(', ')}) values ${vals.join(', ')}`, params).then((r) => (r.error ? r : { data: null, error: null }));
  }
  if (c.op === 'update') {
    const cols = Object.keys(c.dades).map(nom);
    const set = cols.map((k) => { params.push(c.dades[k]); return `${k} = $${params.length}`; });
    const w = filtres(c.filtres, params);
    return executa(s, `update public.${t} t set ${set.join(', ')}${w.length ? ' where ' + w.join(' and ') : ''}`, params).then((r) => (r.error ? r : { data: null, error: null }));
  }
  if (c.op === 'delete') {
    const w = filtres(c.filtres, params);
    if (!w.length) return { data: null, error: { message: 'Esborrat sense filtre' } };
    return executa(s, `delete from public.${t} t where ${w.join(' and ')}`, params).then((r) => (r.error ? r : { data: null, error: null }));
  }
  return { data: null, error: { message: 'Operació desconeguda: ' + c.op } };
}

const servidor = http.createServer((req, res) => {
  const cap = { 'Access-Control-Allow-Origin': ORIGEN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' };
  if (req.headers.origin !== ORIGEN) { res.writeHead(403); res.end('Origen no permès'); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, cap); res.end(); return; }
  let cos = '';
  req.on('data', (d) => { cos += d; if (cos.length > 50e6) req.destroy(); });
  req.on('end', async () => {
    let r;
    try {
      const c = JSON.parse(cos);
      if (c.token !== TOKEN) r = { data: null, error: { message: 'Token no vàlid' } };
      else r = await peticio(c);
    } catch (e) { r = { data: null, error: { message: e.message } }; }
    res.writeHead(200, { ...cap, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r));
  });
});
servidor.listen(PORT, '127.0.0.1', () => {
  console.log(`Pont a http://127.0.0.1:${PORT} (només localhost, origen ${ORIGEN})`);
  console.log(`TOKEN ${TOKEN}`);
});
const surt = async () => { for (const id of [...sessions.keys()]) await tanca(id); process.exit(0); };
process.on('SIGINT', surt);
process.on('SIGTERM', surt);
