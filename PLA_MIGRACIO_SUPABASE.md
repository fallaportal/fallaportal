# Pla de migració a Supabase — Falla Portal
## Redactat: 2026-09-27 · Estat: revisat amb Emilio; decisions principals preses (§9). Comença la Fase 0.
## Decisió associada: D-021 (`DECISION_LOG.md`)

Aquest document es llig sense context previ. Cada sessió de la migració comença
llegint-lo, executa **una** fase (o part d'una) i actualitza la taula de §11.

---

## 1. Objectiu i criteris d'èxit

Passar de Google Sheets + OAuth de Google a Supabase (Postgres + Auth + Storage)
**sense perdre dades ni funcionalitats**, i amb la gestió d'accessos al servidor.

La migració està feta quan es complixen tots aquests criteris:

1. **Dades**: la validació de §6 surt neta sobre producció.
2. **Funcionalitats**: tot l'inventari de la Fase 0 passa a la versió nova, rol per rol.
3. **Accessos**: els permisos els aplica Postgres (RLS), no el JavaScript. El Google
   Sheet deixa d'estar compartit en edició amb els usuaris.
4. **Sessió**: cada usuari entra una vegada per dispositiu i la sessió dura setmanes.
5. **Hosting**: continua a GitHub Pages (`fallaportal.github.io/fallaportal`). Sense Vercel.

---

## 2. Decisions de partida

- **Supabase**: projectes nous dins del compte que Emilio ja té. N'hi haurà dos:
  `fallaportal-dev` i `fallaportal-prod`. És el primer entorn de proves real del
  projecte (D-005 continua valent per a l'app actual fins al tall).
- **Sense bundler** (D-001 es manté): `supabase-js` des de CDN amb la versió fixada.
- **Es manté el model `DB` en memòria**: la UI continua llegint de `DB` i només canvia
  la persistència. És la manera de no reescriure 9.400 línies de pantalles.
- **Congelació d'una setmana**: només per a la migració final i el tall. Tot el
  desenvolupament previ (Fases 0–6) es fa contra `dev` amb una còpia de les dades,
  mentre la falla continua fent servir l'app actual. La setmana de congelació es fixa
  quan la Fase 6 està tancada, no abans.
- **Els permisos es repliquen 1:1**: primer es reprodueix exactament el que fa l'app hui.
  Qualsevol canvi de permisos és una decisió a part, registrada al `DECISION_LOG`.
- **Format del full congelat durant la preparació**: mentre duren les Fases 0–6, no es
  canvien pestanyes ni columnes a l'app actual, perquè l'script de migració depén
  d'eixe format. Les correccions que s'hi facen s'anoten a §11.

---

## 3. Què canvia (millores estructurals incloses)

| Àmbit | Hui | Després |
|---|---|---|
| Entrada | Token de Google d'1 h; renovació amb un toc (v4.0.48) | Supabase Auth per **email amb codi de 6 xifres** (sense Google); sessió persistent amb refresh token; alta pública desactivada |
| Autorització | Rols comprovats en JS; tots els usuaris són editors del full | RLS a Postgres; el full deixa d'estar compartit |
| Escriptura | `writeTab` reescriu la pestanya sencera | insert/update/delete per fila |
| Proteccions contra truncar el full | Swap atòmic, `dadesCarregades`, `_desantAraMateix`, snapshots (D-003, D-013–D-016) | Innecessàries: desapareixen |
| Validació | Cap (només al formulari) | Restriccions: import > 0, claus foranes, `bankHash` únic, estats enumerats |
| Refresc | Polling cada 30 s + `bgRefresh` a cada canvi de pantalla | Realtime (subscripció per taula) |
| Justificants | Drive, públics per enllaç, scope `drive` complet | Storage privat amb URLs signades; sense scope de Drive |
| Auditoria | Revertida (D-007) | Triggers a `audit_log` (qui, quan, abans/després) |
| Caché local | `DB` sencer sense xifrar a `localStorage` (deute 1-bis) | S'elimina; només es guarda la sessió |
| Tipus | Dates i imports com a text | `date` i `numeric(12,2)` |
| Residus | `18 Audit Log`, dues pestanyes `08`, `index1/2/_2.html` | Fora (confirmar a §9) |

**Fora d'abast** (fases posteriors, amb decisió pròpia): dividir `index.html` en
mòduls, algorisme de WS-CONCILIACIÓ, informes R5–R8, OCR de factures.

---

## 4. Esquema proposat (esborrany; es tanca a la Fase 1)

| Pestanya actual | Taula | Notes |
|---|---|---|
| `00 Config` | `config` | clau + valor `jsonb` |
| `01 Moviments` | `moviments` | FK a `arees`, `delegacions`, `events` |
| `02 Fons` | `fons` | `moviment_id` FK opcional |
| `03 Tancaments` | `tancaments` | |
| `04 Arees` / `05 Delegacions` / `06 Events` | `arees` / `delegacions` / `events` | jerarquia amb FK |
| `07 Bancs` + `15 Saldos` | `bancs` + `saldos_inicials` | |
| `08 Regles Import` / `13 Regles CSV` | `regles_import` / `regles_csv` | la Fase 0 confirma si `08 Regles Import` encara s'usa |
| `08 Usuaris` | `usuaris` | email únic + `auth_user_id` |
| `09 Usuaris Assignacions` | `assignacions` | usuari × (àrea\|delegació) × any fiscal |
| `10`/`11`/`12` Pressupostos | `pres_plans` / `pres_config` / `pres_historial` | |
| `14 Rols` / `17 Moduls` | `rols` / `moduls_visibilitat` | |
| `16 Fapp Passiu` | `fapp_passiu` | |
| `18 Audit Log` | — | es descarta; la nova `audit_log` s'omple per triggers |

- **Es conserven els `id` actuals** (`m1785311891715_kwq1`…) com a clau primària.
  Així continuen valent els noms dels justificants i els enllaços `fons.movimentId`.
- **RLS**: funcions SQL `rol_actual()` i `delegacions_meues(any_fiscal)` (security
  definer) que lligen `usuaris` + `assignacions` + `rols`. Les polítiques repliquen
  `perm()`, `getMyArees()` i `getMyDelegacions()`. Un email que no és a `usuaris`
  (`noauth`) no veu cap fila. `board` només pot llegir.

---

## 5. Fases

Cada fase indica el model i l'esforç recomanats (vegeu §8).

### Fase 0 — Auditoria completa i inventari *(app en ús, sense congelar)*
- **Inventari funcional**: cada pantalla, acció i camí d'escriptura (els 66 punts
  de crida a `save()`), per rol. Es desa a `INVENTARI_FUNCIONAL.md` i és la llista
  de proves d'acceptació de la Fase 6.
- **Perfil de les dades reals**: Emilio descarrega el full com a `.xlsx` a la carpeta
  local (fora del repo, via `.gitignore`). Un script local detecta tipus reals, camps
  buits, `id` duplicats, fons orfes, dates mal formades i imports no numèrics.
- **Informe d'anomalies**: què es corregeix durant la migració i què es descarta.
- **Proteccions implícites**: comportaments que protegeixen les dades sense estar
  documentats. Exemple: l'expulsió per error de xarxa de la v4.0.9 evitava truncar el
  full (D-020, "Revisió"). Per a cadascuna es decideix si Supabase la fa innecessària
  o si cal replicar-la.
- **Model**: Opus 5.5 · **high**. Agents Explore per als inventaris de codi.
- **Sessions**: 1–2. **Sortida**: inventari i informe revisats per Emilio.

### Fase 1 — Esquema i seguretat
- SQL versionat a `supabase/migrations/` (al repo, sense claus).
- Taules, restriccions, funcions de permisos, polítiques RLS i triggers d'auditoria.
- **Tests de RLS**: per a cada rol, consultes que han de passar i consultes que han de
  fallar, executables contra `dev`.
- **Model**: Opus 5.5 · **xhigh**. Revisió final de les polítiques: Opus 5.5 · **max**.
- **Sessions**: 1–2. **Sortida**: tests de RLS en verd a `dev`.

### Fase 2 — Entorn dev i autenticació per email
Decisió d'Emilio (2026-09-27): **entrada per email, sense Google**.
- **Mètode**: codi de 6 xifres (OTP) que l'usuari escriu a l'app. **No enllaç màgic**:
  a iOS, l'enllaç del correu s'obri a Safari i no dins de la PWA instal·lada, i la
  sessió quedaria fora de l'app.
- **Només membres**:
  - Alta pública desactivada a Supabase.
  - Els usuaris es donen d'alta des de la llista `usuaris`, amb el rol assignat
    (`canUsers`).
  - Un email que no hi és no rep cap codi.
- **Emilio**:
  - Crea `dev` i `prod` en una regió de la UE. `prod` en pla de pagament; `dev` pot ser
    gratuït.
  - Configura un **SMTP propi** (p. ex. un proveïdor d'enviament transaccional, o el
    compte de la falla). El correu per defecte de Supabase és només per a proves i té
    límits d'enviament molt baixos.
  - Revisa la plantilla del correu del codi, en valencià.
- **Claude**: pantalla d'entrada (email → codi), sessió persistent, pantalla `noauth`,
  tancar sessió. Es lleva tot el codi de Google Identity (GIS, One Tap, `tokenClient`,
  D-020).
- **Conseqüències**:
  - Desapareixen el client OAuth de Google, el mode "Testing", el scope `drive` i la
    caducitat cada 7 dies.
  - Per primera vegada es podrà provar el login real en local.
- **Model**: Sonnet 5 · **high**. **Sessions**: 1.

### Fase 3 — Capa de dades
- `loadFromSheets()` → càrrega des de Supabase per any fiscal.
- `save(key)` / `writeTab` / `appendRow` → operacions per fila als 66 punts de crida,
  agrupats per entitat.
- Es lleven: swap atòmic, `_desantAraMateix`, snapshots, polling (→ Realtime) i la
  caché de `DB` a `localStorage`.
- **Model**:
  - Sonnet 5 · **high** per al gruix mecànic.
  - Opus 5.5 · **high** per a les parts delicades: fons ↔ moviments, tancaments,
    importació CSV amb `bankHash` i bloqueig de pressupostos.
- **Sessions**: 2–3. **Sortida**: totes les entrades de l'inventari que escriuen dades
  funcionen a `dev`.

### Fase 4 — Justificants a Storage
- Bucket privat `justificants/{anyFiscal}/{movId}.{ext}`, polítiques per rol, URL
  signada en obrir el justificant.
- **Justificants antics: es migren a Storage** (decisió d'Emilio, 2026-09-27):
  - Script local que llig `ticketUrl` de cada moviment, baixa el fitxer de Drive amb el
    token d'Emilio i el puja a `justificants/{anyFiscal}/{movId}.{ext}`.
  - Actualitza la referència del moviment.
  - Informe final: pujats, no trobats i orfes a Drive sense moviment (deute tècnic #2).
    Els orfes no es pugen: es llisten perquè Emilio decidisca.
  - Quan tot està verificat, es retira l'accés "qualsevol amb l'enllaç" dels fitxers de
    Drive. **No s'esborren**: queden com a còpia.
- **Model**: Sonnet 5 · **high** (per l'script de migració de fitxers). **Sessions**: 1–2.

### Fase 5 — Script de migració i assajos
- Script local que llig l'export `.xlsx`, transforma les dades (dates, imports,
  correccions de la Fase 0) i les carrega amb la clau `service_role` des d'un `.env`
  local. **La clau `service_role` mai va al repo, que és públic.**
- Idempotent: es pot repetir sobre una base buida tantes vegades com calga.
- Inclou l'**export invers** (Supabase → `.xlsx` amb el format de pestanyes actual)
  per a la marxa arrere de §7.
- Assajos complets sobre `dev` fins que la validació de §6 surt neta dues vegades seguides.
- **Model**: Opus 5.5 · **high**. **Sessions**: 1.

### Fase 6 — Proves d'acceptació
- Inventari sencer, rol per rol, a `dev` amb les dades migrades i usuaris de prova per rol.
- Comparació d'informes amb les mateixes dades: Estat de Resultats, Flux d'Efectiu i
  saldo de fons per delegat, app vella vs nova. **Les xifres han de ser idèntiques.**
- Revisió de codi: `/code-review high`, o `/code-review ultra` si la vols multiagent
  (la llances tu i es factura a part).
- **Model**: Sonnet 5 · **high** per recórrer l'inventari al navegador. Opus 5.5 · **high**
  per a cada discrepància.
- **Sessions**: 1–2. **Sortida**: cap discrepància oberta. Només llavors es fixa la
  setmana de congelació.

### Fase 7 — Setmana de congelació i tall
1. Una setmana abans: avís als usuaris.
2. Dia 0:
   - El full passa a només lectura (compartició com a lector).
   - Export final `.xlsx`.
   - `git tag pre-supabase`.
3. Migració a `prod` i validació de §6.
4. Publicació de la versió nova a GitHub Pages. Emilio prova amb comptes reals de cada rol.
5. La resta de la setmana és marge per a sorpreses. Es pot obrir abans si tot és verd.
- **Model**: Opus 5.5 · **high** el dia del tall. **Sessions**: 1–2.

### Fase 8 — Estabilització
- Primeres dues setmanes: correccions amb Sonnet 5 · **medium**.
- Reescriure el `TDD_FALLA_PORTAL.md` i actualitzar el continuity set: Sonnet 5 · **low**
  (o Haiku 4.5 · **low** per a actualitzacions curtes).

---

## 6. Validació "sense perdre dades"

Totes aquestes comprovacions s'automatitzen dins de l'script de la Fase 5:

1. Files per taula = files no buides per pestanya, menys les descartades a l'informe
   d'anomalies.
2. Suma d'imports per any fiscal × tipus × àrea × via, idèntica al cèntim.
3. Saldo de fons per delegat i any fiscal, idèntic.
4. Tots els `id` del full existeixen a Supabase. Cap clau forana trencada que no estiga
   documentada.
5. Vint files aleatòries comparades camp a camp.
6. Informes de l'app idèntics (Fase 6).

---

## 7. Marxa arrere

- **Abans d'obrir als usuaris**: tornar al tag `pre-supabase` i reobrir el full en
  edició. No s'ha perdut res, perquè el full no s'ha tocat.
- **Després d'obrir**: l'export invers de la Fase 5 regenera el `.xlsx` amb el format
  actual, i es pot tornar al full.
- El full antic es conserva en només lectura com a arxiu.

---

## 8. Models i esforç

| Fase | Model | Esforç |
|---|---|---|
| 0 Auditoria i inventari | Opus 5.5 | high |
| 1 Esquema i RLS | Opus 5.5 | xhigh (revisió final: max) |
| 2 Auth i entorn dev | Sonnet 5 | high |
| 3 Capa de dades | Sonnet 5 / Opus 5.5 per a les parts delicades | high |
| 4 Storage i migració de justificants | Sonnet 5 | high |
| 5 Script de migració | Opus 5.5 | high |
| 6 Acceptació | Sonnet 5 / Opus 5.5 per a discrepàncies | high |
| 7 Tall | Opus 5.5 | high |
| 8 Estabilització | Sonnet 5 (Haiku 4.5 per a documentació curta) | medium / low |

- **Opus 5.5**: disseny, seguretat, integritat de dades i dies crítics.
- **Sonnet 5**: implementació i proves al navegador.
- **Haiku 4.5**: documentació i tasques repetitives, no tocar dades.
- **Nivells d'esforç**: low · medium · high · xhigh · max. No hi ha cap nivell
  "ultracode". El més profund per revisar codi és `/code-review ultra`.
- **Com es canvia**: al selector de model de l'app, o demanant-ho a Claude a l'inici
  de la sessió.

---

## 9. Decisions d'Emilio

**Preses el 2026-09-27:**
1. **Ningú treballa directament al Google Sheet**: només l'app. No cal cap export
   permanent; el full queda com a arxiu de només lectura.
2. **Supabase de pagament per a `prod`**; `dev` pot ser gratuït.
3. **Justificants antics: es migren a Storage** (Fase 4).
4. **Entrada per email, sense Google**: codi de 6 xifres (Fase 2).

**Pendents** (s'assumix el valor recomanat si no es diu res):
5. Regió: UE.
6. Permisos: replicar exactament els actuals.
7. `index1.html`, `index2.html`, `index_2.html` i `dev.html`: es poden esborrar?
   **No s'esborren sense confirmació explícita.**
8. SMTP: quin proveïdor o compte envia els codis (necessari per a la Fase 2).

---

## 10. Calendari orientatiu

De 9 a 15 sessions en total:

| Fase | Sessions |
|---|---|
| F0 Auditoria i inventari | 1–2 |
| F1 Esquema i RLS | 1–2 |
| F2 Auth i entorn dev | 1 |
| F3 Capa de dades | 2–3 |
| F4 Storage i justificants antics | 1–2 |
| F5 Script de migració | 1 |
| F6 Acceptació | 1–2 |
| F7 Tall | 1–2 |

Amb una sessió al dia a partir del 2026-09-28, la preparació (F0–F6) ocupa unes dues
setmanes i després ve la setmana de congelació.

---

## 11. Seguiment

| Fase | Estat | Data | Notes |
|---|---|---|---|
| 0 | Pendent | | Comença el 2026-09-28 |
| 1 | Pendent | | |
| 2 | Pendent | | |
| 3 | Pendent | | |
| 4 | Pendent | | |
| 5 | Pendent | | |
| 6 | Pendent | | |
| 7 | Pendent | | |
| 8 | Pendent | | |
