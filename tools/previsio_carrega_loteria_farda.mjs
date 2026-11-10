// WS-PREVISIO, càrrega única (10/11/2026): la loteria sencera. Emilio (10/11): els 21.573 € de «Venda TPV» del novembre del 25/26 són també loteria, i la falla
// compra els dècims a Farda: un dècim de 20 € es ven al faller a 22 € i eixos 2 € són el marge de la falla.
//   - Ingrés «Loteria: venda de dècims»: 30.130 € (8.557 € de «Loteria» + 21.573 € de «Venda TPV» del novembre del 25/26), amb les dates del 25/26. Substitueix l'ingrés
//     de 8.557 € carregat abans (previsio_carrega_loteria.mjs).
//   - Despesa «Loteria: compra de dècims a Farda»: 30.130 / 1,1 = 27.390,91 € (20 € de cada 22 € venuts). Al 25/26 no hi ha cap pagament a Farda als apunts: la data és provisional
//     (novembre, abans o durant la venda) i s'ha de confirmar amb el pagament real d'enguany.
// El pla compta els ingressos compromesos al 95 % (dècims sense vendre): el marge previst és una mica menor que el 10 % teòric.
//
//   node tools/previsio_carrega_loteria_farda.mjs            simulació
//   node tools/previsio_carrega_loteria_farda.mjs --aplica   ho escriu, en una transacció

import { connectaRemot } from './connexio.mjs';

const aplica = process.argv.includes('--aplica');
const EX = '26/27';
const VELL = 'Loteria (estimació com el 25/26)';
const NOU_ING = 'Loteria: venda de dècims (estimació com el 25/26)';
const NOU_DES = 'Loteria: compra de dècims a Farda';
const VENDES = [['2026-11-11', 9472], ['2026-11-14', 1443], ['2026-11-18', 5459], ['2026-11-20', 4860], ['2026-11-26', 5199], ['2026-11-27', 3697]];
const total = VENDES.reduce((s, [, v]) => s + v, 0);          // 30.130
const compra = Math.round(total / 1.1 * 100) / 100;           // 27.390,91
const eur = (n) => Number(n).toLocaleString('ca-ES', { minimumFractionDigits: 2 }) + ' €';

const db = await connectaRemot();
try {
  console.log(`Connectat: ${db.descripcio}`);
  const v = await db.query('select id, import from public.compromisos where exercici_id = $1 and concepte = $2', [EX, VELL]);
  if (v.length !== 1) throw new Error(`Calia exactament 1 compromís «${VELL}» i n'hi ha ${v.length}`);
  const pagats = await db.query('select count(*)::int n from public.compromis_terminis where compromis_id = $1 and moviment_id is not null', [v[0].id]);
  if (pagats[0].n) throw new Error('El compromís antic té terminis ja enllaçats: no es toca.');
  const dup = await db.query('select 1 from public.compromisos where exercici_id = $1 and concepte in ($2, $3)', [EX, NOU_ING, NOU_DES]);
  if (dup.length) throw new Error('Ja existeix la loteria nova: no es duplica.');
  console.log(`Ingrés: ${VELL} (${eur(v[0].import)}) → ${NOU_ING} (${eur(total)})`);
  VENDES.forEach(([d, x]) => console.log(`  ${d} ${eur(x).padStart(12)}`));
  console.log(`Despesa: ${NOU_DES} · ${eur(compra)} · 2026-11-12 (provisional) · marge teòric ${eur(total - compra)}`);
  if (!aplica) { console.log('\nSimulació: no s\'ha escrit res. Torna a executar amb --aplica.'); }
  else {
    await db.exec('begin');
    try {
      await db.query('delete from public.compromis_terminis where compromis_id = $1', [v[0].id]);
      await db.query('update public.compromisos set concepte = $2, import = $3, notes = $4 where id = $1', [v[0].id, NOU_ING, total,
        'Novembre del 25/26: 4.860 € (20/11) i 3.697 € (27/11) de «Loteria» i 21.573 € de «Venda TPV» (11/11, 14/11, 18/11 i 26/11), que Emilio (10/11) identifica també com a loteria. Un dècim de 20 € es ven a 22 €. Dates com el 25/26.']);
      for (const [d, x] of VENDES) await db.query('insert into public.compromis_terminis (compromis_id, data_prevista, import) values ($1, $2, $3)', [v[0].id, d, x]);
      const r = await db.query(`insert into public.compromisos (exercici_id, delegacio_id, sentit, proveidor, concepte, import, estat, notes)
        values ($1, '0102', 'despesa', 'Farda', $2, $3, 'viu', $4) returning id`, [EX, NOU_DES, compra,
        'Dècims de 20 € que la falla ven a 22 € (marge de 2 € per dècim, Emilio 10/11): compra = vendes / 1,1. Al 25/26 no hi ha cap pagament a Farda als apunts: data provisional, a confirmar amb el pagament real d\'enguany.']);
      await db.query('insert into public.compromis_terminis (compromis_id, data_prevista, import) values ($1, $2, $3)', [r[0].id, '2026-11-12', compra]);
      await db.exec('commit'); console.log('\n✓ Escrit.');
    } catch (e) { await db.exec('rollback'); throw e; }
  }
} finally { await db.tanca(); }
