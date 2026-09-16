# Decision Log — Falla Portal
## Generated: 2026-07-29

---

### D-001: Arquitectura fitxer únic
**Status**: Active
**Decision**: Un sol `index.html` + `sw.js`. Sense bundler, framework ni backend propi.
**Consequences**: ~9.400 línies. Navegació per `grep -n` i rangs de vista.

---

### D-002: Google Sheets com a base de dades
**Status**: Active
**Decision**: Google Sheets com a única base de dades via Sheets API v4.
**Consequences**: Totes les operacions per REST. `writeTab` reescriu pestanyes senceres. Latència variable.

---

### D-003: Swap atòmic a loadFromSheets
**Status**: Active — **completat a v4.0.42**
**Context**: Una versió antiga assignava a `DB` a mesura que carregava, i una operació concurrent va llegir `DB` inconsistent, causant pèrdua de moviments.
**Decision**: Llegir tot en temporals i assignar a `DB` de colp al final.
**Consequences**: A v4.0.41 el swap encara estava **dins** de `if(cfgExtRows.length>0)` i no s'executava si `00 Config` tornava buida. Corregit a v4.0.42: ara està fora de qualsevol condició. Vegeu D-013.

---

### D-004: sheetRangeUrl() i sheetRange() obligatoris
**Status**: Active
**Decision**: Usar sempre els helpers per construir URLs de Sheets API. Mai `encodeURIComponent()` directe sobre noms amb espais.

---

### D-005: No entorn Dev separat
**Status**: Active
**Decision**: No existeix entorn Dev. Totes les proves es fan en producció pujant a GitHub Pages.
**Consequences**: Cal ser conservador amb canvis de risc alt. Aquesta decisió és el motiu pel qual es va desactivar el Service Worker (vegeu D-012).

---

### D-006: writeTab — descripció corregida
**Status**: Superseded (la descripció antiga era incorrecta)
**Context**: Aquest registre deia que `writeTab` "esborra la pestanya completa abans de reescriure". **És fals.**
**Realitat verificada**: `writeTab` fa `PUT` de totes les files primer i **després** un `clear` de les files sobreres. El comentari del codi ho diu explícitament: *"Escrivim primer — si falla, les dades antigues queden intactes"*.
**El risc real**: `writeTab` bolca `DB` sencer. Si `DB` estiguera incomplet o buit, truncaria la pestanya. Això és el que protegeixen D-003 i D-013.

---

### D-007: Audit log WS-AUDIT-LOG — revertit
**Status**: Superseded
**Motiu de reversió**: URLs malformades (400) que van interferir amb guardats concurrents i, combinades amb l'assignació no atòmica de `DB`, van causar pèrdua de dades.
**Nota**: `TABS.audit_log` (`18 Audit Log`) encara existeix al codi com a residu.

---

### D-008: scope drive vs drive.file
**Status**: Active
**Decision**: Usar scope `drive` (accés complet). `drive.file` no permet accedir a carpetes compartides creades manualment.

---

### D-009: Camp conciliacio als moviments
**Status**: Active
**Decision**: Camp `conciliacio` amb tres valors: `pendent`, `conciliat`, `no_aplica`. Lògica centralitzada a `calcConciliacio(via, origen)`. Migració automàtica i silenciosa a `loadFromSheets()`.
**Consequences**: A v4.0.41 la migració corria **abans** de carregar `DB.config.bancs` i classificava malament qualsevol banc que no fóra dels dos codificats a mà. Corregit a v4.0.44 (vegeu D-014).

---

### D-010: Ordre de desplegament sw.js primer, index.html segon
**Status**: Active
**Decision**: Sempre pujar `sw.js` primer, `index.html` segon.
**Nota**: Mentre el Service Worker estiga desactivat (D-012), aquesta regla no té efecte pràctic. Es manté perquè torne a ser correcta quan es restaure.

---

### D-011: Conciliació com a procés de control, no comptable
**Status**: Active
**Decision**: Tots els moviments compten als informes independentment del seu estat de conciliació. Els filtres d'informes no han de tenir en compte `conciliacio`.

---

