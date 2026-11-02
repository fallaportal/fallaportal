// Migració dels justificants antics de Google Drive a Supabase Storage (Fase 4, D-051).
//
// Llig de `justificants` les files que encara només tenen l'enllaç de Drive (storage_path nul), baixa cada fitxer de Drive, el puja al
// bucket privat `justificants` (ruta «XX-YY/<id del moviment>.<ext>») i completa la fila (ruta, nom, tipus, mida). Els fitxers de Drive
// NO s'esborren ni es toquen (queden com a còpia) i l'enllaç antic es conserva a la fila. Es pot repetir: les files ja migrades se salten.
//
//   node tools/supabase_justificants_drive.mjs                  prova: diu què es faria (sense Drive ni Storage; no calen claus)
//   node tools/supabase_justificants_drive.mjs --aplica         migra de veres
//   node tools/supabase_justificants_drive.mjs --aplica --carpeta <id>   a més, llista els fitxers de la carpeta de Drive que cap
//                                                               moviment no referencia (orfes; no es pugen, només es llisten)
//
// Per a --aplica calen (mai al repositori):
//   GOOGLE_TOKEN          variable d'entorn: un token d'accés de Google amb accés de lectura a Drive (caduca en una hora; es pot treure
//                         de https://developers.google.com/oauthplayground amb l'abast https://www.googleapis.com/auth/drive.readonly,
//                         amb el compte que veu els fitxers)
//   SUPABASE_SERVICE_KEY  variable d'entorn o una línia SUPABASE_SERVICE_KEY=… a tools/.env (tauler de Supabase → Project Settings →
//                         API Keys → «service_role» / secret). Dona accés total: no la compartisques ni la pugis enlloc.
// La URL del projecte (https://<ref>.supabase.co) es dedueix de la cadena de connexió de tools/.env.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot, urlRemota } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const aplica = args.includes('--aplica');
const carpeta = args.includes('--carpeta') ? args[args.indexOf('--carpeta') + 1] : null;

const MIDA_MAX = 10 * 1024 * 1024;
const EXT_PER_TIPUS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

