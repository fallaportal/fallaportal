// Buidatge del projecte de Supabase (Fase 5, D-043): el que es fa el dia del tall abans de tornar a aplicar les migracions i carregar les dades
// reals, i el que s'assaja abans. Esborra tot el que és NOSTRE i deixa el projecte tal com el va crear Supabase:
//
//   · les taules, les funcions i la seqüència de l'esquema `public` (incloent-hi el registre d'activitat `audit_log`: és el projecte de proves)
//   · l'esquema `app` (funcions de permisos, triggers i el hook d'alta)
//   · les polítiques de `storage.objects` dels justificants i els fitxers del bucket `justificants` (el bucket es queda: la migració el torna a posar)
//   · els usuaris d'Auth (`auth.users`) i, per cascada, les seues sessions
//   · els apunts de les nostres migracions a `supabase_migrations.schema_migrations` (perquè `supabase_migra.mjs aplica` les torne a aplicar totes)
//
//   node tools/supabase_buida.mjs                     prova: diu què hi ha i què s'esborraria
//   node tools/supabase_buida.mjs --aplica            esborra
//   --ignora-definitiu                                necessari si el projecte ja té la càrrega definitiva (config «carrega_definitiva»)
//
// Mentre el projecte és buit, el hook «Before User Created» (tauler d'Auth) apunta a una funció que no existeix: ningú no pot entrar fins que
// s'apliquen les migracions (`node tools/supabase_migra.mjs aplica`). Els fitxers de Storage s'esborren amb l'API: cal SUPABASE_SERVICE_KEY
// (variable d'entorn o tools/.env) si n'hi ha. Les extensions i els esquemes de Supabase no es toquen.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot, urlRemota } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const aplica = args.includes('--aplica');
const ignoraDefinitiu = args.includes('--ignora-definitiu');

const POLITIQUES_STORAGE = ['justificants_llegeix', 'justificants_puja', 'justificants_substitueix', 'justificants_esborra'];
const versions = readdirSync(join(aqui, '..', 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]);

function claveServei() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  const env = join(aqui, '.env');
  if (existsSync(env)) {
    const m = readFileSync(env, 'utf8').match(/^SUPABASE_SERVICE_KEY=(\S+)\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
const urlProjecte = () => `https://${decodeURIComponent(new URL(urlRemota()).username).split('.')[1]}.supabase.co`;

const db = await connectaRemot();
let codi = 0;
try {
  console.log(`Connectat: ${db.descripcio}${aplica ? '' : ' · PROVA (no s\'esborra res)'}`);
  const un = async (sql) => (await db.query(sql))[0];
  const taules = (await db.query("select tablename t from pg_tables where schemaname = 'public' order by 1")).map((r) => r.t);
  const existeixConfig = taules.includes('config');
  const definitiva = existeixConfig ? (await db.query("select valor from public.config where clau = 'carrega_definitiva'"))[0] : null;
  const usuarisAuth = (await un('select count(*)::int n from auth.users')).n;
  const fitxers = (await db.query("select name from storage.objects where bucket_id = 'justificants' order by name")).map((r) => r.name);
  const migracions = (await un(`select count(*)::int n from supabase_migrations.schema_migrations where version = any ($1)`.replace('$1', `array[${versions.map((v) => `'${v}'`).join(',')}]`))).n;
  const funcionsApp = (await un("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app'")).n;
  console.log(`\nHi ha: ${taules.length} taules a public · ${funcionsApp} funcions a app · ${usuarisAuth} usuaris d'Auth · ${fitxers.length} fitxers a Storage · ${migracions} migracions anotades`);
  if (existeixConfig) console.log(`Moviments: ${(await un('select count(*)::int n from public.moviments')).n} · registre d'activitat: ${(await un('select count(*)::int n from public.audit_log')).n} files`);
  if (definitiva) console.log(`⚠ El projecte té la càrrega DEFINITIVA (${JSON.stringify(definitiva.valor)}).`);

  if (!aplica) { console.log('\nProva: no s\'ha esborrat res. Per esborrar: node tools/supabase_buida.mjs --aplica'); }
  else {
    if (definitiva && !ignoraDefinitiu) throw new Error('El projecte té la càrrega definitiva: buidar-lo esborraria les dades reals d\'ús. Si de veres cal, --ignora-definitiu.');
    // 1. Fitxers de Storage (amb l'API: per SQL, Storage no deixa)
    if (fitxers.length) {
      const clau = claveServei();
      if (!clau) throw new Error(`Hi ha ${fitxers.length} fitxers a Storage i falta SUPABASE_SERVICE_KEY per a esborrar-los (variable d'entorn o tools/.env).`);
      for (let i = 0; i < fitxers.length; i += 100) {
        const r = await fetch(`${urlProjecte()}/storage/v1/object/justificants`, {
          method: 'DELETE', headers: { Authorization: 'Bearer ' + clau, apikey: clau, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: fitxers.slice(i, i + 100) }),
        });
        if (!r.ok) throw new Error(`Storage no ha esborrat els fitxers (${r.status}): ${(await r.text()).slice(0, 150)}`);
      }
      const queden = (await un("select count(*)::int n from storage.objects where bucket_id = 'justificants'")).n;
      if (queden) throw new Error(`Encara queden ${queden} fitxers a Storage.`);
      console.log(`✓ ${fitxers.length} fitxers de Storage esborrats`);
    }
    // 2. Tot el que és nostre, en una transacció
    await db.exec('begin');
    for (const p of POLITIQUES_STORAGE) await db.exec(`drop policy if exists ${p} on storage.objects`);
    for (const t of taules) await db.exec(`drop table if exists public.${t} cascade`);
    await db.exec('drop function if exists public.guarda_canvis(jsonb, text)');
    await db.exec('drop schema if exists app cascade');
    await db.exec(`delete from supabase_migrations.schema_migrations where version = any (array[${versions.map((v) => `'${v}'`).join(',')}])`);
    await db.exec('delete from auth.users');
    const sobren = (await un("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','S','v')")).n;
    if (sobren) throw new Error(`Encara queden ${sobren} objectes a public: no es confirma res.`);
    await db.exec('commit');
    console.log(`✓ ${taules.length} taules, l'esquema app, ${usuarisAuth} usuaris d'Auth i ${migracions} apunts de migracions esborrats`);
    console.log('\nProjecte buit. Següent: node tools/supabase_migra.mjs aplica');
  }
} catch (e) {
  try { await db.exec('rollback'); } catch { /* sense transacció */ }
  console.error('\nERROR: ' + e.message);
  codi = 1;
} finally {
  await db.tanca();
}
process.exit(codi);
