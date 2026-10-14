// Estat i aplicació de les migracions de supabase/migrations al projecte de Supabase (D-043).
//
//   node tools/supabase_migra.mjs estat    connexió, regió, configuració del projecte i migracions pendents
//   node tools/supabase_migra.mjs aplica   aplica les pendents, per ordre, cadascuna en una transacció
//
// Les migracions aplicades s'anoten a supabase_migrations.schema_migrations, la mateixa taula que fa servir la CLI de
// Supabase (`supabase db push`), perquè totes dues eines vegen el mateix estat. Si una migració falla, es desfà sencera
// i no s'aplica cap de les següents. Una migració aplicada no es modifica mai: els canvis van en un fitxer nou.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const dirMigracions = join(aqui, '..', 'supabase', 'migrations');
const ordre = process.argv[2];

if (!['estat', 'aplica'].includes(ordre)) {
  console.log('Ús: node tools/supabase_migra.mjs estat|aplica');
  process.exit(2);
}

function locals() {
  return readdirSync(dirMigracions).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort().map((f) => ({
    fitxer: f,
    versio: f.slice(0, 14),
    nom: f.slice(15, -4),
  }));
}

async function aplicades(db) {
  const hiHa = await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null as hi_ha");
  if (!hiHa[0].hi_ha) return [];
  return (await db.query('select version from supabase_migrations.schema_migrations order by version')).map((r) => r.version);
}

const db = await connectaRemot();
let codi = 0;
try {
  const [info] = await db.query('select version() as versio, current_user as usuari');
  const regio = (db.descripcio.match(/aws-\d+-([a-z]+-[a-z]+-\d+)/) || [])[1] || '(no es dedueix de l\'adreça)';
  console.log(`Connectat: ${db.descripcio}`);
  console.log(`Servidor: ${info.versio.split(' on ')[0]} · usuari ${info.usuari} · regió ${regio}`);

  const fets = await aplicades(db);
  const pendents = locals().filter((m) => !fets.includes(m.versio));
  const desconegudes = fets.filter((v) => !locals().some((m) => m.versio === v));

  if (ordre === 'estat') {
    const [{ n }] = await db.query("select count(*)::int as n from pg_tables where schemaname = 'public'");
    console.log(`Taules a public: ${n}`);
    const defecte = await db.query(`
      select pg_get_userbyid(d.defaclrole) as propietari, a.grantee::regrole::text as rol
      from pg_default_acl d, aclexplode(d.defaclacl) a
      where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
        and d.defaclrole = 'postgres'::regrole  -- propietari de les taules de les migracions
        and a.grantee::regrole::text in ('anon', 'authenticated')
      group by 1, 2 order by 1, 2`);
    console.log(defecte.length
      ? `"Automatically expose new tables" ACTIU: les taules noves de public donen permisos a ${[...new Set(defecte.map((r) => r.rol))].join(' i ')} (les migracions els retiren a anon).`
      : '"Automatically expose new tables" desactivat: les taules noves no donen permisos a ningú.');
    const evt = await db.query('select evtname from pg_event_trigger order by 1');
    console.log(`Event triggers: ${evt.length ? evt.map((r) => r.evtname).join(', ') : 'cap'}`);
    console.log(`Migracions aplicades: ${fets.length ? fets.join(', ') : 'cap'}`);
    console.log(`Migracions pendents: ${pendents.length ? pendents.map((m) => m.fitxer).join(', ') : 'cap'}`);
    if (desconegudes.length) console.log(`ATENCIÓ: aplicades al projecte però no al repositori: ${desconegudes.join(', ')}`);
  } else {
    if (desconegudes.length) {
      throw new Error(`El projecte té migracions que no són al repositori (${desconegudes.join(', ')}): no s'aplica res.`);
    }
    if (!pendents.length) console.log('No hi ha cap migració pendent.');
    await db.exec(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key, statements text[], name text)`);
    for (const m of pendents) {
      const sql = readFileSync(join(dirMigracions, m.fitxer), 'utf8');
      await db.exec('begin');
      try {
        await db.exec(sql);
        await db.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)',
          [m.versio, m.nom, [sql]]);
        await db.exec('commit');
        console.log(`✓ ${m.fitxer}`);
      } catch (e) {
        await db.exec('rollback');
        throw new Error(`${m.fitxer} ha fallat i s'ha desfet sencera (no s'ha aplicat cap de les següents): ${e.message}`);
      }
    }
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  codi = 1;
} finally {
  await db.tanca();
}
process.exit(codi);
