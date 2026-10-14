# Pla de migració a Supabase — Falla Portal
## Redactat: 2026-09-27 · Actualitzat: 2026-10-14 · Estat: Fase 0 feta; Fase 1 en curs (vegeu §11).
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
5. **Hosting**: continua a GitHub Pages, amb el domini propi **`app.fallaportal.es`** des del dia del tall (D-042). Sense Vercel.

---

## 2. Decisions de partida

- **Supabase: un sol projecte, `fallaportal`** (D-043), a l'organització Pro que Emilio ja té (AI4ALL, uns 10 $/mes),
  regió UE:
  - **Fins al tall fa de proves**: la falla continua amb el full i a Supabase només hi ha dades de prova i còpies.
  - **El dia del tall es buida** (esquema, usuaris d'Auth i fitxers de prova), s'hi tornen a aplicar les migracions i
    s'hi carreguen les dades reals: passa a ser el definitiu.
  - **Després del tall no hi ha entorn de proves** (com D-005 avui): els canvis d'esquema es proven en local amb PGlite
    i s'apliquen amb còpia prèvia; la xarxa són les còpies diàries del pla Pro (7 dies) i el registre d'activitat.
- **Sense bundler** (D-001 es manté): `supabase-js` des de CDN amb la versió fixada.
- **Es manté el model `DB` en memòria**: la UI continua llegint de `DB` i només canvia
  la persistència. És la manera de no reescriure 9.400 línies de pantalles.
- **Congelació d'una setmana**: només per a la migració final i el tall. Tot el
  desenvolupament previ (Fases 0–6) es fa contra el projecte de Supabase amb una còpia de les dades,
  mentre la falla continua fent servir l'app actual. La setmana de congelació es fixa
  quan la Fase 6 està tancada, no abans.
- **Els permisos es repliquen 1:1**: primer es reprodueix exactament el que fa l'app hui.
  Qualsevol canvi de permisos és una decisió a part, registrada al `DECISION_LOG`.
- **Millorar el model, replicar el comportament (D-025)**: la migració pot netejar l'esquema (tipus, FK, ids,
  saldos, caixes d'event, paperera, registre d'activitat) però no canvia xifres, permisos ni fórmules. Els canvis
  de comportament són decisions a part, després del tall. Els errors evidents (A-09, A-24, A-13) es poden
  corregir abans a l'app actual.
- **Format del full congelat durant la preparació**: mentre duren les Fases 0–6, no es
  canvien pestanyes ni columnes a l'app actual, perquè l'script de migració depén
  d'eixe format. Les correccions que s'hi facen s'anoten a §11.

---

## 3. Què canvia (millores estructurals incloses)

| Àmbit | Hui | Després |
|---|---|---|
| Entrada | Token de Google d'1 h; renovació amb un toc (v4.0.48) | Supabase Auth per **email amb codi de 6 xifres** (sense Google); sessió persistent amb refresh token; alta pública activada però limitada als membres per un hook (D-046) |
| Autorització | Rols comprovats en JS; tots els usuaris són editors del full | RLS a Postgres; el full deixa d'estar compartit |
| Escriptura | `writeTab` reescriu la pestanya sencera | insert/update/delete per fila |
| Proteccions contra truncar el full | Swap atòmic, `dadesCarregades`, `_desantAraMateix`, snapshots (D-003, D-013–D-016) | Innecessàries: desapareixen |
| Validació | Cap (només al formulari) | Restriccions: import > 0, claus foranes, estats enumerats, exercicis sense solapament; `bankHash` (ara `empremta`) indexat però **no** únic (A-04: hi ha duplicats legítims) |
| Refresc | Polling cada 30 s + `bgRefresh` a cada canvi de pantalla | Realtime (subscripció per taula) |
| Justificants | Drive, públics per enllaç, scope `drive` complet | Storage privat amb URLs signades; sense scope de Drive |
| Auditoria | Revertida (D-007) | Triggers a `audit_log` (qui, quan, abans/després) |
| Caché local | `DB` sencer sense xifrar a `localStorage` (deute 1-bis) | S'elimina; només es guarda la sessió |
| Tipus | Dates i imports com a text | `date` i `numeric(12,2)` |
| Residus | `18 Audit Log`, dues pestanyes `08`, `index1/2/_2.html` | Fora (confirmar a §9) |

