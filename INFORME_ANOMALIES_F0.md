# Informe d'anomalies i proteccions implícites — Fase 0
## Redactat: 2026-10-13 · Base: `index.html` v4.0.66 i export del full del 2026-10-13 · Estat: complet, pendent de revisió d'Emilio

Aquest document es llig sense context previ. Recull el que la lectura del codi ha trobat que **afecta la
migració a Supabase** (`PLA_MIGRACIO_SUPABASE.md`, Fase 0). No s'ha tocat cap línia de l'app.

Confiança: **[Segur]** llegit al codi; **[Probable]** deduït del codi però sense executar; **[A verificar]**
depén de les dades reals (el perfilat del §5 ho comprova).

Tractament proposat: **Corregir ara** (a l'app actual, abans de migrar), **Corregir en migrar**,
**Replicar** (la migració ha de conservar el comportament), **Descartar**, **Decidir** (decisió d'Emilio).

---

## 1. Anomalies que canvien l'esquema o la migració de dades

| # | Anomalia | Evidència | Impacte | Tractament |
|---|---|---|---|---|
| **A-01** | **"Tancar exercici" no fa res i potser ni es desa.** El diàleg diu que "no es podran afegir ni modificar moviments", però `estats_exercicis.tancat` només es llig a la pantalla d'Exercicis. A més, tancar (6800) i canviar la data d'obertura (6598) criden `save('config')`, que **no** escriu `00 Config` (on viu `estats_exercicis`). **[Segur]** | 6789–6800, 6593–6600; grep de `.tancat` | A Supabase caldrà decidir si un exercici tancat bloqueja l'escriptura. Si ara es perd en recarregar, les dades reals poden dir "obert" per a exercicis que Emilio creu tancats. | **Decidit (D-029)**: a Supabase l'exercici tancat bloqueja, amb excepcions amb motiu. |
| **A-02** | **L'any fiscal actiu és una dada global.** Canviar d'any (`canviarExercici`) escriu `anyFiscal` a `00 Config` i tots els usuaris el prenen al refresc següent. **[Segur]** | 1999–2020, 2964 | A Supabase no pot ser una preferència per usuari sense canviar el comportament. | **Replicar** (clau global a `config`). Decidir si més endavant ha de ser per usuari. |
| **A-03** | **`15 Saldos` pot tindre files amb `bancId` truncat i `anyFiscal` contaminat.** Un banc creat des de la UI té id `genId('b')` = `b1785…_ab12`; `save('saldos')` parteix la clau per `_`. En carregar es reconstrueix la mateixa clau, així que l'app no ho nota. **[Segur al codi / A verificar a les dades]** | 5968, 2634–2639, 2884 | La migració no pot fer una FK directa `bancId → bancs.id` per a eixes files. | **Corregir en migrar**: el script reconstrueix `bancId = clau.slice(0, clau.length - ('_' + anyFiscal_real).length)` amb la llista d'exercicis; el perfilat compta les files afectades. |
| **A-04** | **`bankHash` no és únic per disseny.** Ignora el sentit (ingrés/pagament) i no distingeix dues línies idèntiques del mateix dia (p. ex. dues comissions iguals). Hi ha hashos antics sense "Més dades" i moviments sense hash. El pla (§3) proposa "`bankHash` únic". **[Segur]** | 8309–8312, 8318–8339 | Un `UNIQUE` fallaria o, pitjor, es perdrien moviments legítims en migrar. | **Decidir a la Fase 1**: índex *no* únic, o únic només per `(bankHash, sentit, ordinal)`; el perfilat compta duplicats reals. |
| **A-05** | **Claus que no encaixen amb FK.** `tancaments.eventId` pot ser sintètic (`_se_<concepte>_<ddmmaaaa>`, "sense event") i `fons.delegId`/`delegEmail` valen `_event` als registres de caixa d'event. Un tancament és únic per `eventId`, sense any. **[Segur]** | 4421–4433, 4426 | `tancaments → events` i `fons → usuaris` no poden ser FK estrictes. | **Corregir en migrar**: taula `caixes_event` amb `event_id` nullable + camp de descripció; `fons.delegat_id` nullable i `tipus` que identifica els apunts d'event. |
| **A-06** | **Camps que el codi posa però no es desen** (no són a la capçalera): `assignatPer`, `origen` (fons), `notes`/`retirades` (tancaments), `exercici` (events), color d'àrea. Els **moviments de tancament i retirada no tenen** `origen`, `origenFons` ni `conciliacio` desats. **[Segur]** | 1527–1548 contra 4373, 4537, 4871, 4050 | Les dades reals no tenen eixos valors; no s'han d'inventar. | **Corregir en migrar** (valors per defecte explícits) i decidir si els camps nous mereixen columna. |
| **A-14** | **Esborrar no comprova referències.** Esborrar àrea, delegació, event, banc o usuari deixa moviments, pressupostos, fons i assignacions amb referències penjants. Els moviments guarden també `areaNom`/`delegacioNom`/`eventNom` desnormalitzats (poden haver quedat desfasats). `via` guarda el **codi** del banc, no l'id. **[Segur]** | 5690–5744, 5886, 5981, 8025 | Les FK de la Fase 1 fallaran amb dades reals orfes. | **Corregir en migrar**: informe d'orfes (§5) i decisió per cas (reassignar o conservar com a "històric"). |
| **A-15** | **Tres formats d'id de moviment**: `genId('m')` (`m<ms>_<4>`), `genId('m')+Math.random()` (acaba en `0.1234…`), i `'m'+Date.now()` sense sufix (tancament; el moviment de pagaments és `m<ms+1>`). **[Segur]** | 2508, 3989, 4537–4550 | Els ids es conserven (pla §4), però poden col·lidir si dues files comparteixen mil·lisegon, i alguns tenen punt. | **Replicar**: clau de text lliure. Perfilat: comptar duplicats. |
| **A-24** | **Esborrar un moviment amb avançament personal deixa el registre de fons.** Només s'esborra el `fons` si `origenFons==='fons_lliurats'`; amb `'avanc'` el `fons` queda apuntant a un `movimentId` que ja no existeix, i el saldo del delegat segueix baixant. **[Segur]** | 3535–3542 | Fons orfes a les dades i saldos de delegat incorrectes. | **Corregir ara** (és un bug de l'app) i **Corregir en migrar** (informe d'orfes). |

---

## 2. Anomalies de comportament que la migració ha de decidir

| # | Anomalia | Evidència | Tractament |
|---|---|---|---|
| **A-07** | `fons.registratPer` es desa amb el **nom** (`currentUser.name`) però es compara amb l'**email** per decidir qui pot esborrar-lo; i `events.resp` guarda un **nom** que es compara amb un email. Per a usuaris no administradors, la comparació mai coincideix. **[Segur]** (3863; 4151; 5778) | **Decidir**: en migrar, `registrat_per` serà `auth.uid`. Els registres antics es resolen per nom → usuari. |
| **A-08** | **El saldo de fons es calcula amb fórmules i filtres diferents**: capçalera d'administració sense filtre d'any; targetes amb any; vista d'àrea sense `regularitzacio`; vista de delegat amb lliuraments i devolucions de tots els anys i "gastat" extret de moviments; dashboard sense any. **[Segur]** (3738–3746, 3773–3781, 3791–3799, 3076–3081) | **Decidir** una única definició (Fase 6 compara xifres entre la vella i la nova: cal saber quina). Proposta: per any fiscal, amb `regularitzacio`, i el saldo dels anys anteriors com a arrossegament. |
| **A-09** | **`parseFloat` en comptes de `parseImport` en molts camps** (convenció tècnica). Efectes reals: la validació de justificant llig `99,99` com 99 i `1.234,56` com 1,234 (3 funcions); l'edició de moviment, el saldo de banc i la bonificació usen `parseFloat`; la importació CSV genèrica treu **tots** els punts (`12.5` → 125). **[Segur]** (7929, 7976, 3626, 5959, 7375, 9055) | **Corregir ara** (és el mateix patró d'incidents anteriors). A Supabase els camps seran `numeric` i l'entrada es parseja en un únic lloc. |
| **A-10** | **Dates i exercicis**: dates com a text `DD/MM/AAAA` (a moviments es normalitzen en carregar; a fons, tancaments i events no); l'extracte s'importa **a l'any actiu** encara que les dates siguen d'un altre; hi ha moviments sense `anyFiscal` que compten com "de l'any actiu" o "del 26/27"; el filtre de dates de r4 compara `DD/MM/AAAA` amb ISO i no funciona; events duplicats `year`/`anyFiscal`. **[Segur]** (8872, 3031, 6545, 9612, 5826) | **Decidit (D-029)**: `date`; l'exercici es calcula per la data; els que no casen migren com a excepcions; els 7 del 02 Banc es corregeixen a part. |
| **A-11** | **Pressupost**: `pres_config` és **una sola fila** i la UI no mira `any`, de manera que el bloqueig s'aplica a qualsevol any actiu i bloquejar un altre any el sobreescriu; copiar pressupost sobreescriu el pla destí sense respectar el bloqueig i arredoneix a euros (`Math.round`). **[Segur]** (4672, 6358, 6384) | **Corregir en migrar**: estat de bloqueig per any (una fila per any). Decidir el que cal fer amb la còpia (centims i bloqueig). |
| **A-12** | **Abast de dades diferent entre pantalles** (vegeu inventari §1.4). Resultats i Historial usen àrea; Flux usa només delegació; r3 usa delegació. **[Segur]** | **Replicar 1:1** (pla §2, decisió 6) i deixar anotat que una mateixa persona veu totals diferents segons la pantalla. Decidir si s'unifica després. |
| **A-13** | **Dashboard probablement falla per a rols sense `viewAll`**: `(DB.config.directiva||[]).find(...)` s'aplica a un **objecte** (`{any:[…]}`) i llança `TypeError`. **[Probable]** (3065) | **A verificar en execució** amb la skill `verify` (rol `area`/`delegat`). Si es confirma, corregir ara. |
| **A-18** | **Importació d'extractes**: les línies amb data no interpretable o import 0/no numèric s'**ometen en silenci**; si no es troba el banc per IBAN, usa el primer banc de tipus `bank` (va passar el 11/10); la importació CSV genèrica no té `bankHash` ni detecció de duplicats. **[Segur]** (8446–8514, 8402, 9039) | **Corregir ara** les omissions silencioses (recompte "N línies ometudes") i **Descartar** el CSV genèric si no s'usa (preguntar). |
| **A-19** | **Èxit mostrat abans de saber el resultat de l'escriptura** a totes les importacions de Falles.app, a l'extracte i a diversos esborrats (`save(...).catch(console.warn)`), i `deleteMoviment`/`deleteFons` llancen `save('fons')`/`save('moviments')` concurrents sense `await`. `writeTab` directe a `16 Fapp Passiu` i a la càrrega de regles per defecte es salta `dadesCarregades` i `_desantAraMateix`. **[Segur]** (7729, 8897, 3540, 7278, 2939) | **Descartar** en migrar (insert/update/delete per fila amb resposta real). No cal corregir abans. |
| **A-21** | **Informes**: `via:'app'` s'exclou de Dashboard, Resultats i Flux però no del Pressupost ni de r3; el detall del Flux i el filtre de r4 tenen les vies fixes (`Efectiu`, `01 Banc`, `02 Banc`, `TPV`), de manera que el 03 Banc i els bancs nous no hi surten; els CSV d'exportació inclouen tots els anys i porten el nom fix `2627`. **[Segur]** (5312, 9636, 5537) | **Replicar** l'exclusió de `via:'app'`; el detall per via s'ha de generar des de `bancs` (Fase 6 comprova xifres amb dades reals). |
| **A-22** | **El backup JSON d'exercici és incomplet**: `assignacions` sempre buit, sense `pres_config`/`pres_historial`/`regles`/`config`, tancaments sintètics perduts i moviments sense `anyFiscal` fora. **[Segur]** (8048–8076) | **Corregir en migrar**: l'export invers de la Fase 5 no pot basar-se en aquest backup. |
| **A-23** | **El TPV d'un tancament no genera cap moviment** (només es desa a `tancaments.tpv`). **[Segur]** (4511–4570). El Manual diu que el TPV es concilia amb l'extracte. | **Decidir amb Emilio/tresorers** si és intencionat. Afecta el càlcul de resultats per event. |
| **A-25** | **Eliminar exercici** deixa la directiva de l'any i `pres_config`/`pres_historial`, i mai esborra moviments sense `anyFiscal`. **[Segur]** (8138–8178) | **Corregir en migrar** (cascada explícita). |
| **A-26** | **Dades de llavor al codi**: si el full no té àrees ni usuaris, `DB.config` conserva 7 àrees, 29 delegacions, 14 events i 4 bancs de prova, i un `save('config')` els escriuria. **[Segur]** (1698–1759, 2893) | **Descartar** en migrar: no hi haurà llavor al client. |

---

## 3. Codi i pestanyes mortes (no migrar)
- Funcions: `auditLog` (1554), `tancarCaixa` (2996), `tancarEvent` (4572, còpia idèntica d'`executarTancament`),
  `renderPressupostos` (4657), `previewCSV`/`importarCSV` (5555–5567), `getDriveFolderFactures` (6883, sense ús).
- **Funcions definides dues vegades** (guanya la segona): `renderCSVPreview`, `initCSVBancSelector`,
  `cancelCSVImport`, `importarCSVZona`, `importarCSVZonaBtn` (8907–8985 mortes; actives 8991–9089).
- Pestanyes: `08 Regles Import` (substituïda per `13`), `17 Moduls` (`modulVis` viu a `00 Config`),
  `18 Audit Log` (res l'escriu).
- Fitxers: `index1.html`, `index2.html`, `index_2.html`, `dev.html` (pendent de confirmació, pla §9.7).

---

## 4. Proteccions implícites i què fer-ne a Supabase
Comportaments que protegeixen les dades sense que ningú els tinga com a "funcionalitat".

| Protecció | On | A Supabase |
|---|---|---|
| `dadesCarregades`: no es guarda res fins que una càrrega acaba bé | 2599, 2607 | **Innecessària** (no hi ha reescriptura de pestanyes). |
| Swap atòmic de `DB` | 2983–2991 | **Innecessària**. |
| `_desantAraMateix`: el refresc espera les escriptures | 2604, 2406 | **Innecessària**; Realtime no ha de sobreescriure l'edició en curs: **mantenir** el criteri a la UI. |
| `writeTab` escriu primer i neteja després | 2511–2520 | **Innecessària**. |
| `readTab` propaga errors | 2486 | **Innecessària**. |
| `save` propaga errors i no es mostra èxit abans d'hora | 2677–2686 | **Replicar** (patró de UI: l'èxit depén de la resposta). |
| Snapshot a `bgRefresh`/polling | 2411, 7467 | **Innecessària**. |
| Guarda-primer, puja-foto-després (D-014) | 3420–3446 | **Replicar** (insert del moviment i després pujada a Storage). |
| Protecció defensiva de `exercicis`/`drive_folders`/`anyFiscal` (`_lastGoodCfgExt`) | 2588–2594, 2652–2659 | **Innecessària** (cada clau és una fila). |
| Migració de `conciliacio` després de carregar bancs | 2975–2982 | **Replicar** com a valor per defecte calculat al servidor o al script (A-06). |
| Normalització d'`anyFiscal` d'events (`2026` → `26/27`) | 2898–2911 | **Replicar** al script de migració. |
| Confirmacions d'esborrat i avís per a fitxer de Drive | 3525, 3529 | **Replicar** (i afegir paperera, §6). |
| Control de duplicats en crear àrea/delegació/banc | 5675, 5724, 5957 | **Replicar** com a `UNIQUE`. |
| Un sol event "Per defecte" per any | 5864 | **Replicar** com a índex únic parcial. |
| `Varis` paraula reservada | 5015 | **Replicar** (CHECK o regla de negoci). |
| Només es tanquen caixes `obertes` | 4515, 4576 | **Replicar** (transició d'estat). |
| Rols base no esborrables; mínim 1 mòdul a la barra | 7228, 7074 | **Replicar**. |
| Email d'usuari immutable | 8000 | **Replicar**. |
| Backup automàtic abans d'eliminar un exercici | 8144 | **Replicar** com a export previ o paperera. |
| `calcConciliacio` | 3363 | **Replicar**. |
| El tancament de sessió esborra la caché local | 7404 | **Innecessària** (la caché desapareix, deute 1-bis). |

---

## 5. Perfil de les dades reals (export del 2026-10-13)
Script: `python -I tools/f0_perfil_dades.py <export.xlsx>`. L'informe complet (amb xifres) queda **fora del repo**,
al costat de l'export. Aquí només hi ha les conclusions; el repositori és públic.

**Volum**: 922 moviments (684 del 25/26, 238 del 26/27), 86 fons, 5 tancaments, 23 events, 7 àrees, 30 delegacions,
5 bancs, 16 usuaris, 62 assignacions, 11 línies de pressupost (només 26/27), 24 regles, 8 saldos inicials.
`11`/`12` Pressupostos i `16 Fapp Passiu` són buides (mai s'ha bloquejat un pressupost). Hi ha pestanyes antigues
(`15 Fapp Passiu`, `08 Regles Import`, `17 Moduls`, `18 Audit Log`).

| # | Resultat amb dades reals |
|---|---|
| A-01 | `25/26` consta **tancat** des del 17/06/2026 i es va desar bé. Cap moviment del 25/26 creat després del tancament. El risc de no desar-se queda latent; el de no bloquejar, confirmat al codi. |
| A-03 | **No passa a les dades**: el 03 Banc té un id sense `_` (`b1779146131300`). Queda com a risc latent per a bancs nous. |
| A-04 | **Confirmat**: 17 `bankHash` repetits en 43 moviments, tots legítims (p. ex. quatre traspassos de 25 € el mateix dia; un càrrec i la seua devolució de 12 € el mateix dia, 6 casos amb ingrés i pagament). `UNIQUE` impossible. |
| A-05 | **Confirmat**: 4 dels 5 tancaments són "sense event" (`_se_…`) i 5 moviments apunten a eixos ids. |
| A-07 | **Confirmat**: 62 de 86 registres de fons tenen un nom a `registratPer`. |
| A-10 | **Confirmat**: 1 moviment **sense data** (consums falles.app del 25/26, 6.928 €) i **9 moviments del 25/26 amb data del 26/27** (7 de l'extracte del 02 Banc d'abril de 2026 i 2 d'efectiu de maig de 2026); compten a l'exercici tancat. |
| A-15 | Cap id duplicat. Quatre formats; el 82 % (`m<ms><random>`, amb punt) ve de la càrrega massiva del 25/05/2026 (682 moviments del 25/26 creats en el mateix mil·lisegon). |
| A-23 | El TPV declarat als tancaments suma 1.407 € (un event) i no és a cap moviment. |
| A-24 | **Confirmat**: 4 avançaments d'un mateix delegat (205,82 € en total, 26/27) apunten a moviments esborrats. El seu saldo de fons està desquadrat en eixe import. |
| **A-27 (nou)** | **Confirmat [Segur]**: les **117 recàrregues TPV** que la importació de falles.app va posar al 01 Banc el 25/26 (2.836,50 €, origen `App`, `pendent`) **ja són a l'extracte** com a **25 apunts "Ingrés APP"** que sumen exactament 2.836,50 € (la plataforma les liquida agrupades). Estan **comptades dues vegades**: inflen els ingressos del 25/26 i el saldo final del 01 Banc 25/26 en 2.836,50 € (la diferència de 2.836,49 € amb el saldo inicial real del 26/27). Al 26/27 no n'hi ha. A més, `importarFappTrans` les tornaria a crear en la propera importació. |
| **A-28 (nou)** | L'Efectiu del 25/26 no té saldo inicial i acaba amb 149.774,20 € (gairebé només recàrregues de falles.app); el del 26/27 comença amb 17.856 € aproximats. **La continuïtat de saldos entre exercicis no és fiable per a l'efectiu**: la validació de la Fase 6 ha de comparar per exercici, no arrossegar saldos. |
| **A-29 (nou)** | El 01 Banc 26/27 a l'export dona **9.141,88 €**; `WORKSTREAM_STATUS` diu 9.391,88 € (250 € de diferència). Cal saber si l'export és d'abans o de després de l'última correcció. |
| **A-30 (nou)** | Un mateix delegat té registres de fons amb l'email en majúscules i en minúscules (l'informe r2 el mostra en dues files; la vista de delegat compara l'email exacte). Dos lliuraments del 25/26 tenen la data en ISO (`2026-04-25`). Al model nou els fons van per `delegat_id` i `date`. |
| **A-31 (nou)** | **Tancament de caixa**: els pagaments es fan amb diners de la caixa, però el formulari no deia si l'efectiu es comptava abans o després de pagar. Si era després, l'app restava els pagaments dues vegades (vendes registrades = efectiu − canvi, i a més la despesa). **Corregit a la v4.0.73** (efectiu final després de pagar; vendes = final + pagaments − canvi). Els 4 tancaments anteriors amb pagaments (9, 12, 120 i 792 €) depenen de com es van comptar: pendent de preguntar-ho. |
| Altres | 02 Banc sense IBAN a la configuració (risc A-18); el camp IBAN de l'Efectiu diu "Aproximat"; 1 moviment amb `areaNom` antic (sense accent); `modulVis` i `fappPassiu` buits (s'usen els valors per defecte); usuari de proves "Emilio Proves" (`area`); el compte `it.fallaportal` té fila amb rol `president` (la fila mana sobre el valor fix `treasury`). |

## 6. Requisit nou: registre d'activitat (Emilio, 2026-10-13)
"Un log de tot el que ha fet cadascú; ara no tenim res, si algú esborra alguna cosa, per exemple."
- Avui no hi ha cap registre (`auditLog` és mort, D-007; el "Log" de Configuració és local).
- Proposta per a la Fase 1 (decisió D-024): taula `audit_log` plena per **triggers** a totes les taules de
  dades (insert/update/delete), amb usuari (`auth.uid` + email), data i hora, taula, id de la fila, valors
  abans i després (`jsonb`); pantalla "Registre d'activitat" per a `president`\|`treasury` amb filtres per
  usuari, taula, acció i dates; els esborrats es poden **recuperar** des del registre; cap usuari pot
  modificar ni esborrar el registre.
- Mentrestant: Google Sheets → Fitxer → Historial de versions.

---

## 7. Decisions que necessiten Emilio (d'una en una)
1. ~~A-01~~: decidit a D-029 (model nou); a l'app actual, protecció provisional a la v4.0.74 (D-034).
2. ~~A-23~~: **no** (Emilio, 2026-10-13; confirmat a les dades): el TPV de la caixa arriba al 01 Banc per l'extracte com a
   "ON 367893310 ddmm" (Festa de Cloenda 2026: 40,50 + 1.366,50 = 1.407,00 €). Crear-ne moviment el duplicaria. Pendent de
   millora (després del tall): eixos apunts del banc queden a 01 Tresoreria sense event, i el resultat de l'event no els inclou.
3. ~~A-08~~: **decidit (D-032)**: per exercici amb arrossegament automàtic; s'aplica després del tall.
4. ~~A-02~~: **decidit (D-033)**: el selector és de consulta i per usuari; operar va per la data (D-029). Després del tall.
5. A-11: còpia de pressupost: centims i bloqueig.
6. A-18: es pot descartar la importació CSV genèrica?
7. Netejar `index1.html`, `index2.html`, `index_2.html`, `dev.html` (pla §9.7).
8. ~~A-27~~: **decidit i corregit a la v4.0.67** (Emilio, 2026-10-13): botó puntual per esborrar les 117 recàrregues i la
   importació ja no crea les TPV. Aplicat per Emilio el 2026-10-13; codi puntual eliminat a la v4.0.68.
9. ~~A-10~~: el registre de consums sense data passa al 31/03/2026 (Emilio, 2026-10-13; aplicat amb el botó puntual de la v4.0.71, eliminat a la v4.0.72). Els 9
   moviments amb data d'un altre exercici: D-029.
10. ~~A-24~~: eren 4 avançaments duplicats d'un delegat; esborrats amb el botó puntual de la v4.0.69 (aplicat per Emilio el
    2026-10-13) i causa corregida a la v4.0.70 (`deleteMoviment` esborra també l'avançament).
11. **Falles.app: comptar per caixa o per vendes?** Avui l'ingrés és la recàrrega (quan el faller paga) i els consums
    només són estadística, de manera que els Resultats no mostren vendes per event ni per àrea. Alternativa: la recàrrega és
    un deute amb els fallers (passiu del moneder) i l'ingrés és el consum. Canvi de comportament (D-025): s'aplicaria després
    del tall; el model (D-031) admet les dues. Al 25/26 les recàrregues (~152.000 €) i els consums (59.137 €) no lliguen i la
    pestanya de passiu és buida: cal revisar si els consums estan complets.
    **Estat (2026-10-13)**: Emilio ho vol pensar (la venda és important; els diners de les recàrregues serveixen per
    comprar el que després es ven; no es porten inventaris). No bloqueja la Fase 0 ni la 1: el model guarda recàrregues,
    consums i passiu per separat, i qualsevol de les dues lectures es pot calcular després sense perdre res.
