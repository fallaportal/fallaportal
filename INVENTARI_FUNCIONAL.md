# Inventari funcional — Falla Portal v4.0.66
## Redactat: 2026-10-13 · Origen: lectura sencera de `index.html` (9.786 línies) · Fase 0 de `PLA_MIGRACIO_SUPABASE.md`

Aquest document es llig sense context previ. És la **llista de proves d'acceptació de la Fase 6**
i la font de la Fase 1 (esquema i RLS) i la Fase 3 (capa de dades). Les línies citades són
d'`index.html` v4.0.66. Les incoherències trobades estan a `INFORME_ANOMALIES_F0.md`.

Legenda de permisos: **UI** vol dir que el control només existeix al navegador (avui qualsevol
usuari autenticat podria escriure al full igualment; la Fase 1 ho ha de traslladar a RLS).

---

## 1. Rols i permisos

### 1.1 Identitat
- Entrada amb Google. L'identificador de l'usuari és l'**email** (`08 Usuaris`, minúscules). Un email
  que no hi és rep `noauth` i veu la pantalla "No autoritzat" (2297).
- `it.fallaportal@gmail.com` és sempre `treasury`, encara que no estiga a `08 Usuaris` (2098, 2770).
- Si `08 Usuaris` està buida, el primer compte que entra és `president` (2101).
- L'email d'un usuari no es pot canviar un cop creat (8000). El `id` és `genId('u')`.

### 1.2 Rols i els seus sis permisos (pestanya `14 Rols`, valors per defecte a 1593)
| Rol | canRegister | canFons | canImport | canConfig | canUsers | viewAll |
|---|---|---|---|---|---|---|
| `president` | sí | sí | sí | sí | sí | sí |
| `treasury` | sí | sí | sí | sí | no | sí |
| `area` | sí | no | no | no | no | no |
| `delegat` | sí | no | no | no | no | no |
| `board` | no | no | no | no | no | sí |
| `noauth` | no | no | no | no | no | no |

- Es poden crear rols propis (`custom:true`) i editar-ne els permisos (7195–7234). Els rols base no
  es poden esborrar. Qualsevol rol, també `president` i `treasury`, té els permisos editables.
- `canRegister` només es llig per decidir quins mòduls es mostren per defecte; **no bloqueja
  l'escriptura** enlloc.

### 1.3 Comprovacions per nom de rol (literals, no per permís)
| On | Condició |
|---|---|
| Tots els mòduls visibles | `president` sempre (2219, 2250, 2255, 2281, 9101) |
| Editar àrea/delegació d'un moviment | `president`\|`treasury` (3597, 3696) |
| Esborrar/editar un moviment | `president`\|`treasury`\|`responsableEmail`==jo (3698) |
| Esborrar un registre de fons | `president`\|`treasury`\|`registratPer`==jo (3863, vegeu anomalia A-07) |
| Obrir caixa, afegir canvi | `canFons`\|`canConfig` (4098, 4135) |
| Bloquejar/desbloquejar pressupost | `canFons` (4674) |
| Nou exercici, eliminar exercici | `president`\|`treasury` (2023, 8081) |
| Pestanya Log de Configuració | `president`\|`treasury` (5583) |
| Pestanya Usuaris de Configuració | `canUsers` (5571) |
| Directiva: qui pot assignar | `president`\|`treasury`\|`area` (6612–6632) |
| Canviar d'any fiscal (global, amb avís) | `canConfig` (des de la v4.0.74; abans també `viewAll`, és a dir Junta) |
| Escriure en un exercici tancat | `president`\|`treasury` com a excepció confirmada; la resta, bloquejat (v4.0.74) |
| Vista de fons | `canFons`+`viewAll` / `area` / resta (3730, 3761, 3789) |
| Tancament de caixa de `delegat` | només events on és responsable o de la seua delegació (4149) |

