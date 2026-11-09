// Proves del càlcul de diners lliures (WS-PREVISIO, fase 1) amb dades fixes. Fa servir el MATEIX codi que l'app: el bloc entre els marcadors
// «PREVISIO · INICI/FI» d'index.html.   node tools/previsio_tests.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const a = html.indexOf('// ===== PREVISIO · INICI');
const b = html.indexOf('// ===== PREVISIO · FI =====');
if (a < 0 || b < 0) throw new Error('No trobe el bloc PREVISIO a index.html');
const { pvDinersLliures, pvSaldosComptes, pvPendentCompromis, pvIso, pvDies, pvSaldoFinalExtracte, _pvNumBanc, pvPendentIngres, pvGeneraTerminis, pvAddMesos, pvPlaMensual, pvSuggereixVincles } = new Function(
  `${html.slice(a, b)}\nreturn {pvDinersLliures,pvSaldosComptes,pvPendentCompromis,pvIso,pvDies,pvSaldoFinalExtracte,_pvNumBanc,pvPendentIngres,pvGeneraTerminis,pvAddMesos,pvPlaMensual,pvSuggereixVincles};`)();

let ok = 0, ko = 0;
const eq = (nom, real, esperat) => {
  const bo = JSON.stringify(real) === JSON.stringify(esperat);
  bo ? ok++ : ko++;
  console.log(`${bo ? '✓' : '✗'} ${nom}${bo ? '' : `\n    esperava ${JSON.stringify(esperat)} i ha tornat ${JSON.stringify(real)}`}`);
};

const bancs = [
  { id: 'b1', codi: '01 Banc', nom: 'Caixabank', tipus: 'bank' },
  { id: 'b2', codi: '02 Banc', nom: 'Caixa Popular', tipus: 'bank' },
  { id: 'b3', codi: 'Efectiu', nom: 'Caixa efectiu', tipus: 'cash' },
  { id: 'b4', codi: 'TPV', nom: 'TPV targetes', tipus: 'tpv' },
];
const saldos = { 'b1_26/27': { saldoInicial: 1000 }, 'b2_26/27': { saldoInicial: 500 }, 'b3_26/27': { saldoInicial: 200 } };
const mv = (data, tipus, imp, via, o = {}) => ({ data, tipus, import: imp, via, anyFiscal: '26/27', ...o });
const moviments = [
  mv('01/04/2026', 'ing', 300, '01 Banc'),
  mv('10/05/2026', 'gast', 120.5, '01 Banc'),
  mv('15/05/2026', 'gast', 50, 'Efectiu'),
  mv('20/05/2026', 'ing', 80, 'TPV'),
  mv('25/05/2026', 'ing', 40, '02 Banc'),
  mv('01/06/2026', 'gast', 999, 'app'),                       // bonificació Virtual: no són diners
  mv('01/07/2025', 'gast', 7, '01 Banc', { anyFiscal: '25/26' }), // altre exercici
];
const base = { af: '26/27', avui: '2026-06-10', bancs, saldos, moviments, passiu: null, compromisos: [], reservaMinima: 0, diesAvis: 30, extractes: [] };

// Saldos per compte
const sc = pvSaldosComptes(base, null);
eq('saldo 01 Banc = 1000 + 300 − 120,50', sc.comptes.find((c) => c.codi === '01 Banc').saldo, 1179.5);
eq('saldo Efectiu = 200 − 50', sc.comptes.find((c) => c.codi === 'Efectiu').saldo, 150);
eq('TPV sense saldo inicial: 80', sc.comptes.find((c) => c.codi === 'TPV').saldo, 80);
eq('la via app i l\'altre exercici no compten', pvDinersLliures(base).saldoComptes, 1179.5 + 540 + 150 + 80);
eq('saldo fins a una data (10/05)', pvSaldosComptes(base, '2026-05-10').comptes.find((c) => c.codi === '01 Banc').saldo, 1179.5);
eq('saldo fins a una data (09/05, abans de la despesa)', pvSaldosComptes(base, '2026-05-09').comptes.find((c) => c.codi === '01 Banc').saldo, 1300);
eq('una via que no és cap compte es retorna apart', pvSaldosComptes({ ...base, moviments: [...moviments, mv('02/06/2026', 'gast', 10, 'Xec')] }, null).senseCompte, -10);
eq('i entra al total', pvDinersLliures({ ...base, moviments: [...moviments, mv('02/06/2026', 'gast', 10, 'Xec')] }).saldoComptes, 1179.5 + 540 + 150 + 80 - 10);

