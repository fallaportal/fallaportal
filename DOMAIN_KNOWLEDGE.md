# Domain Knowledge Base — Falla Portal
## Generated: 2026-07-29 (sessió de correcció de pèrdua de dades)

### Entities & Definitions

**Falla Portal** — PWA de gestió financera per a una falla valenciana. Arquitectura de fitxer únic (`index.html` + `sw.js`), hostatjada a GitHub Pages, amb Google Sheets com a base de dades i Google OAuth per a autenticació.

**Falla** — Associació cultural valenciana. Falla Portal gestiona ~30 membres amb múltiples rols.

**Emilio** — Desenvolupador principal i administrador. Actua com a tècnic i product owner simultàniament.

**Google Sheets** — Backend/base de dades. Cada pestanya (tab) representa una taula. Lectura i escriptura via Sheets API v4.

**Google Drive** — Emmagatzematge de rebuts i justificants. Requereix scope `drive` (no `drive.file`).

**GitHub Pages** — Hosting. URL producció: `https://fallaportal.github.io/fallaportal/`

**Service Worker (`sw.js`)** — Gestiona la caché PWA. `BUILD_VERSION` (numèric sense punts, ex: `4044`). **[IMPORTANT] Actualment `index.html` NO el registra** — vegeu D-012.

**`DB`** — Objecte global amb totes les dades en memòria: `DB.moviments`, `DB.fons`, `DB.tancaments`, `DB.config`, `DB.regles`, `DB.pres_plans`, etc.

**Moviment** — Transacció econòmica (ingrés o despesa). Entitat central.

**Fons lliurats** — Diners que la junta lliura a un delegat per cobrir despeses.

**Tancament de caixa** — Registre d'efectiu i TPV recaptat en un event.

**Àrea** — Unitat organitzativa de primer nivell. `areaId`. Al codi: `DB.config.areas` (en anglés).

**Delegació** — Subunitat dins d'una àrea. `delegacioId` + `areaId`.

**Event** — Activitat de la falla. Associat a delegació i any fiscal.

**Any Fiscal** — Període comptable format `XX/YY` (ex: `26/27`). **Del 01/04 al 31/03** (D-026): els dies entre la
Cremà (19/03) i el 31/03 serveixen per liquidar els pendents de Falles dins del mateix exercici.

**Banc** — Entitat a `DB.config.bancs`. Camps: `id`, `codi`, `nom`, `tipus` (`bank`|`cash`|`tpv`), `saldoInicial`, `saldoData`.

**`via`** — Mitjà de pagament del moviment: `Efectiu`, `01 Banc`, `02 Banc`, `TPV`, `Virtual`, `app`, o el `codi` de qualsevol banc donat d'alta.

**`origen`** — Com es va crear: `Manual`, `CSV`, `App`.

**`conciliacio`** — Estat de conciliació bancària: `pendent`, `conciliat`, `no_aplica`.

**`dadesCarregades`** — [NOU v4.0.43] Booleà global. Fals fins que `loadFromSheets()` acaba bé almenys una vegada. `save()` es nega a escriure mentre siga fals.

**`_desantAraMateix`** — [NOU v4.0.44] Comptador d'escriptures en curs. Mentre siga > 0, `bgRefresh()` i el polling no recarreguen.

**`parseImport(txt)`** — [NOU v4.0.44] Converteix el text d'un camp d'import a número. Accepta `1.234,56` i `1234.56`. Torna `NaN` si no és vàlid.

**WS-BANK** — Mòdul d'importació de CSV bancaris. Completat.

**WS-CONCILIACIÓ** — Mòdul de conciliació en construcció. 12 casos definits (D1–D5, I1–I3, P1–P4).

**Regles CSV** — Classificació automàtica per a importació CSV. Pestanya `13 Regles CSV`.

**Pressupost** — Planificació per àrea/delegació. `pres_plans`, `pres_config`, `pres_historial`.

**Rol d'usuari** — Rols reals al codi: `president`, `treasury`, `area`, `delegat`, `board`, `noauth`.

**`fontImport`** — Origen específic: `tancament`, `retirada_caixa`, `fallesapp_*`, `xls_[bancId]`.

**`bankHash`** — Hash per detectar duplicats en importació CSV.

**Directiva** — Mapeja usuaris a àrees/delegacions. Pestanya `09 Usuaris Assignacions`. `getMyArees()` i `getMyDelegacions()` la consulten.

---

### Established Facts

- **Versió en producció actual**: v4.0.76 (BUILD_VERSION `4076`) [TIME-SENSITIVE: 2026-10-13]
- **La caducitat del token de Google no tanca la sessió** [v4.0.47–48, D-020]:
  - Apareix un bàner i els guardats esperen el token nou.
  - `save()`/`writeTab()` esperen **abans** de fer la còpia de `DB`.
  - Mai es revoca el consentiment de Google.
