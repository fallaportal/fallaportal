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

---

### D-019: populateDelegatSelects() preserva la selecció en reconstruir el `<select>`
**Date**: 2026-09-20
**Status**: Active
**Context**: En crear un lliurament o una devolució de fons, l'usuari triava un
delegat diferent del primer de la llista, però el que es guardava sempre era el
primer (Antonio Javier) — i esborrant i tornant-ho a fer immediatament després,
sí que es guardava el delegat correcte. Causa: `showPage()` dispara `bgRefresh()`
a cada canvi de pàgina (vegeu Established Facts, `DOMAIN_KNOWLEDGE.md`), que en
acabar la càrrega real de Sheets torna a cridar `renderFons()` si la pàgina
"Fons delegats" és l'activa. `renderFons()` crida `populateDelegatSelects()`,
que reconstruïa `sel.innerHTML` dels `<select id="ll-delegat">` i
`id="dev-delegat"` sense recordar el `value` seleccionat, així que si l'usuari
havia obert el modal i triat un delegat abans que acabara eixa recàrrega (normal,
la crida a Sheets triga uns segons), la selecció es perdia silenciosament i
tornava a la primera opció — sense cap indici visual evident per a l'usuari.
Reproduït en viu (mock de xarxa + esdeveniments reals de `<select>`):
seleccionar `u2`, tornar a cridar `populateDelegatSelects()` (simulant el
refresc en segon pla) deixava `sel.value` a `u1` altra vegada.
**Decision**: `populateDelegatSelects()` guarda `sel.value` abans de reconstruir
les opcions i el restaura si el delegat encara existeix a la llista.
**Consequences**:
  - Cobreix alhora `modal-lliurament` i `modal-devolucio`, que comparteixen la
    funció.
  - S'ha revisat expressament la pantalla "Nou moviment" (Àrea/Delegació) i el
    modal d'edició de moviment: cap dels dos pateix el mateix problema, perquè
    els seus selectors només es construeixen una vegada a `initApp()` i no
    formen part del mapa de re-render de `bgRefresh()`. No s'hi ha tocat res.

---

### D-020: La caducitat del token de Google no tanca la sessió
**Date**: 2026-09-27 (v4.0.47)
**Status**: Active (transitòria fins a la migració a Supabase, D-021)
**Context**: Emilio reportava que l'entrada demanava massa clics. Causes trobades al codi:
  - `signOut()` i l'antiga `signOutWithMsg()` cridaven `google.accounts.oauth2.revoke()`,
    que esborra el consentiment de l'usuari: cada entrada tornava a passar per la
    pantalla completa de permisos.
  - El token dura ~1 h i no es renovava; el primer 401 expulsava l'usuari.
  - Qualsevol error de xarxa també l'expulsava i li esborrava la caché.
  - `disableAutoSelect()` en cada caducitat desactivava l'entrada automàtica de One Tap.
  - No es passava l'email com a `hint`, i eixia el selector de compte.
  - One Tap obria el popup d'OAuth sense gest de l'usuari, i el navegador el bloquejava.
**Decision**:
  - Mai revocar.
  - Guardar `tokenExpiresAt`. Quan el token caduca o arriba un 401, apareix
    `#reauth-banner` i les escriptures esperen (`esperarToken()`). Un toc a
    "Continuar" demana el token amb `hint` i `prompt:''`, i els guardats pendents
    continuen amb el token nou.
  - Si en renovar entra un altre compte, es tanca la sessió i els guardats pendents
    es rebutgen, perquè `_desantAraMateix` no quede bloquejat.
  - Els errors de xarxa es propaguen sense tancar la sessió.
  - L'últim email es guarda a `localStorage` (`fp_last_email`) com a `hint`; s'esborra
    amb "Tancar sessió".
