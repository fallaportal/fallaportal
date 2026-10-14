// Prova de l'escriptura de la Fase 3 (D-048) contra la base de dades real, sense deixar-hi res:
//   1. El camí invers: sbTaules(sbPestanyes(R)) ha de tornar les mateixes files i columnes que R (la lectura).
//   2. Cap canvi fantasma: la diferència d'una foto amb ella mateixa és buida.
//   3. Cada acció de l'inventari §4 (--accions): es fa als pestanyes com ho fa l'app, es calculen les diferències (sbCanvis),
//      s'envien a public.guarda_canvis amb el JWT d'un membre real, es torna a llegir i es comprova que el que s'ha desat
//      és el que es volia (la diferència entre el que volíem i el que hi ha és buida).
// Tot dins d'una transacció que es desfà: la base de dades no canvia.
//
//   node tools/supabase_escriptura.mjs            punts 1 i 2
//   node tools/supabase_escriptura.mjs --accions  tots els punts
//   node tools/supabase_escriptura.mjs --accions --filtre <text>
//
// El convertidor és el d'index.html (entre els marcadors ADAPTADOR SUPABASE), no una còpia.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot } from './connexio.mjs';
import { accions } from './supabase_escriptura_accions.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ambAccions = args.includes('--accions');
const filtre = args.includes('--filtre') ? args[args.indexOf('--filtre') + 1] : null;

