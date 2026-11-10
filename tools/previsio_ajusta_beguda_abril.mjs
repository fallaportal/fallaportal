// WS-PREVISIO (10/11/2026, Emilio): l'abril del 2027 de l'estimació «Beguda i menjar» passa de 16.188 € a 27.848 € (el que es va pagar l'abril del 2026: factures de la
// setmana de Falles). El compromís passa de 34.478 € a 46.138 €. Només toca eixe termini i l'import del compromís, dins d'una transacció.
//
//   node tools/previsio_ajusta_beguda_abril.mjs            simulació
//   node tools/previsio_ajusta_beguda_abril.mjs --aplica   ho escriu

import { connectaRemot } from './connexio.mjs';
const aplica = process.argv.includes('--aplica');
const db = await connectaRemot();
try {
  const c = await db.query(`select id, import from public.compromisos where concepte like 'Beguda i menjar%' and exercici_id = '26/27'`);
  if (c.length !== 1) throw new Error("Calia exactament 1 compromís de beguda i n'hi ha " + c.length);
  const t = await db.query(`select id, import, moviment_id from public.compromis_terminis where compromis_id = $1 and data_prevista >= '2027-04-01' and data_prevista < '2027-05-01'`, [c[0].id]);
  if (t.length !== 1 || t[0].moviment_id) throw new Error("Calia exactament 1 termini d'abril sense pagar");
  const nou = Number(c[0].import) - Number(t[0].import) + 27848;
  console.log(`Termini d'abril: ${t[0].import} → 27848; compromís: ${c[0].import} → ${nou}`);
  if (!aplica) console.log("Simulació: no s'ha escrit res.");
  else {
    await db.exec('begin');
    try {
      await db.query('update public.compromis_terminis set import = 27848 where id = $1', [t[0].id]);
      await db.query('update public.compromisos set import = $2 where id = $1', [c[0].id, nou]);
      await db.exec('commit'); console.log('✓ Escrit.');
    } catch (e) { await db.exec('rollback'); throw e; }
  }
} finally { await db.tanca(); }
