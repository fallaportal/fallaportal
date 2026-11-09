# CLAUDE.md — Falla Portal (Operating Manual)

Esta és l'app de gestió d'una falla (portal.fallaportal.com equivalent local: repo
GitHub `fallaportal/fallaportal`). Aquest fitxer és la configuració autoritativa de
com operes (Claude) en aquest projecte. **A l'inici de cada sessió, llig aquest
fitxer i el continuity set (§2) sencer** abans de tocar res.

---

## 1. Context del projecte

- **Arquitectura**: un sol `index.html` (~9.400 línies) + `sw.js`. Sense bundler,
  framework ni backend propi (D-001, `DECISION_LOG.md`).
- **Dades**: Supabase (Postgres amb RLS, Storage per als justificants) des del tall
  del 9/11/2026 (D-021, D-056). El full de Google és només un arxiu en només lectura
  (D-002 superat). L'app desa per diferències amb `public.guarda_canvis`.
- **Auth**: Supabase Auth, entrada amb correu i codi de 6 xifres (D-046); només els
  membres de `usuaris` poden entrar. Per a provar la UI vore
  `.claude/skills/verify/SKILL.md` (simulació del client de Supabase o pont amb RLS real).
- **Desplegament**: GitHub Pages des de la branca `main` del repo
  `fallaportal/fallaportal`, al domini `app.fallaportal.es`. Un `push` a `main` és el
  que es publica — no hi ha entorn intermedi ni CI que ho filtre. Després del tall no
  hi ha projecte de Supabase de proves: els canvis d'esquema es proven en local (PGlite)
  i només després s'apliquen al projecte (`supabase_migra.mjs aplica`).
- **Dades sensibles fora del repo**: extractes bancaris i fulls de moviments
  (`Moviments_compte_*.xlsx/.xls`, `movimientos.xlsx`, `Book1/2.xlsx`, `eventos
  entradas portal*.csv`) viuen només en local, mai es commitegen (vore
  `.gitignore`).

## 2. Continuity set — documents de treball

| Fitxer | Conté |
|---|---|
| `DOMAIN_KNOWLEDGE.md` | Fets del domini, entitats, relacions, referències externes. |
| `DECISION_LOG.md` | Decisions amb la seua raó (format D-NNN), mai s'esborren, es marquen superseded. |
| `WORKSTREAM_STATUS.md` | Estat dels fluxos de treball actius, completats, parking lot. |
| `CONVENTIONS.md` | Preferències de comunicació, convencions tècniques, anti-patrons. |
| `FDD_FALLA_PORTAL.md` | Disseny funcional. |
| `TDD_FALLA_PORTAL.md` | Disseny tècnic. |
| `PLA_MIGRACIO_SUPABASE.md` | Pla de migració a Supabase (WS-SUPABASE, D-021): fases, model i esforç, seguiment. |
| `INVENTARI_FUNCIONAL.md` | Inventari de funcionalitats, rols i camins d'escriptura (Fase 0); llista d'acceptació de la Fase 6. |
| `MODEL_DADES.md` | Model de dades proposat per a Supabase (taules, claus, vistes, correspondència amb el full). |
| `INFORME_ANOMALIES_F0.md` | Anomalies i proteccions implícites trobades a la Fase 0, amb tractament i decisions pendents. |
| `PLA_PREVISIO_TRESORERIA.md` | Pla de previsió de tresoreria i capacitat de despesa (WS-PREVISIO, després del tall): fases, fórmules, model i seguiment. |

Mai crear duplicats paral·lels (com `index1.html`, `index2.html` — ja n'hi ha i cal
evitar que se'n generen més sense necessitat). Les actualitzacions són
**incrementals i autocontingudes**: cada document ha de llegir-se sense context
previ; substitueix fets superats pel seu valor actual; mai escriure "vore versió
anterior".

## 3. Verificació

No hi ha suite de tests. Qualsevol canvi que afecte la UI o el flux de dades s'ha
de provar executant l'app real al navegador (servidor `falla-static`,
`.claude/launch.json`, port 8899) seguint la simulació del client de Supabase o el pont amb RLS real
documentats a `.claude/skills/verify/SKILL.md` (el bypass d'OAuth només val per a l'etiqueta `pre-supabase`). No es dona per tancada una tasca només perquè el
fitxer "es veu bé".

L'esquema de Supabase (`supabase/`, migració D-021) es prova amb `node tools/supabase_tests.mjs` (PGlite en local;
`--remot` contra el projecte de Supabase) i s'aplica amb `node tools/supabase_migra.mjs aplica`. Primera vegada:
`cd tools && npm install`. La connexió necessita `tools/.env` i `tools/prod-ca-2021.crt`, que només són a l'ordinador
d'Emilio (fora del repo).

## 4. Sincronització git — inici i tancament de sessió

**A l'INICI de qualsevol sessió (local o web):** fes `git pull` abans de tocar res.
Pot haver treballat l'altra sessió des del tancament anterior — el continuity set
(§2) i el codi que tens al disc poden estar desfasats respecte a `origin/main`
sense que ho sàpies fins que ho compares.

**Al TANCAMENT:** el protocol de tancament (actualitzar §2, i FDD/TDD només si ha
canviat un artefacte dissenyat) **no acaba en "commit fet"** — acaba en `git push`
confirmat. Un tancament que es queda en el commit local deixa la propera sessió
(local o web) llegint un `origin/main` desactualitzat, i com el continuity set es
reescriu sencer a cada tancament (no per línies), la primera divergència real
produeix un conflicte de fitxer complet, no una fusió trivial de git. Per això:

**Branques (després del tall, D-056)**: `main` és producció (ja porta Supabase) i la branca `supabase` queda com a
còpia al mateix punt del tall; el treball nou va a `main`. Un `push` a `main` publica: comprova'l abans de fer-lo.
L'etiqueta `pre-supabase` és la versió amb Google Sheets (marxa arrere).

1. `git add` + `git commit` dels documents actualitzats i el codi.
2. `git push`.
3. Verificar amb `git log origin/main -1` que el remot coincideix amb el HEAD
   local. Si no coincideix, la sessió **no** es dona per tancada.
