# Audit B — Expert power-user friction & efficiency

**Auditor persona:** writer-director esperto (sceneggiatura + produzione) che lavora veloce e pretende potenza.
**Data:** 2026-05-31
**Build:** `main` @ `d2c7f42`, dev server `MOCK_AI=true` su porta 3011.
**Login:** test@ohwriters.dev. Progetti usati: team `…011` (prescritto) e personale `…010` (`Non fa ridere`, usato dove `…011` era rotto).
**Metodo:** Playwright-cli, sessione dedicata `expert`. Click-count e tempi misurati live. Screenshot in `docs/audits/2026-05-31/`.

> Nota ambiente: l'app è stata guidata in MOCK_AI. Le risposte agentiche di Cesare scattano solo su prompt "seed" precisi (es. _"Fammi un v2 del soggetto più asciutto."_, _"Espandi la sezione Atto II."_); prompt liberi restituiscono _"Ho letto la tua richiesta ma non ho strumenti specifici da invocare"_. Questo è un limite del mock, non un bug di prodotto — ma vedi M-4 (suggerimenti che portano a vicolo cieco).

---

## Riepilogo priorità

| #   | Severità | Flusso                                            | Friction in una riga                                                                                                                  |
| --- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | ALTO     | Sessione full-screen / Cesare "Apri come colonna" | Render-loop infinito (`Maximum update depth exceeded`), 100–190 errori console per azione                                             |
| A-2 | ALTO     | Edit di Cesare (ogni feature)                     | Nessun pulsante **↩ Annulla** nel result card, anche se il testo dice "usa Annulla" → recupero da perdita dati impossibile dalla chat |
| A-3 | ALTO     | Edit di Cesare — "Mostra modifiche"               | Il toggle diff non mostra **nessun** diff (né nel card né evidenziato sul documento)                                                  |
| A-4 | ALTO     | Tavolozza comandi (⌘K)                            | Conosce solo "Vai alla Dashboard"; cercare "budget"/"scen" → "Nessun risultato". Inutilizzabile come navigazione rapida               |
| A-5 | ALTO     | Cesare stream su progetto team `…011`             | `POST /api/cesare/stream` → 403, ogni edit fallisce con "si è verificato un errore. Riprova."                                         |
| M-1 | MEDIO    | Sceneggiatura — export                            | Non esiste alcun export PDF/Fountain della sceneggiatura dall'editor o dal progetto                                                   |
| M-2 | MEDIO    | Versioni sceneggiatura                            | Manca un "Confronta" tra versioni; click sul corpo della riga ha innescato una Duplica non voluta                                     |
| M-3 | MEDIO    | Navigazione generale                              | Ogni cambio sezione/drawer 2.5–4.3s; switch tra due sessioni brevi 4.2s                                                               |
| M-4 | MEDIO    | Nuova sessione — chip suggeriti                   | "Esplora un'idea" porta a "non ho strumenti da invocare": il suggerimento è un vicolo cieco                                           |
| M-5 | MEDIO    | Login                                             | Login a 2 step (email→Continua→password→Accedi) + Enter non avanza dal campo email                                                    |
| M-6 | MEDIO    | Composer Cesare                                   | Enter inserisce a-capo, l'invio è Cmd+Enter ma non è indicato da nessuna parte                                                        |
| M-7 | MEDIO    | Panoramica progetto                               | Stat "Personaggi: 0" mentre la sceneggiatura ha JOHN/FILIPPO/TEA…; pipeline linka a sceneggiatura inesistente su `…011`               |
| B-1 | BASSO    | Versioni sceneggiatura                            | Il bottone "Versioni" a volte apre un popover a 2 voci, a volte direttamente il drawer (incoerente)                                   |
| B-2 | BASSO    | Markup                                            | Hydration error: `<button>` annidato in `<button>` (a11y + correttezza)                                                               |
| B-3 | BASSO    | Sessione                                          | Titolo del pannello centrale resta "Nuova sessione" mentre la sidebar mostra già il nome auto-generato                                |

---

## ALTO

### A-1 — Render-loop infinito su sessione full-screen e su Cesare "colonna"