### 1.4 Abast de dades (qui veu què)
- `viewAll` veu tot. Sense `viewAll`, `getMyArees()` i `getMyDelegacions()` surten de la directiva
  (`09 Usuaris Assignacions`) de l'**any fiscal actiu**: assignació d'àrea dona accés a totes les
  seues delegacions; assignació de delegació dona accés a la seua àrea (per a la llista d'àrees).
- **L'abast no és el mateix a totes les pantalles** (vegeu A-12):
  - Historial i Resultats: àrea pròpia (i delegació pròpia o sense delegació).
  - Flux: només delegació pròpia.
  - Dashboard "Últims moviments": només àrea pròpia.
  - Reports r1: delegacions pròpies o tancaments registrats per l'usuari. r2: només fons propis.
    r3: delegacions pròpies.
- Les dades arriben **senceres** al navegador de tothom; el filtre és visual.

### 1.5 Visibilitat de mòduls i reports
- `modulVis[rol][mòdul] = {desktop, barra, mes}` a `00 Config`. Màxim 4 mòduls a la barra inferior
  i com a mínim 1 per rol (excepte `president`). Valors per defecte a 1649.
- `reportVis[rol][r1..r4] = {visible}` a `00 Config`.

---

## 2. Pantalles (13) i mòduls

| Mòdul | Pàgina | Qui la veu per defecte | Escriu? |
|---|---|---|---|
| Dashboard | `page-dashboard` | tots | no |
| Nou moviment | `page-moviments` | `canRegister` | sí |
| Fons delegats | `page-lliurament` | `canFons` o `canRegister` | sí |
| Tancament de caixa | `page-tancament` | tots | sí |
| Pressupostos | `page-pressupostos` | tots | sí |
| Historial | `page-historial` | tots | sí (editar/esborrar) |
| Falles.app | `page-fallesapp` | `canImport` | sí |
| Importar CSV | `page-importacio` | `canImport` | sí |
| Estat de Resultats | `page-resultats` | tots | no |
| Flux d'Efectiu | `page-flux` | `viewAll` | no |
| Reports | `page-reports` | tots (segons `reportVis`) | r1 sí, r4 sí |
| Configuració | `page-configuracio` | `canConfig` | sí |
| Manual d'usuari | `page-manual` | tots | no |
| (Directiva) | `page-directiva` | des de Configuració | sí |

---

## 3. Funcionalitats per pantalla

### 3.1 Sessió i càrrega
- Entrada Google (One Tap + botó), token d'1 h, bàner de reautorització, sortida (7398).
- Càrrega inicial `loadFromSheets()` (2858): crea pestanyes que falten (`initSheets`), llig 20,
  fa el swap atòmic i posa `dadesCarregades=true`.
- Refresc: polling 30 s (7457), `bgRefresh` a cada canvi de pàgina (mínim 30 s entre refrescos),
  refresc automàtic 5 min, botó de refresc manual (7491).
- Caché local de `DB` a `localStorage` (1 h) (deute 1-bis).
- Selector d'any fiscal (barra lateral i mòbil). **L'any actiu és una dada global compartida** (A-02).

### 3.2 Dashboard (3029)
Mètriques d'ingressos, despeses, net i nombre de moviments de l'any (excloent `via:'app'`); targeta
de passiu falles.app; alertes (text fix); fons per delegat; 5 últims moviments; despesa per àrea.
(Possible error per a rols sense `viewAll`: A-13.)

### 3.3 Nou moviment (3302–3458)
- Camps: tipus (despesa/ingrés), data, import, via (Efectiu, TPV, 01 Banc, 02 Banc), àrea,
  delegació, event, concepte, establiment, notes, justificant (foto).
- Validacions: import > 0 (`parseImport`), delegació i concepte obligatoris, justificant segons
  mode (`mai`|`sempre`|`import` amb llindar) amb motiu d'excepció a Notes, i per als rols sense
  `viewAll` la data ha d'estar dins l'any fiscal.
- Despesa en **efectiu**: modal d'origen (Caixa de la Falla / Fons lliurats / Avançament personal).
  Fons lliurats i avançament creen a més un registre de `fons` (`gast_fons` | `avanc`) amb
  `movimentId`.
- Amb foto: primer `save('moviments')`, després pujada a Drive, després segon `save('moviments')`.
- Escriu: `moviments` (+ `fons` per `saveFons`/append).

### 3.4 Historial (3471–3720)
Filtres (cerca, àrea, delegació, tipus, via, responsable), ordenació, totals. Per fila: veure
justificant, editar, esborrar.
- **Editar** (3613): àrea i delegació (només `president`\|`treasury`), concepte, import. Si té fons
  associat, també n'actualitza l'import.
- **Esborrar** (3524): confirmació; opció d'esborrar el fitxer de Drive; si `origenFons==='fons_lliurats'`
  esborra també el `fons` associat.

### 3.5 Fons delegats (3728–4091, 7850–7911)
- Tipus de registre de `fons`: `lliurament`, `regularitzacio`, `gast_fons`, `devolucio`, `avanc`,
  `reintegrament`, `event_canvi`, `event_canvi_devolucio`.
- Saldo del delegat = lliuraments (+ regularitzacions) + reintegraments − gast_fons − devolucions
  − avançaments. Model comptable a D-022.
- Accions: **Nou lliurament** (origen Caixa / Tercer / Banc), **Devolució**, **Reintegrament**
  (origen Caixa / Banc), esborrar registre.
  - Origen *Tercer*: crea un moviment d'ingrés (`origenFons:'tercer'`).
  - Origen *Banc*: `crearTraspasBancCaixa` (3984): sortida del banc + entrada a Efectiu, a l'àrea
    `01` i delegació `0102`; si el moviment ja és a l'extracte, el reclassifica.
- Vistes: administració (`canFons`+`viewAll`), responsable d'àrea (delegats de les seues
  delegacions) i delegat (el seu saldo). Targeta plegable per delegat. Caixetes d'event obertes.