// L'id d'un fitxer de Drive d'un enllaç («…/file/d/<id>/view», «…?id=<id>»); nul si no es reconeix.
function idDrive(url) {
  const m = String(url || '').match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
// «XX-YY/<moviment>.<ext>» (l'exercici 26/27 és la carpeta 26-27).
function rutaStorage(exercici, movimentId, ext) {
  return String(exercici).replace('/', '-') + '/' + movimentId + '.' + ext;
}

function claveServei() {
  if (process.env.SUPABASE_SERVICE_KEY) return process.env.SUPABASE_SERVICE_KEY.trim();
  const env = join(aqui, '.env');
  if (existsSync(env)) {
    const m = readFileSync(env, 'utf8').match(/^SUPABASE_SERVICE_KEY=(\S+)\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
function urlProjecte() {
  const u = new URL(urlRemota());
  const ref = decodeURIComponent(u.username).split('.')[1];
  if (!ref) throw new Error('No puc deduir la referència del projecte de la cadena de connexió.');
  return `https://${ref}.supabase.co`;
}

async function drive(ruta, token, opcions = {}) {
  const r = await fetch('https://www.googleapis.com/drive/v3/' + ruta, { headers: { Authorization: 'Bearer ' + token }, ...opcions });
  return r;
}

async function main() {
  const db = await connectaRemot();
  try {
    console.log(`Connectat: ${db.descripcio}`);
    const files = await db.query(`
      select j.id, j.moviment_id, j.url_drive_original, m.exercici_id
      from public.justificants j join public.moviments m on m.id = j.moviment_id
      where j.storage_path is null and j.url_drive_original is not null
      order by m.exercici_id, j.moviment_id`);
    const jaMigrats = (await db.query('select count(*) n from public.justificants where storage_path is not null'))[0].n;
    console.log(`Per migrar: ${files.length} · ja a Storage: ${jaMigrats}`);

    if (!aplica) {
      let sense = 0;
      for (const f of files) {
        const id = idDrive(f.url_drive_original);
        if (!id) sense++;
        console.log(`  ${f.exercici_id}  ${f.moviment_id}  ${id ? 'Drive ' + id : '✗ enllaç no reconegut: ' + f.url_drive_original}`);
      }
      console.log(`\nProva: no s'ha baixat ni pujat res.${sense ? ` ${sense} enllaços no es reconeixen.` : ''}\nPer migrar de veres: GOOGLE_TOKEN=… node tools/supabase_justificants_drive.mjs --aplica`);
      return;
    }

    const token = process.env.GOOGLE_TOKEN;
    const clau = claveServei();
    if (!token) throw new Error('Falta GOOGLE_TOKEN (variable d\'entorn). Vegeu la capçalera d\'aquest fitxer.');
    if (!clau) throw new Error('Falta SUPABASE_SERVICE_KEY (variable d\'entorn o tools/.env). Vegeu la capçalera d\'aquest fitxer.');
    const base = urlProjecte();

    const informe = { pujats: [], no_trobats: [], tipus_no_admes: [], massa_grans: [], errors: [] };
    for (const f of files) {
      const etiqueta = `${f.exercici_id} ${f.moviment_id}`;
      const id = idDrive(f.url_drive_original);
      if (!id) { informe.errors.push(`${etiqueta}: enllaç no reconegut (${f.url_drive_original})`); continue; }
      try {
        const meta = await drive(`files/${id}?fields=name,mimeType,size&supportsAllDrives=true`, token);
        if (meta.status === 404 || meta.status === 403) { informe.no_trobats.push(`${etiqueta}: Drive ${id} (${meta.status})`); continue; }
        if (meta.status === 401) throw new Error('El token de Google no val o ha caducat (401): n\'hi ha un de nou?');
        if (!meta.ok) { informe.errors.push(`${etiqueta}: Drive ${meta.status}`); continue; }
        const m = await meta.json();
        const ext = EXT_PER_TIPUS[m.mimeType];
        if (!ext) { informe.tipus_no_admes.push(`${etiqueta}: ${m.mimeType} (${m.name})`); continue; }
        if (Number(m.size) > MIDA_MAX) { informe.massa_grans.push(`${etiqueta}: ${(Number(m.size) / 1048576).toFixed(1)} MB (${m.name})`); continue; }
        const cos = await drive(`files/${id}?alt=media&supportsAllDrives=true`, token);
        if (!cos.ok) { informe.errors.push(`${etiqueta}: baixada ${cos.status}`); continue; }
        const dades = Buffer.from(await cos.arrayBuffer());
        const ruta = rutaStorage(f.exercici_id, f.moviment_id, ext);
        const up = await fetch(`${base}/storage/v1/object/justificants/${ruta.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + clau, apikey: clau, 'Content-Type': m.mimeType, 'x-upsert': 'true' },
          body: dades,
        });
        if (!up.ok) { informe.errors.push(`${etiqueta}: Storage ${up.status} ${(await up.text()).slice(0, 120)}`); continue; }
        await db.query('update public.justificants set storage_path = $1, nom_fitxer = $2, tipus_mime = $3, mida = $4 where id = $5',
          [ruta, m.name, m.mimeType, dades.length, f.id]);
        informe.pujats.push(`${etiqueta}: ${ruta} (${dades.length} bytes)`);
        console.log(`  ✓ ${ruta}`);
      } catch (e) {
        if (/token de Google/.test(e.message)) throw e;
        informe.errors.push(`${etiqueta}: ${e.message}`);
      }
    }

    // Verificació: cada fila amb ruta té el fitxer a Storage
    const sensefitxer = await db.query(`select j.storage_path from public.justificants j
      where j.storage_path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'justificants' and o.name = j.storage_path)`);

    // Orfes a Drive (opcional): fitxers de la carpeta que cap moviment no referencia
    let orfes = null;
    if (carpeta) {
      const referenciats = new Set((await db.query('select url_drive_original u from public.justificants where url_drive_original is not null')).map((r) => idDrive(r.u)));
      orfes = [];
      let pagina = '';
      do {
        const q = encodeURIComponent(`'${carpeta}' in parents and trashed = false`);
        const r = await drive(`files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true${pagina}`, token);
        if (!r.ok) throw new Error(`No puc llistar la carpeta de Drive (${r.status})`);
        const j = await r.json();
        for (const x of j.files) if (!referenciats.has(x.id)) orfes.push(`${x.name} (${x.id})`);
        pagina = j.nextPageToken ? '&pageToken=' + j.nextPageToken : '';
      } while (pagina);
    }

    console.log('\n=== Informe ===');
    console.log(`Pujats: ${informe.pujats.length}`);
    for (const [k, t] of [['no_trobats', 'No trobats a Drive (o sense permís)'], ['tipus_no_admes', 'Tipus no admès'], ['massa_grans', 'Massa grans (> 10 MB)'], ['errors', 'Errors']]) {
      console.log(`${t}: ${informe[k].length}`);
      informe[k].forEach((x) => console.log('   ' + x));
    }
    console.log(`Files amb ruta però sense fitxer a Storage: ${sensefitxer.length}`);
    sensefitxer.forEach((r) => console.log('   ' + r.storage_path));
    if (orfes) { console.log(`Orfes a Drive (sense moviment): ${orfes.length}`); orfes.forEach((x) => console.log('   ' + x)); }
    const malament = informe.no_trobats.length + informe.tipus_no_admes.length + informe.massa_grans.length + informe.errors.length + sensefitxer.length;
    console.log(malament ? '\nHi ha justificants sense migrar: revisa l\'informe (el que falla es pot repetir).' : '\nTot migrat. Els fitxers de Drive no s\'han tocat.');
    process.exitCode = malament ? 1 : 0;
  } finally {
    await db.tanca();
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
