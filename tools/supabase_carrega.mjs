// Càrrega de l'export del Google Sheet al projecte de Supabase (Fase 3 per a provar; creix fins a ser la Fase 5).
//
//   node tools/supabase_carrega.mjs "C:/ruta/Falla Portal DB.xlsx"            buida les dades i les torna a carregar
//   node tools/supabase_carrega.mjs "C:/ruta/Falla Portal DB.xlsx" --simula   ho fa tot dins una transacció i la desfà
//
// Transforma les pestanyes al model de MODEL_DADES.md (§4 i §6). Totes les dades van en UNA transacció: o es carrega tot
// o no es carrega res. Connexió de servei (tools/.env): no passa per les regles d'usuari, però sí per l'autoria i pel
// registre d'activitat (cada càrrega hi deixa files: al buidatge del tall es descarta el projecte sencer, D-043).
// Els usuaris de prova (prova_*) s'esborren amb la resta d'usuaris.
//
// L'export conté dades reals: mai al repositori. Aquest script no desa res enlloc.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const xlsx = args.find((a) => !a.startsWith('--'));
const simula = args.includes('--simula');
if (!xlsx) {
  console.log('Ús: node tools/supabase_carrega.mjs "<export.xlsx>" [--simula]');
  process.exit(2);
}

// ---------------------------------------------------------------- lectura
const json = execFileSync('python', ['-I', join(aqui, 'f3_export_json.py'), xlsx], { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
const H = JSON.parse(json);
const tab = (n) => H[n] || [];

// ---------------------------------------------------------------- utilitats
const avisos = [];
const avis = (t) => avisos.push(t);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const blanc = (s) => (s === undefined || s === null || String(s).trim() === '' ? null : String(s).trim());
function dataIso(s) {
  s = String(s ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function horaIso(s) {
  const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
function normAF(v) {
  v = String(v ?? '').trim();
  if (/^\d{2}\/\d{2}$/.test(v)) return v;
  const y = parseInt(v, 10);
  if (!Number.isNaN(y) && y > 2000) return `${String(y - 2000).padStart(2, '0')}/${String(y - 1999).padStart(2, '0')}`;
  return v;
}
const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const bool = (s) => String(s).toLowerCase() === 'true';
const dec = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- exercicis
const cfg = {};
for (const r of tab('00 Config')) cfg[r.clau] = r.valor;
const jsonDe = (s, def) => { try { return JSON.parse(s); } catch { return def; } };
const llistaEx = jsonDe(cfg.exercicis, []).map(normAF);
const estats = jsonDe(cfg.estats_exercicis, {});
for (const m of tab('01 Moviments')) { const a = normAF(m.anyFiscal); if (a && !llistaEx.includes(a)) llistaEx.push(a); }
llistaEx.sort();
const exercicis = llistaEx.map((id) => {
  const y = 2000 + parseInt(id.slice(0, 2), 10);
  const e = estats[id] || {};
  return {
    id, data_inici: `${y}-04-01`, data_fi: `${y + 1}-03-31`,
    data_obertura: dataIso(e.dataObertura) || `${y}-04-01`,
    tancat: !!e.tancat, data_tancament: dataIso(e.dataTancament), es_prova: false,
  };
});
const exercDeData = (iso) => exercicis.find((e) => iso >= e.data_inici && iso <= e.data_fi)?.id ?? null;
// Exercici + excepció d'imputació (D-029): si el de l'app antiga no és el de la data, s'imputa a aquell amb motiu.
function exercici(iso, anyFull) {
  const dat = iso ? exercDeData(iso) : null;
  const antic = normAF(anyFull) || null;
  if (!iso) return { exercici_id: antic, imputacio_excepcional: true, motiu_imputacio: `Imputat al ${antic} a l'app antiga` };
  if (antic && dat && antic !== dat) return { exercici_id: antic, imputacio_excepcional: true, motiu_imputacio: `Imputat al ${antic} a l'app antiga` };
  return { exercici_id: dat, imputacio_excepcional: false, motiu_imputacio: null };
}

// ---------------------------------------------------------------- usuaris i rols
const COLORS = { '01': '#1D9E75', '02': '#7F77DD', '03': '#378ADD', '04': '#BA7517', '05': '#D4537E', '06': '#D85A30', '07': '#888780' };
const usuaris = tab('08 Usuaris').map((u) => ({ id: u.id, nom: u.nom.trim(), email: u.email.trim().toLowerCase(), actiu: true, rol: u.rol }));
usuaris.push({ id: 'migracio', nom: 'Migració (historial del full)', email: 'migracio@fallaportal.invalid', actiu: false, rol: null });
const uPerEmail = new Map(usuaris.map((u) => [u.email, u]));
const uPerId = new Map(usuaris.map((u) => [u.id, u]));
const uPerNom = new Map();
for (const u of usuaris) uPerNom.set(norm(u.nom), u);
function resolUsuari(s) {
  s = blanc(s);
  if (!s) return null;
  if (s.includes('@')) return uPerEmail.get(s.toLowerCase()) || null;
  const n = norm(s);
  if (uPerNom.has(n)) return uPerNom.get(n);
  const toks = n.split(' ');
  const c = usuaris.filter((u) => u.id !== 'migracio' && toks.every((t) => norm(u.nom).split(' ').includes(t)));
  return c.length === 1 ? c[0] : null;
}
const creatPer = (s) => (resolUsuari(s) || uPerId.get('migracio')).id;

const usuariRols = usuaris.filter((u) => u.rol && u.rol !== 'noauth').map((u) => ({ usuari_id: u.id, rol_id: u.rol }));

// ---------------------------------------------------------------- organització
const arees = tab('04 Arees').map((a, i) => ({ id: a.id, nom: a.nom.trim(), color: COLORS[a.id] || null, ordre: i + 1 }));
const delegacions = tab('05 Delegacions').map((d) => ({ id: d.id, area_id: d.areaId, nom: d.nom.trim() }));
const delegIds = new Set(delegacions.map((d) => d.id));
const eventsSheet = tab('06 Events');
const events = eventsSheet.map((e) => ({
  id: e.id, exercici_id: normAF(e.anyFiscal || e.year), delegacio_id: e.delegId, nom: e.nom.trim(),
  data_inici: dataIso(e.dataInici), hora_inici: horaIso(e.horaInici), data_fi: dataIso(e.dataFi), hora_fi: horaIso(e.horaFi),
  responsable_id: resolUsuari(e.responsable)?.id ?? null, per_defecte: bool(e.perDefecte),
}));
for (const e of eventsSheet) if (blanc(e.responsable) && !resolUsuari(e.responsable)) avis(`Event ${e.id}: el responsable «${e.responsable}» no és cap usuari: queda sense responsable.`);
const eventIds = new Set(events.map((e) => e.id));
const eventDeleg = new Map(events.map((e) => [e.id, e.delegacio_id]));

// ---------------------------------------------------------------- comptes
const IBAN_PER_ID = { b2: 'ES82 3159 0076 6426 7219 1729' };  // DOMAIN_KNOWLEDGE.md: el full el té buit
const comptes = tab('07 Bancs').map((b) => {
  const tipus = { bank: 'banc', cash: 'efectiu', tpv: 'tpv' }[b.tipus] || 'banc';
  let iban = blanc(b.compte);
  if (iban && !/^[A-Z]{2}\d{2}/.test(iban.replace(/\s/g, ''))) iban = null;   // «Aproximat»
  if (!iban && IBAN_PER_ID[b.id]) iban = IBAN_PER_ID[b.id];
  if (tipus === 'efectiu') iban = null;
  if ((tipus === 'banc' || tipus === 'tpv') && !iban) throw new Error(`El compte ${b.codi} (${b.id}) no té IBAN.`);
  return { id: b.id, codi: b.codi.trim(), nom: b.nom.trim(), tipus, iban: iban ? iban.replace(/\s+/g, ' ') : null, als_informes: true };
});
comptes.push({ id: 'virtual', codi: 'Virtual', nom: 'Bonificacions falles.app', tipus: 'virtual', iban: null, als_informes: true });
const compteDeCodi = new Map(comptes.map((c) => [c.codi, c]));
const saldos = tab('15 Saldos').map((s) => ({ compte_id: s.bancId, exercici_id: normAF(s.anyFiscal), import: dec(num(s.saldoInicial)), data: dataIso(s.saldoData) }));

// ---------------------------------------------------------------- directiva
const directiva = [];
const dirVista = new Set();
for (const a of tab('09 Usuaris Assignacions')) {
  const u = uPerId.get(a.userId);
  const ex = normAF(a.anyFiscal);
  const ok = u && exercicis.some((e) => e.id === ex) && (a.tipus === 'area' ? arees.some((x) => x.id === a.id) : delegIds.has(a.id));
  if (!ok) { avis(`Directiva: assignació ignorada (${a.userNom} · ${a.tipus} ${a.id} · ${a.anyFiscal}).`); continue; }
  const k = [ex, u.id, a.tipus, a.id].join('|');
  if (dirVista.has(k)) continue;
  dirVista.add(k);
  directiva.push({ exercici_id: ex, usuari_id: u.id, area_id: a.tipus === 'area' ? a.id : null, delegacio_id: a.tipus === 'delegacio' ? a.id : null });
}

// ---------------------------------------------------------------- moviments, consums de falles.app i caixes
const movSheet = tab('01 Moviments');
const tancSheet = tab('03 Tancaments');
const caixaIds = new Set(tancSheet.map((t) => t.eventId));
const moviments = [];
const justificants = [];
const consums = [];
const fontDe = (m) => {
  const fi = m.fontImport || '';
  if (fi === 'tancament') return 'tancament_caixa';
  if (fi === 'retirada_caixa') return 'retirada_caixa';
  if (fi === 'fallesapp_bonif') return 'fallesapp_bonificacio';
  if (fi === 'fallesapp') return 'fallesapp_transaccions';
  if (fi.startsWith('xls_')) return 'extracte';
  if (m.origenFons === 'tercer') return 'ingres_tercer';
  if (m.origenFons === 'banc_caixa') return 'traspas_banc_caixa';
  return 'manual';
};
const pagEfectiu = { caixa: 'caixa', fons_lliurats: 'fons_lliurats', avanc: 'avancament' };
const compteSenseTrobar = new Set();
for (const m of movSheet) {
  const iso = dataIso(m.data);
  const ex = exercici(iso, m.anyFiscal);
  if (m.via === 'app') {
    // Consums de falles.app: estadística per a r3, fora del llibre major (D-031).
    consums.push({
      id: m.id, ...(({ exercici_id }) => ({ exercici_id }))(ex), event_id: eventIds.has(m.eventId) ? m.eventId : null,
      area_id: m.areaId, delegacio_id: delegIds.has(m.delegacioId) ? m.delegacioId : null,
      import: dec(num(m.import)), consums: null, periode_inici: iso, periode_fi: iso,
      creat_per: creatPer(m.responsableEmail),
    });
    continue;
  }
  const compte = compteDeCodi.get(m.via);
  if (!compte) { compteSenseTrobar.add(m.via); continue; }
  const font = fontDe(m);
  const esCaixa = font === 'tancament_caixa' || font === 'retirada_caixa';
  const tipus = m.tipus === 'ing' ? 'ingres' : 'despesa';
  const usr = resolUsuari(m.responsableEmail);
  moviments.push({
    id: m.id, ...ex, data: iso, tipus, import: dec(Math.abs(num(m.import))), compte_id: compte.id,
    area_id: blanc(m.areaId), delegacio_id: blanc(m.delegacioId),
    event_id: eventIds.has(m.eventId) ? m.eventId : null, caixa_id: esCaixa ? m.eventId : null,
    font, pagament_efectiu: tipus === 'despesa' ? (pagEfectiu[m.origenFons] || null) : null,
    concepte: blanc(m.concepte), establiment: blanc(m.establiment), notes: blanc(m.notes),
    responsable_id: font === 'manual' ? usr?.id ?? null : null,
    conciliacio: ['pendent', 'conciliat', 'no_aplica'].includes(m.conciliacio) ? m.conciliacio : null,
    empremta: blanc(m.bankHash), motiu_sense_justificant: blanc(m.ticketMotiu),
    creat_per: (usr || uPerId.get('migracio')).id,
  });
  if (blanc(m.ticketUrl)) justificants.push({ moviment_id: m.id, url_drive_original: m.ticketUrl.trim() });
}
if (compteSenseTrobar.size) throw new Error('Moviments amb una via que no és cap compte: ' + [...compteSenseTrobar].join(', '));

// Caixes (03 Tancaments). Àrea i delegació: les dels moviments del tancament; si no n'hi ha, les de la delegació de l'event.
const caixes = tancSheet.map((t) => {
  const iso = dataIso(t.data);
  const movs = moviments.filter((m) => m.caixa_id === t.eventId);
  const ref = movs.find((m) => m.area_id) || null;
  let area = ref?.area_id ?? null;
  let deleg = ref?.delegacio_id ?? null;
  const eventId = eventIds.has(t.eventId) ? t.eventId : null;
  if (!ref && eventId) { deleg = eventDeleg.get(eventId); area = delegacions.find((d) => d.id === deleg)?.area_id ?? null; }
  return {
    id: t.eventId, ...exercici(iso, t.anyFiscal), event_id: eventId,
    descripcio: eventId ? null : (blanc(t.eventNom) || blanc(t.concepte)), data: iso,
    estat: t.estat === 'tancat' || bool(t.tancat) ? 'tancada' : 'oberta',
    efectiu: dec(num(t.efectiu)), tpv: dec(num(t.tpv)), pagaments: dec(num(t.pagaments)),
    area_id: area, delegacio_id: deleg, notes: null, creat_per: creatPer(t.registratPer),
  };
});
// Una retirada o un tancament d'una caixa que ja no existeix (esborrada a l'app antiga) no pot ser de cap caixa: queda com a
// moviment manual, amb el mateix event i els mateixos imports. Cap xifra canvia.
for (const m of moviments) {
  if (m.caixa_id && !caixaIds.has(m.caixa_id)) {
    avis(`Moviment ${m.id} (${m.font}, ${m.import} €, ${m.data}): la caixa ${m.caixa_id} no existeix; passa a moviment manual.`);
    m.font = 'manual'; m.caixa_id = null;
  }
}

// ---------------------------------------------------------------- fons i canvis de caixa
const fons = [];
const canvis = [];
const movIds = new Set(moviments.map((m) => m.id));
const tipusFons = { lliurament: 'lliurament', regularitzacio: 'regularitzacio', gast_fons: 'despesa_fons', devolucio: 'devolucio', avanc: 'avancament', reintegrament: 'reintegrament' };
const fonsOrdenats = [...tab('02 Fons')].sort((a, b) => (dataIso(a.data) || '').localeCompare(dataIso(b.data) || ''));
const canvisPerCaixa = new Map();
for (const f of fonsOrdenats) {
  const iso = dataIso(f.data);
  if (f.tipus === 'event_canvi' || f.tipus === 'event_canvi_devolucio') {
    const caixa = f.eventTancamentId;
    if (!caixaIds.has(caixa)) { avis(`Canvi de caixa ${f.id}: la caixa ${caixa} no existeix; s'ignora (${f.import} €).`); continue; }
    let tipus = 'devolucio';
    if (f.tipus === 'event_canvi') { tipus = canvisPerCaixa.has(caixa) ? 'ampliacio' : 'lliurament'; canvisPerCaixa.set(caixa, true); }
    canvis.push({ id: f.id, caixa_id: caixa, data: iso, tipus, import: dec(num(f.import)), creat_per: creatPer(f.registratPer) });
    continue;
  }
  const tipus = tipusFons[f.tipus];
  const delegat = uPerId.get(f.delegId) || resolUsuari(f.delegEmail);
  if (!tipus || !delegat) { avis(`Fons ${f.id} (${f.tipus}, ${f.import} €): tipus o delegat desconegut; s'ignora.`); continue; }
  const lligat = tipus === 'despesa_fons' || tipus === 'avancament';
  if (lligat && !movIds.has(f.movimentId)) { avis(`Fons ${f.id} (${f.tipus}, ${f.import} €, ${f.data}): la despesa ${f.movimentId || '(cap)'} no existeix; s'ignora (avançament orfe, A-24).`); continue; }
  fons.push({
    id: f.id, ...exercici(iso, f.anyFiscal), data: iso, tipus, delegat_id: delegat.id, import: dec(num(f.import)),
    origen: null, moviment_id: lligat ? f.movimentId : null, nota: blanc(f.nota), creat_per: creatPer(f.registratPer),
  });
}

// ---------------------------------------------------------------- pressupost
const pressupost = tab('10 Pressupostos Plans').map((p) => ({
  exercici_id: normAF(p.any), delegacio_id: p.delegacioId, event_id: eventIds.has(p.eventId) ? p.eventId : null,
  concepte: blanc(p.concepte), tipus: ['event', 'concepte', 'varis'].includes(p.tipus) ? p.tipus : 'concepte',
  import: dec(num(p.importPla)), notes: blanc(p.notes),
}));
const presEstat = tab('11 Pressupostos Config').filter((p) => p.any).map((p) => ({ exercici_id: normAF(p.any), estat: p.estat === 'bloquejat' ? 'bloquejat' : 'obert' }));

// ---------------------------------------------------------------- regles d'importació
const regles = [];
for (const r of tab('13 Regles CSV')) {
  const compte = blanc(r.font) ? compteDeCodi.get(r.font.trim()) : null;
  if (blanc(r.font) && !compte) { avis(`Regla ${r.id} (font «${r.font}»): no és cap compte; s'ignora (decideix Emilio, D-031).`); continue; }
  const patrons = String(r.patrons || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!patrons.length) { avis(`Regla ${r.id}: sense patrons; s'ignora.`); continue; }
  const area = blanc(r.areaId);
  regles.push({
    id: r.id, compte_id: compte?.id ?? null, patrons, tipus: ['assignar', 'tpv', 'ignorar'].includes(r.tipus) ? r.tipus : 'assignar',
    sentit: { gast: 'despesa', ing: 'ingres' }[r.movtype] || 'qualsevol', area_id: area,
    delegacio_id: area && delegIds.has(r.delegacioId) ? r.delegacioId : null, concepte: blanc(r.concepte),
    prioritat: parseInt(r.prioritat, 10) || 100, activa: r.activa !== 'false',
  });
}

// ---------------------------------------------------------------- escriptura
async function ins(db, taula, files, conflicte = '') {
  if (!files.length) return;
  const cols = Object.keys(files[0]);
  const bloc = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < files.length; i += bloc) {
    const part = files.slice(i, i + bloc);
    const params = [];
    const valors = part.map((f) => '(' + cols.map((c) => { params.push(f[c] === undefined ? null : f[c]); return '$' + params.length; }).join(', ') + ')');
    await db.query(`insert into public.${taula} (${cols.join(', ')}) values ${valors.join(', ')} ${conflicte}`, params);
  }
}

const db = await connectaRemot();
let codi = 0;
try {
  console.log(`Connectat: ${db.descripcio}${simula ? ' · SIMULACRE (es desfarà)' : ''}`);
  await db.exec('begin');
  // Buidatge (de fills a pares). audit_log no s'esborra mai (és inalterable).
  for (const t of ['fallesapp_recarregues', 'fallesapp_consums', 'fallesapp_passiu', 'pressupost_historial', 'pressupost_estat', 'pressupost_linies',
    'justificants', 'fons', 'caixa_canvis', 'moviments', 'caixes', 'events', 'directiva', 'saldos_inicials', 'regles_importacio',
    'delegacions', 'arees', 'comptes', 'operacions', 'config', 'exercicis', 'usuari_rols', 'usuaris']) {
    await db.query(`delete from public.${t}`);
  }
  await ins(db, 'exercicis', exercicis);
  await ins(db, 'usuaris', usuaris.map(({ id, nom, email, actiu }) => ({ id, nom, email, actiu })));
  await ins(db, 'usuari_rols', usuariRols);
  await ins(db, 'arees', arees);
  await ins(db, 'delegacions', delegacions);
  await ins(db, 'comptes', comptes);
  await ins(db, 'saldos_inicials', saldos);
  await ins(db, 'directiva', directiva);
  await ins(db, 'events', events);
  await ins(db, 'regles_importacio', regles);
  await ins(db, 'caixes', caixes);
  await ins(db, 'moviments', moviments);
  await ins(db, 'justificants', justificants);
  await ins(db, 'fons', fons);
  await ins(db, 'caixa_canvis', canvis);
  await ins(db, 'pressupost_linies', pressupost);
  await ins(db, 'pressupost_estat', presEstat);
  await ins(db, 'fallesapp_consums', consums);
  const actiu = normAF(cfg.anyFiscal) || llistaEx[llistaEx.length - 1];
  await db.query("insert into public.config (clau, valor) values ('exercici_actiu', $1::jsonb)", [JSON.stringify(actiu)]);
  const j = jsonDe(cfg.justificant, null);
  if (j) await db.query("insert into public.config (clau, valor) values ('justificant', $1::jsonb)", [JSON.stringify(j)]);

  // Validació: sumes del full (menys els consums de falles.app, que van a una altra taula) contra la base de dades.
  const origen = new Map();
  for (const m of moviments) { const k = `${m.exercici_id} ${m.tipus}`; const v = origen.get(k) || { n: 0, s: 0 }; v.n++; v.s += m.import; origen.set(k, v); }
  const dbSum = await db.query("select exercici_id, tipus, count(*)::int n, sum(import)::float8 s from public.moviments group by 1, 2 order by 1, 2");
  console.log('\nMoviments per exercici i tipus (full → base de dades):');
  let ok = true;
  for (const r of dbSum) {
    const o = origen.get(`${r.exercici_id} ${r.tipus}`) || { n: 0, s: 0 };
    const igual = o.n === r.n && Math.abs(o.s - r.s) < 0.005;
    if (!igual) ok = false;
    console.log(`  ${igual ? '✓' : '✗'} ${r.exercici_id} ${r.tipus.padEnd(8)} ${String(r.n).padStart(4)} fila(es)  ${r.s.toFixed(2).padStart(12)} €${igual ? '' : `   (full: ${o.n} · ${o.s.toFixed(2)})`}`);
  }
  const t = (n, v) => console.log(`  ${n.padEnd(22)} ${v}`);
  console.log('\nFiles carregades:');
  t('exercicis', exercicis.length); t('usuaris (+rols)', `${usuaris.length} (+${usuariRols.length})`); t('àrees / delegacions', `${arees.length} / ${delegacions.length}`);
  t('comptes / saldos', `${comptes.length} / ${saldos.length}`); t('events', events.length); t('directiva', directiva.length);
  t('moviments', moviments.length); t('consums falles.app', `${consums.length} (${dec(consums.reduce((s, c) => s + c.import, 0))} €)`);
  t('justificants (Drive)', justificants.length); t('caixes / canvis', `${caixes.length} / ${canvis.length}`); t('fons', fons.length);
  t('pressupost', pressupost.length); t('regles', regles.length);
  const excepcions = moviments.filter((m) => m.imputacio_excepcional).length + fons.filter((f) => f.imputacio_excepcional).length;
  t('imputats a un altre exercici', excepcions);
  if (avisos.length) { console.log(`\n${avisos.length} avís(os):`); for (const a of avisos) console.log('  · ' + a); }
  if (!ok) throw new Error('Les sumes no quadren: no es carrega res.');
  if (simula) { await db.exec('rollback'); console.log('\nSimulacre acabat: s\'ha desfet tot.'); }
  else { await db.exec('commit'); console.log('\nCarregat i confirmat.'); }
} catch (e) {
  try { await db.exec('rollback'); } catch { /* sense transacció */ }
  console.error('\nERROR: ' + e.message);
  codi = 1;
} finally {
  await db.tanca();
}
process.exit(codi);