**Fora d'abast** (fases posteriors, amb decisió pròpia): dividir `index.html` en
mòduls, algorisme de WS-CONCILIACIÓ, informes R5–R8, OCR de factures.

---

## 4. Esquema

El model de dades és a **`MODEL_DADES.md`** (2026-10-13). Substitueix l'esborrany anterior, que copiava una taula per
pestanya i en traslladava els defectes. Resum: comptes en lloc de `via` de text, `operacions` que agrupen el que crea
cada acció, caixes d'event i els seus canvis fora de `fons`, justificants en taula pròpia, bloqueig de pressupost per
exercici, permisos de mòduls i reports en taules, `audit_log` (D-024), vistes per als càlculs i una vista amb la forma
antiga dels moviments per a la UI. Es conserven els `id` actuals. Les decisions obertes són al seu §8.

- **RLS** (detall a `MODEL_DADES.md` §9): qualsevol membre llig totes les files, com avui (D-035); l'escriptura la
  decideix una matriu rol × mòdul (lectura/edició, abast `tot` o `directiva`) amb diversos rols per persona (D-036),
  carregada amb els permisos d'avui. Funcions `app.pot_editar()`, `app.dins_abast()`, `app.delegacions_meues()`…
  (security definer) que lligen `usuaris`, `usuari_rols`, `rol_moduls` i `directiva`. Un email que no és a `usuaris`
  (`noauth`) no veu cap fila. `board` serà de només lectura (D-038), però després del tall: fins aleshores
  reprodueix l'app actual (tanca caixes, edita pressupost i adjunta justificants).

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
- **Registre d'activitat (requisit d'Emilio, 2026-10-13, D-024)**: `audit_log` omplit per triggers a
  totes les taules de dades (insert/update/delete) amb usuari (`auth.uid` + email), data i hora, taula,
  id de la fila i valors abans/després (`jsonb`). Ningú pot modificar-lo ni esborrar-lo. Pantalla
  "Registre d'activitat" per a `president`\|`treasury` amb filtres, i recuperació del que s'ha esborrat.
- **Entrades de la Fase 0** (vegeu `INFORME_ANOMALIES_F0.md`): `bankHash` no pot ser únic (A-04); taula
  de caixes d'event amb `event_id` nullable (A-05); bloqueig de pressupost per any (A-11); `saldos`
  amb FK correcta (A-03); data real i `numeric` (A-09, A-10).
- **Tests de RLS**: per a cada rol, consultes que han de passar i consultes que han de
  fallar, executables contra el projecte de Supabase.
- **Model**: Opus 5.5 · **xhigh**. Revisió final de les polítiques: Opus 5.5 · **max**.
- **Sessions**: 1–2. **Sortida**: tests de RLS en verd al projecte de Supabase.

### Fase 2 — Entorn dev i autenticació per email
Decisió d'Emilio (2026-09-27): **entrada per email, sense Google**.
- **Mètode**: codi de 6 xifres (OTP) que l'usuari escriu a l'app. **No enllaç màgic**:
  a iOS, l'enllaç del correu s'obri a Safari i no dins de la PWA instal·lada, i la
  sessió quedaria fora de l'app.
- **Només membres**:
  - Alta pública activada a Supabase, amb el hook "Before User Created" (D-046) que només deixa crear l'usuari d'Auth
    als membres: persona activa de `usuaris` amb almenys un rol. Sense codi de servidor.
  - Els usuaris es donen d'alta des de la llista `usuaris`, amb el rol assignat
    (`canUsers`); l'usuari d'Auth es crea sol la primera vegada que entren.
  - Un email que no hi és no rep cap codi.
  - **Branca `supabase`** (D-046): tot el desenvolupament de les Fases 2–6 va a esta branca; `main` continua amb Google i
    el full fins al tall.