const html = readFileSync(join(aqui, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ===== ADAPTADOR SUPABASE · INICI');
const b = html.indexOf('// ===== ADAPTADOR SUPABASE · FI =====');
const r0 = html.indexOf('const DEFAULT_ROLES={');
const r1 = html.indexOf('\n};', r0) + 3;
const c0 = html.indexOf('const AREA_COLORS=');
const c1 = html.indexOf('\n', c0);
if ([a, b, r0, c0].some((x) => x < 0)) throw new Error('No trobe l\'adaptador, DEFAULT_ROLES o AREA_COLORS a index.html');
const A = new Function(`const sb=null;\n${html.slice(r0, r1)}\n${html.slice(c0, c1)}\n${html.slice(a, b)}\nreturn {sbPestanyes,sbTaules,sbCanvis,SB_ORDRES,AREA_COLORS,SB_ORDRE_TAULES};`)();

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const clona = (x) => JSON.parse(JSON.stringify(x));

async function llig(db) {
  const R = {};
  for (const t of Object.keys(A.SB_ORDRES)) R[t] = (await db.query(`select to_jsonb(t) as j from public.${t} t order by ${A.SB_ORDRES[t].join(', ')}`)).map((x) => x.j);
  return R;
}
const taules = (T) => A.sbTaules(T, { colors: A.AREA_COLORS });

let errors = 0;
const db = await connectaRemot();
try {
  console.log(`Connectat: ${db.descripcio}`);
  await db.exec('begin');
  const R = await llig(db);
  const T = A.sbPestanyes(R);
  const base = taules(T);

  // ---------------------------------------------------------------- 1. El camí invers
  console.log('\n1. Camí invers: sbTaules(sbPestanyes(R)) contra R');
  // Columnes de cada taula que el convertidor porta (la resta les posa el servidor o no es desen).
  const NORM = (v) => (v === undefined ? null : v);
  const dec = (v) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  const clau = (t, e) => (e.k ? JSON.stringify(Object.keys(e.k).sort().map((c) => [c, e.k[c]])) : null);
  // Files de R que l'adaptador no porta a les pestanyes (o el convertidor no pot tornar) i per què.
  const FORA = {
    usuaris: (r) => !r.actiu,                                  // inactius (migració): no surten a «08 Usuaris»
    usuari_rols: (r) => !R.usuaris.find((u) => u.id === r.usuari_id && u.actiu),
    comptes: (r) => r.tipus === 'virtual',                      // el compte virtual no és a «07 Bancs»
    fons: (r) => false,
    regles_importacio: () => false,
  };
  const COLS = {
    exercicis: ['data_inici', 'data_fi', 'data_obertura', 'tancat', 'data_tancament', 'es_prova'],
    usuaris: ['nom', 'email', 'actiu'], rols: ['nom', 'color', 'de_sistema'],
    arees: ['nom', 'color'], delegacions: ['area_id', 'nom'], comptes: ['codi', 'nom', 'tipus', 'iban'],
    saldos_inicials: ['import', 'data'], events: ['exercici_id', 'delegacio_id', 'nom', 'data_inici', 'data_fi', 'responsable_id', 'per_defecte'],
    regles_importacio: ['compte_id', 'patrons', 'tipus', 'sentit', 'area_id', 'delegacio_id', 'concepte', 'prioritat', 'activa'],
    caixes: ['event_id', 'descripcio', 'data', 'estat', 'efectiu', 'tpv', 'pagaments', 'area_id', 'delegacio_id', 'notes', 'exercici_id'],
    moviments: ['data', 'tipus', 'import', 'compte_id', 'area_id', 'delegacio_id', 'event_id', 'caixa_id', 'font', 'pagament_efectiu', 'concepte', 'establiment', 'notes', 'motiu_sense_justificant', 'exercici_id'],
    fons: ['data', 'tipus', 'delegat_id', 'import', 'origen', 'moviment_id', 'nota', 'exercici_id'],
    caixa_canvis: ['caixa_id', 'data', 'tipus', 'import'],
    pressupost_linies: ['tipus', 'import', 'notes'],
    fallesapp_consums: ['exercici_id', 'event_id', 'area_id', 'delegacio_id', 'import'],
  };
  const CLAU_R = {
    exercicis: ['id'], usuaris: ['id'], rols: ['id'], arees: ['id'], delegacions: ['id'], comptes: ['id'], events: ['id'], regles_importacio: ['id'],
    caixes: ['id'], moviments: ['id'], fons: ['id'], caixa_canvis: ['id'], fallesapp_consums: ['id'],
    saldos_inicials: ['compte_id', 'exercici_id'], pressupost_linies: ['exercici_id', 'delegacio_id', 'event_id', 'concepte'],
    usuari_rols: ['usuari_id', 'rol_id'], directiva: ['exercici_id', 'usuari_id', 'area_id', 'delegacio_id'],
  };
  for (const [t, cols] of Object.entries({ ...COLS, usuari_rols: [], directiva: [] })) {
    const mapa = new Map((base[t] || []).map((e) => [clau(t, e), e]));
    let falten = 0, dif = 0, sobren = 0, exemple = [];
    const vistos = new Set();
    for (const r of R[t] || []) {
      if (FORA[t] && FORA[t](r)) continue;
      // fons: els de tipus event_canvi no hi són (van a caixa_canvis); regles amb compte desconegut tampoc
      const k = JSON.stringify(Object.keys(Object.fromEntries(CLAU_R[t].map((c) => [c, 1]))).sort().map((c) => [c, NORM(r[c])]));
      vistos.add(k);
      const e = mapa.get(k);
      if (!e) { falten++; if (exemple.length < 3) exemple.push('falta ' + k.slice(0, 80)); continue; }
      for (const c of cols) {
        let esperat = NORM(r[c]);
        let obtingut = NORM(e.f[c]);
        if (c === 'color' && t === 'arees') { /* color: el porta AREA_COLORS (01–07) */ if (obtingut === null) continue; }
        if (typeof esperat === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(esperat)) esperat = esperat.slice(0, 10);
        if (c.startsWith('hora')) { esperat = esperat && String(esperat).slice(0, 5); }
        esperat = dec(esperat); obtingut = dec(obtingut);
        if (c === 'import' || c === 'efectiu' || c === 'tpv' || c === 'pagaments') { esperat = esperat === null ? null : Math.round(esperat * 100) / 100; }
        if (JSON.stringify(esperat) !== JSON.stringify(obtingut)) {
          // diferències conegudes: només l'exercici imputat (motiu) i el compte de les files descartades
          dif++; if (exemple.length < 3) exemple.push(`${k.slice(0, 40)} ${c}: «${esperat}» → «${obtingut}»`);
        }
      }
    }
    for (const kk of mapa.keys()) if (!vistos.has(kk)) { sobren++; if (exemple.length < 3) exemple.push('sobra ' + kk.slice(0, 80)); }
    const bo = !falten && !dif && !sobren;
    if (!bo) errors++;
    console.log(`  ${bo ? '✓' : '✗'} ${t.padEnd(22)} R ${String((R[t] || []).length).padStart(4)} → files ${String((base[t] || []).length).padStart(4)}` +
      (bo ? '' : `   falten ${falten} · diferents ${dif} · sobren ${sobren}\n      ${exemple.join('\n      ')}`));
  }

  // ---------------------------------------------------------------- 2. Cap canvi fantasma
  console.log('\n2. Cap canvi fantasma');
  const buit = A.sbCanvis(base, taules(clona(T)));
  console.log(`  ${buit.length ? '✗' : '✓'} sbCanvis(base, base) = ${buit.length} operacions`);
  if (buit.length) { errors++; console.log('    ' + JSON.stringify(buit.slice(0, 3))); }

  // ---------------------------------------------------------------- 3. Accions
  if (ambAccions) {
    console.log('\n3. Accions de l\'inventari §4 (cada una en un savepoint que es desfà)');
    const ctx = { R, T, base, A, db, llig, taules, clona, lit, usuariDe: (rol, extra) => usuariDe(R, rol, extra) };
    for (const accio of accions) {
      if (filtre && !accio.nom.includes(filtre)) continue;
      await db.exec('savepoint accio');
      let res;
      try {
        res = await accio.executa(ctx);
      } catch (e) {
        res = { ok: false, error: e.message };
      }
      await db.exec('rollback to savepoint accio');
      await db.exec('release savepoint accio');
      if (res.ok) console.log(`  ✓ ${accio.nom}${res.nota ? '  · ' + res.nota : ''}`);
      else { errors++; console.log(`  ✗ ${accio.nom}\n      ${res.error}`); }
    }
  }
} finally {
  try { await db.exec('rollback'); } catch { /* sense transacció */ }
  await db.tanca();
}
console.log(errors ? `\n${errors} problema(es).` : '\nTot en ordre.');
process.exit(errors ? 1 : 0);

function usuariDe(R, rol, extra = {}) {
  const ids = R.usuari_rols.filter((r) => r.rol_id === rol).map((r) => r.usuari_id);
  const u = R.usuaris.find((x) => ids.includes(x.id) && x.actiu && (extra.excepte ? !extra.excepte.includes(x.id) : true));
  if (!u) throw new Error('No hi ha cap usuari amb el rol ' + rol);
  return u;
}
