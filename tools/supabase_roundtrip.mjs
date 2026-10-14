// Prova d'anada i tornada de la Fase 3: l'export del full → Supabase (tools/supabase_carrega.mjs) → pestanyes del full
// (l'adaptador sbPestanyes d'index.html). Compara, pestanya per pestanya i camp per camp, el que torna l'adaptador amb
// l'export original. Les diferències esperades (esborrades per la càrrega, A-24; text que ja no es desa) s'indiquen a
// ESPERADES; qualsevol altra diferència és un error de l'adaptador o de la càrrega.
//
//   node tools/supabase_roundtrip.mjs "C:/ruta/Falla Portal DB.xlsx"
//
// Llig de la base de dades amb to_jsonb(), que dona les mateixes representacions que l'API de Supabase (PostgREST):
// numeric com a número, date com a text AAAA-MM-DD, time com HH:MM:SS.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectaRemot } from './connexio.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const xlsx = process.argv[2];
if (!xlsx) { console.log('Ús: node tools/supabase_roundtrip.mjs "<export.xlsx>"'); process.exit(2); }

const H = JSON.parse(execFileSync('python', ['-I', join(aqui, 'f3_export_json.py'), xlsx], { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' }));

// ---- l'adaptador, tal com és a index.html
const html = readFileSync(join(aqui, '..', 'index.html'), 'utf8');
const a = html.indexOf('// ===== ADAPTADOR SUPABASE · INICI');
const b = html.indexOf('// ===== ADAPTADOR SUPABASE · FI =====');
const r0 = html.indexOf('const DEFAULT_ROLES={');
const r1 = html.indexOf('\n};', r0) + 3;
if (a < 0 || b < 0 || r0 < 0) throw new Error('No trobe l\'adaptador o DEFAULT_ROLES a index.html');
const { sbPestanyes, SB_ORDRES } = new Function(`const sb=null;\n${html.slice(r0, r1)}\n${html.slice(a, b)}\nreturn {sbPestanyes,SB_ORDRES};`)();

// ---- les taules de la base de dades
const db = await connectaRemot();
let T;
try {
  const R = {};
  for (const t of Object.keys(SB_ORDRES)) R[t] = (await db.query(`select to_jsonb(t) as j from public.${t} t order by ${SB_ORDRES[t].join(', ')}`)).map((x) => x.j);
  T = sbPestanyes(R);
} finally { await db.tanca(); }

// ---- comparació
const CLAU = {
  '01 Moviments': ['id'], '02 Fons': ['id'], '03 Tancaments': ['eventId'], '04 Arees': ['id'], '05 Delegacions': ['id'], '06 Events': ['id'],
  '07 Bancs': ['id'], '08 Usuaris': ['id'], '09 Usuaris Assignacions': ['userId', 'tipus', 'id', 'anyFiscal'],
  '10 Pressupostos Plans': ['any', 'delegacioId', 'eventId', 'concepte'], '13 Regles CSV': ['id'], '14 Rols': ['id'],
  '15 Saldos': ['bancId', 'anyFiscal'], '00 Config': ['clau'],
};
// Diferències esperades: decisions o dades que el model ja no desa (un motiu per cada una).
const sensAccents = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const EMAILS = new Set(['responsableEmail', 'delegEmail', 'registratPer', 'email', 'bloquejatEmail']);
const DATES = { '01 Moviments': ['data'], '02 Fons': ['data'], '03 Tancaments': ['data'], '15 Saldos': ['saldoData'] };
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
function normalitza(tab, c, v) {
  v = String(v ?? '').trim();
  if (EMAILS.has(c)) return v.toLowerCase();
  if ((DATES[tab] || []).includes(c)) { const m = v.match(ISO); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; }
  if (c === 'patrons') return v.split(/[,;]/).map((x) => x.trim()).filter(Boolean).join(',');
  if (tab === '00 Config' && c === 'valor') { try { return JSON.stringify(ordena(JSON.parse(v))); } catch { return v; } }
  return v;
}
function ordena(x) {
  if (Array.isArray(x)) return x.map(ordena);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordena(x[k])]));
  return x;
}
// Retorna el motiu si la diferència del camp c d'aquesta fila és esperada.
function esperada(tab, c, ro, rn) {
  if (tab === '01 Moviments') {
    if (ro.via === 'app' && ['concepte', 'establiment', 'notes', 'bankHash'].includes(c)) return 'consums de falles.app: la taula (D-031) no desa concepte, notes ni empremta';
    if (c === 'responsable') return 'el nom ve de usuaris (A-30)';
    if (c === 'origenFons' && ro.tipus === 'ing') return 'els ingressos manuals ja no desen «caixa» (no s\'usava)';
    if (c === 'areaNom' || c === 'delegacioNom') return sensAccents(ro[c]) === sensAccents(rn[c]) ? 'nom actualitzat (A-14)' : null;
    if (c === 'fontImport' && /^xls_/.test(ro.fontImport) && /^xls_/.test(rn.fontImport)) return 'moviment passat a un altre compte (TPV) amb un extracte d\'un altre';
    if (c === 'fontImport' && ro.fontImport === 'retirada_caixa' && !rn.fontImport) return 'retirada d\'una caixa que ja no existeix: passa a manual';
    if (c === 'origen' && ro.fontImport === 'retirada_caixa') return 'retirada passada a manual';
    if (c === 'eventNom' && sensAccents(rn.eventNom).startsWith(sensAccents(ro.eventNom))) return null;
  }
  if (tab === '02 Fons') { if (c === 'registratPer' || c === 'nota') return 'creador com a email (A-07) / notes dels canvis no es desen'; }
  if (tab === '03 Tancaments' && c === 'registratPer') return 'ara és l\'email (A-07)';
  if (tab === '03 Tancaments' && c === 'canvi') return null;
  if (tab === '06 Events' && (c === 'responsable' || c === 'status')) return 'responsable és una persona (A-07); l\'estat es calcula';
  if (tab === '07 Bancs' && c === 'compte') return 'el 02 Banc ara té IBAN; «Aproximat» ja no es desa';
  if (tab === '09 Usuaris Assignacions' && (c === 'userNom' || c === 'nom')) return 'nom complet actual';
  if (tab === '14 Rols' && c === 'label') return 'nom del rol';
  if (tab === '14 Rols' && c === 'viewAll' && ro.id === 'board') return 'DECISIÓ PENDENT: al full Junta té viewAll=false; la matriu carregada reprodueix el valor per defecte del codi (true)';
  if (tab === '10 Pressupostos Plans' && (c === 'delegacioNom' || c === 'eventNom')) return 'nom actualitzat';
  return null;
}
// Files que la càrrega descarta a propòsit (avisos de supabase_carrega.mjs).
function descartada(tab, r) {
  if (tab === '02 Fons') {
    if (/^event_canvi/.test(r.tipus)) return !(H['03 Tancaments'] || []).some((t) => t.eventId === r.eventTancamentId);
    if (r.tipus === 'avanc' || r.tipus === 'gast_fons') return !(H['01 Moviments'] || []).some((m) => m.id === r.movimentId);
  }
  if (tab === '13 Regles CSV') return r.font === 'app';
  return false;
}
const IGNORA_CLAU = { '00 Config': ['fapppassiu', 'drive_folders', 'modulvis', 'reportvis'] };   // claus en minúscules (com k())
const norm = (v) => String(v ?? '').trim();
const igual = (x, y) => x === y || (x !== '' && y !== '' && !Number.isNaN(Number(x)) && !Number.isNaN(Number(y)) && Math.abs(Number(x) - Number(y)) < 0.005);
let errors = 0;
for (const [tab, claus] of Object.entries(CLAU)) {
  const orig = H[tab] || [];
  const nou = T[tab] || [];
  const k = (r) => claus.map((c) => norm(r[c]).toLowerCase()).join('|');
  const mNou = new Map(nou.map((r) => [k(r), r]));
  const mOrig = new Map(orig.map((r) => [k(r), r]));
  const descartades = orig.filter((r) => descartada(tab, r)).length;
  const falten = [...mOrig.entries()].filter(([x, r]) => !mNou.has(x) && !descartada(tab, r) && !(IGNORA_CLAU[tab] || []).includes(x)).map(([x]) => x);
  const sobren = [...mNou.keys()].filter((x) => !mOrig.has(x));
  const dif = new Map();
  let esperades = 0;
  for (const [key, ro] of mOrig) {
    const rn = mNou.get(key);
    if (!rn) continue;
    for (const c of Object.keys(ro)) {
      if (!(c in rn)) { (dif.get(c + ' (falta)') || dif.set(c + ' (falta)', []).get(c + ' (falta)')).push(key); continue; }
      if (igual(normalitza(tab, c, ro[c]), normalitza(tab, c, rn[c]))) continue;
      if (esperada(tab, c, ro, rn)) { esperades++; continue; }
      (dif.get(c) || dif.set(c, []).get(c)).push(`${key}: «${norm(ro[c]).slice(0, 40)}» → «${norm(rn[c]).slice(0, 40)}»`);
    }
  }
  const bo = !falten.length && !sobren.length && !dif.size;
  if (!bo) errors++;
  console.log(`${bo ? '✓' : '✗'} ${tab.padEnd(26)} full ${String(orig.length).padStart(4)} → adaptador ${String(nou.length).padStart(4)}` +
    (descartades ? ` · ${descartades} descartades a propòsit` : '') + (esperades ? ` · ${esperades} diferències esperades` : ''));
  if (falten.length) console.log(`    falten (${falten.length}): ${falten.slice(0, 6).join(', ')}`);
  if (sobren.length) console.log(`    sobren (${sobren.length}): ${sobren.slice(0, 6).join(', ')}`);
  for (const [c, l] of dif) console.log(`    ${c}: ${l.length} diferència(es), p. ex. ${l.slice(0, 3).join(' | ')}`);
}
console.log(errors ? `\n${errors} pestanya(es) amb diferències.` : '\nTot igual (menys els camps esperats).');
process.exit(errors ? 1 : 0);