### D-012: Service Worker desactivat — restaurat a v4.0.45
**Date**: Desactivat en data desconeguda (abans del 2026-06-05). Documentat i **resolt** el 2026-07-29.
**Status**: Active (restaurat)
**Context**: `index.html` conté al final `// DEV — Service Worker desactivat intencionadament per evitar cache en proves`. No hi ha cap registre de servei: 0 aparicions de `navigator.serviceWorker` i de `sw.js`. `index_2.html` (maig) encara conté el bloc de registre original. Es va llevar per poder provar en producció sense caché — conseqüència pràctica de D-005 — i no es va tornar a posar ni es va documentar.
**Situació actual**: Dues poblacions d'usuaris. Els que van registrar el SW fa mesos el conserven i el navegador els actualitza `sw.js` sol. Els nous no en tenen: es baixen els ~527 KB d'`index.html` cada visita i l'app no és instal·lable com a PWA.
**Verificat el 2026-07-29** (còpia servida sota `/fallaportal/`, no aplicat a producció):
  - El registre funciona: scope correcte, caché `falla-portal-v40XX` amb els 5 recursos.
  - Desplegar una versió nova arriba **immediatament** a l'usuari i la caché antiga s'esborra sola (Network First). No hi ha risc de quedar encallat.
  - Amb el servidor apagat serveix l'`index.html` cachejat.
  - No provat: iOS Safari, ni l'actualització des d'un SW registrat fa mesos.
**Recomanació**: Restaurar-lo, en un desplegament **a soles**, amb `navigator.serviceWorker.register('sw.js')` (ruta relativa, no `/fallaportal/sw.js`). Confiança que s'ha de restaurar: ~75%. Confiança que no s'ha de barrejar amb altres canvis: ~95%.

**RESOLT el 2026-07-29 (v4.0.45)**: Emilio aprova restaurar-lo. Aplicat al final
d'`index.html` amb ruta **relativa** (`sw.js`), substituint el comentari `// DEV`.
`BASE = '/fallaportal'` de `sw.js` es deixa com estava — tocar-lo hauria sigut un segon
canvi en el desplegament que ha d'anar a soles (deute tècnic #14, encara obert).
**Verificat en execució** servint una còpia sota `/fallaportal/` (port 8901):
  - Registre correcte, scope `http://localhost:8901/fallaportal/`, estat `activated`.
  - Caché `falla-portal-v4045` amb exactament els 5 recursos: arrel, `index.html` i les
    3 icones. **Cap dada financera.**
  - Desplegant una v4.0.46 per damunt: l'usuari veu la versió nova a la primera
    recàrrega i la caché `v4045` s'esborra sola. No hi ha risc de quedar encallat.
  - Amb el servidor apagat: l'app obri des de la caché, `accessToken` és `null`,
    `dadesCarregades` és `false` i `save('moviments')` queda bloquejat. La crida a
    Sheets ix a la xarxa i falla (401) — el SW no la intercepta.
  - 13 pàgines recorregudes, zero errors de consola i zero rebutjos no capturats.
**Continua sense provar**: iOS Safari i l'actualització des d'un SW registrat fa mesos.

---

### D-013: save() ha de propagar els errors
**Date**: 2026-07-29 (v4.0.44)
**Status**: Active
**Context**: `save()` acabava amb `catch(e){showToast(...);setSyncing(false,true);return;}`. En empassar-se l'error, `saveWithToast()` arribava sempre a la línia de l'èxit. Verificat: amb el full rebutjant **totes** les escriptures amb un 500, l'usuari veia **"Moviment registrat ✓"** en un toast normal i el formulari netejat. Res guardat, cap avís. Afectava despeses, fons, tancaments i configuració.
**Decision**: `save()` mostra el toast d'error i **rellança** l'excepció.
**Alternatives Considered**: Deixar-ho i comprovar el resultat a cada lloc de crida — rebutjat, són 67 llocs.
**Consequences**:
  - 63 dels 67 llocs de crida ja tenien `.catch` o `await`; compatibles sense canvis.
  - Els 4 que no en tenien (bloquejar/desbloquejar pressupost) passen a usar `saveMultiWithToast`.
  - La branca de reintent de `saveWithToast` era codi mort i ara funciona de veres.
  - **Aquest era el mecanisme dels duplicats**: l'usuari no es fiava del ✓, reintroduïa, i si alguna provatura havia entrat quedava duplicat.

---

### D-014: Ordre de guardat de les despeses amb justificant
**Date**: 2026-07-29 (v4.0.44)
**Status**: Active
**Context**: Amb justificant, el guardat al full es feia **dins** del `.then()` de la pujada a Drive. La despesa vivia només en memòria mentre durava la pujada (desenes de segons amb foto de mòbil). `showPage()` dispara `bgRefresh()` a cada canvi de pantalla, i el swap substituïa `DB.moviments` pel contingut del full, enduent-se la despesa pendent. Després, `findIndex` no la trobava i `if(idx>=0)` **callava**; el guardat escrivia sense ella i l'usuari veia "Moviment registrat ✓". Reproduït: la despesa desapareixia de memòria 0,5 s després de registrar-la i acabava ni al full ni a `DB`, amb la foto orfe a Drive.
**Decision**: Guardar la despesa al full **primer** i pujar la foto **després**, actualitzant `ticketUrl` amb un segon guardat.
**Alternatives Considered**: Fusionar en lloc de substituir al swap — més complex i amb risc propi. Descartat de moment.
**Consequences**:
  - El pitjor cas passa a ser "despesa guardada sense justificant", visible a l'informe de despeses sense justificant i corregible editant. Mai al revés.
  - Si el full falla, no es puja la foto (no es generen orfes nous).
  - El cas `idx<0` ja no calla: reafegeix i avisa per consola.
  - **No cobreix els justificants ja orfes a Drive** d'abans d'aquesta correcció.

