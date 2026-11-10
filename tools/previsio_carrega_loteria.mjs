// WS-PREVISIO, càrrega única (10/11/2026): ingrés de la loteria, estimat amb el del 25/26 (8.557 €: 4.860 € el 20/11 i 3.697 € el 27/11). Emilio (10/11): «loteria sembla correcte».
// El pla compta els ingressos compromesos al percentatge de seguretat (95 %).
//
//   node tools/previsio_carrega_loteria.mjs            simulació
//   node tools/previsio_carrega_loteria.mjs --aplica   ho escriu, en una transacció
//
// No duplica: s'atura si ja hi ha un compromís amb este concepte.

import { connectaRemot } from './connexio.mjs';

const aplica = process.argv.includes('--aplica');
const EX = '26/27';
const C = {
  proveidor: 'Estimació (patró 25/26)', concepte: 'Loteria (estimació com el 25/26)', delegacio: '0102', import: 8557,
  notes: 'El 25/26 la loteria va entrar al novembre: 4.860 € el 20/11 i 3.697 € el 27/11. Als apunts d\'enguany ja hi ha 2.411 € de loteria del maig. Dates provisionals.',
  terminis: [{ data: '2026-11-20', import: 4860 }, { data: '2026-11-27', import: 3697 }],
};

const db = await connectaRemot();
try {
  console.log(`Connectat: ${db.descripcio}`);
  const ja = await db.query('select 1 from public.compromisos where exercici_id = $1 and concepte = $2', [EX, C.concepte]);
  if (ja.length) throw new Error('Ja existeix: ' + C.concepte + '. No es duplica res.');
  const suma = C.terminis.reduce((s, t) => s + t.import, 0);
  if (Math.abs(suma - C.import) > 0.005) throw new Error(`Els terminis sumen ${suma} i l'import és ${C.import}`);
  console.log(`${C.concepte} · ${C.delegacio} · ${C.import} € · ingrés`);
  C.terminis.forEach((t) => console.log(`  ${t.data} ${t.import} €`));
  if (!aplica) console.log('Simulació: no s\'ha escrit res. Torna a executar amb --aplica.');
  else {
    await db.exec('begin');
    try {
      const r = await db.query(`insert into public.compromisos (exercici_id, delegacio_id, sentit, proveidor, concepte, import, estat, notes)
        values ($1, $2, 'ingres', $3, $4, $5, 'viu', $6) returning id`, [EX, C.delegacio, C.proveidor, C.concepte, C.import, C.notes]);
      for (const t of C.terminis) await db.query('insert into public.compromis_terminis (compromis_id, data_prevista, import) values ($1, $2, $3)', [r[0].id, t.data, t.import]);
      await db.exec('commit'); console.log('✓ Escrit.');
    } catch (e) { await db.exec('rollback'); throw e; }
  }
} finally { await db.tanca(); }