// Traspassos: els dos costats sumen 0 al total
const trasp = [...moviments, mv('03/06/2026', 'gast', 100, '01 Banc', { traspas: true }), mv('03/06/2026', 'ing', 100, 'Efectiu', { traspas: 'true' })];
eq('un traspàs mou diners entre comptes sense canviar el total', pvDinersLliures({ ...base, moviments: trasp }).saldoComptes, 1179.5 + 540 + 150 + 80);
eq('el net de traspassos és 0 si tenen els dos costats', pvDinersLliures({ ...base, moviments: trasp }).controls.traspassosNet, 0);
eq('un traspàs sense un dels costats es detecta', pvDinersLliures({ ...base, moviments: [...moviments, mv('03/06/2026', 'gast', 100, '01 Banc', { traspas: true })] }).controls.traspassosNet, -100);

// Diners lliures
const cp = (id, estat, imp, terminis) => ({ id, estat, import: imp, terminis });
const compromisos = [
  cp('c1', 'viu', 1000, [{ import: 600, moviment_id: 'm1' }, { import: 400, moviment_id: null }]),
  cp('c2', 'viu', 300, [{ import: 300, moviment_id: null }]),
  cp('c3', 'cancellat', 5000, [{ import: 5000, moviment_id: null }]),
  cp('c4', 'tancat', 200, [{ import: 200, moviment_id: null }]),
];
eq('compromís viu: només compten els terminis sense pagament', pvPendentCompromis(compromisos[0]), 400);
eq('un compromís cancel·lat no compta', pvPendentCompromis(compromisos[2]), 0);
eq('un compromís tancat no compta', pvPendentCompromis(compromisos[3]), 0);
const r = pvDinersLliures({ ...base, passiu: { total: 600.25, data: '01/06/2026' }, compromisos, reservaMinima: 100 });
eq('compromisos pendents = 400 + 300', r.compromisos, 700);
eq('diners lliures = 1949,50 − 600,25 − 700 − 100', r.lliures, 549.25);
eq('sense passiu ni compromisos ni reserva, el lliure és el saldo', pvDinersLliures(base).lliures, 1949.5);
eq('el resultat pot ser negatiu (la falla no pot gastar res)', pvDinersLliures({ ...base, reservaMinima: 5000 }).lliures, 1949.5 - 5000);
eq('un passiu a 0 es tracta com a absent', pvDinersLliures({ ...base, passiu: { total: 0, data: '01/06/2026' } }).passiu, 0);

// Controls
eq('passiu de fa 9 dies: sense avís', r.controls.passiuDies, 9);
eq('...i sense avís (llindar 30)', r.controls.passiuAvis, false);
eq('passiu de fa més de 30 dies: avís', pvDinersLliures({ ...base, passiu: { total: 100, data: '01/04/2026' } }).controls.passiuAvis, true);
eq('compromís que no suma el seu import: desquadrat', r.controls.compromisosDesquadrats, []);
eq('compromís de 1.000 amb terminis de 500: desquadrat', pvDinersLliures({ ...base, compromisos: [cp('c9', 'viu', 1000, [{ import: 500, moviment_id: null }])] }).controls.compromisosDesquadrats, ['c9']);
eq('un compromís sense terminis és desquadrat', pvDinersLliures({ ...base, compromisos: [cp('c8', 'viu', 100, [])] }).controls.compromisosDesquadrats, ['c8']);
eq('un compromís tancat no avisa de desquadrament', pvDinersLliures({ ...base, compromisos: [cp('c7', 'tancat', 100, [])] }).controls.compromisosDesquadrats, []);