**Alternatives Considered**: Renovació totalment silenciosa. No és possible amb el
model de token de GIS sense backend: el popup necessita un gest de l'usuari. Arribar a
zero clics requereix refresh token, és a dir, Supabase Auth (D-021).
**Consequences**:
  - Un toc per hora d'ús, en lloc de login complet amb permisos.
  - El polling mostra el bàner sol quan detecta la caducitat.
  - La recepta de verificació ha d'assignar `tokenExpiresAt` (`.claude/skills/verify`).
  - **No provat amb OAuth real**: el popup, `hint` i `error_callback` no es poden
    provar a `localhost`. Emilio ho ha de provar en producció.

**Revisió d'integritat (2026-09-27, v4.0.48)**: Emilio va preguntar si el comportament
antic tenia un motiu d'integritat de dades. No hi ha cap decisió ni comentari que el
justifique. Però:
  - L'expulsió en cas d'error de xarxa o 401 (`signOutWithMsg`) va entrar a la v4.0.9
    (commit `ade2907`, 2026-06-13), **en el mateix canvi que el polling cada 30 s**.
  - En eixe moment `readTab()` s'empassava els errors i tornava `[]`. Un tall de xarxa
    durant el polling deixava `DB` buit, i el guardat següent truncava el full.
    Expulsar l'usuari tallava eixa cadena: era una **protecció d'integritat de fet**,
    no documentada.
  - Des de v4.0.42–44 eixa protecció la cobreixen `readTab` propagant errors, el swap
    atòmic i `dadesCarregades` (D-003, D-016). Verificat: amb un tall a la recàrrega,
    `DB` queda intacte i el guardat següent no trunca.

**Risc nou trobat en la v4.0.47 i corregit a la v4.0.48**:
  - `writeTab` construïa la còpia de `DB` **abans** d'esperar el token. Si es feien dos
    guardats mentre el token estava caducat, en renovar-lo eixien alhora amb còpies
    diferents. Si la més antiga arribava l'última, trepitjava la nova.
  - **Reproduït**: el moviment B es guardava amb "✓" però no quedava al full.
  - **Correcció**: `save()` i `writeTab()` esperen el token **abans** de fer la còpia.
    Un 401 en un `PUT`/`clear` ja no es reenvia amb el cos antic: llança `code:'AUTH'`
    i `save()` es refà sencer amb les dades del moment.
  - **Verificat**: la mateixa seqüència deixa A i B al full, i el 401 enmig d'una
    reescriptura també.

---

### D-021: Migració a Supabase, mantenint GitHub Pages
**Date**: 2026-09-27
**Status**: Proposed — aprovat en principi; el pla està pendent de revisió amb Emilio
**Context**: Emilio ja té compte de Supabase. Motivacions:
  - Sessions persistents.
  - Control d'accessos al servidor: hui cada usuari és editor del full i els rols només
    es comproven en JS.
  - Acabar amb la família de riscos de `writeTab` (D-003, D-013–D-016).
**Decision**: Migrar a Supabase (Postgres + Auth + Storage). El hosting continua a
GitHub Pages (Vercel descartat). Una setmana de congelació d'ús per al tall. S'aprofita
per incorporar millores estructurals. Pla detallat a `PLA_MIGRACIO_SUPABASE.md`.
**Decisions d'Emilio en revisar el pla (2026-09-27)**:
  - Ningú treballa directament al full; només l'app.
  - Supabase de pagament per a `prod`.
  - Els justificants antics es migren a Storage.
  - **Entrada per email amb codi de 6 xifres, sense Google.** El codi es tria en lloc
    de l'enllaç màgic perquè a iOS l'enllaç s'obri fora de la PWA.
  - Alta pública desactivada.
  - Cal un SMTP propi.
**Consequences**:
  - Supersedirà D-002, D-008 i D-020 quan es faça el tall. Sense Google desapareixen el
    client OAuth, el mode "Testing" i el scope `drive`.

---

