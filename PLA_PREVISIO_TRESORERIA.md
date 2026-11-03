# Pla — Previsió de tresoreria i capacitat de despesa (WS-PREVISIO)
## Redactat: 2026-11-03 · Estat: proposta, pendent d'aprovació d'Emilio · Comença després del tall del 9/11/2026

---

## 1. Objectiu

Que l'app responga «puc gastar X € el dia D?» (exemples d'Emilio: una plataforma nova de 2.700 €, ampliar la carpa per
12.000 €) amb dues comprovacions:

1. **Liquiditat**: pagant X el dia D, el saldo previst no baixa mai del mínim (passiu de falles.app + reserva mínima)
   fins al final de l'horitzó. El que compta és el **punt mínim** de la previsió, no el saldo d'avui.
2. **Sostenibilitat**: si la despesa es repeteix cada any, el **resultat ordinari** previst (ingressos ordinaris − despeses
   fixes i variables) continua sent ≥ 0. Una inversió d'una sola vegada ix de les reserves i no ha de passar esta prova.

## 2. Punt de partida (fets, 2026-11-03)

- El saldo dels comptes no són diners lliures: el **passiu de falles.app** és de 26.000,20 € (informe de saldos del 3/11),
  diners dels fallers carregats als moneders.
- **Resultat de l'exercici 26/27 a 13/10/2026: −40.200,46 €** (variació de la suma de saldos). Sense previsió d'ingressos
  fins al 31/03 no es pot saber si és estacional o estructural.
- El **pressupost només té despeses** (`pressupost_linies`: delegació, event, concepte, import; tipus `event`/`concepte`/`varis`)
  i cap data. No hi ha ingressos pressupostats ni calendari de pagaments.
- L'app només veu el que **ja s'ha pagat**: no hi ha registre de contractes signats pendents de pagar.
- Història dins l'app: **un sol exercici complet (25/26)** i el 26/27 en curs. El 25/26 es va carregar en bloc el 25/05/2026
  (A-15) i té peculiaritats conegudes: xecs importats sense revisar que compten com a despesa, apunts imputats a l'altre
  exercici (A-10), Efectiu sense saldo inicial (A-28).
- El **Flux** té una llista fixa de comptes (Efectiu, 01 Banc, 02 Banc, TPV): el 03 Banc entra al total però no té targeta.
- Els extractes de Caixabank i Caixa Popular porten una **columna de saldo** (`processXLSBanc`); avui l'importador no la desa.
- No hi ha cens a l'app: 762 fallers en actiu segons falles.app (3/11).

## 3. Respostes d'Emilio (3/11) i proposta per a cadascuna

| # | Peça | Emilio | Proposta |
|---|---|---|---|
| 1 | Diners lliures | Es pot tindre | Fase 1 |
| 2 | Compromisos | Base: despeses de l'any passat? | **Sí per al pressupost i el calendari, no per als compromisos.** El real del 25/26 proposa les línies de despesa i el patró mensual de cada delegació. Els compromisos són només els contractes signats (monument, música, pirotècnia, lloguers, carpa…): poques línies, imports grans i dates concretes que l'any passat no pot endevinar |
| 3 | Previsió | Es pot muntar si es fa el 2 | Sí, amb el 2 i el 4. Fase 3 |
| 4 | Ingressos | Quotes, loteria i subvencions se saben; events varien, però es poden mirar anys anteriors | Línies d'ingrés amb mes previst per a quotes, loteria i subvencions. Events: el real de l'any anterior (els anys d'abans de l'app, consultats a mà a la Fase 0) per un **factor de prudència** |
| 5 | Ordinari i extraordinari | Lloguers, llum, aigua… | Cada delegació té una naturalesa per defecte (`fixa`, `variable`, `inversio`); una línia de pressupost o un moviment la poden canviar |

**Principi de prudència**: els ingressos incerts es preveuen a la baixa i les despeses al 100 %.

## 4. Conceptes i fórmules

