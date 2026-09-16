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

**Any Fiscal** — Període comptable format `XX/YY` (ex: `26/27`). D'abril a març.

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

- **Versió en producció actual**: v4.0.44 (BUILD_VERSION `4044`) [TIME-SENSITIVE: 2026-07-29]
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
