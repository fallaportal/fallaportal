# Technical Design Document — Falla Portal
## Generated: 2026-07-29 · v4.0.44

---

### System Overview

PWA de fitxer únic (`index.html` ~9.400 línies + `sw.js`), sense bundler ni framework.
Hostatjada a GitHub Pages. Google Sheets com a base de dades, OAuth 2.0 per a auth,
Drive per a justificants.

---

### Technology Stack

| Component | Tecnologia | Notes |
|---|---|---|
| Frontend | HTML/CSS/JS vanilla | Un sol fitxer |
| PWA | Service Worker (`sw.js`) | Network First. **No registrat actualment** (D-012) |
| Auth | Google OAuth 2.0 (implicit) | Scopes: `spreadsheets`, `drive`, `userinfo.email` |
| Base de dades | Google Sheets API v4 | Cada pestanya = una taula |
| Fitxers | Google Drive API v3 | Scope `drive` |
| Hosting | GitHub Pages | `https://fallaportal.github.io/fallaportal/` |
| Icones | Tabler Icons (CDN) | `ti ti-*` |

---

### Architecture

```
Browser
  ├── index.html (UI + tota la lògica)
  │     ├── DB (objecte global)
  │     ├── loadFromSheets() → swap atòmic → DB → dadesCarregades=true
  │     ├── save() → writeTab → Sheets   [propaga errors]
  │     └── _desantAraMateix (bloqueja refrescos mentre s'escriu)
  └── sw.js (caché PWA — present però no registrat)
```

**Flux principal**:
1. OAuth → `accessToken` en memòria
2. `loadFromSheets()` → `initSheets()` crea pestanyes que falten → 20 lectures →
   migració `conciliacio` → swap atòmic → `dadesCarregades = true`
3. UI es renderitza des de `DB`
4. Accions → modifiquen `DB` → `save()` → Sheets

**Refrescos**: `showPage()` dispara `bgRefresh()` (límit 1/30 s); polling cada 30 s;
refresc automàtic cada 5 min. **Tots s'esperen si `_desantAraMateix > 0`.**

---

### Data Models

#### Moviment — pestanya `01 Moviments`
`id`, `data` (DD/MM/AAAA), `tipus` (`ing`|`gast`), `via`, `areaId`, `areaNom`,
`delegacioId`, `delegacioNom`, `eventId`, `eventNom`, `concepte`, `establiment`,
`responsable`, `responsableEmail`, `import` (positiu), `notes`, `anyFiscal`,
`origenFons`, `fontImport`, `bankHash`, `origen`, `ticketUrl`, `ticketMotiu`,
`conciliacio`

#### Fons — `02 Fons`
`id`, `anyFiscal`, `tipus`, `delegId`, `delegEmail`, `import`, `data`, `nota`,
`registratPer`, `movimentId`

#### Banc — `07 Bancs` → `DB.config.bancs`
`id`, `codi`, `nom`, `tipus` (`bank`|`cash`|`tpv`), `compte`, `saldoInicial`, `saldoData`

#### Regla CSV — `13 Regles CSV`
`id`, `prioritat`, `activa`, `patro`, `areaId`, `areaNom`, `delegacioId`, `delegacioNom`

---

### APIs & Interfaces

- **Lectura**: `GET /values/{range}` via `readTab(tabName)` — **propaga els errors**
- **Append**: `POST /values/{range}:append` via `appendRow()`
- **Reescriptura**: `PUT /values/{range}` via `writeTab()` — escriu primer, neteja després
- **Helpers OBLIGATORIS**: `sheetRangeUrl()`, `sheetRange()`
- **Drive**: `POST /upload/drive/v3/files?uploadType=multipart`

---

### Key Algorithms & Logic

#### parseImport(txt) — v4.0.44
```
llevar espais i €
si hi ha més d'una coma → NaN
si hi ha una coma  → llevar tots els punts (milers), coma → punt
si no hi ha coma i hi ha més d'un punt → llevar-los tots (milers)
si no és /^-?\d+(\.\d+)?$/ → NaN
```
Un punt sol continua sent decimal per decisió d'Emilio (D-017): `1.234` → 1,234.

#### calcConciliacio(via, origen)
```
via null o 'Efectiu'                    → 'no_aplica'
origen === 'CSV'                        → 'conciliat'
via és codi d'un banc tipus 'bank'      → 'pendent'
resta                                   → 'no_aplica'
```