**Flusso:** `+ Nuova` → digito un prompt → Cmd+Enter (route `…/sessions/new` → `…/sessions/:id`); e separatamente Cesare drawer → "Apri come colonna" (`?peek=cesare`).
**Friction:** entrambe le azioni scatenano `Maximum update depth exceeded` ripetuto: **190 errori** console dopo l'avvio sessione, **104** dopo "Apri come colonna" (un `setState` dentro `useEffect` senza/with bad deps). Screenshot `03-session-render-loop.png`, `06-cesare-column-render-loop.png`.
**Perché rallenta un pro:** è il cuore del prodotto (sessioni + viste affiancate). Il loop brucia CPU, fa scattare i fan, può far perdere battute durante lo streaming e a lungo termine impalla il tab. Un professionista che vive in sessione abbandona.
**Fix:** trovare il componente che fa `setState` in `useEffect` nelle route `sessions/new`/`sessions/$id` e nel co-existence `SplitDrawer`+Cesare. Stabilizzare le dipendenze (memoizzare il valore derivato, o spostare l'update in un handler / `useMemo`), e aggiungere un test Playwright che assert-a 0 errori console su questi due flussi.

### A-2 — Nessun "↩ Annulla" nel result card di Cesare

**Flusso:** Soggetto → Cesare → "Fammi un v2 del soggetto più asciutto." → edit applicato live.
**Friction:** il messaggio recita _"…l'ho applicata direttamente al documento. Se non ti convince usa **Annulla**."_ ma nel card gli unici controlli sono "1 passaggio" e "Mostra modifiche". Enumerati tutti i `<button>` del drawer: nessun "Annulla"/"↩"/"Ripristina" (screenshot `05-cesare-edit-no-annulla-no-diff.png`).
**Perché rallenta un pro:** la pattern canonica (CLAUDE.md, Agentic Edit Pattern punto 4) promette revert inline a un click. Senza, l'unico recupero è aprire il drawer Versioni, trovare la versione pre-edit e "Attiva" — 4+ click e un context-switch — proprio quando il testo dell'AI ti ha detto che basta "Annulla". È una promessa rotta e un rischio di perdita lavoro.
**Fix:** rendere il pulsante "↩ Annulla" nel result card (revert alla versione auto-creata pre-edit). Se per qualche stato non è disponibile, rimuovere la frase "usa Annulla" dal copy per non mentire.

### A-3 — "Mostra modifiche" non mostra alcun diff

**Flusso:** stesso edit di A-2 → click "Mostra modifiche" (diventa "Nascondi modifiche", `pressed`).
**Friction:** il toggle cambia stato ma non rende **nessun** contenuto diff: il card resta `1 passaggio / Aggiornato Soggetto / 1 modifica`, e sul documento non c'è alcun elemento `ins/del/mark/[class*=diff|highlight|flash]` (verificato via DOM query → `[]`).
**Perché rallenta un pro:** non puoi valutare cosa è cambiato senza rileggere tutto il soggetto a occhio. Per un autore che itera a raffica questo è il controllo più importante e qui è muto.
**Fix:** rendere il diff effettivo (added/removed) nel card o come evidenziazione temporanea sul documento. Coprire con test che asserisce la presenza di nodi diff dopo il toggle.

### A-4 — Tavolozza comandi (⌘K) sa fare solo "Dashboard"

**Flusso:** ⌘K → digito "budget" / "scen".
**Friction:** placeholder _"Cerca comandi, scene, persone…"_ ma l'unico risultato a palette vuota è "Vai alla Dashboard", e qualsiasi query → "Nessun risultato" (screenshot `04-command-palette-empty.png`).
**Perché rallenta un pro:** la command palette è LO strumento del power-user per saltare ovunque senza mouse. Qui non porta a Soggetto/Sceneggiatura/Breakdown/Budget/Calendario/Location, né a scene o personaggi. Resta solo la sidebar a mouse (ogni salto 2.5–4s, vedi M-3).
**Fix:** indicizzare nella palette le sezioni del progetto, le scene (numero + slugline), le sessioni Cesare e i personaggi. È il singolo intervento con il maggior ritorno di efficienza.

### A-5 — Cesare stream 403 sul progetto team prescritto `…011`

**Flusso:** progetto `…011` → Soggetto → Cesare → invio prompt.
**Friction:** `POST /api/cesare/stream` → **403 Forbidden**; il drawer mostra "Invio non riuscito" e "Mi dispiace, si è verificato un errore. Riprova." Log server: `tag:"ForbiddenError" … cesare.stream.access_denied` per `…011` (screenshot `01-cesare-stream-403-error.png`). Il seed dà a test@ohwriters.dev ruolo `owner` sul team del progetto, quindi a livello "view" dovrebbe passare; la risoluzione access via header sullo stream nega comunque.
**Perché rallenta un pro:** su questo progetto Cesare è semplicemente inutilizzabile, e l'errore mostrato è generico ("Riprova") senza spiegare che è un problema di accesso → l'utente riprova all'infinito.
**Fix:** investigare `resolveCesareStreamAccess`/`withProjectAccessHeaders` per i progetti team (membership owner) — l'access "view" dovrebbe risolversi come per i server-fn normali. In parallelo, sostituire il messaggio generico con uno specifico per il 403.

---

## MEDIO

### M-1 — Nessun export della sceneggiatura

**Flusso:** Sceneggiatura → "Altre azioni"; e progetto → "⋯".
**Friction:** "Altre azioni" della sceneggiatura contiene **solo** "Versioni". Il menu "⋯" del progetto offre solo Frontespizio / Impostazioni / Archivia. "Importa Fountain" in dashboard è disabilitato. L'unico Esporta (PDF/CSV) sta nel Breakdown.
**Perché rallenta un pro:** un regista deve consegnare un PDF/Fountain della sceneggiatura a produttori/attori. Oggi non c'è modo dall'UI.
**Fix:** aggiungere "Esporta sceneggiatura" (PDF impaginato standard + Fountain) in "Altre azioni" dell'editor, con scorciatoia (es. ⌘E come nel Breakdown).

### M-2 — Versioni sceneggiatura: niente confronto, click ambiguo che duplica

**Flusso:** Sceneggiatura → Versioni (SplitDrawer).
**Friction:** le azioni per versione sono Attiva / Duplica / Elimina / Rinomina — manca un **Confronta** tra due versioni (il task lo cita). Inoltre, cliccando il corpo della riga versione è comparsa una "Revisione blu (copia)": il target di click della riga si sovrappone alle azioni e ha innescato una Duplica non intenzionale (screenshot `02-versions-splitdrawer.png`).
**Perché rallenta un pro:** confrontare bozze (es. "bianca" vs revisione) è pane quotidiano in stesura; senza Confronta tocca leggere a memoria. E una Duplica accidentale sporca la lista versioni.
**Fix:** aggiungere selezione di 2 versioni → "Confronta" con diff. Rendere il click sul corpo riga un'azione esplicita e prevedibile (apri/anteprima), separata visivamente dai bottoni azione.

### M-3 — Latenza di navigazione e di switch sessione

**Flusso:** salti sezione e cambio sessione.
**Friction (misurato):** Soggetto 1.7s, Breakdown 2.6s, Budget 2.9s, Calendario 2.5s, Location 2.5s; apertura Versioni popover 2.7s, SplitDrawer 4.2s; apertura pannello Sessioni 3.8s; **nuova sessione 4.3s**; **switch tra due sessioni brevi 4.2s**.
**Perché rallenta un pro:** chi salta decine di volte al giorno tra soggetto↔sceneggiatura↔breakdown paga secondi a ogni hop. Lo switch di sessione a 4s è particolarmente fastidioso perché è dentro lo stesso documento (nessuna navigazione reale).
**Fix:** prefetch su hover dei link sezione (TanStack Router `preload`), skeleton immediato, e per lo switch sessione caricare lo storico in modo non bloccante (mostrare subito l'header sessione, popolare i turni dopo).

### M-4 — Chip "Esplora un'idea" è un vicolo cieco

**Flusso:** Nuova sessione → chip "Esplora un'idea per il film" / prompt libero.
**Friction:** risposta _"Ho letto la tua richiesta ma non ho strumenti specifici da invocare per questo caso."_ (anche se in MOCK). Un chip suggerito non dovrebbe mai portare a un no-op.
**Perché rallenta un pro:** rompe la fiducia nei suggerimenti e fa sembrare l'AI passiva proprio nel primo contatto.
**Fix:** o il chip "Esplora un'idea" produce davvero un brainstorm conversazionale, o va rimosso/sostituito con azioni che hanno uno strumento dietro (Genera scaletta, Rivedi). Garantire che ogni suggerimento mappi a una capability reale.

### M-5 — Login a 2 step + Enter non avanza

**Flusso:** /login.
**Friction:** email → "Continua" → password → "Accedi" = 4 azioni in 2 step. Premendo Enter sul campo email il form non avanza (mostra "Inserisci un indirizzo email valido" finché non c'è un click reale).
**Perché rallenta un pro:** è l'attrito quotidiano di ogni accesso; uno step e mezzo in più rispetto al classico email+password sulla stessa schermata.
**Fix:** o unire email+password in un'unica schermata, o far sì che Enter su email valido avanzi al passo password (submit del primo step).

### M-6 — Scorciatoia di invio Cesare non scopribile

**Flusso:** composer Cesare (textarea).
**Friction:** Enter inserisce a-capo; l'invio è **Cmd+Enter** ma non è scritto da nessuna parte (placeholder solo "Chiedi a Cesare…"). Un utente nuovo preme Enter e si ritrova testo multilinea senza inviare.
**Perché rallenta un pro:** chi scrive prompt brevi a raffica si aspetta Enter=invio; senza hint perde tempo a capire il pattern.
**Fix:** mostrare l'hint ("⌘↵ per inviare · ↵ per andare a capo") sotto il composer o nel placeholder, coerente con quanto già fatto bene altrove (la palette mostra ↑↓/Enter/Esc).

### M-7 — Stat "Personaggi: 0" e pipeline che linka a sceneggiatura inesistente

**Flusso:** Panoramica progetto.
**Friction:** la sceneggiatura ha personaggi evidenti (JOHN, FILIPPO, TEA, NONNO, VECCHIA 1/2/3…) ma la stat "Personaggi" è 0. Inoltre su `…011` la pipeline marca "Screenplay ◐" e l'overview offre "Continua sceneggiatura →", ma aprire l'editor dà "Sceneggiatura non trovata" (`ScreenplayNotFoundError`).
**Perché rallenta un pro:** stat sbagliate minano la fiducia nei numeri (che servono per budget/cast); un CTA che porta a una pagina "non trovata" è un dead-end.
**Fix:** popolare "Personaggi" dal parsing scene; nascondere/disabilitare il CTA e segnare la pipeline coerentemente quando lo screenplay non esiste per quel progetto.

---

## BASSO

### B-1 — Bottone "Versioni" incoerente

A volte apre un mini-popover ("● v13", "Apri Versioni →"), a volte il SplitDrawer completo. Comportamento prevedibile = meno carico cognitivo. Uniformare (preferibilmente: un click apre direttamente il drawer).

### B-2 — Hydration error: `<button>` annidato in `<button>`

Console: _"In HTML, `<button>` cannot be a descendant of `<button>`"_ + hydration mismatch. È un problema di correttezza/a11y (focus e click ambigui). Sostituire l'elemento interno con un elemento non-button.

### B-3 — Titolo pannello sessione disallineato

Nella vista sessione il pannello centrale resta "Nuova sessione" mentre la sidebar mostra già il titolo auto-generato ("Esplora un'idea per un thriller"). Sincronizzare il titolo.

---

## Note positive (cosa funziona bene per un pro)

- Eliminazione versione **e** eliminazione sessione hanno modale di conferma con copy chiaro ("L'operazione non è reversibile") — gating corretto delle azioni distruttive.
- Rinomina inline (versioni e sessioni) supporta **Enter per salvare** — buono.
- Breakdown e Schedule espongono scorciatoie **scopribili** ("Ri-spogliare con AI ⌘R", "Esporta ⌘E"): è il modello giusto, da estendere ovunque (vedi M-6).
- Strip board ricca: difficoltà giornata, warning location, tooltip azionabili.
- Switch sessione avviene **dentro** il documento (no navigazione), solo troppo lento (M-3).
