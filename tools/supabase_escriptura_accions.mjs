// Accions de l'inventari §4 (INVENTARI_FUNCIONAL.md) com a escenaris de tools/supabase_escriptura.mjs.
// Cada escenari fa als pestanyes (T) el mateix que fa el codi d'index.html (mateixes formes de fila), calcula les diferències
// amb sbCanvis, les envia a public.guarda_canvis amb el JWT d'un membre real, torna a llegir i comprova dues coses:
//   · el que es volia és el que hi ha (la diferència entre el que volíem i el que s'ha llegit és buida), i
//   · els fets concrets de l'acció (imports, estats, files que hi ha de ser o no).
// Els escenaris encadenats (obrir, afegir canvi, retirar, tancar, reobrir…) fan servir com a base el que el client hauria
// guardat al pas anterior, igual que _sbBase.

const AF = '26/27';
const DATA = '15/10/2026';
let n = 0;
const id = (p) => p + Date.now().toString(36) + (n++).toString(36);
const afirma = (c, m) => { if (!c) throw new Error(m); };

// ---------------------------------------------------------------- utilitats
async function pas(c, estat, email, muta, { motiu = null, espera = null } = {}) {
  const T2 = c.clona(estat.T);
  muta(T2);
  const ara = c.taules(T2);
  const ops = c.A.sbCanvis(estat.base, ara);
  const resum = ops.map((o) => `${o.a} ${o.t} ${JSON.stringify(o.k)}${o.f && o.a !== 'i' ? ' ' + JSON.stringify(o.f) : ''}`).join('\n        ');
  await c.db.exec('savepoint pas');
  try {
    await c.db.query('set local role authenticated');
    await c.db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'authenticated', email, sub: '00000000-0000-4000-8000-000000000001' })]);
    await c.db.query('select public.guarda_canvis($1::jsonb, $2)', [JSON.stringify(ops), motiu]);
  } catch (e) {
    await c.db.exec('rollback to savepoint pas');
    await c.db.exec('reset role');
    if (espera && e.message.includes(espera)) return { error: e.message, ops };
    throw new Error(`${e.message}\n      operacions:\n        ${resum}`);
  }
  await c.db.exec('reset role');
  await c.db.exec('release savepoint pas');
  if (espera) throw new Error(`Esperava un error amb «${espera}» i ha anat bé.\n        ${resum}`);
  const R2 = await c.llig(c.db);
  const T3 = c.A.sbPestanyes(R2);
  const resta = c.A.sbCanvis(ara, c.taules(T3));
  if (resta.length) throw new Error(`El que s'ha desat no és el que es volia (${resta.length} diferències):\n        ${resta.slice(0, 6).map((o) => `${o.a} ${o.t} ${JSON.stringify(o.k)} ${JSON.stringify(o.f || {})}`).join('\n        ')}\n      operacions enviades:\n        ${resum}`);
  return { T: T2, base: ara, ops, R2, T3, resum };
}
const inici = (c) => ({ T: c.T, base: c.base });
const compta = (R, t, f = () => true) => R[t].filter(f).length;

function persones(c) {
  const R = c.R;
  const rol = (r) => R.usuari_rols.filter((x) => x.rol_id === r).map((x) => x.usuari_id);
  const u = (ids, fi) => R.usuaris.find((x) => ids.includes(x.id) && x.actiu && (fi ? fi(x) : true));
  const president = u(rol('president'), (x) => x.email === 'emilio.grau@hotmail.com') || u(rol('president'));
  const tresoreria = u(rol('treasury'));
  const delegat = u(rol('delegat'), (x) => R.directiva.some((d) => d.usuari_id === x.id && d.exercici_id === AF && d.delegacio_id));
  const area = u(rol('area'), (x) => R.directiva.some((d) => d.usuari_id === x.id && d.exercici_id === AF && d.area_id));
  const dirD = R.directiva.find((d) => d.usuari_id === delegat?.id && d.exercici_id === AF && d.delegacio_id);
  const delegDelegat = dirD ? R.delegacions.find((d) => d.id === dirD.delegacio_id) : null;
  return { president, tresoreria, delegat, area, delegDelegat };
}

const movBase = (o = {}) => ({
  id: id('mx'), anyFiscal: AF, tipus: 'gast', via: '01 Banc', areaId: '01', areaNom: 'x', delegacioId: '0102', delegacioNom: 'x',
  eventId: '', eventNom: '', concepte: 'Prova escriptura', establiment: '', data: DATA, responsable: '', responsableEmail: '',
  import: 12.34, notes: '', origenFons: 'caixa', origen: 'Manual', ticketUrl: '', ticketMotiu: '', conciliacio: 'pendent', ...o,
});
const fonsBase = (o = {}) => ({ id: id('fx'), anyFiscal: AF, tipus: 'lliurament', delegId: '', delegEmail: '', import: 50, data: DATA, nota: 'Prova', registratPer: 'Prova', ...o });
const llistaFons = (T, f) => T['02 Fons'].filter(f);
const eventLliure = (T) => T['06 Events'].find((e) => e.anyFiscal === AF && !T['03 Tancaments'].some((t) => t.eventId === e.id));
const tancBase = (o) => ({ eventId: '', eventNom: '', data: DATA, efectiu: 0, tpv: 0, canvi: 0, pagaments: 0, tancat: 'false', estat: 'obert', fonsId: '', concepte: '', registratPer: '', anyFiscal: AF, ...o });