**Diners lliures (a una data)**
```
  Saldo de tots els comptes (bancs + Efectiu; inclou els diners en mans dels delegats i el canvi de les caixes obertes, D-022)
− Passiu de falles.app (últim registre)
− Compromisos pendents (terminis no pagats)
− Reserva mínima
= Diners lliures
```
Al costat, els controls de fiabilitat: per compte, la data de l'últim extracte importat i la diferència entre el saldo
de l'extracte i el de l'app a eixa data; el net dels traspassos (ha de ser 0); l'antiguitat del passiu (avís si fa més
de 30 dies).

**Previsió mensual (fins al 31/03; a la Fase 4, 12 mesos)**
```
saldo(m) = saldo(m−1) + ingressos previstos(m) − pagaments previstos(m)

ingressos previstos(m) = línies d'ingrés amb calendari, menys el que ja s'ha cobrat
                       + events del mes: real de l'any anterior × factor de prudència
pagaments previstos(m) = terminis de compromisos amb data al mes
                       + per a cada línia de despesa: (pressupost − executat − compromisos pendents vinculats),
                         repartit pel calendari de la línia o, si no en té, pel patró mensual de la delegació l'any anterior
marge(m)               = saldo(m) − passiu de falles.app − reserva mínima
punt mínim             = el marge més baix i el mes on cau
```
Una línia mai es compta dues vegades: el que ja s'ha pagat i el que està compromés es resten de la línia.

**Resultat ordinari** = ingressos ordinaris − despeses `fixa` − despeses `variable`. Les `inversio` van a part, contra
reserves. Es mostra per exercici: real (25/26), previst (26/27) i, a la Fase 4, el següent.

**Regla de decisió (simulador)**
- Despesa d'una vegada X el dia D: es torna a calcular la previsió amb X a D. Si el punt mínim continua ≥ 0, sí. Si no,
  quant falta i a partir de quin mes seria possible.
- Despesa recurrent X/any: a més, el resultat ordinari previst amb X ha de continuar ≥ 0 enguany i l'any següent.
- Sempre: l'import per faller (X / fallers en actiu). Amb 762: carpa ≈ 15,75 €, plataforma ≈ 3,54 € per faller i any.

## 5. Fases

### Fase 0 — Dades i decisions (sense codi; pot anar durant l'estabilització del tall)
1. **Claude**: perfil del 25/26 com a base. Ingressos i despeses per delegació i mes; apunts que distorsionen el patró
   (xecs sense revisar, inversions puntuals, apunts sense data, imputacions creuades). Resultat: patró mensual per
   delegació i llista d'apunts a reclassificar.
