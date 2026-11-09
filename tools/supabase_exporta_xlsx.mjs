// Export invers (Fase 5, PLA §7 «marxa arrere»): Supabase → .xlsx amb el format de pestanyes del Google Sheet (el que llig la versió de `main`).
//
//   node tools/supabase_exporta_xlsx.mjs "C:/ruta/sortida.xlsx"
//
// Fa servir el MATEIX adaptador que l'app (sbPestanyes, d'index.html, entre els marcadors ADAPTADOR SUPABASE) i les capçaleres de TABS: el que
// l'app mostra és el que s'exporta. Només llig la base de dades. Diferències respecte del full original (totes esperades):
//   · el justificant és l'enllaç de Drive si el moviment en té (els fitxers de Drive no s'han tocat); si només és a Storage, `sb:<ruta>`
//     (el fitxer continua a Supabase; per a la marxa arrere cal baixar-lo);
//   · «00 Config» porta l'exercici actiu, els exercicis i els estats (no carpetes de Drive ni visibilitat de mòduls: ja no existeixen);
//   · «14 Rols» deriva els sis permisos antics de la matriu rol × mòdul.
// L'export conté dades reals: escriu-lo fora del repositori.
//
// Verificació (assaig): tools/supabase_assaig.mjs carrega l'export desat i comprova que l'empremta de la base de dades és la mateixa.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { connectaRemot } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const sortida = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!sortida) { console.log('Ús: node tools/supabase_exporta_xlsx.mjs "<sortida.xlsx>"'); process.exit(2); }

const html = readFileSync(join(aqui, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ===== ADAPTADOR SUPABASE · INICI');
const b = html.indexOf('// ===== ADAPTADOR SUPABASE · FI =====');
const r0 = html.indexOf('const DEFAULT_ROLES={');
const r1 = html.indexOf('\n};', r0) + 3;
const t0 = html.indexOf('const TABS={');
const t1 = html.indexOf('\n};', t0) + 3;
if ([a, b, r0, t0].some((x) => x < 0)) throw new Error('No trobe l\'adaptador, DEFAULT_ROLES o TABS a index.html');
const { sbPestanyes, SB_ORDRES } = new Function(`const sb=null;\n${html.slice(r0, r1)}\n${html.slice(a, b)}\nreturn {sbPestanyes,SB_ORDRES};`)();
const TABS = new Function(`${html.slice(t0, t1)}\nreturn TABS;`)();

const EXTRES = { compromisos: 'creat_at, id', compromis_terminis: 'data_prevista, id', extractes_saldos: 'compte_id, data' };
const EXTRA = {};
const db = await connectaRemot();
let T;
try {
  console.log(`Connectat: ${db.descripcio}`);
  const R = {};
  for (const t of Object.keys(SB_ORDRES)) R[t] = (await db.query(`select to_jsonb(t) as j from public.${t} t order by ${SB_ORDRES[t].join(', ')}`)).map((x) => x.j);
  // El justificant: l'enllaç de Drive si n'hi ha (l'app de `main` el llig); si no, `sb:<ruta>`.
  R.justificants = R.justificants.map((j) => (j.url_drive_original ? { ...j, storage_path: null } : j));
  T = sbPestanyes(R);
  // WS-PREVISIO, fase 1: taules que l'app llig i escriu directament i que no són pestanyes del full. S'exporten perquè l'export és la còpia
  // de seguretat; si la migració encara no hi és (projecte antic), surten buides.
  for (const [taula, ordre] of Object.entries(EXTRES)) {
    try { EXTRA[taula] = (await db.query(`select to_jsonb(t) as j from public.${taula} t order by ${ordre}`)).map((x) => x.j); }
    catch (e) { console.log(`  (sense ${taula}: ${e.message})`); EXTRA[taula] = []; }
  }
} finally { await db.tanca(); }

// Només les pestanyes que coneix l'app de Sheets, en l'ordre i amb les capçaleres de TABS (les que ja no existeixen surten buides).
const vistes = new Set();
const tabs = [];
for (const def of Object.values(TABS)) {
  if (vistes.has(def.name)) continue;
  vistes.add(def.name);
  tabs.push({ name: def.name, headers: def.headers, rows: T[def.name] || [] });
}
// Pestanyes pròpies (no són de l'app de Sheets): les columnes de la taula, tal qual.
for (const [taula, files] of Object.entries(EXTRA)) {
  const headers = files.length ? Object.keys(files[0]) : ['id'];
  tabs.push({ name: taula, headers, rows: files });
}
const carpeta = mkdtempSync(join(tmpdir(), 'f5-'));
const json = join(carpeta, 'export.json');
writeFileSync(json, JSON.stringify({ tabs }));
console.log(execFileSync('python', ['-I', join(aqui, 'f5_escriu_xlsx.py'), json, sortida], { encoding: 'utf8' }).trim());
for (const t of tabs) console.log(`  ${t.name.padEnd(28)} ${String(t.rows.length).padStart(4)} files`);
console.log(`\nEscrit a ${sortida} (conté dades reals: fora del repositori).`);