- **Emilio**:
  - El projecte `fallaportal` ja existeix (D-043).
  - **SMTP: Resend** (D-045), al compte de Resend que Emilio ja té (Pro). Domini d'enviament `mail.fallaportal.es`
    (regió Ireland, eu-west-1; sense seguiment de clics ni d'obertures; recepció desactivada), remitent
    `no-response@mail.fallaportal.es`. Registres DNS a donDominio: TXT `resend._domainkey.mail` (DKIM), CNAME `rsend.mail`
    i `send.mail` (SPF) i TXT `_dmarc` (`v=DMARC1; p=none;`, un de sol al domini). Clau d'API pròpia de la falla (només
    "Sending access", limitada a eixe domini), que només va al gestor de contrasenyes d'Emilio i a Authentication →
    Emails → SMTP Settings de Supabase (host `smtp.resend.com`, port 465, usuari `resend`). El correu per defecte de
    Supabase és només per a proves i té límits d'enviament molt baixos.
  - A Supabase Auth, l'adreça de l'app (Site URL) és la de proves fins al tall i `https://app.fallaportal.es` des del
    tall (D-042).
  - Activa l'alta pública i registra el hook (Authentication → Hooks → "Before User Created" → Postgres function →
    `app.hook_alta_usuari`); dona la clau pública (publishable/anon) del projecte.
  - Revisa la plantilla del correu del codi, en valencià.
- **Auth de Supabase** (MODEL_DADES §9.7): "Allow new users to sign up" activat amb el hook, "Confirm email" i "Secure email
  change" activats, cap altre proveïdor. La identitat de les polítiques és l'email del JWT.
- **Claude**: pantalla d'entrada (email → codi), sessió persistent, pantalla `noauth`,
  tancar sessió. Es lleva tot el codi de Google Identity (GIS, One Tap, `tokenClient`,
  D-020).
- **Conseqüències**:
  - Desapareixen el client OAuth de Google, el mode "Testing", el scope `drive` i la
    caducitat cada 7 dies.
  - Per primera vegada es podrà provar el login real en local.
- **Model**: Sonnet 5.5 · **high**. **Sessions**: 1.

### Fase 3 — Capa de dades
- `loadFromSheets()` → càrrega des de Supabase per any fiscal.
- `save(key)` / `writeTab` / `appendRow` → operacions per fila als 66 punts de crida,
  agrupats per entitat.
- Es lleven: swap atòmic, `_desantAraMateix`, snapshots, polling (→ Realtime) i la
  caché de `DB` a `localStorage`.
- **Paginar totes les lectures**: l'API de Supabase torna com a màxim 1.000 files per consulta; sense paginar, les
  xifres eixirien curtes sense avís (MODEL_DADES §9.7).
- **Model**:
  - Sonnet 5.5 · **high** per al gruix mecànic.
  - Opus 5.5 · **high** per a les parts delicades: fons ↔ moviments, tancaments,
    importació CSV amb `bankHash` i bloqueig de pressupostos.
- **Sessions**: 2–3. **Sortida**: totes les entrades de l'inventari que escriuen dades
  funcionen al projecte de Supabase.

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
- **Model**: Sonnet 5.5 · **high** (per l'script de migració de fitxers). **Sessions**: 1–2.

### Fase 5 — Script de migració i assajos
- Script local que llig l'export `.xlsx`, transforma les dades (dates, imports,
  correccions de la Fase 0) i les carrega amb la clau `service_role` des d'un `.env`
  local. **La clau `service_role` mai va al repo, que és públic.**
- Idempotent: es pot repetir sobre una base buida tantes vegades com calga.
- Inclou l'**export invers** (Supabase → `.xlsx` amb el format de pestanyes actual)
  per a la marxa arrere de §7.