### 3.6 Tancament de caixa (4093–4652)
- **Obrir caixa** (`obrirEvent`, 4404): event de l'any (o "sense event" amb descripció i data) +
  canvi inicial > 0. Crea `fons` `event_canvi` (`delegId:'_event'`) i un `tancaments` en estat
  `obert`.
- **Afegir canvi** (`afegirCanviEvent`, 4452): nou `fons` `event_canvi`.
- **Retirada d'efectiu** (`retirarEfectiu`, 4359): moviment d'ingrés a Efectiu, `fontImport:'retirada_caixa'`.
- **Tancar** (`executarTancament`): efectiu **final** (després dels pagaments fets amb la caixa, des de la v4.0.73),
  TPV, pagaments, àrea/delegació, notes. Genera: ingrés "Vendes efectiu" = final + pagaments − canvi (o despesa
  "Desquadrament caixa" si és negatiu), despesa "Pagaments", `fons` `event_canvi_devolucio`, i passa el tancament a
  `tancat`. El TPV **no** genera moviment (arriba pel banc, A-23). `tancarEvent` (còpia morta) eliminada a la v4.0.73.
- **Reobrir** (`resetTancament`, 9265) i **Eliminar** (`eliminarEventObert` 4634, `eliminarTancament`
  9290): esborren els moviments `tancament`/`retirada_caixa` de l'event i els fons associats.
- Escriu: `tancaments`, `moviments`, `fons`.

### 3.7 Pressupostos (4659–5258)
- Línies per (any, delegació, event, concepte): *Import global d'event*, *Concepte* i la línia
  reservada **Varis** (residual automàtic = global − suma de conceptes; pot quedar negativa amb avís).
- Alta/edició/esborrat amb recàlcul de Varis, fusió de Varis sol en línia d'event, modals de
  duplicat i d'excés.
- Estat d'aprovació: **Bloquejar i aprovar** / **Desbloquejar** (motiu obligatori), amb historial.
- Vista pla vs executat (despesa real) per àrea i delegació, amb barres d'execució.
- Edició permesa si no està bloquejat i (`viewAll` o delegació pròpia) — només UI.
- Escriu: `pres_plans`, `pres_config`, `pres_historial`.

### 3.8 Falles.app (7235–7848)
Quatre zones d'importació de fitxers de la plataforma + bonificacions. Detall a la secció 4.3.

### 3.9 Importar extracte bancari (8264–8985)
Fitxers `.xls`/`.xlsx` de Caixabank i Caixa Popular (detecció per IBAN i capçalera) i CSV genèric
(`;`). Preview amb classificació de duplicats, regles de mapeig, excepcions, creació de regla des
d'una excepció. Detall a la secció 4.2.

### 3.10 Estat de Resultats i Flux d'Efectiu (5261–5322)
Resultats: ingressos i despeses per àrea i net. Flux: saldo inicial (suma dels saldos inicials de
tots els bancs per a l'any), cobraments, pagaments i detall per via (llista fixa: Efectiu, 01 Banc,
02 Banc, TPV). Exporten CSV de tots els anys (5537).

### 3.11 Reports (9095–9755)
- **r1 Tancaments de caixa**: per event, amb desviació; reobrir/eliminar; CSV.
- **r2 Fons lliurats**: per delegat i any; CSV.
- **r3 Resultat per event**: ingressos, despeses, pressupost, desviació, estat; CSV.
- **r4 Despeses sense justificant**: origen `Manual`, despesa, sense `ticketUrl`, any actiu; filtres;
  botó *Adjuntar* que puja el fitxer a Drive i fa `save('moviments')`; CSV.

