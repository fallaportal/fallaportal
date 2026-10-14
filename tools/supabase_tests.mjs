// Tests de l'esquema i de les polítiques RLS de Supabase (Fase 1 de PLA_MIGRACIO_SUPABASE.md).
//
//   node tools/supabase_tests.mjs            en local: PGlite + supabase/tests/supabase_local.sql + migracions
//   node tools/supabase_tests.mjs --remot    contra el projecte de Supabase: les migracions ja hi han de ser aplicades
//                                            (tools/supabase_migra.mjs). La connexió és la de tools/connexio.mjs.
//   --filtre <text>                          només els casos el nom dels quals conté <text>
//   --detall                                 mostra el missatge dels errors esperats (per comprovar-ne el motiu)
//
// Tot s'executa dins d'una transacció que es desfà al final: al projecte no queda cap dada de prova.
// Cada cas s'executa en un SAVEPOINT amb el rol `authenticated` i el JWT de la persona indicada.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casos as casosRls } from '../supabase/tests/casos_rls.mjs';
import { casos as casosGuarda } from '../supabase/tests/casos_guarda.mjs';

const casos = [...casosRls, ...casosGuarda];
import { connectaRemot } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(aqui, '..', 'supabase');
const args = process.argv.slice(2);
const remot = args.includes('--remot');
const filtre = args.includes('--filtre') ? args[args.indexOf('--filtre') + 1] : null;
const detall = args.includes('--detall');

const llig = (p) => readFileSync(p, 'utf8');

async function connectaLocal() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  return {
    exec: (sql) => db.exec(sql),
    query: async (sql) => (await db.query(sql)).rows,
    tanca: () => db.close(),
  };
}

function claims(email) {
  return JSON.stringify({ role: 'authenticated', email, sub: '00000000-0000-4000-8000-000000000000' });
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function primerValor(files) {
  if (!files.length) return null;
  const v = Object.values(files[0])[0];
  return v === null || v === undefined ? null : String(v);
}

async function executaCas(db, cas) {
  await db.exec('savepoint cas');
  let resultat;
  try {
    for (const sql of [].concat(cas.prep || [])) await db.query(sql);
    if (cas.com === 'service_role') {
      await db.query('set local role service_role');
      await db.query(`select set_config('request.jwt.claims', ${lit(JSON.stringify({ role: 'service_role' }))}, true)`);
    } else if (cas.com !== 'servei') {
      await db.query(cas.com === 'anon' ? 'set local role anon' : 'set local role authenticated');
      // cas.jwt substitueix els claims per defecte (p. ex. un JWT sense el claim `role`)
      const c = cas.jwt ? JSON.stringify(cas.jwt) : claims(cas.com);
      if (cas.com !== 'anon') await db.query(`select set_config('request.jwt.claims', ${lit(c)}, true)`);
    }
    if (cas.motiu) await db.query(`select set_config('app.motiu', ${lit(cas.motiu)}, true)`);
    let files = [];
    for (const sql of [].concat(cas.sql)) files = await db.query(sql);
    if (cas.verifica) {
      await db.query('reset role');
      await db.query(`select set_config('request.jwt.claims', '', true)`);
      files = await db.query(cas.verifica);
    }
    resultat = { ok: true, files };
  } catch (e) {
    resultat = { ok: false, error: e.message };
  }
  await db.exec('rollback to savepoint cas');
  await db.exec('release savepoint cas');
  return resultat;
}

function avalua(cas, r) {
  const esp = cas.espera;
  if (esp === 'error' || (esp && esp.error !== undefined)) {
    if (r.ok) return `esperava un error i ha anat bé (${r.files.length} files)`;
    if (esp.error && !r.error.includes(esp.error)) return `error diferent de l'esperat: ${r.error}`;
    return null;
  }
  if (!r.ok) return `error inesperat: ${r.error}`;
  if (esp && esp.files !== undefined && r.files.length !== esp.files) return `esperava ${esp.files} files i n'hi ha ${r.files.length}`;
  if (esp && esp.valor !== undefined) {
    const v = primerValor(r.files);
    if (v !== String(esp.valor)) return `esperava «${esp.valor}» i ha tornat «${v}»`;
  }
  return null;
}

const db = remot ? await connectaRemot() : await connectaLocal();
let fallen = 0;
let passen = 0;
try {
  if (remot) console.log(`Connectat: ${db.descripcio}`);
  if (!remot) {
    await db.exec(llig(join(supabaseDir, 'tests', 'supabase_local.sql')));
    const migracions = readdirSync(join(supabaseDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of migracions) {
      try {
        await db.exec(llig(join(supabaseDir, 'migrations', f)));
      } catch (e) {
        throw new Error(`La migració ${f} falla: ${e.message}`);
      }
    }
    console.log(`Migracions aplicades: ${migracions.length}`);
  }
  await db.exec('begin');
  await db.exec(llig(join(supabaseDir, 'tests', 'dades_prova.sql')));
  for (const cas of casos) {
    if (filtre && !cas.nom.includes(filtre)) continue;
    const r = await executaCas(db, cas);
    const problema = avalua(cas, r);
    if (problema) {
      fallen++;
      console.log(`✗ ${cas.nom}\n    ${problema}`);
    } else {
      passen++;
      console.log(`✓ ${cas.nom}` + (detall && !r.ok ? `\n    (error esperat) ${r.error}` : ''));
    }
  }
} finally {
  try { await db.exec('rollback'); } catch { /* sense transacció oberta */ }
  await db.tanca();
}
console.log(`\n${passen} correctes, ${fallen} fallits`);
process.exit(fallen ? 1 : 0);