#### Migració conciliacio — loadFromSheets
```js
_newMoviments.forEach(function(m){
  if(!m.conciliacio)m.conciliacio=calcConciliacio(m.via,m.origen);
});
```
**[CRÍTIC] Ha d'anar DESPRÉS de carregar `DB.config.bancs`.** A v4.0.41 corria abans i
classificava malament els bancs afegits a Configuració, sense correcció possible.

#### Registre de despesa amb justificant — v4.0.44
```
push a DB
await save('moviments')        ← la despesa ja és durable
  ├─ falla → avisar, NO pujar la foto, sortir
  └─ va bé → "Despesa registrada. Pujant el justificant..."
await _driveUploadTicket()
  ├─ falla → "La despesa SÍ que està guardada, però el justificant no..."
  └─ va bé → ticketUrl → await save('moviments') → "Despesa i justificant guardats ✓"
```

#### Swap atòmic — loadFromSheets
Totes les pestanyes es llegeixen en temporals. L'assignació a `DB` es fa al final,
**fora de qualsevol condicional**, seguida de `dadesCarregades = true`.

#### genId(prefix)
`prefix + Date.now() + '_' + random`. Ex: `m1785311891715_kwq1`.

---

### Security & Constraints

- **Auth**: OAuth implicit. `accessToken` en memòria. Un 401 força re-autenticació.
- **Autorització**: per email contra `DB.config.usuaris`.
  `it.fallaportal@gmail.com` → `treasury`. `08 Usuaris` buida → el primer que entre
  rep `president`.
- **No hi ha backend propi**: tota la seguretat depén d'OAuth i dels permisos del Sheet.
- **Scope `drive`**: accés complet al Drive de l'usuari autenticat.

---

### Known Issues & Technical Debt

1. ~~**Service Worker no registrat**~~ — **resolt a v4.0.45** (D-012). Registrat amb
   ruta relativa `sw.js`. `BASE` de `sw.js` continua clavat: vegeu el punt 14.

1-bis. **`localStorage` guarda el `DB` sencer sense xifrar** (`saveCache()`,
   `index.html:1519`): moviments, imports, conceptes, emails, fons, tancaments i usuaris.
   Un moviment que ha fallat en escriure's al full **es queda al telèfon**, i pot
   aparèixer breument a l'historial entre `loadCache()` i el final de `loadFromSheets()`.
   Només s'esborra amb Tancar sessió explícit; la caducitat d'1 hora impedeix usar-lo
   però no l'esborra. Pre-existent, sense relació amb el Service Worker.

2. **Justificants orfes a Drive**: les despeses perdudes abans de v4.0.44 van deixar la
   foto pujada amb el nom de l'id del moviment. Eixos ids no són al full. Sense netejar.

3. **Sense validació semàntica d'entrada**: res impedeix conceptes sense sentit,
   imports absurds dins del rang vàlid, o duplicats a consciència.

4. **El swap substitueix `DB.moviments` sencer**: si arribara a haver-hi moviments
   locals no guardats en el moment d'una recàrrega, es perdrien. A la pràctica cobert
   per D-014 (guardar primer) i D-015 (pausar refrescos), però la fusió no està feta.

5. **`1.234` és ambigu**: risc acceptat conscientment (D-017).

6. **Fitxer de 9.400 línies**: sense pla de refactorització.

7. **Dues pestanyes numerades `08`**: `08 Regles Import` i `08 Usuaris`.

8. **`TABS.audit_log` (`18 Audit Log`) és residu** de WS-AUDIT-LOG, revertit a D-007.

9. **Pressupostos — blank durant polling**: cal re-render silenciós.

10. **Botó Refresh no visible en mòbil**.

11. **Log intern en UTC** en lloc d'hora local.

12. **Informes R5–R8** pendents.

13. **`u.arees` i `u.delegacions` sempre buides** → usar `getMyArees()`/`getMyDelegacions()`.

14. **`sw.js` té `BASE = '/fallaportal'` clavat**: si canvia el nom del repositori, la
    caché deixa de funcionar en silenci.

---

### Testing

No hi ha tests automàtics. La verificació es fa executant l'app al navegador amb el
Google Sheet simulat. La recepta (arrancar en local, simular la sessió sense OAuth,
fer anar el formulari, llegir el que s'hauria escrit) està a
`.claude/skills/verify/SKILL.md`. Servidors definits a `.claude/launch.json`.

Patró que ha funcionat aquesta sessió: **reproduir el problema primer** amb una traça
temporal, aplicar el canvi, i repetir exactament la mateixa seqüència.
