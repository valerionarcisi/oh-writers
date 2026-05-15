# Piano di Lavorazione — Audit & Redesign Proposal

Stato attuale: la pagina renderizza uno strip board funzionante (drag&drop, lock,
versione, segmented "Per giornata / Per scena / Tutti i giorni") ma è una vista
unica e povera di contesto produttivo. Lo schema DB regge solo il minimo
(`schedules`, `shooting_days`, `strips` con `bannerColor`, `estimatedHours`,
`dayType`). Mancano i campi e le viste richiesti da un AD reale.

## Findings — cosa non funziona oggi

1. **Una sola vista.** Manca calendario, manca timeline di produzione, manca il
   drill-down "giornata singola con call sheet preview".
2. **Strip card poco leggibili.** Il colore bandiera è ridotto a un border-left
   3px: in industry standard il colore è la firma visiva — deve riempire la
   colonna sinistra dello strip per ~6–10px e dominare lo scan verticale.
3. **Niente KPI giornaliero.** Non si vede a colpo d'occhio: ore stimate vs
   pianificate, n. scene, pagine totali, n. location, cast giorni, company move.
4. **Conflict detection assente.** Niente check su disponibilità cast
   (DOOD), location notturna mal piazzata, sforamento ore, magic-hour bruciato.
5. **Niente milestone / vincoli temporali.** Inizio riprese, move location,
   settimane stunt, wrap non hanno cittadinanza.
6. **Cesare AI muto.** Su Spec 12 l'AI dovrebbe essere "controllore garbato":
   suggerire ricompattamenti, swap di scene per stesso set, equilibrio carico.
7. **DOOD / call sheet inesistenti.** Nessuna preview del foglio convocazione.
8. **Mancano campi DB**: location, cast richiesto per strip, dipartimenti
   richiesti, alba/tramonto/magic hour, distanza base, permessi, meteo. Sono
   tutti derivabili (scene → location → cast) ma vanno esposti nelle view.

## Cosa funziona

- `Viewbar` mono + `SegmentedControl` sono coerenti col DS.
- Drag&drop e lock per-strip funzionano.
- Eyebrow row "PIANO DI RIPRESA · N GIORNATE" è il pattern giusto.
- `VersionTrigger` pill mono è già in stile.

## Proposta — 4 viste, una shell

| Vista | File mockup | Quando si usa |
| --- | --- | --- |
| **A · Strip Board** | `schedule-redesign-a-stripboard.html` | Pianificazione iniziale, swap rapidi, riepilogo scene per giornata |
| **B · Calendario** | `schedule-redesign-b-calendar.html` | Lettura "produttore": mese, weekend, festività, riposi, move |
| **C · Timeline** | `schedule-redesign-c-timeline.html` | Vista Gantt per location: blocchi continuativi, milestone, KPI ore |
| **D · Giornata** | `schedule-redesign-d-day-drilldown.html` | Drill-down: call sheet preview, cast, location, reparti, sole/meteo |

`SegmentedControl` esistente passa da 3 a 4 opzioni: `Strip · Calendario · Timeline · Giornata`.
Versione "Per scena / Tutti i giorni" diventa un filter secondario nella viewbar.

## Dati / campi nuovi necessari

- `strips.requiredCastIds: uuid[]` (derivato da scene → personaggi).
- `strips.requiredDepartmentIds: text[]` (camera, luci, suono, fx, costumi…).
- `shooting_days.crewCallTime / shootStartTime / wrapTime: time`.
- `shooting_days.locationId: uuid` (FK location primaria) + `secondaryLocations`.
- `shooting_days.weather / sunrise / sunset / magicHourStart / magicHourEnd` (cached da API meteo/astro su `date+location`).
- `cast_availability(castId, startDate, endDate, type)` per il conflict check.
- `schedule_milestones(scheduleId, date, kind, label)` (start, wrap, move, stunt week).
- `dayType` esteso con `prep`, `travel`, `rest`, `shoot`, `holiday`.

## Cesare AI — 3 mosse concrete

1. **Conflict resolver.** "L'attrice Marta non è disponibile il 4/6 ma SC.8
   la richiede: posso spostarla al giorno 04 dove il cast è già convocato sulla
   stessa location." → action Applica/Ignora inline.
2. **Location consolidator.** "SC. 14 (giorno 2) e SC. 42 (giorno 9) usano
   entrambe la cucina della cascina. Accorpandole al giorno 2 risparmi 1
   company move (~4h) e una giornata di base camp." → suggerisce swap.
3. **Magic-hour planner.** "SC. 19 e SC. 36 sono entrambe annotate
   'tramonto/magic hour'. Solo una può stare nella finestra 20:30→21:10 del
   giorno 03; sposto SC. 36 al giorno 12 sul lago, stesso intent narrativo,
   finestra disponibile." → fa preview prima di applicare.

Pattern UI: card laterale (vista A/D) o banner full-width (vista C), mai chat;
sempre due azioni — `Applica` (mono, dark) e `Ignora` (mono, ghost).

## Step incrementali consigliati

1. Aggiungere KPI strip e color band a sinistra dello strip card senza
   toccare lo schema (deriva tutto da scene+strip già presenti).
2. Aggiungere `SegmentedControl` con 4 viste; vista A rimane il default.
3. Implementare vista D (Giornata) come prima estensione: richiede solo cast+
   location dalla scene, no nuovi schemi DB obbligatori.
4. Schema additions in una sola migrazione: `shooting_days` time/location,
   `schedule_milestones`, `cast_availability`.
5. Vista C (Timeline) e vista B (Calendario) sopra lo schema esteso.
6. Cesare conflict resolver come server fn `analyzeSchedule(projectId)` →
   suggestions visualizzate inline.