- Assajos complets sobre el projecte de Supabase fins que la validació de §6 surt neta dues vegades seguides.
- Inclou el **buidatge** del projecte que es farà el dia del tall: esquema, usuaris d'Auth i fitxers de Storage de
  prova (D-043). S'assaja també.
- **Model**: Opus 5.5 · **high**. **Sessions**: 1.

### Fase 6 — Proves d'acceptació
- Inventari sencer, rol per rol, al projecte de Supabase amb les dades migrades i usuaris de prova per rol.
- Comparació d'informes amb les mateixes dades: Estat de Resultats, Flux d'Efectiu i
  saldo de fons per delegat, app vella vs nova. **Les xifres han de ser idèntiques.**
- Revisió de codi: `/code-review high`, o `/code-review ultra` si la vols multiagent
  (la llances tu i es factura a part).
- **Model**: Sonnet 5.5 · **high** per recórrer l'inventari al navegador. Opus 5.5 · **high**
  per a cada discrepància.
- **Sessions**: 1–2. **Sortida**: cap discrepància oberta. Només llavors es fixa la
  setmana de congelació.

### Fase 7 — Setmana de congelació i tall
1. Una setmana abans:
   - Avís als usuaris.
   - Comprovar que la configuració del projecte és la de `MODEL_DADES.md` §9.6 i preparar l'SMTP definitiu i
     l'adreça de l'app (D-042).
2. Dia 0:
   - El full passa a només lectura (compartició com a lector).
   - Export final `.xlsx`.
   - `git tag pre-supabase`.
3. Buidatge del projecte (dades, usuaris d'Auth i fitxers de prova; D-043), migracions des de zero, tests
   (`--remot`), càrrega de les dades reals i validació de §6.
4. Publicació de la versió nova a GitHub Pages **a `app.fallaportal.es`** (D-042), en el mateix desplegament:
   - DNS: `CNAME app → fallaportal.github.io`; a GitHub, Settings → Pages → Custom domain `app.fallaportal.es` i
     "Enforce HTTPS" (el certificat el posa GitHub; pot tardar una estona).
   - `sw.js` (`BASE`) i `manifest.json` (`start_url`, `scope`) passen de `/fallaportal/` a l'arrel `/` (deute #14):
     si no, la instal·lació i la caché fallen en silenci.
   - **Logo del correu del codi**: no canvia amb el tall. La plantilla carrega `logo-mail.png` de
     `raw.githubusercontent.com/fallaportal/fallaportal/main/` (repositori públic).
   - L'adreça antiga `fallaportal.github.io/fallaportal` redirigeix sola al domini nou [Probable: comportament de
     GitHub Pages; comprovar-ho]. Cada usuari torna a instal·lar l'app al mòbil una vegada, la mateixa que ja ha
     d'entrar amb el correu nou.
   - Emilio prova amb comptes reals de cada rol.
5. La resta de la setmana és marge per a sorpreses. Es pot obrir abans si tot és verd.
- **Model**: Opus 5.5 · **high** el dia del tall. **Sessions**: 1–2.

### Fase 8 — Estabilització
- Primeres dues setmanes: correccions amb Sonnet 5.5 · **medium**.
- Reescriure el `TDD_FALLA_PORTAL.md` i actualitzar el continuity set: Sonnet 5.5 · **low**
  (o Haiku 5.5 · **low** per a actualitzacions curtes).

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
| 2 Auth i entorn dev | Sonnet 5.5 | high |
| 3 Capa de dades | Sonnet 5.5 / Opus 5.5 per a les parts delicades | high |
| 4 Storage i migració de justificants | Sonnet 5.5 | high |
| 5 Script de migració | Opus 5.5 | high |
| 6 Acceptació | Sonnet 5.5 / Opus 5.5 per a discrepàncies | high |
| 7 Tall | Opus 5.5 | high |
| 8 Estabilització | Sonnet 5.5 (Haiku 5.5 per a documentació curta) | medium / low |