2. **Claude proposa, Emilio i la junta decideixen**: naturalesa de cada delegació (`fixa`/`variable`/`inversio`).
3. **Tresoreria**: compromisos signats del 26/27 (proveïdor, import, terminis, què s'ha pagat ja).
4. **Tresoreria**: ingressos coneguts del 26/27: quotes (import i calendari de remeses), loteria, subvencions (import i mes).
5. **Junta**: reserva mínima (§8).
6. **Emilio**: anys anteriors a l'app (Excel, llibres): ingressos i despeses per event, per fixar l'estimació de cada
   event. No s'importen a l'app.
7. **Claude**: full manual amb diners lliures i previsió fins al 31/03 amb les dades de 1–6. Valida les fórmules abans de
   programar-les i ja respon les preguntes de la carpa i la plataforma.

**Fet quan**: Emilio ha revisat el full manual i les decisions de §8 estan preses. **Sessions**: 1 (més el temps de la
junta). **Model**: Opus 5.5 · high.

### Fase 1 — Compromisos i diners lliures
- Esquema: `compromisos`, `compromis_terminis`, `extractes_saldos`, paràmetres a `config`; mòdul `compromisos` a la matriu.
- Pantalla **Compromisos** (Tresoreria): alta amb terminis; en registrar o importar un pagament, vincular-lo al termini
  (suggeriment per import i proveïdor). Un termini amb moviment està pagat.
- Importació d'extractes: desar el saldo i la data de l'última línia de cada fitxer.
- Targeta **Diners lliures** al Dashboard, amb el desglossament i els controls de fiabilitat (§4).
- Flux: tots els comptes donats d'alta (fora la llista fixa).

**Fet quan**: la xifra coincideix amb el full manual de la Fase 0; vincular un pagament baixa els compromisos pendents;
tests de RLS (primer el que demostra el forat), `supabase_escriptura.mjs --accions` amb escenaris nous i roundtrip en
verd; provat al navegador. **Sessions**: 2. **Model**: Opus 5.5 (esquema i RLS) + Sonnet 5.5 (pantalles), high.

### Fase 2 — Pressupost complet
- `pressupost_linies.sentit` (`ingres`/`despesa`, entra a la clau única), `naturalesa` a `delegacions`, `pressupost_linies`
  i `moviments` (les dues últimes opcionals: hereten de la delegació), taula `pressupost_calendari`.
- Pressupostos: pestanya d'**Ingressos**; calendari opcional per línia; botó **«Proposar des del real de l'any anterior»**
  (línies amb el real per delegació i event, arrodonides a l'euro, amb les proteccions de la còpia de pressupost: mai sobre
  un pressupost bloquejat i avís si el destí ja té línies, A-11).
- Resultat previst de l'exercici; Estat de Resultats separa ordinari i inversions.

**Fet quan**: pressupost 26/27 amb ingressos introduït; Resultats separa ordinari i inversions; la proposta no
sobreescriu cap pressupost bloquejat; proves com a la Fase 1. **Sessions**: 2. **Model**: Sonnet 5.5 · high (Opus per a la
clau única i la migració de les línies existents).

### Fase 3 — Previsió de tresoreria
- Pantalla **Previsió** (mòdul `previsio`): taula i gràfic mensual fins al 31/03 (ingressos, pagaments, saldo previst i
  línia del mínim), punt mínim destacat i detall de cada mes (què entra i què ix).
- Càlcul al client, en una funció pura amb proves en Node sobre dades fixes (com la resta d'informes, sense SQL nou).
- Mesos passats: previst contra real.

**Fet quan**: amb les dades de la Fase 0, la previsió coincideix amb el full manual al cèntim. **Sessions**: 1–2.
**Model**: Opus 5.5 (càlcul) + Sonnet 5.5 (pantalla), high.

### Fase 4 — «Puc gastar-ho?» i resultat ordinari
- **Simulador**: import, data, una vegada o anual (quants anys), delegació. Resultat: semàfor, punt mínim nou i mes crític,
  efecte al resultat ordinari (enguany i el següent), import per faller. No desa res; botó «Convertir en compromís» si
  s'aprova.
- Històric de resultat ordinari i de reserves per exercici.
- Horitzó de 12 mesos: l'exercici següent amb el pressupost proposat des del real de l'actual.

**Fet quan**: els dos exemples (2.700 € anual i 12.000 € d'una vegada) donen el mateix resultat que el full manual.
**Sessions**: 1–2. **Model**: Sonnet 5.5 · high.

**Total**: 7–9 sessions més la Fase 0.

## 6. Model de dades (proposta; es concreta a cada fase)

| Taula / camp | Contingut |
|---|---|
| `compromisos` | `id`, `exercici_id`, `delegacio_id`, `event_id null`, `pressupost_linia_id null`, `proveidor`, `concepte`, `import numeric(12,2) > 0`, `data_signatura null`, `estat` (`viu`/`tancat`/`cancellat`), `notes`, autor i data |
| `compromis_terminis` | `id`, `compromis_id` (cascada), `data_prevista`, `import > 0`, `moviment_id null UNIQUE` (pagat = té moviment) |
| `extractes_saldos` | `compte_id`, `data`, `saldo`, operació d'importació |
| `pressupost_linies` | + `sentit` (`ingres`/`despesa`, per defecte `despesa`; entra a la clau única), + `naturalesa null` |
| `pressupost_calendari` | `linia_id`, `mes` (primer dia del mes), `import`; sense files = patró de l'any anterior |
| `delegacions` | + `naturalesa` (`fixa`/`variable`/`inversio`, per defecte `variable`) |
| `moviments` | + `naturalesa null` (excepció a la de la delegació) |
| `config` | `reserva_minima`, `factor_prudencia_events`, `fallers_actius`, `dies_avis_extracte` |
| Mòduls nous | `compromisos` (edició: President i Tresoreria), `previsio` (lectura: §8.4) |

Al client, cada taula nova necessita la seua clau a `DB` i entrar a `sbPestanyes()`, `sbTaules()`, `sbCanvis()` i
`sbAgrupaOperacions` (D-047, D-048, D-027). Les eines de càrrega i d'**export invers** (`tools/supabase_exporta_xlsx.mjs`)
han d'incloure-les: l'export és la còpia de seguretat i, sense elles, no les guardaria.

## 7. Com es treballa després del tall

- `main` és producció (Supabase a `app.fallaportal.es`). El treball va a una branca `previsio` i es fusiona a `main` en
  acabar i verificar cada fase.
- No hi ha entorn de proves (D-043): cada migració es prova en local amb PGlite (`tools/supabase_tests.mjs`) i s'aplica
  amb una còpia prèvia (`tools/supabase_exporta_xlsx.mjs`).
- No comença fins que s'acabe l'estabilització (Fase 8 del `PLA_MIGRACIO_SUPABASE.md`, dues setmanes). La Fase 0 no toca
  codi i pot anar abans.

**Calendari orientatiu** [Suposició: els pagaments grans de Falles es concentren entre gener i març]:

| Quan | Què |
|---|---|
| 9–22/11 | Tall i estabilització. Fase 0 en paral·lel |
| Setmana del 23/11 | Fase 1 |
| Desembre | Fases 2 i 3 |
| Gener | Fase 4 |

## 8. Decisions pendents (s'assumeix el valor recomanat si no es diu res)

1. **Reserva mínima**: la decideix la junta. Proposta: les despeses fixes de 6 mesos; la xifra ix de la Fase 0.
2. **Passiu de falles.app**: es resta sencer (recomanat, prudent), no només el cost del que es consumirà.
3. **Factor de prudència dels ingressos d'events**: 90 % del real de l'any anterior.
4. **Qui veu Previsió i simulador**: President i Tresoreria. Junta, a decidir (es canvia a la matriu sense codi).
5. **Fallers en actiu** per a l'import per faller: paràmetre manual (762 el 3/11), perquè el cens no és a l'app.
6. **Recàrregues de falles.app** a la previsió: com a ingrés dels events (consums de l'any anterior per event).
7. **Branca de treball** després del tall: `previsio`, fusionada a `main` fase a fase.

## 9. Riscos

- **Base d'un sol any**: el 25/26 és l'únic complet i es va carregar en bloc. La Fase 0 el revisa; des del 27/28 hi haurà
  dos exercicis complets.
- **Saldos desfasats** si no s'importen els extractes: el control de saldo de l'extracte ho fa visible.
- **Compromisos oblidats**: un contracte no introduït fa la previsió optimista. Revisar la llista a cada junta; en un
  pagament gran sense compromís vinculat, suggerir crear-lo.
- **Falsa precisió**: la previsió és una estimació. Sempre amb la data de les dades i el factor de prudència a la vista.
- **Còpia de seguretat**: taules noves fora de l'export invers no es guardarien (§6).

## 10. Seguiment

| Fase | Estat | Data | Notes |
|---|---|---|---|
| 0 Dades i decisions | Pendent | | |
| 1 Compromisos i diners lliures | Pendent | | |
| 2 Pressupost complet | Pendent | | |
| 3 Previsió | Pendent | | |
| 4 Simulador i resultat ordinari | Pendent | | |
