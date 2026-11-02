// Assaig complet del tall (Fase 5): el que es farà el dia del tall, però amb l'export actual, repetit fins que surt net.
//
//   node tools/supabase_assaig.mjs "C:/ruta/Falla Portal DB.xlsx"                 un assaig sencer
//   node tools/supabase_assaig.mjs "C:/ruta/Falla Portal DB.xlsx" --vegades 2     dos assajos seguits (el criteri de la Fase 5: neta dues vegades)
//   --sense-buidar                                                                 no buida el projecte ni aplica les migracions (només carrega i comprova)
//
// Cada assaig:
//   1. Buida el projecte (tools/supabase_buida.mjs --aplica) i aplica les migracions des de zero (tools/supabase_migra.mjs aplica)
//   2. Passa les proves de l'esquema contra el projecte (tools/supabase_tests.mjs --remot)
//   3. Carrega l'export i el valida (tools/supabase_carrega.mjs: files, sumes, saldos, id, mostra; si falla, no confirma res) i en desa l'empremta
//   4. Exporta la base de dades a .xlsx (tools/supabase_exporta_xlsx.mjs) — l'export invers de la marxa arrere
//   5. Carrega aquest export com si fóra el full (simulacre) i comprova que l'empremta és IDÈNTICA a la del pas 3: tornar al full no perd res
//   6. Passa les 33 accions de l'inventari (tools/supabase_escriptura.mjs --accions)
// Destructiu per al projecte de Supabase (és el de proves, D-043): mai després de la càrrega definitiva (el buidatge s'hi nega).
// L'export conté dades reals: es desa a la carpeta temporal i s'esborra en acabar.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const xlsx = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--vegades');
const vegades = args.includes('--vegades') ? parseInt(args[args.indexOf('--vegades') + 1], 10) : 1;
const senseBuidar = args.includes('--sense-buidar');
if (!xlsx) { console.log('Ús: node tools/supabase_assaig.mjs "<export.xlsx>" [--vegades n] [--sense-buidar]'); process.exit(2); }

const carpeta = mkdtempSync(join(tmpdir(), 'assaig-'));
const resultats = [];

function pas(nom, script, params, filtre) {
  const t0 = Date.now();
  process.stdout.write(`  ${nom} … `);
  let sortida;
  try {
    sortida = execFileSync('node', [join(aqui, script), ...params], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
  } catch (e) {
    console.log('✗');
    console.log(String((e.stdout || '') + (e.stderr || '')).split('\n').slice(-25).join('\n'));
    throw new Error(`Ha fallat el pas «${nom}»`);
  }
  const resum = filtre ? filtre(sortida) : '';
  console.log(`✓ ${resum} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return sortida;
}
const darrera = (re) => (s) => (s.match(re) || [''])[0];

try {
  for (let v = 1; v <= vegades; v++) {
    console.log(`\n=== Assaig ${v} de ${vegades} ===`);
    if (!senseBuidar) {
      pas('Buidar el projecte', 'supabase_buida.mjs', ['--aplica'], darrera(/Projecte buit/));
      pas('Aplicar les migracions des de zero', 'supabase_migra.mjs', ['aplica'], (s) => `${(s.match(/✓/g) || []).length} migracions`);
      pas('Proves de l\'esquema (--remot)', 'supabase_tests.mjs', ['--remot'], darrera(/\d+ correctes, \d+ fallits/));
    }
    const A = join(carpeta, `empremta-A-${v}.json`), B = join(carpeta, `empremta-B-${v}.json`), X = join(carpeta, `export-${v}.xlsx`);
    const c1 = pas('Carregar l\'export i validar-lo', 'supabase_carrega.mjs', [xlsx, '--empremta', A], (s) => (s.match(/Validació: .*$/m) || [''])[0]);
    pas('Exportar a .xlsx (marxa arrere)', 'supabase_exporta_xlsx.mjs', [X], darrera(/ok \d+ files, \d+ pestanyes/));
    const c2 = pas('Carregar l\'export invers (simulacre) i validar-lo', 'supabase_carrega.mjs', [X, '--simula', '--empremta', B], (s) => (s.match(/Validació: .*$/m) || [''])[0]);
    const ea = JSON.parse(readFileSync(A, 'utf8')), eb = JSON.parse(readFileSync(B, 'utf8'));
    const difs = Object.keys(ea).filter((t) => ea[t].n !== eb[t]?.n || ea[t].h !== eb[t]?.h);
    console.log(`  Empremta de la base de dades: ${difs.length ? '✗ diferent a ' + difs.join(', ') : `✓ idèntica (${Object.keys(ea).length} taules, ${Object.values(ea).reduce((s, t) => s + t.n, 0)} files)`}`);
    if (difs.length) for (const t of difs) console.log(`      ${t}: ${ea[t].n} → ${eb[t]?.n} files`);
    const acc = pas('Accions de l\'inventari (escriptura)', 'supabase_escriptura.mjs', ['--accions'], darrera(/Tot en ordre\./));
    const net = !difs.length && /0 errors/.test(c1) && /0 errors/.test(c2) && /Tot en ordre/.test(acc);
    resultats.push(net);
    console.log(`  → Assaig ${v}: ${net ? 'NET' : 'AMB PROBLEMES'}`);
    if (!net) break;
  }
  const nets = resultats.filter(Boolean).length;
  console.log(`\nResultat: ${nets} de ${vegades} assajos nets${nets === vegades && vegades >= 2 ? ' — criteri de la Fase 5 complit (net dues vegades seguides).' : '.'}`);
  process.exitCode = nets === vegades ? 0 : 1;
} catch (e) {
  console.error('\nERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