export const accions = [
  // ================================================================ Nou moviment (inventari 3.3)
  {
    nom: 'Nou moviment: despesa pagada des del banc (Tresoreria)',
    async executa(c) {
      const p = persones(c);
      const m = movBase({ id: id('mx'), concepte: 'Despesa banc prova' });
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => T['01 Moviments'].push(m));
      const s = r.R2.moviments.find((x) => x.id === m.id);
      afirma(s && s.tipus === 'despesa' && Number(s.import) === 12.34 && s.compte_id === 'b1' && s.creat_per === p.tresoreria.id, 'el moviment no és com es volia: ' + JSON.stringify(s));
      afirma(s.conciliacio === 'pendent' && s.responsable_id === p.tresoreria.id, 'conciliació o responsable posats pel servidor: ' + s.conciliacio + ' ' + s.responsable_id);
      return { ok: true };
    },
  },
  {
    nom: 'Nou moviment: ingrés a l\'efectiu amb event',
    async executa(c) {
      const p = persones(c);
      const ev = c.T['06 Events'].find((e) => e.anyFiscal === AF);
      const dl = c.R.delegacions.find((d) => d.id === ev.delegId);
      const m = movBase({ tipus: 'ing', via: 'Efectiu', areaId: dl.area_id, delegacioId: dl.id, eventId: ev.id, eventNom: ev.nom, import: 100, origenFons: '' });
      const r = await pas(c, inici(c), p.president.email, (T) => T['01 Moviments'].push(m));
      const s = r.R2.moviments.find((x) => x.id === m.id);
      afirma(s.event_id === ev.id && s.conciliacio === 'no_aplica' && s.tipus === 'ingres', 'event o conciliació: ' + JSON.stringify(s));
      return { ok: true };
    },
  },
  {
    nom: 'Nou moviment d\'un responsable de delegació dins de la seua delegació',
    async executa(c) {
      const p = persones(c);
      afirma(p.delegat && p.delegDelegat, 'no hi ha cap delegat amb delegació a la directiva de ' + AF);
      const m = movBase({ areaId: p.delegDelegat.area_id, delegacioId: p.delegDelegat.id, via: 'Efectiu', concepte: 'Despesa delegat' });
      const r = await pas(c, inici(c), p.delegat.email, (T) => T['01 Moviments'].push(m));
      afirma(r.R2.moviments.find((x) => x.id === m.id).creat_per === p.delegat.id, 'creat_per');
      return { ok: true, nota: p.delegat.nom + ' · ' + p.delegDelegat.nom };
    },
  },
  {
    nom: 'Nou moviment: el responsable de delegació NO pot registrar fora de la seua delegació (error clar, res no es desa)',
    async executa(c) {
      const p = persones(c);
      const altra = c.R.delegacions.find((d) => d.id !== p.delegDelegat.id && d.area_id !== p.delegDelegat.area_id);
      const m = movBase({ areaId: altra.area_id, delegacioId: altra.id, via: 'Efectiu' });
      const r = await pas(c, inici(c), p.delegat.email, (T) => T['01 Moviments'].push(m), { espera: 'No tens permís' });
      afirma(!c.R.moviments.some((x) => x.id === m.id), 'no hauria d\'existir');
      return { ok: true, nota: r.error.slice(0, 90) };
    },
  },
  {
    nom: 'Despesa en efectiu pagada amb fons lliurats (moviment + registre de fons)',
    async executa(c) {
      const p = persones(c);
      const m = movBase({ areaId: p.delegDelegat.area_id, delegacioId: p.delegDelegat.id, via: 'Efectiu', origenFons: 'fons_lliurats', import: 7.5, concepte: 'Amb fons' });
      const f = fonsBase({ tipus: 'gast_fons', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 7.5, movimentId: m.id, nota: 'Amb fons' });
      const r = await pas(c, inici(c), p.delegat.email, (T) => { T['01 Moviments'].push(m); T['02 Fons'].push(f); });
      const s = r.R2.fons.find((x) => x.id === f.id);
      afirma(s && s.tipus === 'despesa_fons' && s.moviment_id === m.id && Number(s.import) === 7.5 && s.delegat_id === p.delegat.id, 'fons: ' + JSON.stringify(s));
      afirma(r.R2.moviments.find((x) => x.id === m.id).pagament_efectiu === 'fons_lliurats', 'pagament_efectiu');
      return { ok: true };
    },
  },
  {
    nom: 'Despesa pagada amb avançament personal (moviment + avançament)',
    async executa(c) {
      const p = persones(c);
      const m = movBase({ areaId: p.delegDelegat.area_id, delegacioId: p.delegDelegat.id, via: 'Efectiu', origenFons: 'avanc', import: 20 });
      const f = fonsBase({ tipus: 'avanc', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 20, movimentId: m.id });
      const r = await pas(c, inici(c), p.delegat.email, (T) => { T['01 Moviments'].push(m); T['02 Fons'].push(f); });
      afirma(r.R2.fons.find((x) => x.id === f.id).tipus === 'avancament', 'tipus del fons');
      return { ok: true };
    },
  },
  {
    nom: 'Editar import i concepte d\'una despesa amb fons (el fons segueix l\'import)',
    async executa(c) {
      const p = persones(c);
      const m = movBase({ areaId: p.delegDelegat.area_id, delegacioId: p.delegDelegat.id, via: 'Efectiu', origenFons: 'fons_lliurats', import: 7.5 });
      const f = fonsBase({ tipus: 'gast_fons', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 7.5, movimentId: m.id });
      const r1 = await pas(c, inici(c), p.delegat.email, (T) => { T['01 Moviments'].push(m); T['02 Fons'].push(f); });
      const r2 = await pas(c, r1, p.delegat.email, (T) => {
        const mm = T['01 Moviments'].find((x) => x.id === m.id); mm.concepte = 'Canviat'; mm.import = 9.9;
        T['02 Fons'].find((x) => x.id === f.id).import = 9.9;
      });
      afirma(Number(r2.R2.fons.find((x) => x.id === f.id).import) === 9.9 && r2.R2.moviments.find((x) => x.id === m.id).concepte === 'Canviat', 'no s\'ha actualitzat');
      afirma(!r2.ops.some((o) => o.t === 'fons'), 'no hauria d\'enviar el fons: el manté la base de dades (R5)');
      return { ok: true };
    },
  },
  {
    nom: 'Editar l\'àrea i la delegació d\'un moviment existent (Tresoreria)',
    async executa(c) {
      const p = persones(c);
      const m0 = c.T['01 Moviments'].find((x) => x.origen === 'Manual' && x.anyFiscal === AF && x.via !== 'app' && !x.fontImport && x.origenFons !== 'fons_lliurats' && x.origenFons !== 'avanc');
      const dl = c.R.delegacions.find((d) => d.id !== m0.delegacioId && d.area_id !== m0.areaId);
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => {
        const m = T['01 Moviments'].find((x) => x.id === m0.id); m.areaId = dl.area_id; m.delegacioId = dl.id; m.concepte = 'Editat';
      });
      const s = r.R2.moviments.find((x) => x.id === m0.id);
      afirma(s.delegacio_id === dl.id && s.concepte === 'Editat', 'no s\'ha canviat');
      afirma(r.ops.length === 1 && Object.keys(r.ops[0].f).sort().join() === 'area_id,concepte,delegacio_id', 'només han d\'anar les 3 columnes canviades: ' + JSON.stringify(r.ops));
      return { ok: true };
    },
  },
  {
    nom: 'Esborrar un moviment existent',
    async executa(c) {
      const p = persones(c);
      const m0 = c.T['01 Moviments'].find((x) => x.origen === 'Manual' && x.anyFiscal === AF && !x.fontImport && x.origenFons === 'caixa');
      const r = await pas(c, inici(c), p.president.email, (T) => { T['01 Moviments'] = T['01 Moviments'].filter((x) => x.id !== m0.id); });
      afirma(!r.R2.moviments.some((x) => x.id === m0.id), 'continua existint');
      return { ok: true };
    },
  },
  {
    nom: 'Esborrar una despesa amb fons: el seu registre de fons desapareix per cascada (A-24)',
    async executa(c) {
      const p = persones(c);
      const m = movBase({ areaId: p.delegDelegat.area_id, delegacioId: p.delegDelegat.id, via: 'Efectiu', origenFons: 'avanc', import: 20 });
      const f = fonsBase({ tipus: 'avanc', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 20, movimentId: m.id });
      const r1 = await pas(c, inici(c), p.delegat.email, (T) => { T['01 Moviments'].push(m); T['02 Fons'].push(f); });
      const r2 = await pas(c, r1, p.delegat.email, (T) => {
        T['01 Moviments'] = T['01 Moviments'].filter((x) => x.id !== m.id);
        T['02 Fons'] = T['02 Fons'].filter((x) => x.id !== f.id);
      });
      afirma(!r2.R2.moviments.some((x) => x.id === m.id) && !r2.R2.fons.some((x) => x.id === f.id), 'queden restes');
      afirma(r2.ops.length === 1 && r2.ops[0].t === 'moviments', 'només ha d\'esborrar el moviment: ' + JSON.stringify(r2.ops));
      return { ok: true };
    },
  },

  // ================================================================ Fons delegats (inventari 3.5)
  {
    nom: 'Nou lliurament de fons (origen caixa) i devolució',
    async executa(c) {
      const p = persones(c);
      const l = fonsBase({ tipus: 'lliurament', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 150, origen: 'caixa' });
      const d = fonsBase({ tipus: 'devolucio', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 20 });
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => T['02 Fons'].push(l));
      afirma(r1.R2.fons.find((x) => x.id === l.id).origen === 'caixa', 'origen');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => T['02 Fons'].push(d));
      afirma(r2.R2.fons.find((x) => x.id === d.id).tipus === 'devolucio', 'devolució');
      return { ok: true };
    },
  },
  {
    nom: 'Lliurament amb origen «tercer»: fons + ingrés d\'un tercer en el mateix guardat',
    async executa(c) {
      const p = persones(c);
      const l = fonsBase({ tipus: 'lliurament', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 80, origen: 'tercer' });
      const m = movBase({ tipus: 'ing', via: 'Efectiu', origenFons: 'tercer', import: 80, concepte: 'Ingres tercer (via x)', notes: 'Ingres tercer a x' });
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => { T['02 Fons'].push(l); T['01 Moviments'].push(m); });
      afirma(r.R2.moviments.find((x) => x.id === m.id).font === 'ingres_tercer', 'font');
      afirma(r.R2.fons.find((x) => x.id === l.id).origen === 'tercer', 'origen');
      return { ok: true };
    },
  },
  {
    nom: 'Lliurament amb origen «banc»: traspàs banc → caixa (2 moviments) + fons',
    async executa(c) {
      const p = persones(c);
      const l = fonsBase({ tipus: 'lliurament', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 300, origen: 'banc' });
      const m1 = movBase({ id: id('mx'), concepte: 'Retirada del banc', import: 300, origenFons: 'banc_caixa', notes: 'Traspàs banc → caixa' });
      const m2 = movBase({ id: id('mx'), tipus: 'ing', via: 'Efectiu', concepte: 'Entrada de diners del banc', import: 300, origenFons: 'banc_caixa', notes: 'Traspàs banc → caixa' });
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => { T['01 Moviments'].push(m1, m2); T['02 Fons'].push(l); });
      afirma(r.R2.moviments.filter((x) => x.id === m1.id || x.id === m2.id).every((x) => x.font === 'traspas_banc_caixa'), 'font dels traspassos');
      return { ok: true };
    },
  },
  {
    nom: 'Reclassificar un moviment de l\'extracte com a traspàs (canvia àrea, delegació i notes) + entrada a l\'efectiu',
    async executa(c) {
      const p = persones(c);
      const m0 = c.T['01 Moviments'].find((x) => x.fontImport && x.fontImport.startsWith('xls_') && x.tipus === 'gast' && x.anyFiscal === AF);
      const l = fonsBase({ tipus: 'lliurament', delegId: p.delegat.id, delegEmail: p.delegat.email, import: m0.import, origen: 'banc' });
      const m2 = movBase({ tipus: 'ing', via: 'Efectiu', concepte: 'Entrada de diners del banc', import: m0.import, origenFons: 'banc_caixa' });
      const r = await pas(c, inici(c), p.president.email, (T) => {
        const m = T['01 Moviments'].find((x) => x.id === m0.id); m.areaId = '01'; m.delegacioId = '0102'; m.notes = (m.notes || '') + ' · Traspàs a caixa';
        T['01 Moviments'].push(m2); T['02 Fons'].push(l);
      });
      afirma(r.R2.moviments.find((x) => x.id === m0.id).font === 'extracte', 'el moviment de l\'extracte ha de seguir sent de l\'extracte');
      return { ok: true };
    },
  },
  {
    nom: 'Reintegrament a un delegat i esborrar un registre de fons',
    async executa(c) {
      const p = persones(c);
      const f = fonsBase({ tipus: 'reintegrament', delegId: p.delegat.id, delegEmail: p.delegat.email, import: 30, origen: 'caixa' });
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => T['02 Fons'].push(f));
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => { T['02 Fons'] = T['02 Fons'].filter((x) => x.id !== f.id); });
      afirma(!r2.R2.fons.some((x) => x.id === f.id), 'no s\'ha esborrat');
      return { ok: true };
    },
  },

  // ================================================================ Caixa d'event (inventari 3.6)
  {
    nom: 'Cicle d\'una caixa d\'event: obrir, afegir canvi, retirar, tancar, reobrir i eliminar',
    async executa(c) {
      const p = persones(c);
      const ev = eventLliure(c.T);
      afirma(ev, 'no hi ha cap event de ' + AF + ' sense caixa');
      const dl = c.R.delegacions.find((d) => d.id === ev.delegId);
      const fonsId = id('fc');
      // obrir
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['02 Fons'].push({ id: fonsId, data: DATA, tipus: 'event_canvi', delegId: '_event', delegEmail: '_event', import: 200, nota: ev.nom + ' ' + DATA, registratPer: 'x', anyFiscal: AF, movimentId: '', eventTancamentId: ev.id });
        T['03 Tancaments'].push(tancBase({ eventId: ev.id, eventNom: ev.nom, concepte: ev.nom + ' ' + DATA, canvi: 200, fonsId, registratPer: p.tresoreria.email }));
      });
      const cx = r1.R2.caixes.find((x) => x.id === ev.id);
      afirma(cx && cx.estat === 'oberta' && cx.event_id === ev.id, 'la caixa no s\'ha obert');
      afirma(r1.R2.caixa_canvis.find((x) => x.id === fonsId).tipus === 'lliurament', 'el primer canvi ha de ser el lliurament');
      // afegir canvi
      const fc2 = id('fc');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['02 Fons'].push({ id: fc2, data: DATA, tipus: 'event_canvi', delegId: '_event', delegEmail: '_event', import: 50, nota: 'ampliació', registratPer: 'x', anyFiscal: AF, movimentId: '', eventTancamentId: ev.id });
        T['03 Tancaments'].find((t) => t.eventId === ev.id).canvi = 250;
      });
      afirma(r2.R2.caixa_canvis.find((x) => x.id === fc2).tipus === 'ampliacio', 'el segon canvi ha de ser una ampliació');
      // retirada d'efectiu
      const ret = movBase({ tipus: 'ing', via: 'Efectiu', areaId: dl.area_id, delegacioId: dl.id, eventId: ev.id, eventNom: ev.nom, concepte: 'Retirada efectiu · ' + ev.nom, import: 60, origenFons: '', fontImport: 'retirada_caixa', conciliacio: '' });
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => T['01 Moviments'].push(ret));
      const sr = r3.R2.moviments.find((x) => x.id === ret.id);
      afirma(sr.font === 'retirada_caixa' && sr.caixa_id === ev.id, 'retirada: ' + JSON.stringify(sr));
      // tancar: vendes efectiu, pagaments i devolució del canvi (en un sol guardat, caixa encara oberta quan s'insereix)
      const vend = movBase({ id: id('mx'), tipus: 'ing', via: 'Efectiu', areaId: dl.area_id, delegacioId: dl.id, eventId: ev.id, eventNom: ev.nom, concepte: 'Vendes efectiu · ' + ev.nom, import: 400, origenFons: '', fontImport: 'tancament', conciliacio: '' });
      const pag = movBase({ id: id('mx'), via: 'Efectiu', areaId: dl.area_id, delegacioId: dl.id, eventId: ev.id, eventNom: ev.nom, concepte: 'Pagaments · ' + ev.nom, import: 90, origenFons: '', fontImport: 'tancament', conciliacio: '' });
      const dev = id('fd');
      const r4 = await pas(c, r3, p.tresoreria.email, (T) => {
        T['01 Moviments'].push(vend, pag);
        T['02 Fons'].push({ id: dev, data: DATA, tipus: 'event_canvi_devolucio', delegId: '_event', delegEmail: '_event', import: 250, nota: 'Devolucio canvi', registratPer: 'x', anyFiscal: AF, movimentId: '', eventTancamentId: ev.id });
        const tc = T['03 Tancaments'].find((t) => t.eventId === ev.id);
        Object.assign(tc, { efectiu: 740, tpv: 25, pagaments: 90, estat: 'tancat', tancat: 'true', areaId: dl.area_id, delegacioId: dl.id });
      });
      const cx4 = r4.R2.caixes.find((x) => x.id === ev.id);
      afirma(cx4.estat === 'tancada' && Number(cx4.efectiu) === 740 && Number(cx4.tpv) === 25 && cx4.area_id === dl.area_id, 'caixa tancada: ' + JSON.stringify(cx4));
      afirma(r4.R2.caixa_canvis.find((x) => x.id === dev).tipus === 'devolucio', 'devolució del canvi');
      afirma(r4.R2.moviments.filter((x) => x.caixa_id === ev.id).length === 3, 'moviments de la caixa');
      // reobrir (r1): esborra el moviments del tancament i la devolució, conserva el canvi i la retirada
      const r5 = await pas(c, r4, p.tresoreria.email, (T) => {
        T['01 Moviments'] = T['01 Moviments'].filter((m) => !(m.fontImport === 'tancament' && m.eventId === ev.id));
        T['02 Fons'] = T['02 Fons'].filter((f) => !(f.eventTancamentId === ev.id && f.tipus === 'event_canvi_devolucio'));
        Object.assign(T['03 Tancaments'].find((t) => t.eventId === ev.id), { estat: 'obert', tancat: 'false', efectiu: 0, tpv: 0, pagaments: 0 });
      });
      const cx5 = r5.R2.caixes.find((x) => x.id === ev.id);
      afirma(cx5.estat === 'oberta' && r5.R2.moviments.filter((x) => x.caixa_id === ev.id).length === 1, 'reobrir');
      // eliminar la caixa oberta: s'emporta retirada i canvis per cascada, sense enviar-los
      const r6 = await pas(c, r5, p.tresoreria.email, (T) => {
        delete T['03 Tancaments'].splice(T['03 Tancaments'].findIndex((t) => t.eventId === ev.id), 1);
        T['02 Fons'] = T['02 Fons'].filter((f) => f.eventTancamentId !== ev.id);
        T['01 Moviments'] = T['01 Moviments'].filter((m) => !((m.fontImport === 'tancament' || m.fontImport === 'retirada_caixa') && m.eventId === ev.id));
      });
      afirma(!r6.R2.caixes.some((x) => x.id === ev.id) && !r6.R2.caixa_canvis.some((x) => x.caixa_id === ev.id), 'queden restes');
      afirma(r6.ops.length === 1 && r6.ops[0].t === 'caixes', 'només ha d\'esborrar la caixa: ' + JSON.stringify(r6.ops));
      return { ok: true, nota: ev.nom };
    },
  },
  {
    nom: 'Caixa sense event (descripció i data), tancada amb desquadrament',
    async executa(c) {
      const p = persones(c);
      const caixaId = '_se_prova_15102026';
      const fonsId = id('fc');
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['02 Fons'].push({ id: fonsId, data: DATA, tipus: 'event_canvi', delegId: '_event', delegEmail: '_event', import: 100, nota: 'Prova ' + DATA, registratPer: 'x', anyFiscal: AF, movimentId: '', eventTancamentId: caixaId });
        T['03 Tancaments'].push(tancBase({ eventId: caixaId, eventNom: 'Prova', concepte: 'Prova ' + DATA, canvi: 100, fonsId }));
      });
      afirma(r1.R2.caixes.find((x) => x.id === caixaId).event_id === null, 'event_id ha de ser nul');
      const des = movBase({ id: id('mx'), tipus: 'gast', via: 'Efectiu', concepte: 'Desquadrament caixa · Prova', import: 5, origenFons: '', fontImport: 'tancament', eventId: caixaId, eventNom: 'Prova', conciliacio: '' });
      const dev = id('fd');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['01 Moviments'].push(des);
        T['02 Fons'].push({ id: dev, data: DATA, tipus: 'event_canvi_devolucio', delegId: '_event', delegEmail: '_event', import: 100, nota: 'x', registratPer: 'x', anyFiscal: AF, movimentId: '', eventTancamentId: caixaId });
        Object.assign(T['03 Tancaments'].find((t) => t.eventId === caixaId), { efectiu: 95, estat: 'tancat', tancat: 'true', areaId: '01', delegacioId: '0102' });
      });
      afirma(r2.R2.caixes.find((x) => x.id === caixaId).estat === 'tancada', 'no s\'ha tancat');
      return { ok: true };
    },
  },
  {
    nom: 'Eliminar una caixa tancada existent amb els seus moviments i canvis (r1)',
    async executa(c) {
      const p = persones(c);
      const t0 = c.T['03 Tancaments'].find((t) => t.estat === 'tancat' && t.anyFiscal === AF) || c.T['03 Tancaments'].find((t) => t.estat === 'tancat');
      const motiu = c.R.exercicis.find((e) => e.id === t0.anyFiscal)?.tancat ? 'Prova de neteja' : null;
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['03 Tancaments'] = T['03 Tancaments'].filter((t) => t.eventId !== t0.eventId);
        T['02 Fons'] = T['02 Fons'].filter((f) => f.eventTancamentId !== t0.eventId);
        T['01 Moviments'] = T['01 Moviments'].filter((m) => !((m.fontImport === 'tancament' || m.fontImport === 'retirada_caixa') && m.eventId === t0.eventId));
      }, { motiu });
      afirma(!r.R2.caixes.some((x) => x.id === t0.eventId), 'continua existint');
      afirma(r.ops.length === 1, 'ha de ser una sola operació: ' + JSON.stringify(r.ops));
      return { ok: true, nota: t0.eventNom };
    },
  },

  // ================================================================ Pressupostos (inventari 3.7)
  {
    nom: 'Pressupost: línia global d\'event, conceptes amb la línia Varis, esborrar un concepte',
    async executa(c) {
      const p = persones(c);
      const ev = c.T['06 Events'].find((e) => e.anyFiscal === AF && !c.T['10 Pressupostos Plans'].some((l) => l.eventId === e.id));
      const lin = (o) => ({ any: AF, delegacioId: ev.delegId, delegacioNom: 'x', eventId: ev.id, eventNom: ev.nom, concepte: '', tipus: 'event', importPla: 1000, notes: '', ...o });
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => T['10 Pressupostos Plans'].push(lin({})));
      // afegir un concepte: el global es reparteix (concepte 300 + Varis 700)
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['10 Pressupostos Plans'] = T['10 Pressupostos Plans'].filter((l) => !(l.eventId === ev.id && !l.concepte));
        T['10 Pressupostos Plans'].push(lin({ concepte: 'Cadires', tipus: 'concepte', importPla: 300 }), lin({ concepte: 'Varis', tipus: 'concepte', importPla: 700, notes: 'Auto' }));
      });
      const varis = r2.R2.pressupost_linies.find((l) => l.event_id === ev.id && l.concepte === 'Varis');
      afirma(varis && varis.tipus === 'varis' && Number(varis.import) === 700, 'Varis ha de quedar com a tipus varis: ' + JSON.stringify(varis));
      // esborrar el concepte: els diners tornen a Varis (1000) i, sol, es fusiona en una línia global
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => {
        T['10 Pressupostos Plans'] = T['10 Pressupostos Plans'].filter((l) => l.eventId !== ev.id);
        T['10 Pressupostos Plans'].push(lin({}));
      });
      afirma(r3.R2.pressupost_linies.filter((l) => l.event_id === ev.id).length === 1, 'ha de quedar una sola línia');
      return { ok: true };
    },
  },
  {
    nom: 'Pressupost: bloquejar i aprovar, un canvi bloquejat és rebutjat, desbloquejar amb motiu',
    async executa(c) {
      const p = persones(c);
      const ev = c.T['06 Events'].find((e) => e.anyFiscal === AF);
      const lin = { any: AF, delegacioId: ev.delegId, delegacioNom: 'x', eventId: ev.id, eventNom: ev.nom, concepte: 'Concepte prova', tipus: 'concepte', importPla: 10, notes: '' };
      const blo = { any: AF, estat: 'bloquejat', bloquejatPer: 'x', bloquejatEmail: 'x', data: DATA };
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['11 Pressupostos Config'] = [blo];
        T['12 Pressupostos Historial'].push({ data: DATA, accio: 'bloquejat', any: AF, usuari: 'x', email: 'x', motiu: '' });
      });
      afirma(r1.R2.pressupost_estat.find((x) => x.exercici_id === AF).estat === 'bloquejat', 'estat');
      const e = await pas(c, r1, p.tresoreria.email, (T) => T['10 Pressupostos Plans'].push(lin), { espera: 'row-level security' });
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['11 Pressupostos Config'] = [{ any: AF, estat: 'obert', bloquejatPer: '', bloquejatEmail: '', data: DATA }];
        T['12 Pressupostos Historial'].push({ data: DATA, accio: 'desbloquejat', any: AF, usuari: 'x', email: 'x', motiu: 'Cal corregir' });
      });
      afirma(r2.R2.pressupost_estat.find((x) => x.exercici_id === AF).estat === 'obert', 'desbloquejat');
      afirma(compta(r2.R2, 'pressupost_historial', (h) => h.exercici_id === AF) === 2, 'historial');
      return { ok: true, nota: 'rebutjat: ' + e.error.slice(0, 60) };
    },
  },
  {
    nom: 'Pressupost: nou exercici, copiar el pressupost i la directiva, i eliminar-lo',
    async executa(c) {
      const p = persones(c);
      const nou = '27/28';
      const r1 = await pas(c, inici(c), p.president.email, (T) => {
        const cfg = (k) => T['00 Config'].find((x) => x.clau === k);
        const ex = JSON.parse(cfg('exercicis').valor); ex.push(nou); cfg('exercicis').valor = JSON.stringify(ex);
        const st = JSON.parse(cfg('estats_exercicis').valor); st[nou] = { tancat: false, dataObertura: '01/04/2027', dataTancament: '', test: true }; cfg('estats_exercicis').valor = JSON.stringify(st);
        T['15 Saldos'].push({ bancId: 'b1', anyFiscal: nou, saldoInicial: 123.45, saldoData: '01/04/2027' });
        const dir = T['09 Usuaris Assignacions'].filter((a) => a.anyFiscal === AF).slice(0, 3).map((a) => ({ ...a, anyFiscal: nou }));
        T['09 Usuaris Assignacions'].push(...dir);
        const pl = T['10 Pressupostos Plans'].filter((l) => l.any === AF).slice(0, 3).map((l) => ({ ...l, any: nou, importPla: Math.round(l.importPla * 1.1), notes: 'Copiat de ' + AF }));
        T['10 Pressupostos Plans'].push(...pl);
      });
      const ex = r1.R2.exercicis.find((e) => e.id === nou);
      afirma(ex && ex.data_inici.slice(0, 10) === '2027-04-01' && ex.es_prova === true, 'exercici: ' + JSON.stringify(ex));
      afirma(compta(r1.R2, 'directiva', (d) => d.exercici_id === nou) === 3 && compta(r1.R2, 'pressupost_linies', (l) => l.exercici_id === nou) >= 1, 'directiva o pressupost');
      // eliminar l'exercici: tot el que hi penja marxa per cascada
      const r2 = await pas(c, r1, p.president.email, (T) => {
        const cfg = (k) => T['00 Config'].find((x) => x.clau === k);
        cfg('exercicis').valor = JSON.stringify(JSON.parse(cfg('exercicis').valor).filter((e) => e !== nou));
        const st = JSON.parse(cfg('estats_exercicis').valor); delete st[nou]; cfg('estats_exercicis').valor = JSON.stringify(st);
        T['15 Saldos'] = T['15 Saldos'].filter((s) => s.anyFiscal !== nou);
        T['09 Usuaris Assignacions'] = T['09 Usuaris Assignacions'].filter((a) => a.anyFiscal !== nou);
        T['10 Pressupostos Plans'] = T['10 Pressupostos Plans'].filter((l) => l.any !== nou);
      });
      afirma(!r2.R2.exercicis.some((e) => e.id === nou), 'continua existint');
      afirma(r2.ops.length === 1 && r2.ops[0].t === 'exercicis', 'només ha d\'esborrar l\'exercici: ' + r2.resum);
      return { ok: true };
    },
  },

  // ================================================================ Configuració (inventari 3.12) i directiva (3.13)
  {
    nom: 'Configuració: àrea i delegació noves, editar-les i eliminar-les',
    async executa(c) {
      const p = persones(c);
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['04 Arees'].push({ id: '98', nom: 'Àrea de prova', responsable: '' });
        T['05 Delegacions'].push({ id: '9801', areaId: '98', nom: 'Delegació de prova', responsable: '' });
      });
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['04 Arees'].find((a) => a.id === '98').nom = 'Àrea de prova (editada)';
        T['05 Delegacions'].find((d) => d.id === '9801').nom = 'Delegació editada';
      });
      afirma(r2.R2.arees.find((a) => a.id === '98').nom.includes('editada'), 'edició');
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => {
        T['04 Arees'] = T['04 Arees'].filter((a) => a.id !== '98');
        T['05 Delegacions'] = T['05 Delegacions'].filter((d) => d.id !== '9801');
      });
      afirma(!r3.R2.arees.some((a) => a.id === '98') && !r3.R2.delegacions.some((d) => d.id === '9801'), 'esborrat');
      return { ok: true };
    },
  },
  {
    nom: 'Configuració: event nou, editar-lo, marcar-lo «per defecte» (desmarcant l\'altre) i eliminar-lo',
    async executa(c) {
      const p = persones(c);
      const dl = c.R.delegacions.find((d) => d.id === '0401') || c.R.delegacions[0];
      const ev = { id: id('e'), delegId: dl.id, nom: 'Event de prova', year: AF, responsable: '', status: 'pendent', dataInici: '2026-11-01', horaInici: '20:00', dataFi: '2026-11-02', horaFi: '02:00', anyFiscal: AF, perDefecte: 'true' };
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['06 Events'].forEach((e) => { if (e.anyFiscal === AF) e.perDefecte = ''; });
        T['06 Events'].push(ev);
      });
      afirma(r1.R2.events.filter((e) => e.exercici_id === AF && e.per_defecte).length === 1 && r1.R2.events.find((e) => e.id === ev.id).per_defecte, 'un sol per defecte');
      const resp = c.T['08 Usuaris'].find((u) => u.rol === 'area');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => { const e = T['06 Events'].find((x) => x.id === ev.id); e.nom = 'Event editat'; e.responsable = resp.nom; e.dataFi = '2026-11-03'; });
      afirma(r2.R2.events.find((e) => e.id === ev.id).responsable_id === resp.id, 'responsable');
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => { T['06 Events'] = T['06 Events'].filter((e) => e.id !== ev.id); });
      afirma(!r3.R2.events.some((e) => e.id === ev.id), 'esborrat');
      return { ok: true };
    },
  },
  {
    nom: 'Configuració: banc nou amb saldo inicial, editar-lo i eliminar-lo',
    async executa(c) {
      const p = persones(c);
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['07 Bancs'].push({ id: 'b9999', codi: '09 Banc', nom: 'Banc de prova', tipus: 'bank', compte: 'ES91 2100 0418 4502 0005 1332' });
        T['15 Saldos'].push({ bancId: 'b9999', anyFiscal: AF, saldoInicial: 1000, saldoData: '01/04/2026' });
      });
      afirma(r1.R2.comptes.find((b) => b.id === 'b9999').tipus === 'banc', 'compte');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['07 Bancs'].find((b) => b.id === 'b9999').nom = 'Banc editat';
        T['15 Saldos'].find((s) => s.bancId === 'b9999').saldoInicial = 1500.5;
      });
      afirma(Number(r2.R2.saldos_inicials.find((s) => s.compte_id === 'b9999').import) === 1500.5, 'saldo');
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => {
        T['07 Bancs'] = T['07 Bancs'].filter((b) => b.id !== 'b9999');
        T['15 Saldos'] = T['15 Saldos'].filter((s) => s.bancId !== 'b9999');
      });
      afirma(!r3.R2.comptes.some((b) => b.id === 'b9999'), 'esborrat');
      return { ok: true };
    },
  },
  {
    nom: 'Directiva: afegir i treure responsables d\'àrea i delegació',
    async executa(c) {
      const p = persones(c);
      const u = c.T['08 Usuaris'].find((x) => x.rol === 'delegat');
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['09 Usuaris Assignacions'].push({ userId: u.id, userNom: u.nom, tipus: 'area', id: '07', nom: 'x', anyFiscal: AF }, { userId: u.id, userNom: u.nom, tipus: 'delegacio', id: '0401', nom: 'x', anyFiscal: AF });
      });
      afirma(compta(r1.R2, 'directiva', (d) => d.usuari_id === u.id && d.exercici_id === AF && (d.area_id === '07' || d.delegacio_id === '0401')) === 2, 'afegides');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        T['09 Usuaris Assignacions'] = T['09 Usuaris Assignacions'].filter((a) => !(a.userId === u.id && a.anyFiscal === AF && ((a.tipus === 'area' && a.id === '07') || (a.tipus === 'delegacio' && a.id === '0401'))));
      });
      afirma(compta(r2.R2, 'directiva', (d) => d.usuari_id === u.id && d.exercici_id === AF && (d.area_id === '07' || d.delegacio_id === '0401')) === 0, 'treure');
      return { ok: true };
    },
  },
  {
    nom: 'Usuaris: alta amb rol, canvi de rol i baixa (es desactiva, no s\'esborra)',
    async executa(c) {
      const p = persones(c);
      const nou = { id: 'uprova1', nom: 'Persona de Prova', email: 'Persona.Prova@Exemple.com', rol: 'delegat' };
      const r1 = await pas(c, inici(c), p.president.email, (T) => T['08 Usuaris'].push(nou));
      const s = r1.R2.usuaris.find((u) => u.id === nou.id);
      afirma(s && s.email === 'persona.prova@exemple.com' && r1.R2.usuari_rols.some((r) => r.usuari_id === nou.id && r.rol_id === 'delegat'), 'alta');
      const r2 = await pas(c, r1, p.president.email, (T) => { const u = T['08 Usuaris'].find((x) => x.id === nou.id); u.rol = 'area'; u.nom = 'Persona Canviada'; });
      afirma(r2.R2.usuari_rols.filter((r) => r.usuari_id === nou.id).map((r) => r.rol_id).join() === 'area', 'rol');
      const r3 = await pas(c, r2, p.president.email, (T) => { T['08 Usuaris'] = T['08 Usuaris'].filter((x) => x.id !== nou.id); });
      afirma(r3.R2.usuaris.find((u) => u.id === nou.id).actiu === false && !r3.R2.usuari_rols.some((r) => r.usuari_id === nou.id), 'baixa');
      return { ok: true };
    },
  },
  {
    nom: 'Regles d\'importació: crear, editar i eliminar',
    async executa(c) {
      const p = persones(c);
      const reg = { id: id('r'), font: '01 Banc', patrons: 'PROVA1,PROVA2', areaId: '01', areaNom: 'x', delegacioId: '0102', delegacioNom: 'x', concepte: 'Prova', tipus: 'auto', movtype: 'gast', prioritat: 5, activa: true };
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => T['13 Regles CSV'].push(reg));
      afirma(r1.R2.regles_importacio.find((r) => r.id === reg.id).patrons.join() === 'PROVA1,PROVA2', 'patrons');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => { const r = T['13 Regles CSV'].find((x) => x.id === reg.id); r.patrons = 'PROVA3'; r.activa = false; r.tipus = 'ignore'; r.areaId = ''; r.delegacioId = ''; });
      const s = r2.R2.regles_importacio.find((r) => r.id === reg.id);
      afirma(s.tipus === 'ignorar' && s.activa === false && s.area_id === null, 'edició: ' + JSON.stringify(s));
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => { T['13 Regles CSV'] = T['13 Regles CSV'].filter((x) => x.id !== reg.id); });
      afirma(!r3.R2.regles_importacio.some((r) => r.id === reg.id), 'esborrat');
      return { ok: true };
    },
  },
  {
    nom: 'Traspassos (D-049): marcar i desmarcar un moviment, i una regla que marca traspassos',
    async executa(c) {
      const p = persones(c);
      let mid = null;
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        const m = T['01 Moviments'].find((x) => x.anyFiscal === '26/27' && x.via !== 'app' && x.traspas !== 'true');
        mid = m.id; m.traspas = 'true';
      });
      afirma(r1.R2.moviments.find((m) => m.id === mid).traspas === true, 'marcar el moviment');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => { T['01 Moviments'].find((x) => x.id === mid).traspas = ''; });
      afirma(r2.R2.moviments.find((m) => m.id === mid).traspas === false, 'desmarcar el moviment');
      const reg = { id: id('r'), font: '01 Banc', patrons: 'TRASPASO PROPIO PROVA', areaId: '01', areaNom: 'x', delegacioId: '0102', delegacioNom: 'x', concepte: '', tipus: 'auto', movtype: 'auto', prioritat: 5, activa: true, traspas: 'true' };
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => T['13 Regles CSV'].push(reg));
      afirma(r3.R2.regles_importacio.find((r) => r.id === reg.id).traspas === true, 'regla de traspàs');
      return { ok: true };
    },
  },
  {
    nom: 'Rols: rol nou, permís, color i eliminar',
    async executa(c) {
      const p = persones(c);
      const rol = { id: 'rol_prova', label: 'Rol de prova', color: 'p-ok', canRegister: 'false', canFons: 'false', canImport: 'false', canConfig: 'false', canUsers: 'false', viewAll: 'false', custom: 'true' };
      const r1 = await pas(c, inici(c), p.president.email, (T) => T['14 Rols'].push(rol));
      afirma(r1.R2.rols.find((r) => r.id === 'rol_prova').de_sistema === false, 'rol');
      const r2 = await pas(c, r1, p.president.email, (T) => { const r = T['14 Rols'].find((x) => x.id === 'rol_prova'); r.canRegister = 'true'; r.canImport = 'true'; r.color = 'p-warn'; });
      const mods = r2.R2.rol_moduls.filter((m) => m.rol_id === 'rol_prova').map((m) => m.modul_id + ':' + m.nivell).sort().join();
      afirma(mods === 'fallesapp:edicio,importacio:edicio,moviments:edicio', 'permisos: ' + mods);
      const r3 = await pas(c, r2, p.president.email, (T) => { T['14 Rols'].find((x) => x.id === 'rol_prova').canImport = 'false'; });
      afirma(r3.R2.rol_moduls.filter((m) => m.rol_id === 'rol_prova').length === 1, 'treure permís');
      const r4 = await pas(c, r3, p.president.email, (T) => { T['14 Rols'] = T['14 Rols'].filter((x) => x.id !== 'rol_prova'); });
      afirma(!r4.R2.rols.some((r) => r.id === 'rol_prova') && !r4.R2.rol_moduls.some((m) => m.rol_id === 'rol_prova'), 'eliminar');
      return { ok: true };
    },
  },
  {
    nom: 'Configuració: justificants (mode i llindar), exercici actiu, tancar i reobrir l\'exercici',
    async executa(c) {
      const p = persones(c);
      const r1 = await pas(c, inici(c), p.tresoreria.email, (T) => {
        const cfg = (k) => T['00 Config'].find((x) => x.clau === k);
        const j = cfg('justificant'); if (j) j.valor = JSON.stringify({ mode: 'import', llindar: 75 }); else T['00 Config'].push({ clau: 'justificant', valor: JSON.stringify({ mode: 'import', llindar: 75 }) });
      });
      afirma(r1.R2.config.find((x) => x.clau === 'justificant').valor.llindar === 75, 'justificant');
      const r2 = await pas(c, r1, p.tresoreria.email, (T) => {
        const cfg = (k) => T['00 Config'].find((x) => x.clau === k);
        const st = JSON.parse(cfg('estats_exercicis').valor); st[AF] = { ...st[AF], tancat: true, dataTancament: '31/03/2027' }; cfg('estats_exercicis').valor = JSON.stringify(st);
      });
      afirma(r2.R2.exercicis.find((e) => e.id === AF).tancat === true, 'tancat');
      const r3 = await pas(c, r2, p.tresoreria.email, (T) => {
        const cfg = (k) => T['00 Config'].find((x) => x.clau === k);
        const st = JSON.parse(cfg('estats_exercicis').valor); st[AF] = { ...st[AF], tancat: false, dataTancament: '' }; cfg('estats_exercicis').valor = JSON.stringify(st);
      });
      afirma(r3.R2.exercicis.find((e) => e.id === AF).tancat === false, 'reobert');
      const r4 = await pas(c, r3, p.tresoreria.email, (T) => { T['00 Config'].find((x) => x.clau === 'anyFiscal').valor = '25/26'; });
      afirma(r4.R2.config.find((x) => x.clau === 'exercici_actiu').valor === '25/26', 'exercici actiu');
      return { ok: true };
    },
  },

  // ================================================================ Falles.app (3.8) i importació d'extractes (3.9)
  {
    nom: 'Falles.app: passiu, bonificació (Virtual), transacció d\'efectiu amb empremta i consums per event',
    async executa(c) {
      const p = persones(c);
      const ev = c.T['06 Events'].find((e) => e.anyFiscal === AF);
      const dl = c.R.delegacions.find((d) => d.id === ev.delegId);
      const bon = movBase({ via: 'Virtual', concepte: 'Bonificació falles.app', import: 40, origenFons: '', fontImport: 'fallesapp_bonif', origen: 'App', conciliacio: 'no_aplica' });
      const tr = movBase({ tipus: 'ing', via: 'Efectiu', concepte: 'Recàrregues efectiu', import: 500, origenFons: '', fontImport: 'fallesapp', origen: 'App', bankHash: 'hash-prova-123', conciliacio: 'no_aplica' });
      const con = movBase({ tipus: 'ing', via: 'app', areaId: dl.area_id, delegacioId: dl.id, eventId: ev.id, eventNom: ev.nom, concepte: 'Consums', import: 250, origenFons: '', fontImport: 'fallesapp_tickets', origen: 'App', conciliacio: 'no_aplica' });
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => {
        T['01 Moviments'].push(bon, tr, con);
        T['16 Fapp Passiu'].push({ data: DATA, total: 1234.56, fallers: 30, anyFiscal: AF });
      });
      afirma(r.R2.moviments.find((m) => m.id === bon.id).compte_id === 'virtual', 'compte virtual');
      afirma(r.R2.moviments.find((m) => m.id === tr.id).empremta === 'hash-prova-123', 'empremta de la importació');
      afirma(r.R2.fallesapp_consums.some((k) => k.id === con.id), 'consums');
      afirma(Number(r.R2.fallesapp_passiu.find((x) => x.data.slice(0, 10) === '2026-10-15').total) === 1234.56, 'passiu');
      return { ok: true };
    },
  },
  {
    nom: 'Importació d\'extracte: moviments del banc amb empremta, conciliats pel servidor',
    async executa(c) {
      const p = persones(c);
      const mov = (i) => movBase({ id: id('mx') + i, via: '01 Banc', tipus: i % 2 ? 'ing' : 'gast', concepte: 'Extracte ' + i, import: 10 + i, fontImport: 'xls_b1', origen: 'CSV', bankHash: 'b1|15/10/2026|' + (10 + i) + '|extracte ' + i, conciliacio: 'conciliat' });
      const movs = [1, 2, 3].map(mov);
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => T['01 Moviments'].push(...movs));
      afirma(movs.every((m) => { const s = r.R2.moviments.find((x) => x.id === m.id); return s.font === 'extracte' && s.conciliacio === 'conciliat' && s.empremta === m.bankHash && s.responsable_id === null; }), 'extracte');
      return { ok: true };
    },
  },

  // ================================================================ Exercici tancat (D-029)
  {
    nom: 'Exercici tancat: escriure-hi sense motiu és rebutjat; amb motiu, Tresoreria ho pot fer i queda marcat',
    async executa(c) {
      const p = persones(c);
      const tancat = c.R.exercicis.find((e) => e.tancat);
      if (!tancat) return { ok: true, nota: 'cap exercici tancat a la base de dades: no s\'ha pogut provar' };
      const y = 2000 + Number(tancat.id.slice(0, 2));
      const m = movBase({ anyFiscal: tancat.id, data: '15/06/' + y, concepte: 'Excepció' });
      const e = await pas(c, inici(c), p.tresoreria.email, (T) => T['01 Moviments'].push(m), { espera: 'està tancat' });
      const r = await pas(c, inici(c), p.tresoreria.email, (T) => T['01 Moviments'].push(m), { motiu: 'Factura arribada tard' });
      const s = r.R2.moviments.find((x) => x.id === m.id);
      afirma(s.imputacio_excepcional === true && s.motiu_imputacio === 'Factura arribada tard', 'excepció: ' + JSON.stringify(s));
      return { ok: true, nota: e.error.slice(0, 70) };
    },
  },
  {
    nom: 'Un guardat sense canvis no envia res; un moviment amb data fora de tot exercici és rebutjat',
    async executa(c) {
      const p = persones(c);
      afirma(c.A.sbCanvis(c.base, c.taules(c.clona(c.T))).length === 0, 'canvis fantasma');
      const m = movBase({ data: '15/10/2040', anyFiscal: '' });
      const e = await pas(c, inici(c), p.tresoreria.email, (T) => T['01 Moviments'].push(m), { espera: 'no és dins de cap exercici' });
      return { ok: true, nota: e.error.slice(0, 70) };
    },
  },
];