---

### D-015: Pausa dels refrescos mentre s'està guardant
**Date**: 2026-07-29 (v4.0.44)
**Status**: Active
**Context**: `bgRefresh()` guarda una còpia de `DB.moviments` abans de recarregar, però **només la restaura si la càrrega falla**. Quan va bé, el swap substitueix l'array i el que encara no s'ha escrit es perd.
**Decision**: Comptador `_desantAraMateix`, incrementat i decrementat dins de `save()`. Mentre siga > 0, `bgRefresh()` i el polling tornen sense recarregar.
**Consequences**: Tanca la classe de carrera sencera, no només el cas del justificant. Si un guardat es penjara, els refrescos s'aturarien fins que acabe; el risc es considera baix perquè `save()` sempre acaba (té `finally`).

---

### D-016: Pany de guardat fins que les dades s'hagen carregat
**Date**: 2026-07-29 (v4.0.43)
**Status**: Active
**Context**: Si la primera càrrega de la sessió fallava, `DB.moviments` es quedava buit i l'usuari podia registrar igualment: el desat reescrivia el full sencer amb una sola fila.
**Decision**: Booleà `dadesCarregades`, cert només després del swap. `save()` es nega a escriure si és fals. `saveWithToast`/`saveMultiWithToast` tallen abans amb un missatge clar i **sense reintent**.
**Alternatives Considered**: Deixar el reintent — rebutjat després de verificar-ho: si entremig arribava una càrrega bona, el reintent escrivia però la càrrega ja havia substituït `DB` i s'havia endut el moviment nou, amb el missatge "Moviment registrat ✓".
**Consequences**: Es reinicia a fals en tancar sessió.

---

### D-017: Parseig d'imports — el punt sol continua sent decimal
**Date**: 2026-07-29 (v4.0.44)
**Status**: Active
**Context**: 19 camps d'entrada manual feien `parseFloat(txt.replace(',','.'))`, que només substitueix la **primera** coma: `1.234,56` es convertia en `1.234.56` i `parseFloat` tornava **1,23 €**. Afectava el formulari de moviments i tots els camps de caixa d'event (efectiu, TPV, pagaments, canvi, retirada). La importació de CSV bancari ja ho feia bé.
**Decision**: Funció `parseImport()` que accepta `1.234,56` i `1234.56` i torna `NaN` si el text no és vàlid.
**Decisió d'Emilio sobre el cas ambigu**: un punt sol amb tres xifres darrere (`1.234`) **continua sent decimal** (1,234 €), no milers. Emilio escriu els imports amb punt decimal (`1.23`) i prefereix el comportament previsible.
**Consequences**:
  - Risc acceptat conscientment: qui escriga `1.234` volent dir 1.234 € registrarà 1,23 €. El parapet és el modal de confirmació, que mostra l'import ja interpretat.
  - `1e3` passa a rebutjar-se (abans donava 1.000 €).
  - Els imports negatius, el zero i el text ja es bloquejaven i continuen bloquejant-se.

---

### D-018: Repositori git local inexistent — inicialització i protocol de sincronització
**Date**: 2026-09-16
**Status**: Active
**Context**: La carpeta local no havia sigut mai un repositori git. Els documents de
continuïtat (aquest fitxer inclòs) existien només en local des del 2026-07-29 i mai
s'havien pujat. `index.html`, `sw.js`, `dev.html`, `manifest.json` i les icones sí
eren idèntics byte a byte al remot `fallaportal/fallaportal` — no hi havia divergència
de contingut real, només absència d'historial git local.
**Decision**: `git init` + `origin` cap a `fallaportal/fallaportal` (branca `main`).
Afegit `CLAUDE.md` amb un protocol explícit: qualsevol sessió (local o web) ha de
començar amb `git pull`, i el tancament de sessió no es dona per fet fins que
`git push` es confirma (`git log origin/main -1` == `HEAD` local) — no n'hi ha prou
amb el commit local. Raó: com els documents de continuïtat es reescriuen sencers a
cada tancament (no per línies), la primera divergència real produiria un conflicte
de fitxer complet, no una fusió trivial.
**Consequences**: Els extractes bancaris i CSV locals (`Moviments_compte_*`,
`movimientos.xlsx`, `Book1/2.xlsx`, `eventos entradas portal*.csv`) queden exclosos
via `.gitignore` — mai han d'acabar al repo públic.
