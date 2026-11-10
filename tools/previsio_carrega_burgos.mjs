// WS-PREVISIO, càrrega única (10/11/2026): compra del solar de Burgos (contracte d'arres penitencials del 21/05/2026).
//
//   node tools/previsio_carrega_burgos.mjs            simulació: mostra què es crearia i quin moviment s'enllaçaria a cada termini
//   node tools/previsio_carrega_burgos.mjs --aplica   ho escriu, tot en una transacció (si alguna cosa falla, no es desa res)
//
// Dades (contracte i Emilio, 10/11): preu 80.000 € + impostos (estimats en 18.560 € → 98.560 €, segons el full); arres 30.000 € ja pagades (10.000 € efectiu el 12/06 i
// 20.000 € per transferència el 08/07, enllaçades als moviments); la resta (50.000 € + impostos = 68.560 €) en l'escriptura, que s'ha de signar abans del 31/05/2028.
// El termini va al 31/05/2028 (data límit) fins que la junta decidisca una data. No duplica: s'atura si ja hi ha un compromís amb este concepte.

import { connectaRemot } from './connexio.mjs';

const aplica = process.argv.includes('--aplica');
const EX = '26/27';

const COMPROMISOS = [
  {
    proveidor: 'Nueva Gestión Empresarial, S.L.', concepte: 'Compra solar Burgos (c/ Major 85) · arres i escriptura', delegacio: '0102', import: 98560, signat: '2026-05-21',
    notes: "Contracte d'arres penitencials del 21/05/2026: 80.000 € + impostos (estimats: 98.560 € en total). Arres 30.000 € pagades (10.000 € efectiu, 20.000 € transferència). Els 68.560 € restants (50.000 € + impostos estimats) en l'escriptura, abans del 31/05/2028: data límit, no decidida. Si la falla desisteix perd les arres.",
    terminis: [{ data: '2026-06-12', import: 10000 }, { data: '2026-07-08', import: 20000 }, { data: '2028-05-31', import: 68560 }],
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
