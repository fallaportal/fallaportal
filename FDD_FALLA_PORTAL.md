# Functional Design Document — Falla Portal
## Generated: 2026-07-29 · Actualitzat: 2026-10-13 · v4.0.78

---

### Purpose & Scope

Falla Portal és una PWA de gestió financera per a una falla valenciana (~30 membres).
Centralitza el registre de despeses i ingressos, la gestió de fons lliurats a delegats,
el seguiment de pressupostos, la conciliació bancària i la generació d'informes.
No és comptabilitat professional. La seua fortalesa és la simplicitat i l'accés mòbil.

**Principi rector** (explicitat 2026-07-29): l'eina existeix per donar **certesa** sobre
les finances. Els usuaris no són experts. Qualsevol camí que puga generar dades
inconsistents sense que l'usuari se n'adone és un defecte de primer ordre, encara que
no siga un error tècnic.

---

### User Roles & Personas

| Rol (id al codi) | Descripció | Permisos clau |
|---|---|---|
| `president` | Accés total | Tot, inclosa gestió d'usuaris |
| `treasury` | Tresoreria | Tot el financer. `canUsers: false` |
| `area` | Cap d'àrea | Registrar moviments de la seua àrea |
| `delegat` | Responsable de delegació | Registrar, sol·licitar fons |
| `board` | Membre de junta | Visibilitat, sense edició |

**Notes importants**:
- L'email `it.fallaportal@gmail.com` rep rol **`treasury`**, no `president`.
- Si la pestanya `08 Usuaris` està buida, **el primer que entre rep `president`**
  (bootstrap). Val la pena saber que aquesta finestra existeix.

---

### Features & Functional Requirements

#### F-01: Registre de Moviments
**Description**: Formulari per registrar ingressos i despeses manuals amb justificant
fotogràfic opcional.
**Acceptance Criteria**:
1. La via de pagament determina `conciliacio` via `calcConciliacio()`
2. Els imports s'interpreten amb `parseImport()`: accepta `1.234,56` i `1234.56`
3. El modal de confirmació mostra l'import **ja interpretat** abans de guardar
4. **Amb justificant**: la despesa es guarda al full primer i la foto es puja després
5. El missatge final depén del resultat real de l'escriptura
**Status**: Implementat i verificat (v4.0.44)

**Missatges possibles en registrar amb justificant**:
| Situació | Al full | Missatge |
|---|---|---|
| Tot bé | Despesa amb justificant | "Despesa i justificant guardats ✓" |
| Drive falla | Despesa sense justificant | "La despesa SÍ que està guardada, però el justificant no... Edita la despesa per adjuntar-lo." |
| Full falla | Res | "No s'ha registrat la despesa... Comprova l'historial abans de tornar a introduir-la." |

---