- **Migració a Supabase planificada** (D-021, `PLA_MIGRACIO_SUPABASE.md`):
  - Entrada per email amb codi, sense Google.
  - El hosting continua a GitHub Pages.
  - Propera fase: F0.
- Un sol fitxer `index.html` de ~9.400 línies. Sense bundler ni framework.
- Google Sheets és l'única base de dades. No hi ha backend propi.
- **`readTab()` propaga els errors** [v4.0.42]. Abans tornava `[]` i convertia un tall de xarxa en pèrdua de dades.
- **El swap atòmic està fora de qualsevol `if`** [v4.0.42]. Abans estava dins de `if(cfgExtRows.length>0)` i no s'executava si `00 Config` no tornava files.
- **`save()` propaga els errors** [v4.0.44]. Abans se'ls empassava i `saveWithToast` mostrava "Moviment registrat ✓" encara que el full haguera rebutjat l'escriptura.
- **Les despeses amb justificant es guarden al full ABANS de pujar la foto** [v4.0.44].
- **Els refrescos en segon pla s'esperen mentre hi ha una escriptura en curs** [v4.0.44].
- `showPage()` dispara `bgRefresh()` a cada canvi de pàgina (limitat a un cada 30 s). El polling és cada 30 s i el refresc automàtic cada 5 min.
- `sheetRangeUrl()` i `sheetRange()` s'han d'usar sempre per construir URLs de Sheets API.
- Les cometes tipogràfiques (U+2019) en strings JS causen `SyntaxError`. Usar `\'`.
- **`writeTab` escriu primer i neteja després** — no al revés. El risc real és que bolca `DB` sencer: si `DB` estiguera incomplet, truncaria la pestanya.
- `getMyArees()`/`getMyDelegacions()` tornen tot si el rol té `viewAll`; si no, consulten la Directiva.
- L'email `it.fallaportal@gmail.com` rep rol **`treasury`**, no `president`.
- Si `08 Usuaris` està buida, **qualsevol compte de Google que entre rep rol `president`** (bootstrap).
- El scope `drive.file` no permet accedir a carpetes compartides. Cal scope `drive`.
- No existeix entorn Dev separat. Les proves es fan en producció.
- La conciliació és control, no comptable: els moviments compten als informes independentment del seu estat.
- **Comptes bancaris** (a l'app, IBAN i via):
  - **01 Banc** Caixabank ES06 2100 1958 3602 0008 8726.
  - **02 Banc** Caixa Popular ES82 3159 0076 6426 7219 1729.
  - **03 Banc** Caixabank ES56 2100 7990 7413 0059 2938.
  - **TPV targetes** (tipus `tpv`) Caixabank ES60 2100 7990 7802 0033 2534: només comissions del TPV i traspassos
    propis; saldo 0. L'IBAN s'ha de tenir configurat al banc: si no, `processXLSBanc` assigna el fitxer al primer
    Caixabank que troba (va passar el 11/10/2026).
- **El saldo d'un banc/via és saldo inicial + ingressos − despeses de tots els moviments d'eixa via** (sense filtrar
  per origen). Per això un apunt pagat per Efectiu resta de la Caixa efectiu encara que els diners vinguen d'una
  retirada del banc: cal l'entrada equivalent (traspàs banc → caixa).
- **Model dels fons delegats** (D-022): el lliurament i la devolució no fan apunt; la despesa contra fons i
  l'avançament personal sí; el Reintegrament només puja el saldo del delegat. Els diners que ixen del banc cap a un
  delegat o la caixa (xec, transferència) s'apunten com a traspàs a Administració · Tresoreria (sortida del banc +
  entrada a l'efectiu), mai com a despesa. Els diners que els delegats tenen a les mans compten dins la Caixa efectiu.
- **Convenció dels traspassos entre comptes**: els dos costats s'apunten a Administració i Secretaria · Tresoreria
  (`TRASPASO PROPIO`), de manera que el resultat per àrea és zero.
- Un xec de l'extracte (`CARG.CHEQUE nnnnnn`) pot ser una retirada d'efectiu, diners per a un delegat o un pagament
  directe: l'extracte no ho diu i cal preguntar-ho als tresorers. Importats sense revisar compten com a despesa.
- **Els apunts manuals de banc no es concilien sols amb l'extracte**: en importar-lo, apareixen com a "possibles
  duplicats" (mateixa data, import i sentit, concepte diferent) i s'han de deixar desmarcats.
- **Resultat de l'exercici** (reserves gastades): és la variació de la suma de tots els saldos (a 13/10/2026:
  −40.200,46 €) i només és fiable quan els saldos de tots els comptes estan confirmats.
