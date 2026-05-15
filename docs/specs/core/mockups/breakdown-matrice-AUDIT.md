# Breakdown · Matrice — Audit

## Findings (versione attuale)

`BreakdownMatrix.tsx` usa `MatrixGrid` con righe = gruppi categoria + elementi, colonne = scene. È funzionante ma minimale:

- **Orientamento invertito** rispetto allo standard di settore (Movie Magic, Gorilla, StudioBinder): nel software professionale le **righe sono scene** e le **colonne sono elementi**, perché la scena è l'unità che il regista/AD percorre. La versione attuale fa il contrario.
- **Header colonna povero**: solo `fountainNumber` + 8 caratteri di location. Nessun TOD, nessun colore categoria.
- **Nessun raggruppamento visivo delle colonne** per categoria (banda colore in alto).
- **Cella binaria**: `·` / `✓` / `qty`. Manca segnalazione `pending` e `stale` a livello cella — informazione presente nei dati ma non resa.
- **Heatmap globale**: un solo toggle, normalizzato sul max globale → poco utile quando un solo elemento (es. JOHN, 22 scene) appiattisce tutto il resto.
- **No totali di riga / di colonna** a colpo d'occhio.
- **Nessuna densità** (compatta/normale/estesa), nessun filtro range scene, nessun KPI.
- **CellPopover** apre overlay grande per cambiare quantità: troppo invasivo per un'azione che dovrebbe essere inline.
- **Scene scariche** (elementi < soglia) non evidenziate — è uno dei use-case principali della matrice ("quale scena è troppo vuota?").

## Proposta layout (mockup A — typewriter)

1. **Orientamento corretto**: righe = scene (mono SC.N + Fraunces italic location + TOD badge), colonne = elementi raggruppati per categoria.
2. **Doppia riga di intestazione**: banda categoria color + intestazione elemento (label verticale Courier, totale presenze sotto).
3. **Sticky** su corner + prima colonna + prima riga (banda) + seconda riga (header elementi).
4. **Celle informative**: `·` empty, `●`/qty filled con tinta categoria a 3 step (q1/q2/q3 = 1, 2-3, 4+), bordo warn + `?` per pending, `⚠` overlay per stale.
5. **Legenda inline** nell'hero — autospiegante.
6. **KPI strip** (4 colonne): scene tot, elementi tot, presenze tot vs possibili (% copertura), scene scariche.
7. **Toolbar**: chips categoria (filtrano le colonne), picker range scene, picker stato, density toggle (compatta 24px / normale 30px / estesa 40px), export CSV.
8. **Doppio click su row-header**: jump a "Per scena" sulla scena selezionata (cross-tab nav).
9. **Click cella**: inline popover compatto (qty + remove) — non più overlay full-screen.
10. **Shift+click range**: aggiunta bulk su più scene contigue per lo stesso elemento.

## Dati che servono dal server

Riferimento: `apps/web/app/features/breakdown/server/breakdown.server.ts` + `getBreakdownContext`.

Già disponibili: `BreakdownSceneSummary[]` (id, fountainNumber, location), `ProjectBreakdownRow[]` con `scenesPresent[]` (sceneId, sceneNumber, quantity, occurrenceId).

Da aggiungere/esporre:

- `BreakdownSceneSummary.timeOfDay: "GIORNO"|"NOTTE"|"ALBA"|"TRAMONTO"|null` — già su `scenes.timeOfDay`, basta includerlo nel select.
- `scenesPresent[].cesareStatus: "pending"|"accepted"|"ignored"` — già in `breakdown_occurrences`, da propagare a `ProjectBreakdownRow`.
- `scenesPresent[].isStale: boolean` — già in `breakdown_occurrences`, idem.
- `sceneDensity: Map<sceneId, number>` — count elementi per scena, derivabile client-side da `cellMap`, ma utile pre-calcolato per highlight "scene scariche" senza n iterazioni.
- Endpoint `setBreakdownOccurrenceRange({ elementId, sceneIds[], quantity, screenplayVersionId })` per il bulk shift+click — oggi servirebbero N chiamate ad `addBreakdownOccurrence`.

## Bulk actions proposte

- **Shift+click su celle stessa colonna** → aggiungi/rimuovi occorrenze multiple per uno stesso elemento.
- **Click su header elemento** → seleziona colonna intera: bulk `Conferma tutte`, `Archivia elemento`, `Rinomina`, `Cambia categoria` (riusa le mutation della vista "Per progetto").
- **Click su header scena** → apri "Per scena" filtrato su quella scena (deep-link), oppure bulk `Marca scena come scarica/da rifare`.
- **Copia da scena simile**: menu su header scena → "Riempi come SC.N" → duplica le occorrenze di tutti gli elementi presenti nella scena sorgente verso quella corrente.
- **Esporta CSV matrice**: client-side, righe scene × colonne elementi con qty nelle celle.

URL state: `view=matrix`, `cat=[]`, `density`, `sceneFrom`, `sceneTo`.
