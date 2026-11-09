// WS-PREVISIO, càrrega única (10/11/2026): els compromisos d'artistes de la Falla Gran i la Falla Infantil del 26/27 i el vincle amb els pagaments ja fets.
//
//   node tools/previsio_carrega_artistes.mjs            simulació: mostra què es crearia i quin moviment s'enllaçaria a cada termini
//   node tools/previsio_carrega_artistes.mjs --aplica   ho escriu, tot en una transacció (si alguna cosa falla, no es desa res)
//
// Dades (Emilio, 10/11): vegeu WORKSTREAM_STATUS.md («Compromisos d'artistes per carregar»). No duplica: si ja hi ha compromisos amb estos mateixos noms, s'atura.
// Els terminis ja pagats s'enllacen al moviment real (import igual i data a menys de 25 dies, sense repetir moviment); els pendents queden sense vincular.

import { connectaRemot } from './connexio.mjs';

const aplica = process.argv.includes('--aplica');
const EX = '26/27';

const mes = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// mesos de l'exercici: maig 2026 … març 2027
const MESOS = [[2026, 5], [2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2], [2027, 3]];

const COMPROMISOS = [
  {
    nom: 'Gran amb factura', proveidor: 'Artista Falla Gran', concepte: 'Falla Gran 2027 · amb factura', delegacio: '0601', import: 33275, signat: null,
    notes: '3.025 €/mes de maig a març (dia 5). El paper deia 33.725 € de total: era un error (11 × 3.025 = 33.275 €).',
    terminis: MESOS.map(([y, m]) => ({ data: m === 5 ? mes(y, m, 25) : mes(y, m, 5), import: 3025 })),
  },
  {
    nom: 'Gran fora de factura', proveidor: 'Artista Falla Gran', concepte: 'Falla Gran 2027 · fora de factura', delegacio: '0601', import: 11725, signat: null,
    notes: '1.000 €/mes de maig a febrer i 1.275 € + 450 € de l\'error del calendari al març (1.725 €). Els 8.000 € ja pagats són 3 pagaments en efectiu (fons lliurats d\'Arturo) que cobreixen de maig a desembre.',
    terminis: [
      { data: '2026-06-12', import: 3000 }, { data: '2026-09-26', import: 3000 }, { data: '2026-10-27', import: 2000 },
      { data: '2027-01-01', import: 1000 }, { data: '2027-02-01', import: 1000 }, { data: '2027-03-01', import: 1725 },
    ],
  },
  {
    nom: 'Infantil amb factura', proveidor: 'Gonzalo Rojas Rodríguez', concepte: 'Falla Infantil 2027 «Cos i Ment» · amb factura', delegacio: '0602', import: 14000, signat: '2026-04-01',
    notes: 'Contracte d\'1/04/2026: 12.727,27 € + 1.272,73 € d\'IVA. 3.000 € l\'1 d\'abril i 1.000 € l\'1 de cada mes de maig a març.',
    terminis: [{ data: '2026-04-01', import: 3000 }].concat(MESOS.map(([y, m]) => ({ data: mes(y, m, 1), import: 1000 }))),
  },
  {
    nom: 'Infantil fora de factura', proveidor: 'Gonzalo Rojas Rodríguez', concepte: 'Falla Infantil 2027 · fora de factura', delegacio: '0602', import: 10000, signat: null,
    notes: '10.000 € fora de factura: 2 × 2.500 € ja pagats en efectiu (23/06 i 30/09) i 2.500 € al desembre i 2.500 € al març (dies aproximats: 15).',
    terminis: [{ data: '2026-06-23', import: 2500 }, { data: '2026-09-30', import: 2500 }, { data: '2026-12-15', import: 2500 }, { data: '2027-03-15', import: 2500 }],
  },
];

const dies = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const eur = (n) => Number(n).toLocaleString('ca-ES', { minimumFractionDigits: 2 }) + ' €';

const db = await connectaRemot();
try {
  console.log(`Connectat: ${db.descripcio}`);
  const ja = await db.query('select proveidor, concepte from public.compromisos where exercici_id = $1', [EX]);
  const dup = COMPROMISOS.filter((c) => ja.some((x) => x.concepte === c.concepte));
  if (dup.length) throw new Error('Ja existeixen: ' + dup.map((c) => c.concepte).join(', ') + '. No es duplica res.');
  for (const c of COMPROMISOS) {
    const suma = c.terminis.reduce((s, t) => s + t.import, 0);
    if (Math.abs(suma - c.import) > 0.005) throw new Error(`${c.nom}: els terminis sumen ${suma} i l'import és ${c.import}`);
  }
  const movs = await db.query(`select m.id, m.data, m.import, m.concepte, m.delegacio_id, c.codi as via
    from public.moviments m left join public.comptes c on c.id = m.compte_id
    where m.tipus = 'despesa' and m.exercici_id = $1`, [EX]);
  const usats = new Set();
  const trobaMoviment = (t) => {
    const c = movs.filter((m) => !usats.has(m.id) && Math.abs(Number(m.import) - t.import) < 0.005 && dies(iso(m.data), t.data) <= 25)
      .sort((a, b) => dies(iso(a.data), t.data) - dies(iso(b.data), t.data));
    return c[0] || null;
  };

  const dades = [];
  for (const c of COMPROMISOS) {
    console.log(`\n== ${c.nom} · ${c.proveidor} · ${c.delegacio} · ${eur(c.import)}`);
    const fila = { c, terminis: [] };
    for (const t of c.terminis) {
      const hoPagat = t.data <= '2026-11-09';
      const m = hoPagat ? trobaMoviment(t) : null;
      if (m) usats.add(m.id);
      fila.terminis.push({ ...t, moviment: m });
      console.log(`  ${t.data} ${eur(t.import).padStart(12)}  ` + (m ? `✓ ${iso(m.data)} ${m.via || ''} «${String(m.concepte).slice(0, 34)}» (${m.delegacio_id})` : (hoPagat ? '⚠ sense pagament als extractes' : 'pendent')));
    }
    dades.push(fila);
  }
  const vinc = dades.reduce((s, f) => s + f.terminis.filter((t) => t.moviment).length, 0);
  const pend = dades.reduce((s, f) => s + f.terminis.filter((t) => !t.moviment).reduce((x, t) => x + t.import, 0), 0);
  console.log(`\n${COMPROMISOS.length} compromisos, ${dades.reduce((s, f) => s + f.terminis.length, 0)} terminis, ${vinc} enllaçats amb un pagament real, pendent ${eur(pend)}.`);

  if (!aplica) { console.log('\nSimulació: no s\'ha escrit res. Torna a executar amb --aplica.'); }
  else {
    await db.exec('begin');
    try {
      for (const f of dades) {
        const r = await db.query(`insert into public.compromisos (exercici_id, delegacio_id, sentit, proveidor, concepte, import, data_signatura, estat, notes)
          values ($1, $2, 'despesa', $3, $4, $5, $6, 'viu', $7) returning id`, [EX, f.c.delegacio, f.c.proveidor, f.c.concepte, f.c.import, f.c.signat, f.c.notes]);
        for (const t of f.terminis) {
          await db.query('insert into public.compromis_terminis (compromis_id, data_prevista, import, moviment_id) values ($1, $2, $3, $4)',
            [r[0].id, t.data, t.import, t.moviment ? t.moviment.id : null]);
        }
      }
      await db.exec('commit');
      console.log('\n✓ Escrit.');
    } catch (e) { await db.exec('rollback'); throw e; }
  }
} finally { await db.tanca(); }
