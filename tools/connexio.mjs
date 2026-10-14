// Connexió al projecte de Supabase per a les eines locals. La cadena és a SUPABASE_DB_URL (variable d'entorn) o a
// tools/.env, que no es puja mai al repositori. Cap funció d'aquest fitxer escriu la contrasenya enlloc.
//
// TLS: es verifica el certificat del servidor (sense verificar, qualsevol que estiguera enmig de la xarxa podria
// veure la contrasenya). Supabase el signa amb una CA pròpia: cal desar-la a tools/supabase-ca.crt o
// tools/prod-ca-2021.crt (tauler → Project Settings → Database → SSL Configuration → Download certificate).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));

export function urlRemota() {
  let url = process.env.SUPABASE_DB_URL;
  const env = join(aqui, '.env');
  if (!url && existsSync(env)) {
    // `SUPABASE_DB_URL=postgresql://…` o la cadena sola en una línia.
    const m = readFileSync(env, 'utf8').match(/^(?:SUPABASE_DB_URL=)?(postgres(?:ql)?:\/\/\S+)\s*$/m);
    if (m) url = m[1].trim();
  }
  if (!url) throw new Error('Falta SUPABASE_DB_URL (variable d\'entorn o tools/.env).');
  if (url.includes('REEMPLAÇA') || url.includes('[YOUR-PASSWORD]')) {
    throw new Error('tools/.env encara té el text de mostra: falta enganxar la cadena o posar-hi la contrasenya.');
  }
  // La contrasenya pot portar caràcters reservats (@ : / # % ? …) sense codificar, tal com la dona Supabase:
  // es separa pel darrer "@" i es codifica, llevat que ja estiga codificada.
  const parts = url.match(/^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([^@]+)$/);
  if (parts) {
    const [, esquema, usuari, contrasenya, resta] = parts;
    const jaCodificada = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})*$/.test(contrasenya);
    url = esquema + usuari + ':' + (jaCodificada ? contrasenya : encodeURIComponent(contrasenya)) + '@' + resta;
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('La cadena de tools/.env no és una URI vàlida (format esperat: postgresql://usuari:contrasenya@servidor:port/base).');
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('La cadena ha de començar per postgresql://');
  if (!u.password) throw new Error('La cadena no porta contrasenya.');
  return url;
}

// Descripció sense la contrasenya, per mostrar-la.
export function descriu(url) {
  const u = new URL(url);
  return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

export async function connectaRemot() {
  const url = urlRemota();
  const { default: pg } = await import('pg');
  const caFitxer = ['supabase-ca.crt', 'prod-ca-2021.crt'].map((f) => join(aqui, f)).find((f) => existsSync(f));
  const ssl = caFitxer
    ? { ca: readFileSync(caFitxer, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: true };
  const u = new URL(url);
  u.searchParams.delete('sslmode');  // el TLS el decideix `ssl`, no la cadena
  const client = new pg.Client({ connectionString: u.toString(), ssl });
  await client.connect();
  return {
    descripcio: descriu(url),
    exec: (sql) => client.query(sql),
    query: async (sql, params) => (await client.query(sql, params)).rows,
    tanca: () => client.end(),
  };
}
