// Validació «sense perdre dades» de la Fase 5 (PLA_MIGRACIO_SUPABASE.md §6) i empremta de la base de dades.
// L'usa tools/supabase_carrega.mjs just després de carregar, dins de la mateixa transacció: si alguna comprovació falla, no es confirma res.
//
//   1. Files per taula = files de la pestanya menys les descartades a propòsit (que queden llistades).
//   2. Suma d'imports per exercici × tipus × àrea × via, idèntica al cèntim (comptada de la pestanya crua, no de les files transformades).
//   3. Saldo de fons per delegat i exercici, idèntic (menys el dels registres descartats, que es mostren).
//   4. Tots els id del full existeixen a la base de dades.
//   5. Vint moviments i cinc fons triats a l'atzar (llavor fixa o --llavor) comparats camp a camp amb la pestanya crua.
//
// `empremta(db)` torna, per taula, el nombre de files i un hash del seu contingut (sense dates ni autors de creació, i sense els id
// que genera la base de dades): dues càrregues que han de ser iguals tenen la mateixa empremta (assaig de l'export invers).

const cents = (n) => Math.round(n * 100);
const euros = (c) => (c / 100).toFixed(2);

function atzar(llavor) {
  // mulberry32: determinista
  let a = llavor >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function valida(db, c) {
  const errors = [];
  let n = 0;
  const ok = (cond, text) => { n++; if (!cond) errors.push(text); console.log(`  ${cond ? '✓' : '✗'} ${text}`); };

  // ------------------------------------------------------------------ 1. Files
  console.log('\n1. Files per taula (pestanya → base de dades)');
  const compta = async (t) => (await db.query(`select count(*)::int n from public.${t}`))[0].n;
  const esperatBD = {
    exercicis: c.exercicis.length, usuaris: c.usuaris.length, usuari_rols: c.usuariRols.length, arees: c.arees.length,
    delegacions: c.delegacions.length, comptes: c.comptes.length, saldos_inicials: c.saldos.length, directiva: c.directiva.length,
    events: c.events.length, regles_importacio: c.regles.length, caixes: c.caixes.length, moviments: c.moviments.length,
    fons: c.fons.length, caixa_canvis: c.canvis.length, pressupost_linies: c.pressupost.length, pressupost_estat: c.presEstat.length,
    pressupost_historial: c.presHistorial.length, fallesapp_consums: c.consums.length, fallesapp_passiu: c.passiu.length,
    justificants: c.justificants.length,
  };
  for (const [t, e] of Object.entries(esperatBD)) {
    const r = await compta(t);
    ok(r === e, `${t.padEnd(22)} base de dades ${String(r).padStart(4)} = carregades ${String(e).padStart(4)}`);
  }
  const d = c.descarts;
  const pestanya = [
    ['01 Moviments', c.tab('01 Moviments').length, c.moviments.length + c.consums.length, 0],
    ['02 Fons', c.tab('02 Fons').length, c.fons.length + c.canvis.length, d.fons + d.canvis],
    ['03 Tancaments', c.tab('03 Tancaments').length, c.caixes.length, 0],
    ['04 Arees', c.tab('04 Arees').length, c.arees.length, 0],
    ['05 Delegacions', c.tab('05 Delegacions').length, c.delegacions.length, 0],
    ['06 Events', c.tab('06 Events').length, c.events.length, 0],
    ['07 Bancs', c.tab('07 Bancs').length, c.comptes.length - 1, 0],             // -1: el compte virtual no és al full
    ['08 Usuaris', c.tab('08 Usuaris').length, c.usuaris.length - 1, 0],        // -1: l'usuari «migració»
    ['09 Usuaris Assignacions', c.tab('09 Usuaris Assignacions').length, c.directiva.length, d.directiva],
    ['10 Pressupostos Plans', c.tab('10 Pressupostos Plans').length, c.pressupost.length, 0],
    ['11 Pressupostos Config', c.tab('11 Pressupostos Config').filter((p) => p.any).length, c.presEstat.length, 0],
    ['12 Pressupostos Historial', c.tab('12 Pressupostos Historial').length, c.presHistorial.length, 0],
    ['13 Regles CSV', c.tab('13 Regles CSV').length, c.regles.length, d.regles],
    ['15 Saldos', c.tab('15 Saldos').length, c.saldos.length, 0],
    ['16 Fapp Passiu', c.tab('16 Fapp Passiu').length, c.passiu.length, 0],
  ];
  for (const [nom, full, carregades, descartades] of pestanya) {
    ok(full === carregades + descartades, `${nom.padEnd(26)} full ${String(full).padStart(4)} = carregades ${String(carregades).padStart(4)}${descartades ? ` + descartades ${descartades}` : ''}`);
  }

  // ------------------------------------------------------------------ 2. Sumes
  console.log('\n2. Imports per exercici × tipus × àrea × via (cèntims)');
  const font = new Map();
  for (const m of c.tab('01 Moviments')) {
    if (m.via === 'app') continue;
    const compte = c.compteDeCodi.get(m.via);
    const ex = c.exercici(c.dataIso(m.data), m.anyFiscal).exercici_id;
    const k = [ex, m.tipus === 'ing' ? 'ingres' : 'despesa', c.blanc(m.areaId) ?? '', compte?.id ?? m.via].join('|');
    font.set(k, (font.get(k) || 0) + cents(Math.abs(c.num(m.import))));
  }
  const bd = new Map();
  for (const r of await db.query(`select exercici_id, tipus, coalesce(area_id, '') a, compte_id, sum(round(import * 100))::bigint s from public.moviments group by 1, 2, 3, 4`)) {
    bd.set([r.exercici_id, r.tipus, r.a, r.compte_id].join('|'), Number(r.s));
  }
  let dif = 0;
  for (const k of new Set([...font.keys(), ...bd.keys()])) {
    if ((font.get(k) || 0) !== (bd.get(k) || 0)) { dif++; if (dif <= 5) console.log(`      ✗ ${k}: full ${euros(font.get(k) || 0)} · base de dades ${euros(bd.get(k) || 0)}`); }
  }
  const totalFull = [...font.values()].reduce((s, v) => s + v, 0);
  ok(dif === 0, `${font.size} combinacions, total ${euros(totalFull)} €: ${dif ? dif + ' diferents' : 'idèntiques'}`);
  const consFull = c.tab('01 Moviments').filter((m) => m.via === 'app').reduce((s, m) => s + cents(Math.abs(c.num(m.import))), 0);
  const consBd = Number((await db.query('select coalesce(sum(round(import * 100)), 0)::bigint s from public.fallesapp_consums'))[0].s);
  ok(consFull === consBd, `consums de falles.app: full ${euros(consFull)} € · base de dades ${euros(consBd)} €`);

  // ------------------------------------------------------------------ 3. Saldos de fons
  console.log('\n3. Saldo de fons per delegat i exercici');
  const signe = { lliurament: 1, reintegrament: 1, despesa_fons: -1, devolucio: -1, avancament: -1 };
  const tipusFons = { lliurament: 'lliurament', gast_fons: 'despesa_fons', devolucio: 'devolucio', avanc: 'avancament', reintegrament: 'reintegrament' };
  const saldoFull = new Map();
  for (const f of c.tab('02 Fons')) {
    const tipus = tipusFons[f.tipus];
    if (!tipus || c.fonsDescartats.has(f.id)) continue;
    const u = c.uPerId.get(f.delegId) || c.resolUsuari(f.delegEmail);
    const ex = c.exercici(c.dataIso(f.data), f.anyFiscal).exercici_id;
    const k = `${u?.id}|${ex}`;
    saldoFull.set(k, (saldoFull.get(k) || 0) + signe[tipus] * cents(c.num(f.import)));
  }
  const saldoBd = new Map();
  for (const r of await db.query(`select delegat_id, exercici_id, tipus, sum(round(import * 100))::bigint s from public.fons where tipus in ('lliurament','reintegrament','despesa_fons','devolucio','avancament') group by 1, 2, 3`)) {
    const k = `${r.delegat_id}|${r.exercici_id}`;
    saldoBd.set(k, (saldoBd.get(k) || 0) + signe[r.tipus] * Number(r.s));
  }
  let difS = 0;
  for (const k of new Set([...saldoFull.keys(), ...saldoBd.keys()])) {
    if ((saldoFull.get(k) || 0) !== (saldoBd.get(k) || 0)) { difS++; console.log(`      ✗ ${k}: full ${euros(saldoFull.get(k) || 0)} · base de dades ${euros(saldoBd.get(k) || 0)}`); }
  }
  ok(difS === 0, `${saldoFull.size} saldos (delegat × exercici): ${difS ? difS + ' diferents' : 'idèntics'}`);
  if (c.fonsDescartats.size) {
    const perduts = c.tab('02 Fons').filter((f) => c.fonsDescartats.has(f.id) && tipusFons[f.tipus]);
    const efecte = perduts.reduce((s, f) => s + signe[tipusFons[f.tipus]] * cents(c.num(f.import)), 0);
    console.log(`      (no compten, descartats a propòsit: ${perduts.length} registres de fons, ${euros(efecte)} € al saldo)`);
  }

  // ------------------------------------------------------------------ 4. Ids
  console.log('\n4. Tots els id del full són a la base de dades');
  const ids = async (t, col = 'id') => new Set((await db.query(`select ${col} v from public.${t}`)).map((r) => r.v));
  const bMov = await ids('moviments'), bCons = await ids('fallesapp_consums'), bFons = await ids('fons'), bCanv = await ids('caixa_canvis');
  const bCaix = await ids('caixes'), bAre = await ids('arees'), bDel = await ids('delegacions'), bEv = await ids('events');
  const bUs = await ids('usuaris'), bReg = await ids('regles_importacio'), bCom = await ids('comptes');
  const falten = (llista, ...conjunts) => llista.filter((id) => !conjunts.some((s) => s.has(id)));
  const comprova = (nom, llista, ...conjunts) => {
    const f = falten(llista, ...conjunts);
    ok(f.length === 0, `${nom.padEnd(22)} ${llista.length} id${f.length ? ` · ${f.length} que falten: ${f.slice(0, 4).join(', ')}` : ' · tots hi són'}`);
  };
  comprova('01 Moviments', c.tab('01 Moviments').map((m) => m.id), bMov, bCons);
  comprova('02 Fons', c.tab('02 Fons').map((f) => f.id).filter((id) => !c.fonsDescartats.has(id)), bFons, bCanv);
  comprova('03 Tancaments', c.tab('03 Tancaments').map((t) => t.eventId), bCaix);
  comprova('04 Arees', c.tab('04 Arees').map((a) => a.id), bAre);
  comprova('05 Delegacions', c.tab('05 Delegacions').map((x) => x.id), bDel);
  comprova('06 Events', c.tab('06 Events').map((e) => e.id), bEv);
  comprova('07 Bancs', c.tab('07 Bancs').map((b) => b.id), bCom);
  comprova('08 Usuaris', c.tab('08 Usuaris').map((u) => u.id), bUs);
  comprova('13 Regles CSV', c.tab('13 Regles CSV').map((r) => r.id).filter((id) => !c.reglesDescartades.has(id)), bReg);
  const orfes = (await db.query(`select (select count(*) from public.moviments m where m.caixa_id is not null and not exists (select 1 from public.caixes x where x.id = m.caixa_id))::int a,
    (select count(*) from public.fons f where f.moviment_id is not null and not exists (select 1 from public.moviments x where x.id = f.moviment_id))::int b`))[0];
  ok(orfes.a === 0 && orfes.b === 0, `claus foranes: moviments sense caixa ${orfes.a} · fons sense despesa ${orfes.b}`);

  // ------------------------------------------------------------------ 5. Mostra
  console.log(`\n5. Mostra a l'atzar (llavor ${c.llavor}): 20 moviments i 5 fons camp a camp`);
  const rnd = atzar(c.llavor);
  const mescla = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const movs = mescla(c.tab('01 Moviments').filter((m) => m.via !== 'app')).slice(0, 20);
  let malament = 0;
  for (const m of movs) {
    const r = (await db.query("select m.*, to_char(m.data, 'YYYY-MM-DD') d, c.codi from public.moviments m join public.comptes c on c.id = m.compte_id where m.id = $1", [m.id]))[0];
    const esperat = {
      data: c.dataIso(m.data), tipus: m.tipus === 'ing' ? 'ingres' : 'despesa', import: String(Math.abs(c.num(m.import)).toFixed(2)), codi: m.via,
      area_id: c.blanc(m.areaId), delegacio_id: c.blanc(m.delegacioId), concepte: c.blanc(m.concepte), establiment: c.blanc(m.establiment), notes: c.blanc(m.notes),
      traspas: String(m.traspas || '').trim() === 'true',
    };
    const obtingut = r && { data: r.d, tipus: r.tipus, import: String(r.import), codi: r.codi,
      area_id: r.area_id, delegacio_id: r.delegacio_id, concepte: r.concepte, establiment: r.establiment, notes: r.notes, traspas: r.traspas };
    const camps = r ? Object.keys(esperat).filter((k) => JSON.stringify(esperat[k]) !== JSON.stringify(obtingut[k])) : ['(no existeix)'];
    if (camps.length) { malament++; console.log(`      ✗ ${m.id}: ${camps.map((k) => `${k} «${esperat[k]}» → «${obtingut?.[k]}»`).join(' · ')}`); }
  }
  ok(malament === 0, `${movs.length} moviments: ${malament ? malament + ' amb diferències' : 'tots els camps iguals'}`);
  const fonsMostra = mescla(c.tab('02 Fons').filter((f) => tipusFons[f.tipus] && !c.fonsDescartats.has(f.id))).slice(0, 5);
  let malF = 0;
  for (const f of fonsMostra) {
    const r = (await db.query("select *, to_char(data, 'YYYY-MM-DD') d from public.fons where id = $1", [f.id]))[0];
    const esperat = { data: c.dataIso(f.data), tipus: tipusFons[f.tipus], import: String(c.num(f.import).toFixed(2)), nota: c.blanc(f.nota) };
    const obtingut = r && { data: r.d, tipus: r.tipus, import: String(r.import), nota: r.nota };
    const camps = r ? Object.keys(esperat).filter((k) => JSON.stringify(esperat[k]) !== JSON.stringify(obtingut[k])) : ['(no existeix)'];
    if (camps.length) { malF++; console.log(`      ✗ ${f.id}: ${camps.join(', ')}`); }
  }
  ok(malF === 0, `${fonsMostra.length} fons: ${malF ? malF + ' amb diferències' : 'tots els camps iguals'}`);

  console.log(`\nValidació: ${n} comprovacions, ${errors.length} errors.`);
  return errors;
}

// Taules i columnes que no entren a l'empremta: dates i autors d'alta (canvien a cada càrrega) i els id que genera la base de dades.
const SENSE_ID = new Set(['justificants', 'directiva', 'pressupost_linies', 'fallesapp_passiu', 'pressupost_historial']);
const TAULES = ['exercicis', 'usuaris', 'usuari_rols', 'arees', 'delegacions', 'comptes', 'saldos_inicials', 'directiva', 'events', 'regles_importacio',
  'caixes', 'caixa_canvis', 'moviments', 'justificants', 'fons', 'pressupost_linies', 'pressupost_estat', 'pressupost_historial',
  'fallesapp_passiu', 'fallesapp_consums', 'config'];
export async function empremta(db) {
  const out = {};
  for (const t of TAULES) {
    const treu = ['creat_at', 'creat_per', 'modificat_at', 'modificat_per', ...(SENSE_ID.has(t) ? ['id'] : [])].map((c) => `- '${c}'`).join(' ');
    const r = await db.query(`select count(*)::int n, coalesce(md5(string_agg(j, '|' order by j)), '') h
      from (select (to_jsonb(t) ${treu})::text j from public.${t} t) x`);
    out[t] = { n: r[0].n, h: r[0].h };
  }
  return out;
}