### D-022: Model comptable dels fons delegats — què genera apunt i què no
**Date**: 2026-10-13
**Status**: Accepted
**Context**: El desquadrament del 01 Banc i de la Caixa efectiu va destapar que el model dels
fons delegats no estava escrit enlloc i que el codi el contradeia: el botó "Reintegrament"
creava un segon apunt de despesa per Efectiu (comptava la despesa dues vegades), i a més
no funcionava mai (el títol del formulari no tenia l'id `ll-title`, així que `openReintegramentFor`
llançava un error, i el botó de confirmar cridava sempre el lliurament normal). No hi havia
cap manera d'apuntar diners que ixen del banc cap a un delegat (xec o transferència), de manera que
el moviment del banc entrava per l'extracte com a despesa i després la despesa real del delegat
tornava a comptar.
**Decision** (explicada per Emilio, 2026-10-13):
  - **Lliurament** de fons a un delegat: **no genera apunt**. Els diners continuen sent de la
    caixa de la falla; només canvien de mans. Els fons en mans dels delegats compten dins la
    Caixa efectiu.
  - **Despesa contra fons lliurats**: genera apunt (efectiu). És la despesa real.
  - **Devolució** del sobrant: no genera apunt; només ajusta el saldo del delegat.
  - **Avançament personal** (el delegat paga de la seua butxaca): genera l'apunt d'efectiu i
    deixa el saldo del delegat en negatiu.
  - **Reintegrament** (la falla torna un avançament): **no genera apunt** (ja el va fer
    l'avançament); és un lliurament que s'ofereix quan el saldo és negatiu, amb l'import
    pendent ja omplit.
  - **Diners que ixen del banc** (xec o transferència) cap a un delegat, o per a pagar un
    reintegrament: no són despesa. S'apunta un **traspàs banc → caixa** a Administració i
    Secretaria · Tresoreria: sortida del banc + entrada a l'efectiu, de manera que el resultat
    per àrea és zero (la mateixa convenció que el "TRASPASO PROPIO" entre comptes). Si el
    moviment del banc ja és a l'extracte, es reclassifica a Tresoreria en lloc de duplicar-lo.
**Consequences**:
  - El formulari de lliurament i el de reintegrament tenen l'origen "Banc" (`crearTraspasBancCaixa`).
  - Els xecs 364928, 364929, 364930 i 364931 del 01 Banc (3.000 €, 860 €, 5.750 €, 502 €) estan
    apuntats com a despesa i sense l'entrada a l'efectiu: cal reclassificar-los quan els tresorers
    diguen què van ser.
  - El saldo de la Caixa efectiu només serà fiable després d'això i d'un recompte físic
    (= caixa física + saldos positius dels delegats).

---

### D-023: Connexió automàtica als bancs (Open Banking / PSD2) — després de Supabase
**Date**: 2026-10-13
**Status**: Proposed — només enfocament; sense proveïdor triat ni codi
**Context**: Hui els moviments bancaris entren per extracte CSV/XLS descarregat a mà
(`processXLSBanc`, WS-BANK). Emilio vol valorar tindre les dades sempre actualitzades. Cap
banc ofereix una API directa a una falla; el camí estàndard és PSD2 (accés a informació de
comptes) a través d'un agregador autoritzat (p. ex. Enable Banking, GoCardless Bank Account
Data, Tink, TrueLayer, Salt Edge; disponibilitat i preus per verificar). Comptes: 01 Banc i
03 Banc (Caixabank), 02 Banc (Caixa Popular, cooperativa: cobertura per comprovar) i el compte
TPV.
**Decision**:
  - **No es construeix res a l'arquitectura actual.** Els secrets de l'agregador i els tokens
    de consentiment no poden viure en un `index.html` públic, i D-001 no deixa lloc a un
    backend. Un backend provisional (Apps Script o similar) es descartaria amb la migració.
  - **Es farà sobre Supabase** (D-021), a partir de la Fase 3 (capa de dades): Edge Function
    que parla amb l'agregador, `pg_cron` que la dispara, tokens en una taula inaccessible al
    client (RLS), Realtime per mostrar els moviments nous.
  - **Els moviments de l'API no van directes a `moviments`.** Passen pel mateix procés que
    l'extracte (regles d'importació, `bankHash` anti-duplicats, `conciliacio`), amb
    `fontImport: 'api_[bancId]'` i en estat pendent de revisió. Raó: un xec `CARG.CHEQUE`
    no diu si és retirada d'efectiu, diners per a un delegat o un pagament directe (D-022);
    ho han de classificar persones. L'API substitueix només el pas "descarregar i arrossegar
    el fitxer".
  - **Primer una prova de concepte** amb un sol compte (01 Banc) en sandbox, per veure quins
    camps arriben de veritat. Només si convenç, s'amplia als altres comptes.
