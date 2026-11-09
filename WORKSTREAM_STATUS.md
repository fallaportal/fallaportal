# Work Stream Status — Falla Portal
## Snapshot Date: 2026-11-09
## Versió en producció: v4.2.2 (a `main`, amb Supabase, a `app.fallaportal.es`; publicada el 9/11) · etiqueta `pre-supabase` = versió amb Google Sheets

> **WS-RECARREGUES (D-057, 9/11): fase 1 feta en local, PENDENT d'aplicar la migració i de publicar (v4.3.0).** Els delegats declaren les
> recàrregues de falles.app en efectiu (pantalla «Declarar recàrregues», botó a l'inici del mòbil): ingrés en efectiu a 01·0102 + fons a nom seu,
> lligats; la devolució física només Tresoreria o President. El fitxer de falles.app ja no crea l'ingrés de les recàrregues: les guarda com a
> control a `fallesapp_recarregues` (amb «Autorizado por» i una empremta SHA-256). Les ja importades es queden. Migració
> `supabase/migrations/20261109120000_recarregues_delegats.sql` (mòdul `recarregues`, polítiques, trigger, config `recarregues_desti`, columnes
> `autoritzat_per` i `empremta`): **306 proves en verd en local; NO aplicada a Supabase** (el sistema de permisos va bloquejar l'aplicació a
> producció: cal l'ok d'Emilio) i la v4.3.0 no es publica fins llavors. Verificat al navegador amb l'app i la base real (matriu simulada, desat
> simulat): l'alta porta operació + ingrés + fons lligat, el saldo diu «Tens X de la falla al teu poder» i l'inici amb 5 botons no fa scroll.
> **Fase 2 (pendent)**: pantalla de quadrament declarat contra falles.app per delegat i període, amb la taula d'àlies `fallesapp_alies`
> (nom d'usuari de falles.app → persona; cal afegir-la a `guarda_canvis`). **Manual**: afegit el pas 1b a Fons delegats del Manual d'usuari.

> **Pantalles que no tenen sentit al mòbil (decisió del 9/11, publicada com a v4.2.2)**: `MOBIL_NO` = Importar extracte, Falles.app,
> Pressupostos i Configuració (fitxers d'Excel, taules d'edició, administració). No apareixen a la barra inferior, als botons de l'inici ni a
> «Més» (que acaba amb «Des de l'ordinador: …» per als rols que les tenen); a l'escriptori, igual que sempre. Es pot canviar la llista a
> `index.html` (`MOBIL_NO`). Verificat per a president, tresoreria, àrea i delegat.

> **v4.2.1 (2026-11-09, publicada): inici del mòbil.** Al mòbil, la pantalla d'inici passa a ser un resum personal
> (fons delegats de la persona amb saldo i barra, «Moviments teus», «Despeses declarades» amb avís de les sense justificant) i botons grans
> dels mòduls que els seus rols posen a la barra inferior (sense Inici) més «Més» (obri el menú de sempre). El saldo de fons es diu en clar:
> «Tens X de la falla al teu poder» (positiu), «La falla et deu X» (negatiu) o «Estàs a zero». El Dashboard de sempre s'obri en una pantalla
> pròpia des de «Dashboard de la falla» (`showPage('dashboard-full')`, per als rols que el veuen); a l'escriptori no canvia res. Codi:
> `renderMobHome()` (`index.html`).
> **Memòria de navegació (mòbil)**: `showPage` guarda una pila (`_navPila`, màxim 30) i mostra una barra «‹ <pantalla anterior>» a dalt; el botó
> Enrere del telèfon també hi torna (una entrada a l'historial mentre hi haja on tornar). Tocar la pantalla d'on véns compta com a tornar-hi.
> Només al mòbil (≤768 px); `navReinicia()` buida la pila en entrar. Verificat: Inici → Fons → Historial → Inici → Dashboard i enrere pas a
> pas amb el botó i amb `history.back()`. No cobreix les pestanyes internes de Configuració ni tanca el menú «Més» amb el botó Enrere.
> **Regla de disseny (Emilio, 9/11): sense scroll al mòbil sempre que siga possible.** L'inici ocupa exactament l'alt de la pantalla
> (`100dvh` menys padding, barra inferior i àrees segures; amb la barra Enrere, 56 px menys) i els botons s'estiren o es comprimeixen
> (a ≤700 px d'alt compacte; a ≤600 px sense barra ni subtítols). Provat a 320×568, 360×640, 360×740 i 412×915 per a president, àrea,
> delegat i tresoreria: 0 px de scroll. Corregit de passada per a totes les pantalles: `.main` sumava 80 px de padding inferior a l'`80px` de
> cada `.page` (80 px de scroll de més) i `100vh` d'iOS és més alt que la zona visible (ara `100dvh`). Nou moviment: sense el títol de la
> pantalla i amb menys padding, 0 px de scroll fins i tot amb la barra Enrere. **Pantalles que encara fan scroll a 360×740 (dades reals)**:
> Dashboard complet 545 px, Fons delegats 585, Estat de resultats 359, Flux 545, Importar 739, Manual 638, Falles.app 2.028, Pressupostos
> 2.994, Historial 7.647 (llistes llargues: no es poden quedar a 0 sense paginar o plegar).
> Criteris: moviments i despeses = els d'origen Manual registrats per la persona a l'exercici actiu (els d'extractes importats no compten);
> sense justificant = mateix criteri que l'informe r4; saldo = `calcSaldoDelegat`; si la persona no té fons i ho veu tot, la targeta és el
> total en mans dels delegats (coincideix amb el Dashboard). Verificat al navegador a 360 px amb l'app real i la base de dades real
> (pont `tools/f6_pont.mjs`, transacció que es desfà) per a delegat, àrea, president i tresoreria; sense errors ni canvis fantasma.

> **TALL FET i PROVAT el 2026-11-09 (D-056)**: producció usa Supabase. Proves d'entrada real fetes: Emilio (president), Juanba Mafé
> (tresoreria) i Juanjo Felis (àrea) han entrat (comprovat a `auth.users`); passiu de falles.app registrat (26/27, 9/11, 25.412,20 €, 676
> monederos); un justificant real pujat des de l'app (29 a Storage) i 3 dels 28 migrats oberts correctament; accés públic dels 28 fitxers de
> Drive retirat (comprovat: sense sessió acaben a l'inici de sessió de Google). Avís als usuaris enviat per WhatsApp el 9/11 (esborrar la icona antiga, entrar a app.fallaportal.es amb correu i codi, reinstal·lar a iPhone i Android). **Pendents**: seguir les incidències d'entrada (correu a brossa, correus no registrats)
> ; `/code-review`; obrir algun dels 5 PDF migrats; Fase 8 (estabilització).
> Còpia de la base de dades: `Falla Portal DB_supabase_tall_20261109.xlsx` (Descàrregues, fora del repo). Les referències
> més avall a «`main` v4.0.89», «branca `supabase`» o «fins al tall» són de l'estat anterior.

> **Context de calendari**: període vacacional, ús baix de l'eina. Bon moment per a
> canvis estructurals i per a la decisió pendent del Service Worker.

---

### Eina puntual — Certificats d'antiguitat de fallers (2026-11-04)

Emilio necessita certificats de que un/a faller/a és (o va ser) de la falla des d'un any. Eina local, fora de l'app:
`tools/certificat_faller.mjs` genera el Word (1 pàgina A4, escut a `tools/assets/escut_falla.png`; dependència `docx`
a `tools/package.json`) i `tools/certificat_pdf.ps1` l'exporta a PDF amb Word per a signar-lo amb Autofirma. Fets:
Macarena Gimeno Giménez (infantil, vocal, alta 01/03/2023, cens falla 591, JCF 626167) i Jennifer Gascón Gómez (baixa
`840`: alta 01/03/2012, baixa 25/05/2018, comissió major segons el Cens; **no apareix a la JCF** (baixa anterior al cens informatitzat), així que el
certificat té l'alta i la baixa d'Altes/Baixes i els números de cens de la falla per any que Emilio va treure del
programa de cens: 139 (2012–13), 140 (2014–15), 141 (2016–17), 138 (2018), opció `--cens-anys`; sense cens JCF ni càrrec). Fonts de dades i límits: `DOMAIN_KNOWLEDGE.md` («Cens de fallers i certificats»). Els `Certificat_*.docx/pdf` són
dades personals: al `.gitignore`.

Pendent: si es repeteix molt, plantejar-ho com a funció de l'app (D-021, dades al Supabase) en lloc d'eina local.

---

### Actiu — WS-SUPABASE (nou, 2026-09-27)

**Objective**: Migrar de Google Sheets + OAuth de Google a Supabase sense perdre dades
ni funcionalitats, amb els accessos controlats al servidor (RLS). El hosting es queda a
GitHub Pages. Decisió D-021.
**Current State**: Pla a `PLA_MIGRACIO_SUPABASE.md`, **revisat amb Emilio el
2026-09-27**. Decisions preses:
  - Ningú treballa directament al full.
  - Supabase de pagament: un sol projecte (D-043).
  - Els justificants antics es migren.
  - Entrada per email amb codi, sense Google.

**Fase 0 tancada (2026-10-13)**: inventari, informe d'anomalies amb perfil de dades reals, model de dades nou
(`MODEL_DADES.md`, decisions D-026–D-033) i correccions a l'app actual (v4.0.67–v4.0.78).
**Fase 1 tancada (2026-10-14)**:
  - Decisions d'Emilio: **D-035** (a Supabase qualsevol membre llig totes les dades, com avui; Postgres controla
    l'escriptura), **D-036** (permisos amb una matriu rol × mòdul de lectura/edició, i diversos rols per persona) i
    **D-038–D-041** (permisos d'avui que no es volen, per a després del tall: Junta només lectura, Àrea sense gestió de
    fons, r4 només als moviments propis, només President dissenya rols).
  - Fet: SQL a `supabase/migrations/` (taules, catàleg de mòduls i rols de sistema amb els permisos d'avui, funcions i
    polítiques RLS, triggers d'autoria, exercici per data, exercici tancat, columnes permeses, estat de caixa,
    anti-bloqueig i registre d'activitat). 178 tests de RLS en verd **en local (PGlite, D-037) i a Supabase**, comprovant el motiu
    de cada error esperat i amb una prova de control (dues polítiques espatllades → 6 tests fallen).
  - Detall del model de permisos i dels pendents: `MODEL_DADES.md` §9.
**Projecte de Supabase creat i provat (2026-10-14)**: `fallaportal` (organització AI4ALL, Pro, regió eu-west-1,
PostgreSQL 17.11). Les 4 migracions hi estan aplicades i els 151 tests hi passen, amb el mateix resultat que en local. La
cadena de connexió i el certificat de Supabase són a `tools/.env` i `tools/prod-ca-2021.crt` (fora del repo).
**Revisió final de seguretat feta (2026-10-14, Opus 5.5 · max, D-044)**: 11 grups de troballes (R1–R11,
`MODEL_DADES.md` §9.7), totes reproduïdes amb un test abans de corregir-les a
`supabase/migrations/20261014150000_revisio_seguretat.sql`, sense tocar la matriu. 178 tests en verd en local i a
Supabase, idèntics.
**Fet per Emilio (2026-10-14)**: a Supabase, Authentication, primer "Allow new users to sign up" desactivat i, a la Fase 2,
activat de nou amb el hook "Before User Created" registrat (D-046). La identitat de les polítiques és l'email del JWT.
**Correu d'entrada muntat i provat de punta a punta (2026-10-14, D-045)**: Resend amb el domini `mail.fallaportal.es`
(DNS verificat), SMTP configurat a Supabase (remitent `no-respon@mail.fallaportal.es`, nom "Falla Portal"), ajustos d'Auth
(OTP de 6 xifres que caduca als 900 s, "Secure email change" activat; l'alta pública s'activa amb el hook, D-046), plantilla "Magic link" amb el
logo (`supabase/email/codi_entrada.html`, logo servit des de `raw.githubusercontent.com`) i límit de 30 correus/hora. Prova real
des de Supabase (Users → Send magic link): **arriba, amb el logo i el remitent correcte, però a brossa**.
**Pendents del correu**:
  1. ~~Brossa~~: analitzada, vegeu més avall (autenticació correcta; Outlook el posa a brossa per reputació).
  2. Emilio ha d'**esborrar els usuaris de prova** d'Authentication → Users (vegeu la Fase 2).
  3. Comprovar que la plantilla "Magic link" de Supabase porta la línia `<img>` amb l'adreça de `raw.githubusercontent.com`
     (el logo es veia al correu; confirmar-ho a la plantilla desada).
**Brossa analitzada (2026-10-14, encapçalament d'un correu a Hotmail)**: SPF, DKIM (el del domini i el d'Amazon SES) i DMARC
surten `pass`, i el correu arriba amb `X-MS-Exchange-Organization-SCL: 5` i `RF:JunkEmail`: el DNS és correcte i és Outlook
qui el posa a brossa per reputació (domini nou, IP compartida d'SES) o contingut. Remitent real: `no-respon@mail.fallaportal.es`.
**Troballa (2026-10-15): la primera entrada d'una persona usa la plantilla "Confirm sign up", no "Magic link"** (l'usuari d'Auth es
crea en demanar el primer codi, D-046). La de Supabase per defecte porta un enllaç i cap codi: el correu que va arribar a Gmail
(`it.fallaportal@gmail.com`, persona nova) era eixe, sense número, i per tant **no serveix per a comparar la brossa** amb el de
Hotmail (que ja tenia usuari i va rebre "Magic link"). Cal posar la mateixa plantilla a "Confirm sign up". **Resultat amb la plantilla del codi a les dues (2026-10-15)**: Gmail → safata d'entrada; Hotmail → brossa, també amb l'estructura HTML
completa. És reputació d'Outlook amb un domini nou. Mesures, per ordre:
(0) [fet] enganxar `supabase/email/codi_entrada.html` a **"Confirm sign up" i "Magic link"** (des de `<!doctype html>`, amb l'assumpte
"El teu codi d'accés a Falla Portal: {{ .Token }}") i tornar a provar amb Gmail i Hotmail; (1) [fet, no ha canviat res] estructura HTML completa
(el primer correu duia només un `<div>`); (2) [decidit per Emilio, 2026-10-15: deixar-ho així] marcar "No és brossa" i
afegir el remitent als contactes (els membres, el primer cop: avisar-los abans del tall; repetir la prova a Hotmail/Outlook abans del tall); (3) si persisteix, treure el logo
extern de la plantilla o servir-lo des del domini propi; (4) l'ús continuat millora la reputació. Files de prova a `usuaris`:
`prova_emilio` (Hotmail, president) i `prova_gmail` (Gmail, board); s'esborren al buidatge del tall.

**Fase 2 tancada (2026-10-14, Sonnet 5.5 · high) — branca `supabase`, v4.1.0, D-046**:
  - Fet: hook `app.hook_alta_usuari` (només els membres poden crear-se l'usuari d'Auth; migració aplicada a Supabase, 190 tests
    en verd en local i a Supabase); entrada correu → codi de 6 xifres, sessió persistent, `noauth`, tancar sessió, logo a
    l'entrada i a la barra lateral; fora Google Identity i el correu d'administració `it.fallaportal@gmail.com`. Provat al
    navegador amb el client de Supabase simulat. **No és a `main` ni es publica**: sense Google l'app no pot llegir el full, així
    que la branca s'obri amb el DB buit i un bàner "Versió de proves amb Supabase" fins a la Fase 3.
  - **Prova real feta (2026-10-14/15)**: amb la clau pública a `SUPABASE_KEY`, l'alta pública activada i el hook registrat
    (Emilio), des de `localhost:8899`: un correu desconegut es rebutja amb 403 i el missatge del hook; el membre de prova
    (`prova_emilio`, emilio.grau@hotmail.com, president, creat per Claude a `usuaris`) rep el codi, entra, en recarregar
    continua dins (refresh token) i tancar sessió esborra la sessió. A la prova real va aparéixer un error de l'app (l'embed
    `usuari_rols` era ambigu) i es va corregir.
  - **Pendents d'Emilio**: esborrar els usuaris de prova d'Authentication → Users (el de la prova antiga i
    emilio.grau@hotmail.com; es tornarà a crear en entrar) i, abans del tall, resoldre la brossa (el codi va a "No deseados"
    a Hotmail: vegeu l'anàlisi més amunt). La fila `prova_emilio` de `usuaris` s'esborra al buidatge del tall (D-043).
  - (La resta de la Fase 3 —lectura, matriu de permisos al client, fora la capa de Sheets— es va fer després; vegeu «Fase 3 tancada».)
  - Fins a la Fase 3 una persona només tenia un rol a l'app; des de la v4.1.5 en pot tindre diversos (el de més prioritat és `rol`).
**Fase 3 (2026-10-15, Sonnet 5.5 · high; branca `supabase`, v4.1.2, D-047 i D-048): lectura i escriptura fetes**:
  - Tros 1 (lectura): dades reals a Supabase (`node tools/supabase_carrega.mjs "<export.xlsx>"`, l'export és a `~/Downloads/Falla Portal DB.xlsx`,
    fora del repo), adaptador `sbPestanyes()`, `loadFromSupabase()` paginat, prova `tools/supabase_roundtrip.mjs`.
  - **Tros 2 (escriptura, D-048)**: `public.guarda_canvis` (security invoker, una transacció, comprova les files tocades); `save()` desa per
    diferències tot `DB` (`sbTaules`/`sbCanvis`, foto `_sbBase`); Realtime en lloc del polling (migració `…110000_realtime.sql`); fora la
    capa de Sheets. **253 tests en verd en local i a Supabase**, `supabase_roundtrip` en verd i `node tools/supabase_escriptura.mjs --accions`
    (33 escenaris de l'inventari §4 contra les dades reals, en transacció que es desfà). Provat al navegador amb entrada real (vegeu PLA §11).
    Es van trobar i corregir errors preexistents (D-048): `genId` i `calcSaldoDelegat` perduts al tros 1, `saveArea`, claus de saldos amb `_`,
    saldos d'un banc esborrat, i una cursa entre lectura i desat.
  - **Pendent després d'aquest tros** (tancat el 2026-11-02, vegeu «Fase 3 tancada»): Fase 4 (justificants: pujar-ne falla amb missatge clar; les
    carpetes de Drive **no es desen**, l'app ho avisa) i esborrar els usuaris de prova d'Authentication (Emilio). Fets: matriu rol × mòdul al
    client, `operacions` en desar i textos del manual.
  - Decisions pendents d'Emilio (no bloquegen): (1) ~~Junta `viewAll`~~ decidit a D-053; (2) els consums de
    falles.app ja no desen empremta: com es detecten duplicats en reimportar (període + event + import?); (3) descartats a la càrrega: 4
    avançaments orfes i 12 canvis orfes (net zero); (4) regles d'importació amb font `app` (2) no es poden desar; (5) un responsable d'àrea que fa
    un traspàs banc → caixa reclassificant un moviment de l'extracte rep error de permís (només Historial en edició el pot canviar).
**Fase 3 tancada (2026-11-02, Sonnet 5.5 · high; branca `supabase`, v4.1.5, D-050)**:
  - Fet: `operacions` es creen en desar (`sbAgrupaOperacions`); la matriu rol × mòdul i el catàleg de mòduls es llegeixen al client; `perm()`, el
    menú, la barra del mòbil, els informes i les comprovacions per nom de rol (`president`/`treasury`) passen a la matriu; diversos rols per persona
    (`rols` a `08 Usuaris`, caselles al formulari d'usuari); editor Configuració → «Rols i permisos» (substitueix Mestre de Rols, Mòduls i
    Reports); textos del manual retocats. Proves: `tools/supabase_escriptura.mjs --accions` en verd (33 escenaris, amb comprovació de cada operació
    i de la matriu: `rol_moduls` 80 → 80, permisos antics deduïts = `DEFAULT_ROLES`); provat al navegador amb el client simulat (president,
    delegat, delegat + junta: menú, barra, informes, edició de la matriu amb error del servidor, rol nou, usuari amb dos rols, 13 pantalles sense
    canvis fantasma).
  - **No verificat**: entrada real per correu amb cada rol (Fase 6) i que `/code-review` no trobe res.
  - Pendents d'Emilio (no bloquegen): els de més amunt (~~Junta `viewAll`~~ decidit a D-053, duplicats de falles.app, orfes, regles `app`, traspàs d'un responsable
    d'àrea) i esborrar els usuaris de prova d'Authentication. Els canvis D-038–D-041 (després del tall) ara es fan des de l'editor de rols.
**Fase 4 feta (2026-11-02, Sonnet 5.5 · high; branca `supabase`, v4.1.6, D-051) — falta migrar els 24 justificants antics (Emilio)**:
  - Fet: bucket privat `justificants` (10 MB, imatges i PDF) amb polítiques de Storage (migració `20261102100000`, **aplicada al projecte**); client que puja,
    substitueix, obri (URL signada de 5 minuts) i esborra justificants; fora les carpetes de Drive; `tools/supabase_justificants_drive.mjs`. Proves: 278 tests
    en local i 274 a Supabase en verd (22 nous de Storage i de la ruta, 4 d'esborrat només en local); `supabase_roundtrip` i les 33 accions en verd;
    provat al navegador amb Storage simulat (ruta, fila, tipus i mida rebutjats, error de permís, neteja si la fila falla, substitució, obrir, previsualitzar,
    esborrar només després de desar). La prova en sec de l'script veu els 24 enllaços de Drive (tots reconeguts).
  - **Pendent d'Emilio per a migrar els antics** (`node tools/supabase_justificants_drive.mjs` és la prova; `--aplica` la migració): (1) posar la clau
    `service_role` (tauler de Supabase → Project Settings → API Keys) a `tools/.env` com a `SUPABASE_SERVICE_KEY=…` o com a variable d'entorn; (2) un
    token d'accés de Google amb lectura de Drive (OAuth Playground, abast `drive.readonly`, vàlid una hora) a la variable `GOOGLE_TOKEN`; (3) executar-lo
    i mirar l'informe (opcional `--carpeta <id>` per als orfes de Drive); (4) quan tot siga verd, retirar l'accés «qualsevol amb l'enllaç» dels fitxers de
    Drive (no s'esborren).
  - **No verificat**: pujar un justificant real des de l'app amb entrada per correu (Fase 6) ni l'script en mode `--aplica` (necessita les claus).
**Fase 5 feta (2026-11-02, Sonnet 5.5 · high; branca `supabase`, D-052): assaig net dues vegades seguides**:
  - Fet: càrrega validada (`tools/supabase_carrega.mjs` + `tools/f5_valida.mjs`: files, sumes per exercici × tipus × àrea × via, saldos de fons, id, mostra de 20
    files; **50 comprovacions, 0 errors** amb el full real), empremta de la base de dades, export invers (`tools/supabase_exporta_xlsx.mjs`; carregar-lo dona una
    empremta **idèntica**: 21 taules, 1.227 files), buidatge (`tools/supabase_buida.mjs`) i orquestrador (`tools/supabase_assaig.mjs`). Un assaig complet **sense buidar**
    ha eixit net (càrrega, validació, export, recàrrega, empremta, 33 accions). La càrrega ara també porta `16 Fapp Passiu`, `12 Pressupostos Historial` i els rols
    propis (abans s'ometien).
  - **Assaig complet fet, autoritzat per Emilio**: `node tools/supabase_assaig.mjs "<export.xlsx>" --vegades 2` → **2 de 2 nets** (buidar, 11 migracions des de zero, 275 proves `--remot`,
    càrrega validada 50/0, export invers, recàrrega amb empremta idèntica —21 taules, 1.227 files— i 33 accions). `supabase_buida.mjs --aplica` provat. El projecte ha quedat amb les
    dades del full; s'han esborrat els usuaris d'Auth (el codi d'entrada els torna a crear) i el registre d'activitat (6.251 files de proves).
  - **Decidit per Emilio (D-053)**: (1) el passiu de falles.app és el que els fallers tenen a l'app falles.app: la pestanya antiga `15 Fapp Passiu` no es carrega i Emilio passarà la xifra
    actual; (2) Junta «veu el que volem, no tot»: matriu amb abast `directiva` a Dashboard, Historial, Resultats i r1–r3 i sense Flux (migració `20261102110000`, v4.1.7; es pot canviar a «Rols i permisos»).
**Propera sessió**: la migració dels 24 justificants (Emilio: clau `service_role` i token de Google) i la Fase 6 (proves d'acceptació rol per rol amb
`tools/supabase_escriptura.mjs` com a base). A la branca `supabase`, sense tocar `main`.
**Blockers**:
  - Cap per a començar la Fase 3. El pendent de brossa no la bloqueja, però cal resoldre'l abans del tall: si els codis van
    a brossa, la gent no entrarà.
  - Emilio: activar la renovació automàtica i el bloqueig de transferència del domini `fallaportal.es` (D-042).

---

### Actiu — WS-QUADRAMENT (quadrament dels comptes de l'exercici 26/27, 2026-10-11 → 2026-10-13)

**Objective**: que els saldos de l'app coincidisquen amb els bancs i la caixa, i que cada despesa
compte una sola vegada. Va començar quan el 01 Banc mostrava un desquadrament de 9.737,85 €.
**Current State**: 01 Banc i TPV confirmats; falten els altres tres comptes (vegeu "Pendents").

**Fet (tot en producció, sense botons puntuals pendents d'eliminar)**:
- **v4.0.49–50 Importació**: preview clar (marcat = s'importa, desmarcat = s'omet), "Més dades" visible,
  backup de l'exercici actiu.
- **v4.0.51 Duplicats**: `_classifyDuplicate` distingeix ingrés de pagament i reconeix el hash antic (sense
  "Més dades"). La causa del desquadrament va ser una reimportació que va duplicar 50 moviments i un fitxer del
  Compte 2 (TPV) importat dins el 01 Banc perquè el banc TPV no tenia IBAN (ara en té).
- **v4.0.52–53 Neteja del 01 Banc** aplicada: 50 duplicats i la compra del pa duplicada esborrats, 9 moviments
  passats al banc TPV, 2 traspassos afegits, saldo inicial 16.374,02 €.
- **v4.0.54 Regles de mapeig**: patró suggerit sense números, previsualització de coincidències, concepte només si
  l'usuari el canvia, tots els bancs al desplegable, prioritat per davant de la regla que ja casava, sentit del
  moviment respectat, avisos a la llista. Detall més avall.
- **v4.0.55–56 Reassignació d'àrees** aplicada (WiFi a 07 Coordinació Tècnica; TPV a 01 Tresoreria).
- **v4.0.57–58 Fons delegats (D-022)**: el Reintegrament no funcionava i comptava la despesa dues vegades; ara només
  puja el saldo del delegat. Origen "Banc" al lliurament i al reintegrament (`crearTraspasBancCaixa`). Error corregit:
  reclassificar un moviment existent reescriu la pestanya (`save('moviments')`); `saveMoviment` només afegeix files
  noves.
- **v4.0.59–66 Xecs del 01 Banc classificats** (tots amb botó d'un sol ús, ja eliminat):
  - 364929 (3.000 €, 16/9): xec = traspàs banc → caixa; la despesa de Monument Gran és només el pagament d'Alario.
  - 364930 (5.750 €, 30/6): 5.500 € d'orquestres (Antonio Javier, Eventime) i 250 € de seguretat (Juanjo), a
    Festejos · Música (0402); cada part és traspàs + lliurament + pagament contra fons.
  - 364931 (502 €, 30/6): diners per a Juanjo, que va pagar el "Generador" a MGM; traspàs banc → caixa i rastre als
    Fons delegats (lliurament del 6/6 i pagament enllaçat).
  - 364928 (860 €, 10/7): diners a la caixa i d'allà es va pagar "Manuel Neteja" (Festejos · Dinars, Sopars i Festes);
    traspàs banc → caixa i pagament en efectiu (data 10/07 per defecte).

**Estat financer a 2026-10-13**: la suma de tots els saldos ha baixat de 88.362,68 € (1/4/2026: 01 Banc 16.374,02 +
02 Banc 23.941,79 + Efectiu 17.856,00 + TPV 0 + 03 Banc 30.190,87) a 48.162,22 € (01 Banc 9.391,88 + 02 Banc
23.941,79 + Efectiu 4.637,68 + TPV 0 + 03 Banc 10.190,87): **resultat −40.200,46 €**, finançat amb les reserves.
Confirmats: 01 Banc (extracte al 28/9 + despeses manuals del 8/10) i TPV (0 €). **Sense confirmar (80 % del total)**:
02 Banc (cap moviment a 26/27; l'últim extracte és del 3/5), 03 Banc (extracte del 18/5) i Efectiu (aproximat).

**v4.0.67 (2026-10-13) — recàrregues TPV de falles.app duplicades (A-27)**: botó puntual a Configuració → Exercicis
("117 recàrregues TPV de falles.app comptades dues vegades", "Revisar i aplicar") que esborra els 117 apunts "Recàrrega TPV"
del 01 Banc 25/26 (2.836,50 €), només si casen exactament i l'extracte té els 25 "Ingrés APP" pel mateix total; descarrega
còpia abans. A més, la importació de transaccions de falles.app ja no crea les recàrregues TPV. Verificat en execució amb
dades sintètiques (2 escriptures: PUT + clear; proves negatives). **Aplicat per Emilio el 2026-10-13; codi puntual eliminat a
la v4.0.68** (la importació continua sense crear les recàrregues TPV).
Efecte: el saldo final del 01 Banc 25/26 segons l'app passa de 19.210,51 € a 16.374,01 € (casa amb l'inicial del 26/27).

**v4.0.69 (2026-10-13) — avançaments orfes (A-24)**: botó puntual a Configuració → Exercicis ("4 avançaments duplicats de
Juanjo Felis sense despesa") que esborra 4 `avanc` del 26/27 (205,82 €) registrats dues vegades: les despeses duplicades ja
s'havien esborrat i els avançaments s'havien quedat. Només apareix si els 4 casen (id, data, import, moviment inexistent) i
cadascun té el bessó amb despesa; descarrega còpia abans. Verificat amb dades sintètiques (escriu `02 Fons` sencer sense els 4;
saldo del delegat +205,82 €; prova negativa). **Aplicat per Emilio el 2026-10-13; codi puntual eliminat a la v4.0.70.**
**v4.0.70 — causa corregida**: `deleteMoviment` ara també esborra l'avançament associat quan la despesa es va pagar amb
avançament personal (abans només ho feia amb fons lliurats). Reproduït amb la v4.0.69 (l'avançament quedava) i verificat
amb la v4.0.70 (s'esborra; fons lliurats i caixa sense canvis).

**v4.0.71 (2026-10-13) — consums sense data (A-10)**: botó puntual a Configuració → Exercicis ("Consums de falles.app sense
data") que posa el 31/03/2026 al registre "Consums falles.app - Activitats Casal 25/26" (6.928 €), decisió d'Emilio. Només
apareix si el registre casa (id, sense data, import, via `app`); descarrega còpia abans. Verificat amb dades sintètiques.
**Aplicat per Emilio el 2026-10-13; codi puntual eliminat a la v4.0.72.**

**v4.0.73 (2026-10-13) — tancament de caixa: l'efectiu es compta al final (A-31)**: els pagaments d'un event es fan amb
diners de la caixa, però el formulari no deia si l'efectiu es comptava abans o després de pagar; si era després, l'app
restava els pagaments dues vegades i la Caixa efectiu quedava curta. Ara el camp és "Efectiu final a la caixa" (després de
pagar) i l'app registra **Vendes efectiu** = final + pagaments − canvi, i la despesa de pagaments. `tancaments.efectiu` desa
l'efectiu abans de pagar (final + pagaments), de manera que l'informe r1 no canvia de fórmula. Eliminada `tancarEvent()`
(còpia morta). Verificat amb dos casos (sense i amb retirada i TPV). Els tancaments anteriors no es toquen.

**v4.0.74 (2026-10-13) — protecció provisional (D-034)**: l'any actiu continua global però només el canvien President i
Tresoreria (no Junta), amb avís que afecta tothom; un exercici tancat no accepta canvis de moviments, fons, caixes ni
importacions (President i Tresoreria poden fer-ho com a excepció confirmant-ho). Verificat amb Tresoreria (cancel·la i
accepta l'excepció), Responsable d'àrea (bloquejat en registrar, esborrar i obrir caixa), Junta (no pot canviar l'any)
i amb l'exercici obert (sense avisos).

**v4.0.75–76 (2026-10-13) — còpia de pressupost (A-11)**: no deixa copiar sobre un pressupost bloquejat i aprovat (cal
desbloquejar-lo abans) i demana confirmació si el destí ja té línies (abans les substituïa sense avisar). L'arredoniment a
euros es manté (Emilio: els cèntims no importen en un pressupost). Verificat: destí bloquejat, destí buit, destí amb
línies. La v4.0.76 només corregeix la redacció del singular ("1 línia").

**v4.0.77 (2026-10-13) — fora l'importador CSV genèric (A-18)**: no detectava duplicats, llegia malament els decimals amb
punt i no s'havia fet servir mai. Ara Importar CSV només admet extractes en Excel (.xls/.xlsx); un altre format mostra
"Format no admés". Eliminades les dues còpies de les seues funcions. Verificat: un .csv es rebutja i un .xlsx de
Caixabank es continua llegint (banc per IBAN, 2 moviments).

**2026-10-13 — `dev.html` esborrat del repositori**: era la v3.0.15 publicada a `fallaportal.github.io/fallaportal/dev.html`
i qualsevol que hi entrara escrivia al full real amb codi anterior a D-013–D-016.

**v4.0.78 (2026-10-13) — Dashboard dels responsables (A-13)**: per als rols sense `viewAll` (`area`, `delegat`) el Dashboard
llançava un `TypeError` en calcular la llista de fons (tractava la directiva, que va per any fiscal, com una llista) i
tallava `initApp`: no es veien fons, últims moviments ni despesa per àrea, i no es programava el refresc de 5 min ni
l'ajust mòbil/escriptori del botó de registrar. Ara llig la directiva de l'any actiu. Reproduït amb la v4.0.77 i
verificat amb la v4.0.78 per a `area`, `delegat` i `treasury`.

**v4.0.79 (2026-10-27) — total a Configuració → Bancs**: nova fila "Total" amb la suma dels saldos actuals de tots els comptes i
caixes, el saldo inicial total i la variació (és el resultat de l'exercici, vegeu D-029 i el model de saldos). Verificat amb
dades sintètiques (4 comptes, total quadrat a mà) i sense escriptures al full.

**Diagnòstic del 02 Banc (2026-10-27, extracte `ciaxapopularfalla_5419.xlsx` des de l'1/4 fins al 3/10; dades de producció llegides
amb la sessió d'Emilio, només lectura)**: l'extracte acaba a 26.353,58 € i l'app mostrava 26.948,13 € (+594,55 €). Els 17 apunts de
l'extracte hi són tots, sense cap de sobrant. La causa és el **saldo inicial del 02 Banc al 26/27: 24.536,34 €** (el saldo de l'extracte
després del primer apunt, no el de l'1/4). Dos fets: (1) el saldo real de Caixa Popular a l'1/4 és **24.542,39 €** (D-029 confirmat);
(2) 7 apunts d'abril–maig (net −600,60 €) són del 26/27 però estan imputats al 25/26: es van importar el 25/05/2026 amb el 25/26 actiu
(l'importador usa l'any actiu, no la data; A-10) i el 25/26 es va tancar el 17/06 amb ells a dins. Amb ells fora, el 25/26 tanca a
24.542,39 €, igual que el banc a 31/03. Una primera lectura (amb la còpia del 13/10) deia, erròniament, que faltaven 10 apunts.

**v4.0.80 (2026-10-27) — correcció d'un sol ús dels 7 apunts del 02 Banc (A-10, D-029)**: targeta ambre a Configuració → Exercicis
("Revisar i aplicar") que passa els 7 apunts del 25/26 al 26/27 i posa el saldo inicial del 02 Banc 26/27 a 24.542,39 € (01/04/2026);
exercici tancat: excepció confirmada; descarrega còpia dels dos exercicis; escriu `01 Moviments` i `15 Saldos`. Només apareix si els
7 apunts casen (id, data, import, sentit), el saldo inicial és 24.536,34 € i el tancament del 25/26 sense ells és 24.542,39 €.
**Aplicada per Emilio el 2026-10-27** (comprovat a producció: els 7 apunts al 26/27, 842 moviments = 560 + 282, cap duplicat; 02 Banc
26.353,58 €). Efecte als informes: 25/26 −600,60 € de despesa neta, 26/27 +600,60 €. Codi puntual eliminat a la v4.0.81.

**Incident (2026-10-27): la v4.0.80 va esborrar la pestanya `15 Saldos`**. En aplicar-la, el full es va quedar amb una sola fila (02 Banc
26/27, 24.542,39 €); 01 Banc, Efectiu i 03 Banc es van veure en negatiu (només el net dels moviments). Causa: `loadFromSheets` fa
`DB.saldos={}` a mitja càrrega (fora del swap atòmic) i s'empassa una lectura fallida de `15 Saldos` (`catch → []`); si el refresc falla
després, `bgRefresh` restaura moviments i fons però no els saldos. Un refresc d'aquests va buidar `DB.saldos` mentre la targeta esperava
les còpies de seguretat, i `save('saldos')` va escriure només el saldo que la targeta acabava de posar. La prova de la v4.0.80 tenia els
refrescos desactivats i no ho podia veure. Les còpies de la targeta no es van descarregar (el navegador integrat no les desa).
**v4.0.82 — restauració puntual de `15 Saldos`**: targeta a Configuració → Exercicis que escriu 8 saldos (valors de la còpia del 13/10, decisió
d'Emilio; 02 Banc 26/27 a 24.542,39 €). No depén de `DB.saldos`: llig el full, només escriu si encara té l'única fila esperada, i torna a
llegir per comprovar-ho; mentre restaura bloqueja els refrescos (`_desantAraMateix`). Verificat amb un full simulat que desa el que s'hi
escriu: amb la memòria buidada i un refresc concurrent (restaura les 8 files; només `PUT`+`clear` de `15 Saldos`), amb la lectura pròpia
fallida (429: no escriu res), i amb el full ja restaurat (no escriu res). Saldos previstos a producció: 01 Banc 9.141,88; 02 Banc 26.353,58;
Efectiu 3.625,68; TPV 0; 03 Banc 26.298,99 (total 65.420,13 €). **Aplicada per Emilio el 2026-10-27** (el primer intent va fallar per quota
429 sense escriure res; el segon, amb una sola sessió oberta, va anar bé). Comprovat a producció: 8 saldos; 02 Banc i 03 Banc quadren amb els
seus extractes (26.353,58 € a 3/10 i 26.298,99 € a 26/10). Codi puntual eliminat a la v4.0.83.
**Quota de lectura**: Google limita a 60 lectures/minut per usuari i cada sessió oberta recarrega el full sencer (~20 lectures) cada 30 s; amb
dues sessions del mateix compte se supera i les lectures fallen (429). La sessió de producció oberta per Claude al panell del navegador
va contribuir a l'incident: no deixar-ne cap d'oberta més del temps de llegir.
**v4.0.83 (2026-10-27) — causa arrel corregida**: `loadFromSheets` llig `15 Saldos` en una variable temporal i l'assigna al swap atòmic, i una
lectura fallida es propaga (un refresc fallit ja no toca els saldos); `save('saldos')` es nega a escriure si falta algun saldo de l'última
lectura o desat el banc i l'exercici del qual continuen existint (`_saldosPerduts`; esborrar un banc o un exercici sí que els treu). Reproduït
amb la v4.0.82 (refresc amb 429 a `15 Saldos` → 0 saldos en memòria → el desat deixa el full amb 0 files) i verificat amb la v4.0.83 amb la
mateixa seqüència (8 saldos intactes, 8 files), amb la memòria buidada a la força (no desa i ho avisa), editant un saldo, esborrant un banc,
eliminant un exercici i amb `bgRefresh` real amb lectura fallida. **Publicada el 2026-10-27.**
**v4.0.84 (2026-10-27) — correcció d'un sol ús dels casos dels traspassos**: targeta a Configuració → Exercicis ("Correcció dels traspassos")
que esborra la retirada de −250 € del 01 Banc del 30/06 (`m1791877040319_ppsp0.026796729502469585`, part del xec 364930) i canvia el concepte de
3 apunts del 03 Banc (+5.000 € 30/06 → "Arres venda propietat"; +30.000 € 02/10 → "Venda propietat (resta)"; −20.000 € 08/07 → "Compra solar
C/ M"); les àrees no canvien. Cada apunt ha de casar amb un sol moviment (compte, data, sentit, import i inici del text). Llig `01 Moviments` just
abans i aplica el canvi sobre el full, bloqueja refrescos, escriu, torna a llegir i compara fila per fila; després espera que acabe qualsevol
càrrega en curs (`_carregant`, nou a `loadFromSheets`) i torna a carregar. **Troballa de la prova**: sense aquesta espera, un refresc iniciat
abans de l'escriptura bolcava a la memòria el full d'abans (targeta encara visible, saldo sense canviar), i un desat posterior de moviments
hauria tornat a posar la retirada. Verificat: cas bo amb refresc concurrent (només `PUT`+`clear` de `01 Moviments`, 9 → 8 files, la resta
idèntica, memòria igual que el full, 01 Banc +250 €), lectura pròpia fallida (no escriu), full ja corregit amb memòria antiga (no escriu),
apunt ambigu (no apareix) i rol sense permís (no apareix). **Aplicada per Emilio el 2026-10-27**; comprovat a producció: retirada esborrada,
3 conceptes nous, 01 Banc 9.391,88 €, 02 i 03 Banc igual que els extractes, 8 saldos. L'Efectiu va baixar 2.000 € entre les dues lectures per un
pagament de l'Arturo (no per la correcció). Codi puntual eliminat a la v4.0.85 (es manté `_carregant`).
Cas 1 tornat a confirmar per Emilio el mateix dia: la retirada de −250 € no té empremta d'importació (la va crear la correcció del 13/10);
a l'extracte del 30/06 només hi ha els xecs de 502 € i 5.750 €. Els diners sí que van a la caixa (l'entrada de +250 € i el pagament de
"Seguretat" es queden). La grua està pagada a part: 747,50 € de la caixa el 04/06 i 2.797 € avançats per Juanjo el 10/07.
**Risc general trobat**: el mateix passava amb els desats normals. `bgRefresh` i el polling no comencen mentre es desa, però una càrrega que
ja estava en curs bolcava en acabar el que havia llegit abans del desat: el moviment nou desapareixia de la memòria i, si abans del refresc
següent es desava una altra cosa de moviments, s'esborrava del full. A més, si la càrrega fallava, `bgRefresh` i el polling restauraven una
còpia de l'inici i desfeien el que s'haguera desat mentrestant.
**v4.0.86 (2026-10-27) — una càrrega no trepitja un desat (conformitat d'Emilio)**: `loadFromSheets` llig les 17 pestanyes abans de tocar `DB`
(cap espera entre la lectura i l'assignació) i, si mentre llegia ha pujat `_genEscriptura` (s'incrementa al principi de `save`, `saveMoviment`,
`saveFons` i el desat del passiu de falles.app), descarta el llegit i torna a llegir (fins a 3 vegades; després falla sense tocar `DB`).
`bgRefresh` i el polling ja no restauren cap còpia. Reproduït amb la v4.0.85 (refresc lent + moviment A desat enmig → A desapareix de la
memòria i el desat de B l'esborra del full) i verificat amb la v4.0.86 amb la mateixa seqüència (A es conserva), amb `saveMoviment` +
`bgRefresh`, amb un refresc normal, amb desats contínuament durant la lectura (descarta i falla sense tocar res), amb la protecció dels saldos
i registrant un moviment des del formulari. **v4.0.85 i v4.0.86 publicades el 2026-10-27.**
**v4.0.87 (2026-10-27) — traspassos entre comptes fora dels informes (pas 3a)**: nova columna `traspas` a `01 Moviments` (`'true'` o buit;
els apunts antics no en tenen i no són traspassos; la fila de capçaleres la reescriu el primer desat). `esTraspas(m)` i `netTraspassos()`.
No compten com a ingrés ni despesa: Dashboard (mètriques i despesa per àrea), Historial (totals, "sense N traspassos"), Resultats, Flux
(cobraments/pagaments; a cada compte "Traspassos (net)" i el saldo final l'inclou), Pressupost (real i còpia), fons gastat d'un delegat,
informes per event i despeses sense justificant. Sí: saldos dels comptes i saldos inicials del nou exercici. Control a Resultats, Flux i
Configuració → Bancs (nombre de traspassos i avís si el net no és 0). Marca: automàtica a `crearTraspasBancCaixa` (els dos costats, també
quan reclassifica un moviment de l'extracte) i casella a l'edició de l'Historial (President i Tresoreria). CSV: "Traspas (entrada)/(eixida)".
Targeta d'un sol ús a Configuració → Exercicis ("Marcar els traspassos entre comptes") amb els 30 apunts revisats (4 del 25/26 i 26 del 26/27),
cadascun ha de casar amb un sol moviment; llig el full, marca, escriu, rellig i compara fila per fila, espera les càrregues en curs i recarrega.
Verificat amb un full simulat sense la columna: abans 51.172 € d'ingressos i 60.472 € de despeses (inflats), després 1.000 € i 300 € (els
moviments normals); saldos i saldo final del Flux iguals; control amb net −10.000 €; només `PUT`+`clear` de `01 Moviments`, capçalera nova,
30 marcats i la resta idèntica; casella de l'Historial (marcar/desmarcar, bloquejada per a `area`); "Banc → caixa" marca els dos costats;
la targeta no apareix amb un apunt ambigu ni per al rol `area`; lectura fallida no escriu. Efecte previst a producció (26/27): ingressos
−50.171,60 €, despeses −60.171,60 € (el −10.000 € del 26/10 queda sense parella fins a importar l'extracte del 01 Banc des del 29/9).
**Publicada i aplicada per Emilio el 2026-10-27** ("30 apunts marcats com a traspàs", missatge que només surt si la relectura del full
coincideix fila per fila). Codi puntual eliminat a la v4.0.88. Últim apunt de l'extracte del 01 Banc: 28/09/2026 (després, 2 despeses
manuals del 08/10: Filament 3D 214,95 € i Gorres negres 4.116,42 €); falta l'extracte des del 29/09.
**v4.0.89 (2026-10-27) — regles d'importació que marquen traspassos (pas 3b)**: nova columna `traspas` a `13 Regles CSV` i casella "Traspàs
entre comptes de la falla" al formulari de regles (només per a regles de tipus "auto"); `aplicarReglesImportacio` copia la marca de la regla al
moviment i la importació la desa. La previsualització compta els traspassos i els etiqueta; la llista de regles també. Verificat amb un full
simulat sense la columna: marcar una regla existent ("TRASPASO PROPIO") la desa i la mostra; un extracte de Caixabank amb un "TRASPASO PROPIO"
i un rebut importa el primer marcat i el segon no; Resultats no compta el traspàs i el saldo del banc sí. **Pendent d'Emilio**: a Configuració →
Regles, marcar com a traspàs les regles de traspassos propis (p. ex. `TRASPASO PROPIO`, `TRASPÀS PROPI`), i no les de "PAGO TRASPASOS" (pagaments
a tercers). En importar l'extracte del 01 Banc des del 29/9, comprovar que l'entrada de 10.000 € del 26/10 queda marcada (si no, marcar-la a
l'Historial): llavors el net dels traspassos del 26/27 serà 0.
**v4.0.88–89 publicades el 2026-10-27.**
**Branca `supabase` v4.1.4 (2026-10-27) — fusió de `main` (v4.0.80–89) i traspassos al model (D-049)**: la capa de dades es queda la de
Supabase (desat per diferències, `loadFromSupabase` amb `_sbGen`, Realtime): no s'hi porten el comptador `_genEscriptura`, `_carregant` ni el
desat per pestanyes de `main`. El cos de la càrrega llig de `_sbPestanyes` (variable `L`) sense cap espera i assigna `DB.saldos` al swap; es porta
la guarda dels saldos (`_saldosPerduts`) a `save()` abans de `sbDesa()` (les diferències esborrarien els saldos perduts). Migració
`20261027120000_traspassos.sql` (`moviments.traspas` i `regles_importacio.traspas`, boolean, per defecte false) **aplicada a Supabase**;
adaptador (`sbPestanyes`/`sbTaules`) i `tools/supabase_carrega.mjs` porten la marca. Proves: `supabase_tests.mjs` 256 correctes en local i a
Supabase (3 casos nous: el delegat no pot marcar, Tresoreria sí, per defecte no és traspàs); `supabase_roundtrip.mjs` amb l'export del 13/10:
tot igual; `supabase_escriptura.mjs --accions`: tot en ordre (escenari nou: marcar i desmarcar un moviment i una regla de traspàs). Al navegador,
la v4.1.4 carrega sense errors i Resultats i Bancs exclouen els traspassos amb el control a net 0.

**Pendents** (res d'això depén de codi):
1. Extractes actuals: Caixabank ES06 2100 1958 3602 0008 8726 des del 29/9; Caixabank ES56 2100 7990 7413 0059 2938
   des de l'1/4; Caixa Popular ES82 3159 0076 6426 7219 1729 des de l'1/4; Caixabank TPV ES60 2100 7990 7802 0033 2534
   des del 8/9. En importar el del 01 Banc, les despeses manuals del 8/10 (Gorres negres 4.116,42 € i Filament 3D
   214,95 €, pagades pel banc) apareixeran com a "possibles duplicats": deixar-les **desmarcades**.
2. **Tancaments anteriors amb pagaments (A-31)**: 4 caixes (pagaments de 9, 12, 120 i 792 €; la de 792 € és la Festa de
   Cloenda 2026). Preguntar a qui les va tancar si l'efectiu es va comptar abans o després de pagar; si va ser després,
   la Caixa efectiu està curta en eixos imports i cal corregir-les.
2b. Recompte físic de la caixa en efectiu. Referència: Efectiu de l'app menys els saldos positius dels delegats
   (3.290,01 € a l'11/10); aproximadament 1.350 € a la caixa. El saldo inicial de 17.856 € és aproximat.
3. A Configuració → Regles (Emilio): `T.PlanaMyCommerce` i `MANTENIMIENTO TPV` a 01 Tresoreria; esborrar `PR.DE;`;
   buidar el concepte de `PR.DE` i `DETIR`; allargar `RAMS`. Opcional: regla `FATIR` → 01 Secretaria (remeses de quotes).
4. Avançament pendent d'A. Alario: 40 €.
5. **02 Banc (D-029)**: fet el 2026-10-27 (v4.0.80): els 7 moviments d'abril–maig són al 26/27 i el saldo inicial 26/27 és 24.542,39 €
   (saldo real a 31/03). El 02 Banc dona 26.353,58 €, com l'extracte del 3/10.
5b. **Traspassos (2026-10-27)**: 32 apunts amb pinta de traspàs; 14 parelles completes. Respostes d'Emilio als que no tenien parella:
   xec 364930 → sobra la "Retirada del banc per a Juanjo" de −250 € al 01 Banc (els 250 € eren part del xec; sense ella el 01 Banc torna a
   9.391,88 €); +5.000 € 03 Banc 30/06 = arres de la venda d'una propietat i +30.000 € 03 Banc 02/10 = resta de la venda (ingressos);
   −20.000 € 03 Banc 08/07 = compra d'un solar (despesa); tots tres es queden a Tresoreria i només canvia el concepte; −408 € "PAGO TRASPASOS"
   i +90,75 € "TRASPAS" (01 Banc) són pagament i cobrament amb tercers; +1.110,53 € "RECUP.SALDO.TARGETA" és un ingrés real. Queda sense
   parella el −10.000 € del 03 Banc del 26/10 fins a importar l'extracte del 01 Banc des del 29/9. Ordre acordat: (1) protecció dels saldos
   (v4.0.83), (2) correcció d'un sol ús dels casos (−250 € i 3 conceptes), (3) marca "Traspàs entre comptes" i informes sense traspassos.
6. Decidir si les remeses de quotes (`FATIR…`) i els apunts del TPV tenen regla pròpia; les àrees confirmades són TPV →
   01 Tresoreria, WiFi COM.T → 07 Coordinació Tècnica, aigua → 01 Jurídica i Contractacions, quotes → 01 Secretaria.

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

### Planificat — WS-PREVISIO (previsió de tresoreria i capacitat de despesa, 2026-11-03)

**Objective**: que l'app responga «puc gastar X € el dia D?» (plataforma de 2.700 €, ampliar la carpa per 12.000 €) amb el
punt mínim de la previsió de tresoreria i el resultat ordinari.
**Current State**: pla **aprovat** per Emilio el 3/11 (D-054, `PLA_PREVISIO_TRESORERIA.md`) amb els valors recomanats; farà
ajustos i potser avançarà el calendari. Emilio: els diners lliures, el pressupost d'ingressos (quotes, loteria, subvencions;
events des d'anys anteriors) i la classificació de despeses fixes (lloguers, llum, aigua) es poden tindre.
**Fase 0, pas 1 fet (3/11)**: perfil del 25/26 amb `tools/previsio_f0_perfil.py` (informe `.xlsx` fora del repo; resultats a
`PLA_PREVISIO_TRESORERIA.md` §10). El banc quadra i serveix de base; l'efectiu no (≥ 131.918,20 € de pagaments en efectiu sense
registrar). Tres ajustos aplicats al pla (D-055): naturalesa `fixa`/`variable`/`extraordinaria` per a ingressos i despeses,
posada per la regla d'importació; l'efectiu de la base s'estima amb el 26/27.
L'efectiu a l'1/4/2025 no el sap ningú (Emilio, 3/11): el resultat real del 25/26 només es dona per al banc.
**Next**: Emilio pregunta què van ser els 13.000 € d'«Assegurances» del 25/26 i revisa el full «Naturalesa» de l'informe; resta de la Fase 0
durant l'estabilització; tornar a passar el perfil amb l'export del tall; Fase 1 des de la setmana del 23/11.
**Blockers**: el tall del 9/11 i les dues setmanes d'estabilització.

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

**Després del tall — canvis de permisos decidits** (es fan a la matriu de rols, sense tocar l'SQL):
- Junta de només lectura (D-038): `board` passa a lectura a `caixa`, `pressupostos` i `r4`.
- Responsable d'àrea sense gestió de fons (D-039): `area` passa a lectura a `fons`.
- Justificants des de r4 només als moviments propis (D-040): `area` i `delegat` passen a lectura a `r4`.
- Només President dissenya rols (D-041): `treasury` passa a lectura a `rols`.

**TPV de les caixes d'event al resultat de l'event** (A-23, 2026-10-13): els apunts "ON 367893310 ddmm" del banc queden a
01 Tresoreria sense event; quadrar-los amb el TPV de la caixa i assignar-los l'event i l'àrea. Després del tall (D-025).

**Falles.app: comptar per caixa o per vendes** (Emilio ho pensa, 2026-10-13; `INFORME_ANOMALIES_F0.md` §7.11). Per no tancar
cap porta: pujar els consums de **tots** els events i registrar el passiu dels moneders periòdicament. Relacionat: no es
porten inventaris (begudes, menjar); és un tema a part.

**WS-BANK-API — connexió automàtica als bancs (PSD2)**: idea de 2026-10-13, decisió
proposada a D-023. Depén de WS-SUPABASE: no començar abans de la Fase 3 (capa de dades).
Primer pas: prova de concepte amb el 01 Banc en sandbox d'un agregador (triar-lo i
verificar-ne preus i cobertura de Caixabank i Caixa Popular). Els moviments entren pel mateix
procés que l'extracte CSV, no directes a `moviments`. Limitacions: ~4 consultes/dia per
compte i consentiment que cal renovar cada 90–180 dies.

**Botó Refresh en mòbil**: només és a la barra lateral (escriptori).

**Pressupostos — re-render silenciós**: la pàgina es queda en blanc durant el polling.

**Log de configuració interna — hora local**: mostra UTC.

**Fusionar en lloc de substituir al swap**: alternativa considerada a D-014. Faria
que `loadFromSheets()` preservara els moviments locals encara no guardats en lloc de
substituir l'array sencer. Més robust, però amb risc propi. Amb D-014 i D-015 el
problema pràctic ja està cobert.

**Cas ambigu `1.234`**: risc acceptat conscientment a D-017.

---

### Fase 6 (en curs, 2026-11-02) — informes i inventari per rol
- **Informes app vella (`main` v4.0.89 amb el full) vs nova (Supabase), mateixes dades** (Dashboard, Resultats, Flux, Fons delegats, r1–r4, exercicis 25/26 i 26/27): **idèntics** llevat de
  tres diferències explicades: (1) saldo de fons de Juanjo Felis 205 € «disponible» (nou) contra 0 € «excedit» (vell): són els 4 avançaments orfes descartats a propòsit (A-24, D-047; 205,82 €);
  total «en mans dels delegats» 3.455,48 € contra 3.249,66 €; (2) r2 25/26: l'app vella duplicava la fila d'Emilio David Grau (2 delegats; totals iguals); (3) noms del responsable (usuari actual, no text lliure) i ordre de files amb la mateixa data a r4. **(1) resolt (2026-11-02, Emilio)**: els 4 avançaments orfes de Juanjo Felis (205,82 €) són duplicats d'avançaments que ja existeixen amb un altre id; la regularització del 25/09 (4.352 €) els va cobrir de més, i Emilio va regularitzar **−205 € el 25/10** (posterior a l'export del 13/10, que és el que fan servir els assajos): amb eixa regularització el saldo de Juanjo queda al voltant de 0,5 €. L'export del dia del tall ja la durà. Les xifres de la Fase 6 es van comparar amb l'export del 13/10.
- **Inventari per rol amb l'app REAL i la base de dades REAL** (`tools/f6_pont.mjs` + `f6_client.js` + `f6_inventari.js`; transacció que es desfà): president, tresoreria, àrea, delegat i Junta **sense problemes**
  (menú, barra, permisos, abast, pantalles sense errors ni canvis fantasma, Nou moviment pel formulari, canvi de Configuració rebutjat pel servidor).
- **Discrepància trobada i CORREGIDA (v4.1.8)**: no era del doble rol sinó un error de l'app: en entrar amb una pàgina nova, `initApp()` omplia els selectors de «Nou moviment» abans de carregar la directiva (ja no hi ha caché de `DB`), i un responsable d'àrea o de delegació es quedava amb **àrea i delegació buides**; el servidor rebutjava el moviment (`dins_abast(null, null)`). Ara `carregaInicial()` els torna a omplir en acabar de carregar. Comprovat amb una persona nova (Delegat + Junta) en una pàgina recent: Nou moviment es desa. El pont no deixava veure-ho abans perquè reutilitzava l'estat del perfil anterior.
- Eina: el pont crea cada persona de prova amb un correu únic (una sessió penjada ja no bloqueja les altres).
- **Tall fixat per al dilluns 9/11/2026** (procediment al PLA, Fase 7). **Fet el 3/11**: avís als usuaris enviat per WhatsApp; DNS `CNAME app → fallaportal.github.io` creat i verificat (resol a les IP de GitHub Pages; el domini encara no es publica); passiu de falles.app **26.000,20 €** (informe de saldos del 3/11: 768 files, 673 amb saldo; l'informe encara mostra monederos esborrats, p. ex. 2 € d'un monedero ja eliminat, que no es gastaran mai).
- **Revisió de falles.app contra el cens (3/11)**: altes 762, baixes 720, saldos 763 monederos amb nom; 735 coincideixen (615 idèntics, 111 amb nom diferent, 9 aparellats a mà). 28 no són a les altes: 8 eren baixes ja registrades (ja esborrats a falles.app), 7 sense classificar (340,60 €) i 13 que Emilio creu músics (23 €). Els 7 i els 13 els ha de confirmar qui porta el cens (informe Word entregat a Emilio; no bloqueja el tall). Pendent de decidir si es retornen o es queden els diners dels que no siguen de la falla.
- **Decidit (3/11)**: el full passa a només lectura el dilluns 9/11 a les 9:00 i es migra amb l'export baixat després; les proves d'entrada real es fan el mateix dia 0 amb les dades definitives (Emilio president, Juanba Mafé tresoreria, Juanjo Felis àrea; vegeu el PLA, Fase 7), sense carregar res abans.
- Falta abans del dia 0: `SUPABASE_SERVICE_KEY` a `tools/.env`, `GOOGLE_TOKEN` el dia 9 per als 24 justificants de Drive. El dia 0, baixar de nou l'informe de saldos i importar-lo a la pantalla Falles.app.
- Falta: `/code-review`, **tornar a exportar el full abans del tall i repetir la comparació d'informes i l'assaig** (l'export actual és del 13/10), i proves amb entrada real per correu el dia del tall.
