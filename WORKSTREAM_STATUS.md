# Work Stream Status — Falla Portal
## Snapshot Date: 2026-07-29
## Versió en producció: v4.0.44 (pujada a GitHub Pages al final d'aquesta sessió)

> **Context de calendari**: període vacacional, ús baix de l'eina. Bon moment per a
> canvis estructurals i per a la decisió pendent del Service Worker.

---

### Completat aquesta sessió — WS-INTEGRITAT (nou)

**Objective**: Que l'eina done certesa. Un usuari no expert no ha de poder generar
dades inconsistents sense adonar-se'n, i la confirmació que veu ha de ser certa.

**Estat**: Completat i verificat en execució. v4.0.41 → v4.0.44.

**Problemes trobats i corregits** (tots pre-existents, cap introduït per aquesta sessió):

| # | Problema | Versió |
|---|---|---|
| 1 | `readTab()` s'empassava els errors de lectura i tornava `[]`. Un tall de xarxa o un 429 deixava `DB` a zero amb la barra dient "Sincronitzat", i el desat següent esborrava el full. | 4.0.42 |
| 2 | El swap atòmic estava dins de `if(cfgExtRows.length>0)`: amb `00 Config` buida no s'executava mai. | 4.0.42 |
| 3 | Es podia guardar sense haver carregat mai les dades → el full es truncava a una fila. | 4.0.43 |
| 4 | La migració de `conciliacio` corria abans de carregar els bancs: qualsevol banc afegit a Configuració es marcava `no_aplica` en lloc de `pendent`, i no es corregia mai. | 4.0.43 |
| 5 | `parseFloat(txt.replace(',','.'))` en 19 camps: `1.234,56` es registrava com **1,23 €**. | 4.0.43 |
| 6 | **`save()` s'empassava els errors**: l'usuari veia "Moviment registrat ✓" encara que el full haguera rebutjat l'escriptura amb un 500. Afectava tot. | 4.0.44 |
| 7 | Les despeses **amb justificant** es guardaven només després de pujar la foto; qualsevol canvi de pantalla enmig se les enduia. | 4.0.44 |
| 8 | `bgRefresh()` recarregava enmig d'un guardat i substituïa `DB.moviments`. | 4.0.44 |

**Verificació**: cada correcció s'ha provat executant l'app al navegador amb el Google
Sheet simulat, reproduint primer el problema i confirmant després que la mateixa
seqüència ja no el provoca. Rutes de fallada comprovades: Drive caigut, full caigut,
càrrega inicial fallida, i camí bo sense regressió (13 pàgines, cap error de consola).

**Correccions de documentació**: D-006 descrivia `writeTab` al revés; l'email admin
rep `treasury` i no `president`; el rol es diu `board` i no `junta`; hi ha dues
pestanyes numerades `08`; `18 Audit Log` continua al codi tot i D-007.

---

### Actiu — WS-CONCILIACIÓ

**Objective**: Creuar moviments bancaris manuals amb línies del CSV bancari.
**Current State**: Fonaments a v4.0.41, amb la migració ja corregida a v4.0.44.
El camp `conciliacio` existeix a tots els moviments i la columna és a `01 Moviments`.
**Verificat**: `Efectiu`→`no_aplica`, banc + `Manual`→`pendent`, `CSV`→`conciliat`,
`TPV`→`no_aplica`, i bancs afegits a mà→`pendent` (això últim era el bug corregit).
**Open Items**:
  1. Implementar l'algorisme de matching — els 12 casos D1–D5, I1–I3, P1–P4
  2. Configuració `conciliacio_marge` (tolerància d'import)
  3. Vista de Conciliació per al tresor
**Blockers**: Cap.

---

### Pendents immediats (proposta d'ordre per a la propera sessió)

**1. ~~D-012 — Service Worker.~~ FET a v4.0.45** (2026-07-29). Restaurat amb ruta
relativa i verificat en execució. Va **a soles** en aquest desplegament.

**1-bis. Dades de la falla a `localStorage` del telèfon — NOU, detectat el 2026-07-29.**
Sorgit d'una pregunta d'Emilio sobre què queda al telèfon sense connexió. No té res a
veure amb el Service Worker; ja passava abans.
`saveCache()` (`index.html:1519`) fa `localStorage.setItem('fallaportal_cache', {db:DB})`:
guarda **el `DB` sencer** — moviments amb imports i conceptes, responsables amb email,
fons, tancaments i la llista d'usuaris — **sense xifrar**, després de cada registre.
Tres conseqüències:
  a) Al registrar, el moviment entra a `DB` i a `localStorage` **abans** d'intentar
     escriure al full. Si el full falla, el moviment **es queda al telèfon** encara que
     l'usuari haja vist el missatge d'error.
  b) Eixe fantasma **no acaba al full**: si la càrrega següent va bé, el swap atòmic el
     substitueix; si falla, `dadesCarregades` bloqueja `save()`. Però entre `loadCache()`
     i el final de `loadFromSheets()` (`index.html:7140`) l'usuari **pot veure a
     l'historial un moviment que no és al full**.
  c) Només s'esborra amb **Tancar sessió** explícit (`index.html:7100`). Passada l'hora,
     `loadCache()` es nega a usar-lo però **no l'esborra**: continua al telèfon.
Cal decidir què es vol abans de tocar res. **No abordat.**

**2. Justificants orfes a Drive.** Les despeses perdudes abans de v4.0.44 van deixar
la foto pujada a la carpeta de tickets, amb el nom de l'id del moviment. Eixos ids no
existeixen al full. Es poden localitzar creuant la carpeta amb `01 Moviments` i
decidir si es recuperen o s'esborren. **No fet.**

**3. Validació d'entrada (anti-garbage).** Preocupació explícita d'Emilio i **no
abordada**. Cap validació impedeix conceptes sense sentit, imports absurds dins del
rang numèricament vàlid, o despeses duplicades introduïdes a consciència. Cal decidir
quines regles es volen abans d'implementar res.

**4. WS-CONCILIACIÓ sessió 2** — l'algorisme de matching.

---

### Completats anteriorment

**WS-BANK**: Importació CSV bancari, regles, `_calcBankHash()`, `importarXLSZona()`.
**WS-FONS**: Fons lliurats a delegats.
**WS-TANCAMENTS**: Tancament de caixa per events.
**WS-PRESSUPOSTOS**: Pressupostos per àrea/delegació.
**WS-FALLES-APP**: Integració amb falles.app.
**Migració pestanyes Sheets**: via `TABS_MIGRATION`.

---

### Parking Lot

**Escaneig de factures (OCR)**: captura mòbil amb extracció automàtica. No planificat.

**WS-AUDIT-LOG**: revertit per incident (D-007). Requisits per a reimplementar: URLs
via helpers, respectar el swap atòmic, no interferir amb guardats concurrents.
Nota: ara que `_desantAraMateix` existeix, aquest últim requisit és més fàcil.

**Informes R5–R8**: pendents de definir.

**Botó Refresh en mòbil**: només és a la barra lateral (escriptori).

**Pressupostos — re-render silenciós**: la pàgina es queda en blanc durant el polling.

**Log de configuració interna — hora local**: mostra UTC.

**Fusionar en lloc de substituir al swap**: alternativa considerada a D-014. Faria
que `loadFromSheets()` preservara els moviments locals encara no guardats en lloc de
substituir l'array sencer. Més robust, però amb risc propi. Amb D-014 i D-015 el
problema pràctic ja està cobert.

**Cas ambigu `1.234`**: risc acceptat conscientment a D-017.