**Consequences / limitacions acceptades**:
  - No és temps real: PSD2 limita les consultes sense l'usuari present a unes 4 per dia i
    compte.
  - El consentiment caduca (uns 90–180 dies segons banc i agregador): un tresorer l'ha de
    renovar a l'app del banc, i l'app ha d'avisar abans que el feed s'aturi.
  - El camp "Més dades" del CSV, que ajuda a decidir l'àrea, pot no existir a l'API.
  - El TPV només es pot connectar com a compte bancari; el detall de vendes depén de l'adquirent.
  - Dades sensibles (IBAN, moviments, tokens): només al projecte de Supabase a la UE i mai al
    repo, igual que els extractes (D-018).
  - Alternatives descartades de moment: millorar la importació CSV (continua manual) i
    Norma 43 de Caixabank empresa (fitxer estructurat, però semiautomàtic). Es poden
    reconsiderar si la prova de concepte falla.

---

### D-024: Registre d'activitat (qui ha fet què) a la migració a Supabase
**Date**: 2026-10-13
**Status**: Accepted com a requisit; el disseny es tanca a la Fase 1
**Context**: Emilio demana "un log de tot el que ha fet cadascú; ara no tenim res, si algú esborra alguna cosa,
per exemple". Avui no hi ha cap registre: `auditLog()` és codi mort des de la reversió de D-007, la pestanya
`18 Audit Log` no l'escriu ningú i el "Log" de Configuració només mostra un registre local d'`exercicis` i
`drive_folders`. Com que `save()` reescriu pestanyes senceres, ni l'historial de versions de Google Sheets pot dir
amb detall qui ha esborrat una fila (D-002, D-006).
**Decision**:
  - `audit_log` per **triggers** a Postgres, a totes les taules de dades, per a insert, update i delete: usuari
    (`auth.uid` + email), data i hora, taula, id de la fila, valors abans i després (`jsonb`).
  - Ningú, tampoc `president`, pot modificar ni esborrar el registre (RLS).
  - Pantalla "Registre d'activitat" per a `president`\|`treasury`, amb filtres per usuari, taula, acció i dates.
  - Els esborrats es poden **recuperar** a partir del valor "abans" del registre.
**Consequences**:
  - No es reimplementa a l'app actual (D-007: el risc de tocar `save()` és més alt que el valor, i la migració ho
    resol de soldre). Mentrestant: Google Sheets → Fitxer → Historial de versions.
  - Fa que el registre de la migració (`INVENTARI_FUNCIONAL.md` §8) siga un criteri d'acceptació de la Fase 6.

---

