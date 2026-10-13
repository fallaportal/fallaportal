# Work Stream Status — Falla Portal
## Snapshot Date: 2026-10-13
## Versió en producció: v4.0.64

> **Context de calendari**: període vacacional, ús baix de l'eina. Bon moment per a
> canvis estructurals i per a la decisió pendent del Service Worker.

---

### Actiu — WS-SUPABASE (nou, 2026-09-27)

**Objective**: Migrar de Google Sheets + OAuth de Google a Supabase sense perdre dades
ni funcionalitats, amb els accessos controlats al servidor (RLS). El hosting es queda a
GitHub Pages. Decisió D-021.
**Current State**: Pla a `PLA_MIGRACIO_SUPABASE.md`, **revisat amb Emilio el
2026-09-27**. Decisions preses:
  - Ningú treballa directament al full.
  - Supabase de pagament per a `prod`.
  - Els justificants antics es migren.
  - Entrada per email amb codi, sense Google.

**Propera sessió**: Fase 0 (auditoria i inventari). Model Opus 5.5, esforç high.
**Blockers**:
  - Cap per a la Fase 0.
  - Per a la Fase 2 cal triar l'SMTP (§9.8 del pla).

---

### Completat 2026-10-13 — Xecs del 30/06 aplicats i botó eliminat (v4.0.61–v4.0.62)

- **Què eren els xecs** (segons els tresorers):
  - **364930 (5.750 €)**: 5.500 € d'orquestres (diners donats a Antonio Javier, que va pagar Eventime) i 250 €
    de seguretat (diners donats a Juanjo, que la va pagar); tot a Festejos i Gastronomia · Música, Ambientació i
    Audiovisuals (0402). Cada part: xec = traspàs banc → caixa + lliurament al delegat + pagament contra fons.
  - **364931 (502 €)**: diners donats a Juanjo, que va pagar el "Generador" en efectiu (despesa del 6/6 ja
    apuntada): traspàs banc → caixa, la despesa estava comptada dues vegades.
  - **364928 (860 €)**: encara no se sap. Una pista: Juanjo va pagar les grues (Monument Gran) però no hi ha
    cap altre apunt de 860 €. No tocar fins que es confirme.
  - 364929 (3.000 €): ja arreglat.
- **Aplicat per Emilio** amb un botó puntual (dividir el 364930, simular el lliurament i el pagament de cada part a
  Festejos · Música i afegir l'entrada de 502 € a l'efectiu). El codi d'un sol ús s'ha eliminat a v4.0.62: ja no
  queda cap botó puntual a l'app. Verificat abans d'aplicar-lo: el total del banc no canvia, els saldos dels delegats
  queden a 0 i no hi ha files repetides.
