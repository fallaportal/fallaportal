# CLAUDE.md — Falla Portal (Operating Manual)

Esta és l'app de gestió d'una falla (portal.fallaportal.com equivalent local: repo
GitHub `fallaportal/fallaportal`). Aquest fitxer és la configuració autoritativa de
com operes (Claude) en aquest projecte. **A l'inici de cada sessió, llig aquest
fitxer i el continuity set (§2) sencer** abans de tocar res.

---

## 1. Context del projecte

- **Arquitectura**: un sol `index.html` (~9.400 línies) + `sw.js`. Sense bundler,
  framework ni backend propi (D-001, `DECISION_LOG.md`).
- **Dades**: Google Sheets com a única base de dades via Sheets API v4 (D-002).
  `writeTab` reescriu pestanyes senceres — no hi ha escriptura incremental.
- **Auth**: Google OAuth. No funciona en `localhost` (client OAuth de producció no
  l'autoritza) — vore `.claude/skills/verify/SKILL.md` pel procediment exacte per
  simular sessió i provar la UI real.
- **Desplegament**: GitHub Pages des de la branca `main` del repo
  `fallaportal/fallaportal`. Un `push` a `main` és el que es publica — no hi ha
  entorn intermedi ni CI que ho filtre.
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

Mai crear duplicats paral·lels (com `index1.html`, `index2.html` — ja n'hi ha i cal
evitar que se'n generen més sense necessitat). Les actualitzacions són
**incrementals i autocontingudes**: cada document ha de llegir-se sense context
previ; substitueix fets superats pel seu valor actual; mai escriure "vore versió
anterior".

## 3. Verificació

No hi ha suite de tests. Qualsevol canvi que afecte la UI o el flux de dades s'ha
de provar executant l'app real al navegador (servidor `falla-static`,
`.claude/launch.json`, port 8899) seguint el bypass d'OAuth documentat a
`.claude/skills/verify/SKILL.md`. No es dona per tancada una tasca només perquè el
fitxer "es veu bé".

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

1. `git add` + `git commit` dels documents actualitzats i el codi.
2. `git push`.
3. Verificar amb `git log origin/main -1` que el remot coincideix amb el HEAD
   local. Si no coincideix, la sessió **no** es dona per tancada.