### D-025: La migració millora el model de dades i replica 1:1 el comportament
**Date**: 2026-10-13
**Status**: Accepted (Emilio, 2026-10-13)
**Context**: La Fase 0 (`INFORME_ANOMALIES_F0.md`) va trobar incoherències de model (tipus, claus, saldos,
bloqueig de pressupost per any, caixes d'event) i de comportament (tancar exercici, saldo de fons, abast per
pantalla, TPV del tancament). La Fase 6 compara les xifres de l'app vella i de la nova: si es canvia el
comportament alhora que es migra, una diferència no es pot atribuir a un error de la migració o a un canvi volgut.
**Decision**:
  - **Es millora el model de dades en migrar**: tipus `date` i `numeric`, claus foranes, un sol format d'id,
    bloqueig de pressupost per any, taula de caixes d'event, saldos inicials ben desats, paperera, registre
    d'activitat (D-024), escriptura per fila i Realtime. Cap d'això ha de canviar una xifra.
  - **El comportament i els permisos es repliquen 1:1** (pla §2, decisió 6). Qualsevol canvi de comportament
    (A-01, A-02, A-08, A-12, A-23 i semblants) és una decisió pròpia d'Emilio, registrada al `DECISION_LOG`, i
    s'aplica **després del tall**.
  - **Excepció**: els errors evidents (A-09 `parseFloat`, A-24 fons orfe en esborrar un avançament, A-13 dashboard)
    es poden corregir abans, a l'app actual.
  - **Fora d'abast** (fases pròpies): partir `index.html` en mòduls o afegir bundler (D-001), l'algorisme de
    WS-CONCILIACIÓ i la connexió als bancs (D-023).
**Consequences**: Les anomalies de `INFORME_ANOMALIES_F0.md` marcades "Replicar" es traslladen tal qual; les de
"Corregir en migrar" són canvis de model; les de "Decidir" esperen la decisió d'Emilio.

---

### D-026: L'exercici fiscal va del 01/04 al 31/03
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: Emilio dubtava si la falla comença l'exercici el 20/03 (després de la Cremà) o el 01/04. L'app ja usa
el 01/04 (fix al codi en 4 llocs) i els saldos inicials del 25/26 i del 26/27 estan datats el 01/04; el del 01 Banc
26/27 es va quadrar amb el banc a eixa data.
**Decision**: L'exercici va del **01/04 al 31/03**. Els dies del 20 al 31/03 serveixen per liquidar els pendents de
Falles dins del mateix exercici.
**Consequences**:
  - Cap canvi a les dades: els 9 moviments del 20–31/03/2026 continuen al 25/26.
  - Al model nou (`MODEL_DADES.md`) les dates d'inici i fi es desen a cada exercici en lloc d'estar fixes al codi.

---

### D-027: Taula `operacions` per agrupar el que crea cada acció
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: Avui una acció de l'usuari crea diversos registres sense vincle comú (traspàs banc → caixa: 2 moviments
+ 1 fons; tancament: 2 moviments + 1 fons; despesa amb fons: 1 moviment + 1 fons; importació: N moviments). Esborrar-ne
un deixa la resta: hi ha 4 avançaments orfes a les dades reals (A-24), i reobrir una caixa esborra moviments per
coincidència de text (`fontImport` + `eventId`).
**Decision**: Al model de Supabase (`MODEL_DADES.md` §4.2), la taula `operacions` agrupa tot el que crea una acció
(`moviments`, `fons`, `caixa_canvis`, `fallesapp_passiu` hi tenen `operacio_id`). Alternativa descartada: només claus
foranes directes (no cobreix traspassos, tancaments ni importacions).
**Consequences**:
  - Esborrar o desfer una acció l'esborra sencera; es pot desfer una importació completa.
  - El registre d'activitat (D-024) inclou `operacio_id`.
  - En migrar es reconstrueixen les operacions que les dades permeten (despeses amb fons, tancaments, traspassos,
    importacions); la resta queden com a `migracio`.

---

### D-028: Esborrat real, recuperació des del registre d'activitat
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: Cal poder recuperar el que algú esborra (D-024). Alternatives: (a) esborrat real i restauració des de
`audit_log`, que ja guarda la fila abans d'esborrar-la; (b) paperera amb `esborrat_at` a cada taula.
**Decision**: (a). Les files s'esborren de veritat; la pantalla "Registre d'activitat" permet restaurar una fila (o
una operació sencera, D-027) a partir del valor "abans".
**Consequences**:
  - Cap consulta, informe ni política RLS ha de filtrar esborrats: un esborrat no pot tornar a sumar per oblit.
  - La restauració ha de comprovar que les claus foranes encara existeixen (p. ex. la delegació) i avisar si no.
  - `audit_log` no es pot esborrar ni modificar per ningú (RLS), perquè és l'única còpia del que s'ha esborrat.