### 3.12 Configuració (5570–7234, 8033–8230)
| Pestanya | Funcionalitat | Permís UI |
|---|---|---|
| Exercicis | Nou, editar, activar, tancar, reobrir, eliminar, backup JSON, copiar pressupost, gestionar i copiar directiva, data d'obertura | `canConfig` (nou/eliminar: `president`\|`treasury`) |
| Àrees | CRUD d'àrees i delegacions | `canConfig` |
| Events | CRUD, estat calculat, "Per defecte" únic per any, copiar a un altre exercici | `canConfig` |
| Bancs | CRUD de bancs/vies (`bank`\|`cash`\|`tpv`), IBAN, saldo inicial per any | `canConfig` |
| Mestre de Rols | Permisos per rol, rols propis | `canConfig` |
| Mòduls | Visibilitat per rol (escriptori, barra, "Més") | `canConfig` |
| Reports | Visibilitat per rol | `canConfig` |
| Regles CSV | CRUD de regles de mapeig, simulador, avisos | `canConfig` |
| Justificants | Mode d'obligatorietat, llindar, carpetes de Drive per any (tickets i factures) | `canConfig` |
| Usuaris | CRUD d'usuaris (nom, email, rol) | `canUsers` |
| Log | Log local d'`exercicis`/`drive_folders` (no és un registre d'activitat) | `president`\|`treasury` |

### 3.13 Directiva (6602–6787)
Assignació d'usuaris a àrees i delegacions per any fiscal (poden ser diversos responsables per
element). Copiar la directiva d'un any a un altre.

---

## 4. Camins d'escriptura

Recompte a v4.0.66: **66** crides `save('clau')`, 6 `saveWithToast(`, 6 `saveMultiWithToast(`,
3 `saveMoviment(`, 9 `saveFons(` i 11 `writeTab(TABS…` directes (comptant les de dins de `save`).
Mapa per entitat. `save('clau')` reescriu la pestanya sencera des de `DB`; `append` afegeix una fila.

### 4.1 Per entitat
| Entitat (pestanya) | Operacions i punt d'entrada | Mètode |
|---|---|---|
| Moviments (`01`) | Alta manual 3375; edició 3613; esborrat 3524; retirada de caixa 4359; tancament 4511 (+`4572` mort); eliminar caixa 4634/9290; reobrir 9265; reclassificar traspàs 3984; ingrés tercer 4039; Falles.app 7346, 7374, 7669, 7733, 7793; extracte 8857; CSV 9039; adjuntar justificant 9718; netejar exercici 8138 | `save('moviments')` (sencer) o `saveMoviment` (append, 3 llocs) |
| Fons (`02`) | Lliurament 4039; devolució 4076; reintegrament 7886; despesa amb fons 3375; esborrat 3906; canvi de caixa 4404/4452; devolució de canvi 4511; edició d'import 3613; esborrar exercici 8138 | `save('fons')` o `saveFons` (append, 9 llocs) |
| Tancaments (`03`) | Obrir 4404; afegir canvi 4452; tancar 4511; reobrir 9265; eliminar 4634/9290; antic `tancarCaixa` 2996 (mort) | `save('tancaments')` |
| Àrees, delegacions, events, bancs, usuaris, assignacions (`04`–`09`) | Qualsevol alta/edició/baixa de Configuració i Directiva, còpia d'events, còpia de directiva, eliminar exercici | `save('config')` = **6 `writeTab` seguits** |
| Saldos (`15`) | Alta/edició de banc 5952; nou exercici 2037; eliminar exercici | `save('saldos')` |
| Regles CSV (`13`) | Alta/edició/baixa 6453/6512; càrrega amb la pestanya buida 2939 | `save('regles')` / `writeTab` directe |
| Rols (`14`) | Permisos, alta, baixa de rols | `save('rols')` |
| Config extesa (`00`) | Exercicis, any actiu, estats, justificants, carpetes Drive, `modulVis`, `reportVis`, passiu | `save('config_ext')` |
| Pressupost plans/config/historial (`10`/`11`/`12`) | Línies, còpia d'exercici, bloqueig | `save('pres_plans')`, `save('pres_config')`, `save('pres_historial')` |
| Fapp passiu (`16`) | Registrar passiu 7269 | `writeTab` directe (sense `dadesCarregades`) |
| Justificants (Drive) | Pujada 2707, esborrat 2733 | API de Drive |

### 4.2 Importació bancària
1. Es llig el fitxer, es detecta IBAN, format i capçalera (8342).
2. Cada línia es classifica contra els moviments existents del mateix banc, data, import i sentit:
   `nou`, `possible` (concepte diferent) o `duplicat_segur` (hash igual).
3. Les regles de `13 Regles CSV` (per `font` = codi de banc o buit, `prioritat`, `patrons`,
   `movtype`, `activa`) assignen àrea, delegació i concepte; la resta va a "excepcions".