- **L'any fiscal actiu és global**: l'escriu qualsevol admin a `00 Config` i tots els usuaris el prenen al refresc.
- **`bankHash`** = id del banc | data DD/MM/AAAA | import abs amb 2 decimals | concepte normalitzat. No inclou el
  sentit ni cap ordinal: dues línies idèntiques del mateix dia tenen el mateix hash (no pot ser UNIQUE).
- **Falles.app** (sense decisió escrita; reconstruït el 2026-10-13): les **recàrregues** (efectiu i TPV) i les
  devolucions són apunts reals; els **consums per event** es pugen amb `via:'app'` només per atribuir ingressos als
  events (r3) i no entren a Dashboard, Resultats ni Flux (ja van entrar com a recàrrega); la **bonificació** dels
  moneders és una despesa `via:'Virtual'` que sí compta.
- **Recàrregues TPV de falles.app**: la plataforma les liquida al 01 Banc agrupades i entren per l'extracte com a
  "Ingrés APP". Des de la v4.0.67 la importació de falles.app **no** les crea (abans es comptaven dues vegades: 117
  apunts, 2.836,50 € al 25/26, A-27). Les d'**efectiu** sí que s'importen (ingrés a la Caixa efectiu per dia).
- Emilio vol **quadrar el que diu falles.app amb el que entra a l'efectiu i als bancs** (requisit del model nou).
- **Tancament de caixa**: el TPV només es desa a `tancaments.tpv`; els moviments que es generen són l'"Efectiu net"
  i els "Pagaments". Els apunts d'event de `fons` tenen `delegId:'_event'`; els tancaments "sense event" tenen un
  `eventId` sintètic `_se_…`.
- **Tancament de caixa (des de la v4.0.73)**: l'efectiu es compta **al final, després dels pagaments** fets amb diners de
  la caixa. Moviments: ingrés "Vendes efectiu" = efectiu final + pagaments − canvi; despesa "Pagaments"; si l'efectiu
  final + pagaments no arriba al canvi, despesa "Desquadrament caixa". Les retirades ja són ingressos a part. El canvi
  no és moviment (torna a la caixa de la falla). `tancaments.efectiu` = efectiu abans de pagar (final + pagaments).
- **TPV de les caixes d'event**: les vendes amb targeta arriben al 01 Banc per l'extracte com a "ON 367893310 ddmm"
  (número de comerç del TPV; ddmm = dia de la venda). Per això el tancament no en crea moviment (A-23). Eixos apunts es
  classifiquen a 01 Tresoreria sense event.
- **Exercici tancat** (des de la v4.0.74, D-034): no accepta canvis de moviments, fons, caixes ni importacions; President
  i Tresoreria poden fer-ho com a excepció confirmant-ho. El pressupost no hi entra.
- **Any actiu**: global; és el control de Tresoreria sobre on es fan els moviments. Només el canvien President i
  Tresoreria, amb avís que afecta tothom. Al model nou passa a ser de consulta i per usuari (D-033).
- Un banc creat des de la UI té id amb `_` i pot deixar files contaminades a `15 Saldos` (A-03).
- Documents de la Fase 0: `INVENTARI_FUNCIONAL.md` (acceptació de la Fase 6) i `INFORME_ANOMALIES_F0.md`.
- Aprovat per Emilio: àrees TPV → 01 Tresoreria, WiFi COM.T → 07 Coordinació Tècnica, aigua → 01 Jurídica i
  Contractacions, remeses de quotes (`FATIR…`) → 01 Secretaria.

---

### Relationships & Dependencies

```
Usuari → Google OAuth → accessToken → Sheets API / Drive API

loadFromSheets() → initSheets() (crea pestanyes que falten)
                 → llegeix 20 pestanyes (readTab, propaga errors)
                 → migració conciliacio (DESPRÉS de carregar bancs)
                 → swap atòmic → DB → dadesCarregades = true

Registrar despesa SENSE justificant:
  push a DB → saveWithToast('moviments') → writeTab

Registrar despesa AMB justificant [v4.0.44]:
  push a DB → save('moviments')          ← la despesa ja és durable
            → _driveUploadTicket()        ← lent, però ja no hi ha risc
            → ticketUrl → save('moviments')

Mentre save() corre: _desantAraMateix > 0 → bgRefresh i polling s'esperen

Pestanyes Google Sheets:
  00 Config, 01 Moviments, 02 Fons, 03 Tancaments, 04 Arees, 05 Delegacions,
  06 Events, 07 Bancs, 08 Regles Import, 08 Usuaris, 09 Usuaris Assignacions,
  10/11/12 Pressupostos, 13 Regles CSV, 14 Rols, 15 Saldos, 16 Fapp Passiu,
  17 Moduls, 18 Audit Log
```

---

### External References

- **Producció**: `https://fallaportal.github.io/fallaportal/`
- **Sheets API v4**: `https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/`
- **Drive API v3**: `https://www.googleapis.com/drive/v3/files`
- **Admin email**: `it.fallaportal@gmail.com` (rol `treasury`)