---

### D-029: L'exercici es calcula per la data; un exercici tancat no es pot modificar sense excepció
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: Avui cada moviment guarda l'exercici actiu en el moment de crear-lo (A-10) i "Tancar exercici" no
bloqueja res (A-01). A les dades reals hi ha 9 moviments i 14 fons del 25/26 amb data del 26/27: 7 són comissions,
quota i impostos del 02 Banc d'abril–maig de 2026 importats per error a l'any actiu; la resta (Festa de Cloenda 2026,
caixes de maig, devolució de fons del 02/06/2026) semblen imputats al 25/26 a propòsit.
**Decision**:
  1. A Supabase, l'exercici de moviments, fons i caixes **es calcula per la data** (dates de `exercicis`, D-026).
  2. Un **exercici tancat** no accepta altes, edicions ni esborrats.
  3. **Excepció**: `president`\|`treasury` poden imputar un registre a un exercici diferent del de la data o escriure
     en un exercici tancat amb **motiu obligatori** (`imputacio_excepcional`, `motiu_imputacio`, i `audit_log`).
  4. **Migració 1:1**: els registres que no casen entren com a excepcions amb el motiu "Imputat al 25/26 a l'app
     antiga"; cap xifra canvia i la Fase 6 compara igual.
  5. **Correcció a part**: els 7 moviments del 02 Banc passen al 26/27 i el saldo inicial del 02 Banc 26/27 passa de
     23.941,79 € a 24.542,39 € (+600,60), **després de comprovar el saldo real de Caixa Popular a 31/03/2026**.
**Consequences**:
  - Supersedeix el tractament "conservar el valor desat" proposat a A-10 i resol A-01 (bloqueig).
  - El 25/26 ja està tancat: activar el bloqueig des del primer dia no canvia cap xifra.
  - Les dates fixes del codi (4 llocs) passen a llegir les de `exercicis`.

---

### D-030: Separar qui entra un moviment de qui n'és responsable
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: El camp `responsable` d'un moviment manual és qui ha fet el pagament o el cobrament; en un moviment
importat (extracte, falles.app) és qui ha pujat el fitxer. L'Historial mostra centenars de moviments del banc com si
els haguera fet qui els va importar.
**Decision**: Al model de Supabase, `creat_per` (sempre: qui entra o importa) i `responsable_id` (només moviments
manuals: qui fa el pagament o cobrament; buit als importats). En migrar, el responsable dels importats passa a
`creat_per`.
**Consequences**: Cap xifra ni permís canvia (els importats només els poden tocar `president`\|`treasury`, igual que
ara). L'Historial mostra "importat per X" als importats i el filtre de responsable deixa de comptar-los.

---

### D-031: Els consums de falles.app es guarden fora del llibre de moviments
**Date**: 2026-10-13
**Status**: Accepted (Emilio)
**Context**: Els consums per event de falles.app (59.137 € el 25/26) es pugen com a moviments amb `via:'app'` i
s'exclouen a mà de Dashboard, Resultats i Flux: són estadístics (els diners ja van entrar com a recàrrega) i només
serveixen per atribuir ingressos als events (r3). No hi havia cap decisió escrita; es va reconstruir del codi i de les
dades. Les recàrregues, devolucions i bonificacions sí que són apunts reals i continuen al llibre.
**Decision**: Taula pròpia `fallesapp_consums` (`MODEL_DADES.md` §4.5). No hi ha compte `app`.
**Consequences**: Cap informe nou pot sumar-los per error. Dashboard, Resultats, Flux i pressupost no canvien; r3
llegeix moviments + consums i dona el mateix. Els consums deixen de sortir a l'Historial de moviments i es veuen a la
pantalla de Falles.app.