- **Opus 5.5**: disseny, seguretat, integritat de dades i dies crítics.
- **Sonnet 5.5**: implementació i proves al navegador.
- **Haiku 5.5**: documentació i tasques repetitives, no tocar dades.
- **Nivells d'esforç**: low · medium · high · xhigh · max. No hi ha cap nivell
  "ultracode". El més profund per revisar codi és `/code-review ultra`.
- **Com es canvia**: al selector de model de l'app, o demanant-ho a Claude a l'inici
  de la sessió.

---

## 9. Decisions d'Emilio

**Preses el 2026-09-27:**
1. **Ningú treballa directament al Google Sheet**: només l'app. No cal cap export
   permanent; el full queda com a arxiu de només lectura.
2. **Supabase de pagament**: un sol projecte, de proves fins al tall i definitiu després (D-043).
3. **Justificants antics: es migren a Storage** (Fase 4).
4. **Entrada per email, sense Google**: codi de 6 xifres (Fase 2).

**Pendents** (s'assumix el valor recomanat si no es diu res):
5. Regió: UE.
6. Permisos: replicar exactament els actuals.
7. ~~`dev.html`~~: **esborrat del repositori el 2026-10-13** (Emilio): era la v3.0.15 publicada a GitHub Pages i escrivia
   al full real amb codi anterior a les correccions de pèrdua de dades. `index1.html`, `index2.html` i `index_2.html` només
   són a l'ordinador d'Emilio (ignorats per git); els pot esborrar ell.
8. ~~SMTP~~: **Resend**, amb el domini `mail.fallaportal.es` (D-045, 2026-10-14). Falta que Emilio verifique el DNS.

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
| 0 | **Fet** | 2026-10-13 | `INVENTARI_FUNCIONAL.md`, `INFORME_ANOMALIES_F0.md` (codi + perfil de les dades reals), `MODEL_DADES.md` (decisions D-026–D-033) i `tools/f0_perfil_dades.py`. Correccions prèvies a l'app actual: v4.0.67–v4.0.78. Oberts sense bloquejar: A-31 (tancaments antics amb pagaments) i caixa vs vendes de falles.app. Tancada per Emilio el 2026-10-13. |
| 1 | **Fet** | 2026-10-14 | SQL a `supabase/migrations/` (5 fitxers: taules, mòduls i rols, permisos, triggers i revisió de seguretat), aplicat al projecte `fallaportal` (PostgreSQL 17.11, eu-west-1) amb `tools/supabase_migra.mjs`. **178 tests de RLS en verd en local i a Supabase**, amb resultats i missatges idèntics (D-037). Revisió final amb Opus 5.5 · max: 11 grups de troballes corregides sense tocar la matriu (D-044, `MODEL_DADES.md` §9.7). Decisions D-035, D-036, D-038–D-044. Les vistes del model §5 passen a la Fase 3. |
| 2 | **Fet** | 2026-10-14 | Branca `supabase`, **v4.1.0**, D-046. Hook d'alta (migració `20261014170000`, 12 tests nous; **190 en verd en local i a Supabase**); a `index.html`, entrada correu → codi de 6 xifres, sessió persistent (supabase-js 2.45.4 des de CDN), `noauth`, tancar sessió, logo a l'entrada i a la barra lateral, i fora Google Identity i les portes del correu d'administració. **Provat amb el servei real** des de `localhost:8899`: un correu desconegut es rebutja (403, "Aquest correu no és de cap membre de la falla"), un membre rep el codi i entra, en recarregar la pàgina continua dins amb el refresh token, i tancar sessió esborra la sessió. Corregit a la prova real: l'embed `usuari_rols` era ambigu (`usuari_rols!usuari_id`). Oberts: el codi arriba a brossa a Hotmail (autenticació correcta; reputació del domini nou) i la fila de prova `prova_emilio` de `usuaris` (s'esborra al buidatge del tall). `main` no s'ha tocat. |
| 3 | Pendent | | |
| 4 | Pendent | | |
| 5 | Pendent | | |
| 6 | Pendent | | |
| 7 | Pendent | | |
| 8 | Pendent | | |