#### F-02: Importació CSV Bancari (WS-BANK)
**Description**: Importació d'extractes bancaris **en Excel** (.xls/.xlsx; l'importador CSV genèric es va retirar a la
v4.0.77). Classificació automàtica per regles.
Detecció de duplicats per `bankHash`, tenint en compte el sentit (un ingrés no és duplicat d'un pagament).
**Preview** (v4.0.49–50): cada moviment dubtós és una fila clicable amb l'estat explícit "S'importarà" /
"S'ometrà" (marcat = s'importa) i botons "Importar tots" / "Ometre tots". Es mostra la columna "Més dades" /
"Mas Datos" del banc, detectada per nom de capçalera, perquè ajuda a decidir l'àrea.
**Regles** (v4.0.54): el patró suggerit no porta números; la modal mostra quants moviments casa la regla (fitxer
i historial); el concepte només es guarda si l'usuari el canvia; es pot limitar a pagaments o ingressos; una regla
nova passa per davant de la que ja casava; la llista mostra tots els bancs i avisa de regles amb patró curt, número
al concepte o patró repetit.
**Acceptance Criteria**: duplicats detectats; regles apliquen àrea/delegació;
els importats reben `origen:'CSV'` i `conciliacio:'conciliat'`. Un moviment manual de banc pendent d'extracte
apareix com a "possible duplicat" en importar-lo (cal desmarcar-lo).
**Status**: Implementat

---

#### F-03: Gestió de Fons Lliurats
**Description**: Cicle sol·licitud → aprovació → lliurament → justificació. Model comptable a D-022:
  - **Lliurament** i **devolució**: no fan apunt (els diners continuen sent de la caixa de la falla).
  - **Despesa contra fons** i **avançament personal** (el delegat paga de la seua butxaca): fan apunt d'efectiu;
    l'avançament deixa el saldo del delegat en negatiu.
  - Esborrar una despesa pagada amb fons lliurats o amb avançament esborra també el registre de fons (v4.0.70).
  - **Reintegrament** (la falla torna un avançament; botó visible a la targeta desplegada d'un delegat amb saldo
    negatiu): només puja el saldo, sense apunt.
  - **Origen "Banc"** (lliurament i reintegrament): els diners ixen del banc (xec o transferència) cap a un
    delegat o la caixa. S'apunta un traspàs banc → caixa a Administració · Tresoreria (sortida del banc + entrada a
    l'efectiu), sense despesa. Es pot triar un moviment ja importat de l'extracte perquè es reclassifique.
**Status**: Implementat

---

#### F-04: Tancament de Caixa
**Description**: Caixa d'event: obrir amb canvi, ampliar canvi, retirades d'efectiu i tancament. En tancar, l'efectiu es
compta **al final, després dels pagaments** fets amb la caixa (v4.0.73): ingrés "Vendes efectiu" = efectiu final +
pagaments − canvi, i despesa "Pagaments". El TPV no genera moviment (arriba al banc com a "ON <comerç> ddmm").
Moviments amb `fontImport:'tancament'`. Tots els camps d'import usen `parseImport()`.
**Status**: Implementat

---

#### F-05: Pressupostos
**Description**: Pressupost per àrea/delegació i any fiscal, amb % executat i historial. La còpia entre exercicis no
sobreescriu un pressupost bloquejat i avisa si el destí ja té línies (v4.0.75).
**Status**: Implementat

---

#### F-06: Conciliació Bancària (WS-CONCILIACIÓ)
**Description**: Creuament entre moviments bancaris manuals i línies del CSV importat.
**Acceptance Criteria**:
1. Camp `conciliacio` informat a tots els moviments ✓
2. Algorisme de matching configurable (`conciliacio_marge`) — pendent
3. Vista de conciliació — pendent
4. Matching manual per als casos no automàtics — pendent
5. Els 12 casos D1–D5, I1–I3, P1–P4 — pendents
**Status**: Fonaments completats i verificats. Matching i vista pendents.

---

#### F-07: Informes
**Description**: Balanç, despesa per àrea, ingressos per font, evolució temporal.
Inclou l'informe de **despeses sense justificant**, que és la xarxa de seguretat quan
la pujada d'un justificant falla.
**Status**: R1–R4 implementats. R5–R8 pendents.

---

#### F-08: Integració Falles.app
**Description**: Quatre zones: transaccions (recàrregues d'efectiu agrupades per dia i devolucions; les recàrregues
TPV **no** s'importen des de la v4.0.67 perquè arriben per l'extracte com a "Ingrés APP"), saldos (passiu dels moneders),
tickets (consums per event, `via:'app'`, només estadístics) i entrades. Bonificacions com a despesa `Virtual`.
**Status**: Implementat

---

#### F-09: Configuració
**Description**: Bancs, àrees, delegacions, events, usuaris, regles CSV, justificants,
carpetes Drive.
**Exercicis** (v4.0.74): l'any actiu és global i només el canvien President i Tresoreria, amb avís que afecta tothom.
Un exercici tancat no accepta canvis de moviments, fons, caixes ni importacions; President i Tresoreria poden fer-ho
com a excepció confirmant-ho.
**Status**: Implementat

---

### User Flows

#### Registrar una despesa amb justificant (delegat)
1. Accedeix a "Registrar", tria Despesa
2. Tria via de pagament, àrea, delegació, event
3. Omple import, concepte, establiment, notes
4. Adjunta la foto del rebut
5. Prem "Registrar moviment" → modal de confirmació amb l'import interpretat
6. Confirma → modal "Origen del pagament" (Caixa de la Falla / Avançament personal)
7. **La despesa es guarda al full** → "Despesa registrada. Pujant el justificant..."
8. La foto puja a Drive → "Despesa i justificant guardats ✓"

Si el pas 8 falla, la despesa queda guardada sense justificant i l'usuari ho sap.

#### Importar CSV bancari
1. Tresor va a "Importació CSV" i arrossega l'extracte en Excel (el banc es detecta per l'IBAN)
2. El sistema processa, aplica regles, detecta duplicats
3. Revisa les excepcions i importa

---

### UI / UX Notes

- Idioma de la interfície: Valencià
- Els camps d'import mostren `0,00` com a text guia, però **accepten punt decimal**
- El modal de confirmació sempre mostra l'import ja interpretat: és el parapet contra
  una interpretació inesperada
- Toast notifications per a confirmació. **Un toast d'èxit només apareix si
  l'escriptura al full ha anat bé.**
- Mode offline limitat: no pot llegir/escriure sense connexió a Google Sheets
- PWA: actualment **no instal·lable per a usuaris nous** (vegeu D-012)

---

### Out of Scope

- Comptabilitat professional
- Facturació, pagaments en línia
- Multitenancy
- App nativa iOS/Android
- **Validació semàntica de les dades introduïdes**: cap regla impedeix conceptes sense
  sentit o duplicats introduïts a consciència. Identificat com a treball futur.