const ctl = (extractes, avui = '2026-06-10') => pvDinersLliures({ ...base, extractes, avui }).controls.comptes;
eq('només els bancs porten control d\'extracte', ctl([]).map((c) => c.codi), ['01 Banc', '02 Banc']);
eq('sense cap extracte: avís «sense»', ctl([]).map((c) => c.avis), ['sense', 'sense']);
// 01 Banc a 10/05: 1000 + 300 − 120,50 = 1179,50
const ex = ctl([{ compte_id: 'b1', data: '2026-05-10', saldo: 1179.5 }, { compte_id: 'b2', data: '2026-05-31', saldo: 540 }]);
eq('l\'extracte coincideix amb l\'app a la seua data', ex[0].dif, 0);
eq('l\'extracte de fa 31 dies: antic', ex[0].avis, 'antic');
eq('l\'extracte del 02 Banc coincideix i és recent', ex[1].avis, '');
const dif = ctl([{ compte_id: 'b1', data: '2026-05-10', saldo: 1100 }]);
eq('diferència entre l\'extracte i l\'app', [dif[0].dif, dif[0].avis], [79.5, 'diferencia']);
eq('s\'agafa l\'extracte més recent del compte', ctl([{ compte_id: 'b1', data: '2026-05-09', saldo: 1 }, { compte_id: 'b1', data: '2026-05-10', saldo: 1179.5 }])[0].ultim, '2026-05-10');
eq('el saldo de l\'app es compara a la data de l\'extracte, no avui', ctl([{ compte_id: 'b1', data: '2026-05-09', saldo: 1300 }])[0].dif, 0);

// Saldo de l'extracte
const ln = (data, saldo, idx) => ({ data, _saldo: saldo, _idx: idx });
eq('fitxer del més nou al més vell: el saldo és el de la primera línia', pvSaldoFinalExtracte([ln('10/05/2026', 100, 1), ln('09/05/2026', 80, 2), ln('08/05/2026', 60, 3)]), { data: '2026-05-10', saldo: 100 });
eq('fitxer del més vell al més nou: el de la darrera línia', pvSaldoFinalExtracte([ln('08/05/2026', 60, 1), ln('09/05/2026', 80, 2), ln('10/05/2026', 100, 3)]), { data: '2026-05-10', saldo: 100 });
eq('descendent amb dues línies el mateix dia: la primera del fitxer (la més nova)', pvSaldoFinalExtracte([ln('10/05/2026', 150, 1), ln('10/05/2026', 100, 2), ln('09/05/2026', 80, 3)]), { data: '2026-05-10', saldo: 150 });
eq('ascendent amb dues línies el mateix dia: la darrera del fitxer', pvSaldoFinalExtracte([ln('09/05/2026', 80, 1), ln('10/05/2026', 100, 2), ln('10/05/2026', 150, 3)]), { data: '2026-05-10', saldo: 150 });
eq('dates sense zero (1/5/2026)', pvSaldoFinalExtracte([ln('1/5/2026', 7, 1)]), { data: '2026-05-01', saldo: 7 });
eq('sense columna de saldo: res a desar', pvSaldoFinalExtracte([{ data: '10/05/2026', _saldo: null, _idx: 1 }]), null);
eq('el saldo es limita a dos decimals', pvSaldoFinalExtracte([ln('10/05/2026', 10.005000001, 1)]).saldo, 10.01);
eq('número tal qual', _pvNumBanc(1234.5), 1234.5);
eq('format europeu 1.234,56', _pvNumBanc('1.234,56'), 1234.56);
eq('coma decimal', _pvNumBanc('-12,5 €'), -12.5);
eq('buit: sense saldo', _pvNumBanc(''), null);
eq('text no numèric: sense saldo', _pvNumBanc('abc'), null);

// Ingressos compromesos i pla mensual
const ci = (id, estat, terminis) => ({ id, estat, sentit: 'ingres', import: terminis.reduce((x, t) => x + t.import, 0), terminis });
const quotes = ci('q', 'viu', [{ import: 28000, data_prevista: '2026-11-15', moviment_id: null }, { import: 28000, data_prevista: '2027-02-15', moviment_id: null }]);
eq('els ingressos no es resten com a compromisos pendents', pvPendentCompromis(quotes), 0);
eq('ingressos pendents amb seguretat del 95 %', pvPendentIngres(quotes, 0.95), 53200);
eq('un ingrés ja cobrat no és pendent', pvPendentIngres(ci('q2', 'viu', [{ import: 100, data_prevista: '2026-11-15', moviment_id: 'm1' }]), 1), 0);
eq('un ingrés cancel·lat no compta', pvPendentIngres(ci('q3', 'cancellat', [{ import: 100, data_prevista: '2026-11-15', moviment_id: null }]), 1), 0);
eq('els diners lliures d\'avui no sumen ingressos futurs', pvDinersLliures({ ...base, compromisos: [quotes] }).lliures, 1949.5);