- **Pendent**: reclassificar el xec 364928 (860 €) quan es confirme què va ser (origen "Banc" del lliurament,
  triant el moviment de l'extracte, si va passar per mans de Juanjo).
- **Generador MGM (502 €) — v4.0.63**: el xec 364931 va eixir del banc, els diners van passar per Juanjo i va pagar
  MGM ("Generador", 6/6, Festejos · Dinars, Sopars i Festes, ja apuntat com a caixa). Faltava el rastre als Fons
  delegats: botó puntual a Configuració → Exercicis (`_GENERADOR_JUANJO`, `_generadorJuanjoPla`,
  `arreglaGeneradorJuanjo`) que registra el lliurament de 502 € a Juanjo el 6/6 i enllaça el pagament com a despesa
  contra els seus fons (`origenFons` passa de `caixa` a `fons_lliurats`). L'efectiu i el saldo de Juanjo no canvien.
  Emilio ho va aplicar i el codi d'un sol ús s'ha eliminat a v4.0.64: ja no queda cap botó puntual a l'app.

---

### Estat financer 2026-10-13 (resultat de l'exercici 26/27 fins ara)

- **Resultat = −40.702,46 €** (abans dels xecs del 30/06) i **−40.200,46 €** un cop aplicats: la suma de tots els
  saldos ha baixat de 88.362,68 € (1/4/2026: 01 Banc 16.374,02 + 02 Banc 23.941,79 + Efectiu 17.856,00 + TPV 0 +
  03 Banc 30.190,87) a 48.162,22 € (01 Banc 9.391,88 + 02 Banc 23.941,79 + Efectiu 4.637,68 + TPV 0 + 03 Banc
  10.190,87). Es gasta de les reserves.
- **Confiança dels saldos**: només 01 Banc (9.391,88 €, quadrat amb l'extracte al 28/9 + despeses manuals del
  8/10) i TPV (0 €) estan confirmats. 02 Banc (sense cap moviment a 26/27; l'últim extracte és del 3/5), 03 Banc
  (extracte del 18/5) i l'efectiu (aproximat, sense recompte) sumen 38.268,34 €, el 80 % del total, i no estan
  confirmats.
- **Només queda sense classificar el xec 364928 (860 €)**: si és un traspàs banc → caixa (diners per a Juanjo),
  el resultat millorarà fins a −39.340,46 € (i la despesa de les grues hauria d'estar apuntada a Monument Gran);
  si va ser un pagament directe, no canvia.

---

### Completat 2026-10-13 — Xec de 3.000 € d'Alario i correcció del traspàs (v4.0.58)

- **Error corregit a v4.0.58**: `crearTraspasBancCaixa` guardava amb `saveMoviment` (que AFEGEIX
  una fila) un moviment ja existent que reclassificava, la qual cosa el duplicaria al full. Ara,
  si es reclassifica un moviment existent, es reescriu la pestanya sencera (`save('moviments')`); si
  només hi ha moviments nous, s'afegeixen. Verificat mirant exactament què s'envia al full.
- **Xec 364929 (3.000 €, 16/9) arreglat**: Emilio va aplicar el botó puntual (xec a Tresoreria + entrada
  de 3.000 € a la Caixa efectiu; la despesa de Monument Gran queda només al pagament d'Alario del 26/9).
  El codi d'un sol ús s'ha eliminat a v4.0.59: ja no queda cap botó puntual a l'app.
- **8/10**: els tresorers confirmen que la transferència de "Gorres negres" (4.116,42 €) i "Filament
  3D" (214,95 €) es va fer el 8/10 pel banc. Encara no hi ha apunts bancaris d'eixa data (l'últim
  extracte arriba al 28/9): quan s'importe, apareixeran com a "possibles duplicats" i s'han de
  deixar desmarcats.
- **Pendent**: xecs 364928 (860 €), 364930 (5.750 €) i 364931 (502 €): reclassificar-los (origen
  "Banc" del lliurament, triant el moviment de l'extracte) quan es sàpiga què van ser.

---

### Completat 2026-10-13 — Fons delegats: Reintegrament arreglat i origen "Banc" (v4.0.57)

- Model comptable dels fons delegats documentat a **D-022**.
- **Reintegrament**: funciona (abans donava error en obrir-se) i ja no genera un segon apunt de
  despesa; només puja el saldo del delegat. La targeta del delegat és plegable i el botó només
  es veu desplegada i amb saldo negatiu.
- **Origen "Banc"** al lliurament i al reintegrament (`crearTraspasBancCaixa`): sortida del banc +
  entrada a l'efectiu a Tresoreria, sense despesa; si el moviment ja és a l'extracte se'n pot
  triar un i es reclassifica a Tresoreria en lloc de duplicar-lo.
- Cancel·lar el formulari el deixa com a "Nou lliurament" (abans un Reintegrament cancel·lat
  convertia el lliurament següent en reintegrament).
- **Pendent**: reclassificar els xecs 364928 (860 €), 364929 (3.000 €, 16/9), 364930 (5.750 €) i
  364931 (502 €) un cop els tresorers diguen si van ser retirades per a la caixa/delegats o
  pagaments a proveïdors; el de 3.000 € ja és clar (despesa comptada dues vegades amb el
  pagament d'Alario del 26/9). Després, recompte físic de l'efectiu.

---

### Completat 2026-10-13 — Reassignació d'àrees aplicada i botó eliminat (v4.0.56)

- Emilio va aplicar la reassignació (2 apunts del WiFi a 07 Coordinació Tècnica i 5 del TPV
  a 01 Tresoreria) i el codi d'un sol ús s'ha eliminat. Ja no queda cap botó puntual a l'app.
- Decisions: TPV → 01 Tresoreria; WiFi COM.T → 07 Coordinació Tècnica; aigua → 01 Jurídica i
  Contractacions; remeses de quotes (FATIR…) → 01 Secretaria.
- **Pendent per a Emilio a Configuració → Regles**: `T.PlanaMyCommerce` i `MANTENIMIENTO TPV`
  a 01 Tresoreria; esborrar `PR.DE;`; buidar el concepte de `PR.DE` i `DETIR`; allargar `RAMS`;
  opcional regla `FATIR` → 01 Secretaria.
- **Pendents oberts** (vegeu més avall): extractes actuals de Caixa Popular, 03 Banc i 01 Banc des
  del 28/9; recompte físic de l'efectiu (= caixa física + 3.290,01 € en mans dels delegats);
  xecs 364928 (860 €), 364930 (5.750 €) i 364931 (502 €) del 01 Banc, i el de 3.000 € del 16/9
  (despesa comptada dues vegades: xec a Monument Gran + pagament d'Alario del 26/9);
  avançament pendent d'A. Alario (40 €).
- **Les despeses manuals del 8/10** (Gorres negres 4.116,42 € i Filament 3D 214,95 €) es van pagar
  pel banc: són la diferència entre el saldo de l'app (9.391,88 €) i l'extracte (13.723,25 €).
  En importar un extracte posterior al 8/10 apareixeran com a "possibles duplicats": cal deixar-les
  desmarcades (s'ometran).
- Disseny dels fons delegats (Reintegrament i diners del banc cap a un delegat): resolt a v4.0.57 (D-022).

---

### Completat 2026-10-11 — Regles de mapeig de la importació (v4.0.54)

- **Problemes trobats** (comprovats amb l'extracte real i la pestanya "13 Regles CSV"):
  1. El patró suggerit eren les 3 primeres paraules del concepte, amb números que canvien
     (`CARG.CHEQUE 364929`, `WEB367893310 0706`, `DETIR190221507`): 49 de 90 patrons no
     casaven mai amb l'extracte següent.
  2. La regla guardava com a concepte el text exacte del moviment (amb els seus números) i
     renomenava així tots els moviments futurs que casaven.
  3. El desplegable "Font de dades" només tenia 4 opcions: una regla creada des d'un altre banc
     (p. ex. 03 Banc) es guardava amb font buida, és a dir, per a tots els bancs.
  4. Les regles noves anaven a l'última prioritat i una regla genèrica anterior les ombrejava.
  5. `movtype` es guardava sempre com "auto" i el casament l'ignorava; "PR.DE;" amb punt i coma
     no casava mai; Configuració → Regles només mostrava 4 bancs; crear una regla reiniciava
     les caselles "s'importarà / s'ometrà".
- **Canvi**: patró suggerit sense números (`_suggerirPatrons`) amb botons Moviment / Més dades /
  tots dos; previsualització de quants moviments casa la regla (fitxer i historial); el concepte
  només s'hi guarda si l'usuari l'ha canviat; desplegable amb tots els bancs; prioritat per
  davant de la regla que ja casava; a igualtat de prioritat guanya el patró més llarg;
  `movtype` respectat (el sentit del moviment que genera la regla); separadors `,` `;` i salt
  de línia; avisos a la llista de regles (patró curt, número al concepte, regla repetida).
- **Pendent per a Emilio** (a Configuració → Regles, ara marcat amb avisos): esborrar
  `r1791710077609_d3ck` ("PR.DE;", duplicada de `r1791710527127_ei5b`), buidar el concepte de
  `PR.DE` i `DETIR` (diuen `PR.DE190221507` i `DETIR190221507`) i allargar `RAMS` (p. ex. `RAMS CRIDA`).
- **Revisar**: en la neteja del 01 Banc es van conservar les còpies antigues; en 20 de 50 parelles
  l'àrea era diferent de la de les regles noves (TPV, WiFi COM.T i aigua van a 07 segons les
  regles noves i a 01 a les còpies antigues). Decidir quina és la correcta.

---

### Completat 2026-10-11 — Neteja del 01 Banc 26/27 aplicada (v4.0.52–v4.0.53)

- Emilio va aplicar des de Configuració → Exercicis la neteja puntual (50 duplicats de la
  reimportació i la compra del pa duplicada esborrats, 9 moviments del Compte 2 passats al
  banc TPV, 2 traspassos afegits, saldo inicial corregit a 16.374,02 €). El codi d'un sol ús
  s'ha eliminat a la v4.0.53.
- Saldos resultants confirmats per Emilio: 01 Banc 9.391,88 € (13.723,25 € del banc menys
  4.331,37 € de despeses manuals del 8/10 pendents d'extracte), TPV 0,00 €, 03 Banc 10.190,87 €.
- **Pendent per a tancar el quadrament**: extractes actuals de Caixa Popular (02 Banc) i
  del 03 Banc, recompte físic de l'efectiu i reemborsaments de despeses pagades de la butxaca.

---

### Completat 2026-10-11 — Detecció de duplicats més estricta (v4.0.51)

- **Causa del desquadrament del 01 Banc (9.737,85 €)**: la reimportació del fitxer
  del banc va duplicar 50 moviments, perquè les importacions antigues no incloïen
  "Més dades" al concepte i el hash no coincidia (es marcaven "possibles" i venien
  marcats per importar). A més, 9 moviments del Compte 2 (TPV, …0332534) es van
  importar dins del 01 Banc, i faltaven 2 traspassos (−10,89 € el 8/7 i −12,00 € el 7/9).
  Saldo inicial 26/27 del 01 Banc: 16.374,20 a l'app contra 16.374,02 al banc.
- **Canvi**: `_classifyDuplicate` ara (1) té en compte el sentit (un ingrés no és
  duplicat d'un pagament del mateix import) i (2) també reconeix el hash antic, sense
  "Més dades" (`concepteAlt`). Verificat amb 5 casos.
- **Pendent**: Emilio ha d'executar `neteja_caixabank.js` (simulacre i després
  `__neteja.aplicar()`) i comprovar que el saldo del 01 Banc queda a 9.326,12 € (13.723,25 €
  del banc menys 4.397,13 € de despeses manuals pendents). El script fa un backup
  abans d'aplicar i la versió corregida (bug de la plantilla de les 2 línies afegides)
  no s'ha pogut tornar a provar en simulació.
  Pendent també: revisar la despesa manual "Compra del pa" (6/6, −65,76 €) apuntada al banc.

---

### Completat 2026-10-11 — "Més dades" a la importació i backup de l'exercici actiu (v4.0.50)

- **Importació de moviments**: la columna "Més dades" / "Mas Datos" del banc es detecta
  per nom de capçalera (sense accents, en qualsevol posició; també l'import per
  "Import"/"Importe"). Es guarda a `m.masDades` i es mostra en una línia pròpia
  ("MÉS DADES ...") a les files de duplicats i a les targetes d'excepcions, perquè
  ajuda a decidir l'àrea. `m.concepte` (regles i moviment guardat) la continua incloent.
  El hash anti-duplicats (`_concepteOriginal`) no canvia en els formats que no la
  combinaven, perquè els moviments ja importats continuen coincidint.
  Provat amb fitxers reals: 150 i 9 moviments, sumes exactes.
- **Configuració → Exercicis**: el botó "Backup JSON" ara també apareix a l'exercici
  actiu (abans només als no actius).
- **Pendent**: Emilio informa que el compte de CaixaBank li desquadra. Cal comparar un
  backup 26/27 amb els fitxers `Compte 1.xlsx` (…0088726: saldo final 13.723,25 €) i
  `Compte 2.xlsx` (…0332534: saldo final 0 €). Hipòtesis: possibles duplicats
  importats amb la UI antiga, o el Compte 2 importat contra el banc equivocat.

---

### Completat 2026-10-11 — Preview d'importació de moviments més clar (v4.0.49)

- **Problema**: a la llista "Possibles duplicats" (i "Ja existents al sistema") de la
  importació de moviments bancaris, la casella ocupava tota la fila per la regla
  global `input{width:100%}` i no quedava clar què significava marcar-la.
- **Canvi**: cada moviment és una fila clicable (`.imp-row`, `_impRowHtml`) amb
  l'estat explícit "S'importarà" / "S'ometrà" (marcat = importar, desmarcat =
  ometre), la fila ometuda s'atenua i es ratlla, "Ja al sistema: ..." mostra amb què
  coincideix, i hi ha botons "Importar tots" / "Ometre tots" (`marcarTotsImportar`).
  Les altres caselles de l'app ja porten el seu `width` i no estaven afectades.
- Verificat en execució (escriptori i mòbil 375 px) amb dades simulades.

---

### Completat 2026-09-27 — Login amb menys clics (v4.0.47) i targetes plegables

- **Fons delegats**: cada targeta de delegat es plega i només mostra nom i saldo. Es
  desplega en tocar-la. També es va corregir un `0` espuri al costat del botó
  Devolució (`+ +(...)`). Publicat com a `c9906d3`, sense bump de versió; el bump
  queda inclòs a v4.0.47.
- **Login**: vegeu D-020. La caducitat del token ja no tanca la sessió: un bàner
  demana un toc i els guardats esperen. Mai es revoca el consentiment.
  - Verificat en execució amb 6 escenaris: caducitat amb guardat pendent, 401, tall de
    xarxa, bàner des del polling, canvi de compte en renovar i entrada des de One Tap.
    També s'ha comprovat la vista mòbil.
  - **Pendent**: que Emilio ho prove en producció amb OAuth real (popup, `hint`).
- **v4.0.48, revisió d'integritat del canvi de login** (D-020, apartat "Revisió"):
  - L'expulsió antiga protegia de rebot contra truncar el full quan `readTab`
    s'empassava errors. Hui eixa protecció ja la cobreixen D-003 i D-016.
  - Trobat i corregit un risc nou de la v4.0.47: guardats en cua durant la caducitat
    amb còpies de `DB` desfasades. Reproduït abans i verificat després.

---

### Completat 2026-09-20 — Fix delegat incorrecte a Fons delegats

**Objective**: Emilio reportava que en crear un lliurament de fons, encara triant un
altre delegat al modal, sempre es guardava el primer (Antonio Javier) — calia
esborrar-lo i tornar-ho a fer per a que quedara bé la segona vegada.

**Fet**: Vegeu D-019 (`DECISION_LOG.md`). `populateDelegatSelects()` ara preserva el
`value` seleccionat en reconstruir el `<select>`, evitant que el refresc en segon pla
de `bgRefresh()` esborre la selecció de l'usuari mentre el modal de lliurament o
devolució està obert. Reproduït i verificat en execució (Regla 5) abans i després del
canvi.

**Revisat i descartat**: Emilio també sospitava del mateix bug a "Nou moviment"
(ingrés/despesa). Revisió exhaustiva (codi + execució, pagament banc i efectiu, amb
refresc en segon pla forçat): els selectors d'Àrea/Delegació d'eixa pantalla només es
construeixen una vegada a `initApp()` i no formen part del mapa de re-render de
`bgRefresh()`, així que no pateixen el mateix problema. **No s'hi ha tocat res.**

**Bump de versió**: v4.0.45 → v4.0.46 (Regla 1).

---

### Completat 2026-09-16 — Infraestructura de repositori

**Objective**: Aquesta carpeta local no era un repositori git (mai s'havia inicialitzat)
i els documents de continuïtat (aquest fitxer inclòs) no s'havien pujat mai a GitHub.

**Fet**:
  - `git init` + `origin = https://github.com/fallaportal/fallaportal.git` (branca `main`).
  - Reconciliació: `index.html`, `sw.js`, `dev.html`, `manifest.json` i les icones ja
    eren idèntics byte a byte al remot — cap divergència real de contingut.
  - `CLAUDE.md` nou (D-018): documenta el projecte i el protocol d'inici/tancament
    de sessió (`git pull` a l'inici, `git push` confirmat abans de donar la sessió
    per tancada).
  - `.gitignore`: exclou els extractes bancaris i CSV locals (`Moviments_compte_*`,
    `movimientos.xlsx`, `Book1/2.xlsx`, `eventos entradas portal*.csv`) — mai al repo.
  - Pujats per primera vegada: `DOMAIN_KNOWLEDGE.md`, `DECISION_LOG.md`, aquest fitxer,
    `CONVENTIONS.md`, `FDD_FALLA_PORTAL.md`, `TDD_FALLA_PORTAL.md`.
**Verificat**: `git log origin/main -1` coincideix amb el `HEAD` local després del push.

---

### Completat 2026-07-29 — WS-INTEGRITAT (nou)

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