4. L'usuari marca què s'importa. Cada línia crea un moviment `origen:'CSV'`, `conciliacio:'conciliat'`,
   `fontImport:'xls_'+banc.id`, `bankHash`, **`anyFiscal` = any actiu** (no el de la data).
5. `bankHash` = `bancId|DD/MM/AAAA|import 2 decimals|concepte normalitzat`.

### 4.3 Falles.app
| Zona | Entrada | Resultat |
|---|---|---|
| 1 Transaccions (`Estado=Autorizado`) | Recàrregues d'efectiu, de TPV, devolucions | Ingrés per dia a via efectiu; ingrés individual a via de banc triada; despesa de devolucions. `fontImport:'fallesapp'`, `bankHash` |
| 2 Saldos | Fallers amb saldo | Passiu total de l'any a `16 Fapp Passiu` |
| 3 Tickets | Consums | Ingrés `via:'app'` per event segons dates (o event "Per defecte", o 04/0401) |
| 4 Entrades CSV (`Aprobada`\|`Consumida`) | Entrades | Ingrés `via:'app'` agrupat per event; data = avui |
| Bonificació | Import, data, àrea, delegació | Despesa `via:'Virtual'`, `fontImport:'fallesapp_bonif'` |

---

## 5. Regles de negoci que viuen al navegador (cal replicar-les o moure-les)
1. **Saldo d'un banc/via** = saldo inicial de l'any + ingressos − despeses de tots els moviments de la via.
2. **Saldo inicial d'un exercici nou** = saldo final de l'anterior per banc (2051–2073). Els moviments
   sense `anyFiscal` compten com del primer exercici.
3. **Saldo de fons d'un delegat** (fórmula de 3.5; **no és igual a totes les pantalles**, A-08).
4. **Varis** al pressupost (3.7).
5. **Conciliació** (`calcConciliacio`, 3363): Efectiu → `no_aplica`; `origen CSV` → `conciliat`; via d'un
   banc de tipus `bank` → `pendent`; resta → `no_aplica`. S'assigna a la càrrega si el camp està buit.
6. **Estat d'un tancament**: `obert` → `tancat`; canvi total = suma de fons `event_canvi` de l'event.
7. **Resultat net del tancament** = (efectiu − canvi) + retirades + TPV − pagaments.
8. **Traspàs banc → caixa** (D-022): dos moviments a 01/0102.
9. **Justificant obligatori** segons mode i llindar; en excepció, el motiu va a `ticketMotiu`.
10. **Un únic event "Per defecte"** per any (només client).
11. **Rang de dates**: els rols sense `viewAll` només poden registrar dins l'any fiscal.
12. **Duplicats d'importació** (hash i classificació, 4.2).
13. **Pressupost bloquejat** impedeix editar línies (UI).
14. **Rol de bootstrap** i administrador fix (1.1).
15. **Any actiu global** guardat a `00 Config`.

---

## 6. Valors i supòsits escrits al codi
- Àrea `01` i delegació `0102` (traspàs banc → caixa, bonificació, passiu), `0104` (regles per defecte),
  `04`/`0401` (tancament per defecte, consums sense event).
- Bancs `b1` i `b2` i vies `Efectiu`, `TPV`, `01 Banc`, `02 Banc` al formulari de nou moviment (3209–3231),
  al flux (5312) i a r4 (9636).
- Llista de 29 delegacions, 7 àrees i 14 events de **llavor** (1698–1753) que s'usa si el full està buit.
- Colors d'àrea per codi `01`–`07` (1589); el color escollit al modal no es desa.
- Any `26/27` com a valor per defecte de directiva (2123) i de comptatge d'exercici (6545).
- Carpetes de Drive per any (`tickets_<any>`, `factures_<any>`).
- Moviments `via:'app'` exclosos de Dashboard, Resultats i Flux.

---

## 7. Camps persistits per pestanya (capçaleres actuals)
Vegeu `TABS` (1527). Camps que el codi posa en memòria però **no es desen** perquè no són a la
capçalera: `assignatPer` (moviments), `origen` (fons), `notes` i `retirades` (tancaments), `exercici`
(events), color d'àrea, `responsable` d'àrees i delegacions (sempre buit; viu a la directiva).

---

## 8. Requisits afegits en revisar el pla
- **Registre d'activitat (Emilio, 2026-10-13)**: qui ha fet què i quan (p. ex. qui ha esborrat un
  moviment). Avui no existeix (`auditLog` és codi mort des de D-007). Vegeu D-024 i la Fase 1 del pla.
