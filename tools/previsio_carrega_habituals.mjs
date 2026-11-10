// WS-PREVISIO, càrrega única (10/11/2026): lloguer del casal i estimacions de despeses habituals (llibret, carpa i muntatges, coordinació tècnica).
//
//   node tools/previsio_carrega_habituals.mjs            simulació: mostra què es crearia i quin moviment s'enllaçaria a cada termini
//   node tools/previsio_carrega_habituals.mjs --aplica   ho escriu, tot en una transacció (si alguna cosa falla, no es desa res)
//
// Dades (Emilio, 10/11): lloguer 13.800 € del pressupost menys 2.448 € ja pagats (13/08): 6.000 € aquest mes i 5.352 € al març; llibret com el 25/26 (4.924 €,
// febrer); carpa i muntatges 5.000 € i coordinació tècnica 4.000 € (inclou presentació) com a previsió; res d'App i pulseres. Les dates dels terminis estimats són
// provisionals. Burgos NO s'hi carrega: Emilio passarà el contracte i es decidiran els terminis. No duplica: s'atura si ja hi ha compromisos amb estos conceptes.

import { connectaRemot } from './connexio.mjs';

const aplica = process.argv.includes('--aplica');
const EX = '26/27';

const COMPROMISOS = [
  {
    proveidor: 'Lloguer del casal', concepte: 'Lloguer del casal 26/27', delegacio: '0704', import: 13800, signat: null,
    notes: 'Pressupost 26/27: 13.800 €. Pagats 2.448 € el 13/08/2026; 6.000 € aquest mes (novembre) i la resta (5.352 €) al març (Emilio, 10/11).',
    terminis: [{ data: '2026-08-13', import: 2448 }, { data: '2026-11-15', import: 6000 }, { data: '2027-03-01', import: 5352 }],
  },
  {
    proveidor: 'Estimació (patró 25/26)', concepte: 'Llibret (estimació com el 25/26)', delegacio: '0303', import: 4924, signat: null,
    notes: 'El 25/26: 2.745,60 € i 2.178 € al febrer (llibrets). Sense el llibret del 50è aniversari (1.378 €, d\'una sola vegada). Data provisional.',
    terminis: [{ data: '2027-02-10', import: 4924 }],
  },
  {
    proveidor: 'Estimació (provisió)', concepte: 'Carpa i muntatges (provisió 5.000 €)', delegacio: '0701', import: 5000, signat: null,
    notes: 'Provisió d\'Emilio (10/11). El 25/26, de novembre a febrer: 4.584 €. Dates provisionals.',
    terminis: [{ data: '2027-01-15', import: 1500 }, { data: '2027-02-15', import: 1500 }, { data: '2027-03-10', import: 2000 }],
  },
  {
    proveidor: 'Estimació (provisió)', concepte: 'Coordinació tècnica i presentació (provisió 4.000 €)', delegacio: '0703', import: 4000, signat: null,
    notes: 'Provisió d\'Emilio (10/11): inclou els gastos de la presentació. Sense App i pulseres (no hi ha despesa). Dates provisionals.',
    terminis: [{ data: '2027-01-15', import: 1000 }, { data: '2027-02-15', import: 1300 }, { data: '2027-03-10', import: 1700 }],
  },
];

const dies = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const eur = (n) => Number(n).toLocaleString('ca-ES', { minimumFractionDigits: 2 }) + ' €';

const db = await connectaRemot();
try {
  console.log(`Connectat: ${db.descripcio}`);
  const ja = await db.query('select concepte from public.compromisos where exercici_id = $1', [EX]);
  const dup = COMPROMISOS.filter((c) => ja.some((x) => x.concepte === c.concepte));
  if (dup.length) throw new Error('Ja existeixen: ' + dup.map((c) => c.concepte).join(', ') + '. No es duplica res.');
  for (const c of COMPROMISOS) {
    const suma = c.terminis.reduce((s, t) => s + t.import, 0);
    if (Math.abs(suma - c.import) > 0.005) throw new Error(`${c.concepte}: els terminis sumen ${suma} i l'import és ${c.import}`);
  }
  const movs = await db.query(`select m.id, m.data, m.import, m.concepte from public.moviments m where m.tipus = 'despesa' and m.exercici_id = $1`, [EX]);
  const usats = new Set();
  const trobaMoviment = (t) => movs.filter((m) => !usats.has(m.id) && Math.abs(Number(m.import) - t.import) < 0.005 && dies(iso(m.data), t.data) <= 25)
    .sort((a, b) => dies(iso(a.data), t.data) - dies(iso(b.data), t.data))[0] || null;

  const dades = [];
  for (const c of COMPROMISOS) {
    console.log(`\n== ${c.concepte} · ${c.delegacio} · ${eur(c.import)}`);
    const fila = { c, terminis: [] };
    for (const t of c.terminis) {
      const m = t.data <= '2026-11-09' ? trobaMoviment(t) : null;
      if (m) usats.add(m.id);
      fila.terminis.push({ ...t, moviment: m });
      console.log(`  ${t.data} ${eur(t.import).padStart(12)}  ` + (m ? `✓ ${iso(m.data)} «${String(m.concepte).slice(0, 34)}»` : (t.data <= '2026-11-09' ? '⚠ sense pagament als extractes' : 'pendent')));
    }
    dades.push(fila);
  }
  const pend = dades.reduce((s, f) => s + f.terminis.filter((t) => !t.moviment).reduce((x, t) => x + t.import, 0), 0);
  console.log(`\n${COMPROMISOS.length} compromisos, pendent ${eur(pend)}.`);

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