eq('generador mensual', pvGeneraTerminis('2026-11-05', 3, 'mensual', 150), [{ data: '2026-11-05', import: 150 }, { data: '2026-12-05', import: 150 }, { data: '2027-01-05', import: 150 }]);
eq('generador trimestral', pvGeneraTerminis('2026-11-05', 2, 'trimestral', 90).map((t) => t.data), ['2026-11-05', '2027-02-05']);
eq('generador anual', pvGeneraTerminis('2026-11-05', 2, 'anual', 500).map((t) => t.data), ['2026-11-05', '2027-11-05']);
eq('dia 31 en un mes de 28 dies', pvAddMesos('2027-01-31', 1), '2027-02-28');
eq('dia 31 cap a un mes de 30', pvAddMesos('2026-10-31', 1), '2026-11-30');

const plaBase = { ...base, avui: '2026-11-10', saldos: { 'b1_26/27': { saldoInicial: 10000 } }, moviments: [], passiu: { total: 2000, data: '09/11/2026' }, reservaMinima: 1000, seguretatIngressos: 0.95, bancs: [{ id: 'b1', codi: '01 Banc', nom: 'Caixabank', tipus: 'bank' }] };
const cd = (id, terminis, estat = 'viu') => ({ id, estat, sentit: 'despesa', import: terminis.reduce((x, t) => x + t.import, 0), terminis });
const pla = pvPlaMensual({ ...plaBase, compromisos: [quotes, cd('llum', [{ import: 100, data_prevista: '2026-11-20', moviment_id: null }, { import: 100, data_prevista: '2026-12-20', moviment_id: null }]), cd('monument', [{ import: 6000, data_prevista: '2027-03-10', moviment_id: null }])] });
eq('el pla va del mes en curs al març de l\'exercici', pla.mesos.map((m) => m.mes), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
eq('situació actual: marge = saldo − passiu − reserva', pla.inici, { saldo: 10000, passiu: 2000, reserva: 1000, marge: 7000 });
eq('novembre: quota 26.600 (95 %) i llum 100', [pla.mesos[0].ingressos, pla.mesos[0].despeses, pla.mesos[0].saldo], [26600, 100, 36500]);
eq('desembre: només la llum', [pla.mesos[1].ingressos, pla.mesos[1].despeses, pla.mesos[1].saldo], [0, 100, 36400]);
eq('febrer: segona quota', pla.mesos[3].saldo, 36400 + 26600);
eq('març: el monument', [pla.mesos[4].despeses, pla.mesos[4].saldo, pla.mesos[4].marge], [6000, 36400 + 26600 - 6000, 36400 + 26600 - 6000 - 3000]);
eq('el punt mínim és l\'actual (7.000) si tot puja', pla.minim, { marge: 7000, mes: null });
const plaMal = pvPlaMensual({ ...plaBase, compromisos: [cd('gran', [{ import: 9000, data_prevista: '2026-12-01', moviment_id: null }])] });
eq('una despesa gran abans de la quota fa baixar el mínim', plaMal.minim, { marge: -2000, mes: '2026-12' });
const plaEnd = pvPlaMensual({ ...plaBase, compromisos: [cd('tard', [{ import: 400, data_prevista: '2026-10-01', moviment_id: null }])] });
eq('un termini endarrerit compta al mes en curs i es marca', [plaEnd.mesos[0].despeses, plaEnd.mesos[0].endarrerit.des], [400, 400]);
eq('un termini pagat no compta al pla', pvPlaMensual({ ...plaBase, compromisos: [cd('p', [{ import: 400, data_prevista: '2026-12-01', moviment_id: 'm1' }])] }).mesos[1].despeses, 0);
eq('els terminis posteriors a l\'horitzó van a «després»', pvPlaMensual({ ...plaBase, compromisos: [cd('lluny', [{ import: 300, data_prevista: '2027-06-01', moviment_id: null }])] }).despres, { ing: 0, des: 300 });
eq('un compromís tancat o cancel·lat no entra al pla', pvPlaMensual({ ...plaBase, compromisos: [cd('c', [{ import: 300, data_prevista: '2026-12-01', moviment_id: null }], 'cancellat')] }).mesos[1].despeses, 0);
eq('sense exercici vàlid, l\'horitzó són 6 mesos', pvPlaMensual({ ...plaBase, af: 'x', compromisos: [] }).mesos.length, 6);
eq('el pla encadena l\'any (desembre → gener)', pvPlaMensual({ ...plaBase, compromisos: [] }).mesos.map((m) => m.mes).slice(1, 3), ['2026-12', '2027-01']);

// Pla rodant: mesos reals + mes en curs + previsió
const movsR = [mv('05/04/2026', 'ing', 1000, '01 Banc'), mv('10/05/2026', 'gast', 200, '01 Banc'), mv('05/11/2026', 'ing', 50, '01 Banc'), mv('06/11/2026', 'gast', 20, '01 Banc'),
  mv('07/11/2026', 'gast', 999, 'app'), mv('08/11/2026', 'gast', 300, '01 Banc', { traspas: true })];
const rod = pvPlaMensual({ ...plaBase, moviments: movsR, historic: true, compromisos: [cd('llum', [{ import: 100, data_prevista: '2026-11-20', moviment_id: null }, { import: 100, data_prevista: '2026-12-20', moviment_id: null }])] });
eq('el pla rodant comença a l\'inici de l\'exercici', rod.mesos.map((m) => m.mes).slice(0, 3), ['2026-04', '2026-05', '2026-06']);
eq('7 mesos reals, el mes en curs i 4 de previsió (fins al març)', rod.mesos.map((m) => m.tipus), ['real', 'real', 'real', 'real', 'real', 'real', 'real', 'curs', 'previsio', 'previsio', 'previsio', 'previsio']);
eq('abril real: ingressos 1.000 i saldo 11.000', [rod.mesos[0].ingressos, rod.mesos[0].despeses, rod.mesos[0].saldo], [1000, 0, 11000]);
eq('maig real: despesa 200 i saldo 10.800', [rod.mesos[1].despeses, rod.mesos[1].saldo], [200, 10800]);
eq('un mes real no té marge (el passiu d\'aleshores es desconeix)', rod.mesos[0].marge, null);
const curs = rod.mesos[7];
eq('el mes en curs porta el real fins avui', curs.real, { ing: 50, des: 20 });
eq('...i el previst que queda (llum del 20/11)', curs.previst, { ing: 0, des: 100 });
eq('...totals = real + previst, sense la via app ni els traspassos', [curs.ingressos, curs.despeses], [50, 120]);
eq('el saldo del mes en curs és el d\'avui (amb el costat solt del traspàs: −300) menys el previst', curs.saldo, 10530 - 100);
eq('el pla sense historic no canvia (7 mesos menys)', pvPlaMensual({ ...plaBase, moviments: movsR, compromisos: [] }).mesos.length, 5);
eq('el punt mínim només mira la previsió', pvPlaMensual({ ...plaBase, moviments: movsR, historic: true, compromisos: [] }).minim.mes, null);
eq('un exercici que comença al mes en curs no té mesos reals', pvPlaMensual({ ...plaBase, avui: '2026-04-10', historic: true, compromisos: [] }).mesos[0].tipus, 'curs');

// Suggeriments de vinculació
const tm = (id, data, imp, mov = null) => ({ id, data_prevista: data, import: imp, moviment_id: mov });
const cm = (id, prov, sentit, terminis, estat = 'viu') => ({ id, proveidor: prov, sentit, estat, import: 0, terminis });
const mm = (id, data, tipus, imp, concepte, est = '') => ({ id, data, tipus, import: imp, via: '01 Banc', anyFiscal: '26/27', concepte, establiment: est });
const sg = (compromisos, moviments) => pvSuggereixVincles({ af: '26/27', compromisos, moviments });
const mon = cm('mon', 'Taller Fallero SL', 'despesa', [tm('t1', '2026-10-05', 2000), tm('t2', '2026-11-05', 2000), tm('t3', '2026-12-05', 2000)]);
const r1 = sg([mon], [mm('a', '04/10/2026', 'gast', 2000, 'Monument', 'Taller Fallero'), mm('b', '06/11/2026', 'gast', 2000, 'Monument', 'Taller Fallero')]);
eq('cada moviment al seu termini per proximitat de dates', r1.map((x) => [x.moviment_id, x.termini_id]).sort(), [['a', 't1'], ['b', 't2']]);
eq('import igual i proveïdor: suggeriment fort (marcat per defecte)', r1.every((x) => x.fort), true);
eq('un moviment només paga un termini', sg([mon], [mm('a', '05/11/2026', 'gast', 2000, 'Monument', 'Taller Fallero')]).length, 1);
eq('i va al termini més pròxim en dates', sg([mon], [mm('a', '05/11/2026', 'gast', 2000, 'Monument', 'Taller Fallero')])[0].termini_id, 't2');
eq('un moviment ja vinculat no es torna a proposar', sg([cm('x', 'Taller Fallero SL', 'despesa', [tm('t1', '2026-10-05', 2000, 'a'), tm('t2', '2026-11-05', 2000)])], [mm('a', '04/10/2026', 'gast', 2000, 'M', 'Taller Fallero'), mm('b', '06/11/2026', 'gast', 2000, 'M', 'Taller Fallero')]).map((x) => x.moviment_id), ['b']);
eq('un ingrés no paga una despesa', sg([mon], [mm('a', '05/10/2026', 'ing', 2000, 'Monument', 'Taller Fallero')]).length, 0);
eq('una despesa no complix una quota (ingrés)', sg([cm('q', 'Fallers', 'ingres', [tm('t1', '2026-11-15', 28000)])], [mm('a', '15/11/2026', 'gast', 28000, 'Quotes')]).length, 0);
eq('una remesa d\'ingrés complix la quota', sg([cm('q', 'Fallers', 'ingres', [tm('t1', '2026-11-15', 28000)])], [mm('a', '16/11/2026', 'ing', 28000, 'Remesa quotes fallers')]).map((x) => x.termini_id), ['t1']);
eq('import diferent sense proveïdor: no es proposa', sg([mon], [mm('a', '05/10/2026', 'gast', 1950, 'Monument', 'Altra')]).length, 0);
eq('import dins del 2 % amb proveïdor: es proposa però no ve marcat', sg([mon], [mm('a', '05/10/2026', 'gast', 1980, 'Monument', 'Taller Fallero')]).map((x) => [x.igual, x.fort]), [[false, false]]);
eq('import igual sense proveïdor ni dates pròximes: no és fort', sg([mon], [mm('a', '21/10/2026', 'gast', 2000, 'Transferència', 'X')]).map((x) => x.fort), [false]);
eq('més de 45 dies de diferència: no es proposa', sg([mon], [mm('a', '05/04/2026', 'gast', 2000, 'Monument', 'Taller Fallero')]).length, 0);
eq('un compromís tancat no rep suggeriments', sg([cm('c', 'Taller Fallero SL', 'despesa', [tm('t1', '2026-10-05', 2000)], 'tancat')], [mm('a', '05/10/2026', 'gast', 2000, 'M', 'Taller Fallero')]).length, 0);
eq('la via app i els traspassos no compten', sg([mon], [{ ...mm('a', '05/10/2026', 'gast', 2000, 'M', 'Taller Fallero'), via: 'app' }, { ...mm('b', '05/10/2026', 'gast', 2000, 'M', 'Taller Fallero'), traspas: 'true' }]).length, 0);
eq('un altre exercici no compta', sg([mon], [{ ...mm('a', '05/10/2026', 'gast', 2000, 'M', 'Taller Fallero'), anyFiscal: '25/26' }]).length, 0);

// Dates
eq('DD/MM/AAAA → ISO', pvIso('05/11/2026'), '2026-11-05');
eq('ISO amb hora → ISO', pvIso('2026-11-05T10:00:00Z'), '2026-11-05');
eq('dies entre dates', pvDies('2026-10-01', '2026-11-09'), 39);

console.log(`\n${ok} correctes, ${ko} fallits`);
process.exit(ko ? 1 : 0);
