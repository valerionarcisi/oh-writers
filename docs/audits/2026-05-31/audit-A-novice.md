# Audit A — Novice first-time user

**Date:** 2026-05-31
**Persona:** Sceneggiatore italiano alle prime armi, prima volta in assoluto su Oh Writers. Nessuna esperienza con tool di scrittura + produzione.
**Method:** Drive live dell'app reale (port 3010, MOCK_AI=true) via Playwright. Login, lettura dashboard, creazione progetto da zero, apertura primo documento (Soggetto), scrittura, uso di Cesare, sessione Cesare full-screen, giro sulle sezioni di produzione.
**Screenshots:** `./screenshots-A/`

> Nota ambiente: la fixture condivisa con altri auditor sullo stesso account `test@ohwriters.dev` provocava log-out ripetuti (Better Auth invalida sessioni concorrenti). Per avere una sessione stabile ho usato l'account seedato `valerio@ohwriters.dev`. Questo è un artefatto del setup di test, **non** un bug di prodotto, e non incide sui findings di discoverability qui sotto. (Un progetto creato durante la fase instabile è risultato orfano — vedi nota in F-ALTO-1.)

---

## Sommario findings

| #         | Priorità | Schermata / Flusso                                                          | Sintesi                                                                                                      |
| --------- | -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| F-ALTO-1  | ALTO     | Documenti di sviluppo (synopsis / outline / treatment) di un progetto nuovo | Empty state = messaggio d'errore "Documento non trovato" senza azione                                        |
| F-ALTO-2  | ALTO     | Onboarding globale                                                          | Nessuna guida / tour / help al primo accesso. Zero "?"                                                       |
| F-ALTO-3  | ALTO     | Project overview — CTA primaria                                             | "Continua sceneggiatura →" su progetto vuoto: non c'è niente da "continuare"                                 |
| F-MEDIO-1 | MEDIO    | Mix lingua IT/EN (overview, pipeline)                                       | "Synopsis / Outline / Treatment / Screenplay" in inglese accanto a "Sinossi / Scaletta" in italiano          |
| F-MEDIO-2 | MEDIO    | Sessione Cesare full-screen                                                 | Landing centrale "Cosa scriviamo oggi?" + drawer Cesare flottante aperti insieme: due Cesare, dove scrivo?   |
| F-MEDIO-3 | MEDIO    | Dashboard — "Importa Fountain"                                              | Bottone disabilitato, jargon, nessuna spiegazione del perché è grigio                                        |
| F-MEDIO-4 | MEDIO    | Empty state Breakdown                                                       | "Nessuna versione disponibile per questa sceneggiatura" — il novizio non sa che deve prima scrivere le scene |
| F-BASSO-1 | BASSO    | Empty state Soggetto vs altri doc                                           | Incoerenza: "Documento soggetto non trovato" (testo piatto) vs card "Documento non trovato"                  |
| F-BASSO-2 | BASSO    | Sidebar — toolbar a sole icone                                              | "Cerca / Nuovo / Cambia progetto / Altro" senza etichette visibili; scoperti solo al passaggio del mouse     |
| F-BASSO-3 | BASSO    | Brand glyph                                                                 | "OOh Writers" (doppia O) nel logo testuale può leggersi come refuso                                          |
| F-BASSO-4 | BASSO    | favicon 404                                                                 | Console error `favicon.ico 404` su ogni pagina                                                               |

---

## ALTO

### F-ALTO-1 — Il primo documento di un progetto nuovo dice "Documento non trovato"

**Schermata:** `/projects/:id/synopsis` (e `/outline`, `/treatment`) su progetto appena creato. Screenshots `08-synopsis-empty.png`, `07-soggetto-empty-notfound.png`.

**Cosa mi ha confuso (da novizio):** Creo il mio primo progetto, sono entusiasta, clicco "Sinossi" per iniziare. La pagina mi dice:

> **"Documento non trovato — Il documento richiesto non esiste o è stato rimosso."**

Da novizio leggo: "ho rotto qualcosa" oppure "ho cancellato il documento per sbaglio". In realtà il progetto è semplicemente vuoto e nuovo. Stesso problema su Scaletta e Trattamento. Sul Soggetto compare la variante "Documento soggetto non trovato."

**Perché è un problema:** È il momento più fragile dell'onboarding — il primo click per "iniziare a scrivere" finisce in un vicolo cieco che _sembra un errore di sistema_. Non c'è nessun bottone "Inizia a scrivere" / "Crea il documento". (NB: aprendo lo stesso doc _navigando dal pipeline dell'overview_ il Soggetto invece si apre con un placeholder corretto "Scrivi il tuo soggetto. Usa ## per strutturarlo…", vedi `09-soggetto-empty-good.png` — quindi il comportamento è **incoerente** a seconda di come ci arrivi, il che è ancora più spiazzante. Un progetto creato nella fase instabile della sessione è inoltre risultato del tutto "Progetto non trovato" e assente dalla dashboard.)

**Fix suggerito:** L'empty state di un documento di sviluppo deve trattare l'assenza come stato normale, non come errore. Mostrare l'editor vuoto con il placeholder ("Scrivi il tuo soggetto…") oppure una empty card con CTA esplicita "Inizia a scrivere" / "Genera con Cesare" — coerente tra Soggetto/Sinossi/Scaletta/Trattamento e indipendente dal path di navigazione. Riservare "Documento non trovato" ai casi reali (id inesistente).

### F-ALTO-2 — Nessun onboarding al primo accesso

**Flusso:** dall'login alla prima scrittura. Verificati menu "Altro", "Impostazioni", toolbar: nessun Help/Guida/Tutorial.

**Cosa mi ha confuso:** Entro per la prima volta e nessuno mi spiega cos'è "Soggetto", cosa fa "Cesare", in che ordine si lavora, cosa significa "Scaletta" vs "Trattamento". Non c'è un tour, un tooltip di benvenuto, una pagina "Da dove inizio?", né un punto "?" a cui chiedere aiuto.

**Perché è un problema:** Il prodotto unisce due mondi (scrittura + produzione) con tanta terminologia. Senza nessun appiglio iniziale il novizio procede per tentativi. La pipeline narrativa (Soggetto → Sinossi → Scaletta → Trattamento → Sceneggiatura) è la conoscenza chiave e non viene mai introdotta.

**Fix suggerito:** Un onboarding leggero: (a) banner/tour dismissibile sull'overview del primo progetto che spiega la pipeline in una riga ciascuno; (b) un'icona "?" persistente con accesso a Cesare in modalità "spiegami il prodotto". Cesare è già il candidato perfetto come guida.

### F-ALTO-3 — CTA primaria "Continua sceneggiatura →" su progetto vuoto

**Schermata:** Project overview di un progetto appena creato (0 scene, 0 pagine). Screenshot `04-project-overview.png`.

**Cosa mi ha confuso:** Il bottone più prominente in alto a destra dell'overview è **"Continua sceneggiatura →"**, ma non ho ancora scritto una sola riga. "Continuare" cosa? Il verbo presuppone un lavoro già iniziato.

**Perché è un problema:** Per un progetto a 0 contenuto la CTA primaria comunica il messaggio sbagliato e porta dritta nell'editor sceneggiatura, saltando tutta la fase di sviluppo (soggetto/sinossi/scaletta) che è proprio dove un novizio dovrebbe partire.

**Fix suggerito:** Stato vuoto della CTA: "Inizia dal Soggetto →" (o "Inizia a scrivere →") quando non c'è contenuto; passare a "Continua sceneggiatura →" solo quando esiste già una bozza con scene.

---

## MEDIO

### F-MEDIO-1 — Lingua mista italiano/inglese nelle etichette

**Schermata:** Project overview — sezione "Sviluppo narrativo" e rail "Pipeline di sviluppo". Screenshot `04-project-overview.png`.

**Cosa mi ha confuso:** Nella sidebar e nei badge leggo "Sinossi", "Scaletta", "Trattamento", "Sceneggiatura" (italiano), ma le **card** della stessa pagina hanno il titolo in inglese: `Synopsis`, `Outline`, `Treatment`, e il pipeline mostra "Screenplay" accanto a "Calendarizzazione". Stessa entità, due nomi.

**Perché è un problema:** Il prodotto è localizzato in italiano per sceneggiatori italiani. Vedere "Outline" e "Synopsis" mina la fiducia ("è tradotto a metà?") e aumenta il carico cognitivo: devo mappare due vocabolari sulla stessa cosa.

**Fix suggerito:** Uniformare a italiano ovunque nelle stringhe UI: card heading "Sinossi/Scaletta/Trattamento/Sceneggiatura", pipeline "Sceneggiatura" al posto di "Screenplay". I `_tag`/identificatori interni restano inglesi (corretto), ma il testo visibile no.

### F-MEDIO-2 — Due "Cesare" aperti insieme nella sessione full-screen

**Schermata:** `/projects/:id/sessions/new` — landing "Cosa scriviamo oggi?". Screenshot `12-new-session-landing.png`.

**Cosa mi ha confuso:** Clicco "+ Nuova" (Nuova sessione Cesare) e arrivo a una bella schermata centrale "✦ Cosa scriviamo oggi?" con il suo campo di input. Ma **contemporaneamente** resta aperto il drawer flottante "Cesare" in basso a destra, con un _altro_ campo di input. Due Cesare, due composer: dove scrivo? Inoltre il badge di scope del drawer dice "SCENEGGIATURA" mentre stavo lavorando sul Soggetto, e il selettore sessione mostra un'etichetta troncata "Scrivi una logline su quello che ti ho".

**Perché è un problema:** Duplicazione dell'affordance principale = esitazione. Il novizio non sa quale superficie è "quella vera" per avviare la sessione.

**Fix suggerito:** Quando si apre la landing full-screen della nuova sessione, il drawer flottante dovrebbe chiudersi/minimizzarsi (sono la stessa conversazione). E il badge di scope deve riflettere il contesto corrente, non "SCENEGGIATURA" residuo.

### F-MEDIO-3 — "Importa Fountain" disabilitato senza spiegazione

**Schermata:** Dashboard, accanto a "+ Nuovo progetto". Screenshot `02-dashboard.png`.

**Cosa mi ha confuso:** C'è un bottone grigio "Importa Fountain". Non so cosa sia "Fountain" (è un formato di sceneggiatura, ma un esordiente può non saperlo) e soprattutto non capisco perché è disabilitato — nessun tooltip, nessun `title`, nessuna nota "in arrivo".

**Perché è un problema:** Un controllo disabilitato e senza spiegazione genera dubbio ("è rotto? mi manca un permesso? devo fare qualcosa prima?").

**Fix suggerito:** Aggiungere un tooltip su hover ("Importa una sceneggiatura in formato Fountain — presto disponibile" oppure la precondizione che lo abilita). Idealmente espandere "Fountain" con un micro-aiuto.

### F-MEDIO-4 — Empty state Breakdown poco didattico

**Schermata:** `/projects/:id/breakdown` su progetto senza scene. Screenshot `13-breakdown-empty.png`.

**Cosa mi ha confuso:** "Nessuna versione disponibile per questa sceneggiatura." Da novizio non collego: per fare il breakdown devo prima avere una sceneggiatura con delle scene. Il messaggio descrive l'assenza ma non la causa né il passo successivo (a differenza del Calendario, che spiega bene "Richiede uno screenplay con scene").

**Perché è un problema:** Il novizio resta bloccato senza capire la dipendenza tra le fasi.

**Fix suggerito:** Allineare il Breakdown al pattern del Calendario: "Per fare lo spoglio servono delle scene. Scrivi prima la sceneggiatura" + link/CTA all'editor. (Il Calendario è il riferimento positivo da copiare.)

---

## BASSO

### F-BASSO-1 — Empty state Soggetto incoerente con gli altri documenti

Sul Soggetto l'assenza appare come testo piatto "Documento soggetto non trovato.", mentre Sinossi/Scaletta/Trattamento mostrano una card titolata "Documento non trovato" con paragrafo. Due trattamenti visivi per lo stesso stato. (Va comunque risolto a monte da F-ALTO-1.)

### F-BASSO-2 — Toolbar sidebar a sole icone

Le azioni "Cerca / Nuovo / Cambia progetto / Altro" nella sidebar sono solo icone; le scopro unicamente al passaggio del mouse (le aria-label esistono, bene per l'accessibilità, ma non per la scoperta visiva). Da novizio non immagino che "Nuovo" (icona) porti direttamente al form Nuovo progetto. **Fix:** etichette testuali quando la sidebar è espansa, oppure tooltip immediati.

### F-BASSO-3 — Glyph del brand "OOh Writers"

Il logo testuale rende come "OOh Writers" (glyph "O" + parola "Oh Writers") e può leggersi come refuso al primo colpo d'occhio (login, sidebar). Screenshot `01-login.png`. **Fix:** distanziare/styling del glyph così che non si fonda con la "O" iniziale di "Oh".

### F-BASSO-4 — favicon 404

Ogni pagina logga in console `Failed to load resource: 404 (Not Found) favicon.ico`. Invisibile al novizio ma sporca la console e lascia la tab senza icona. **Fix:** aggiungere una favicon.

---

## Cosa invece funziona bene (da novizio)

- **Login email-first** ("Continua" → "Bentornato" + password): pulito e familiare.
- **Form Nuovo progetto**: minimale, campi chiari, asterischi sui required. Buono.
- **Editor Soggetto (quando si apre)**: placeholder utile "Scrivi il tuo soggetto. Usa ## per strutturarlo in sezioni"; contatore "cartelle · caratteri" live; testo seed con istruzioni d'uso. Ottimo onboarding inline. Screenshots `06`, `09`.
- **Cesare** (drawer in-page): "Chiedimi qualunque cosa su SOGGETTO", suggerimenti rapidi e un "Prossimo passo: Scrivi una logline dal tuo spunto". Cliccandolo ha generato la logline e l'ha applicata **live** al documento con trace inline "1 passaggio › Aggiornato Soggetto" + "Mostra modifiche" + "↩ Annulla". Pattern agentico chiaro e rassicurante. Screenshots `10`, `11`.
- **Landing nuova sessione** "Cosa scriviamo oggi?" con suggerimenti: accogliente (a parte la doppia superficie, F-MEDIO-2).
- **Empty state Calendario**: spiega la precondizione ("Richiede uno screenplay con scene") + CTA. Modello da estendere alle altre sezioni.

---

## Top 5 (prioritised)

1. **F-ALTO-1** — Empty doc di un progetto nuovo = "Documento non trovato": il primo click per scrivere finisce in un finto errore. Mostrare editor vuoto/CTA.
2. **F-ALTO-2** — Zero onboarding/help al primo accesso: nessuno introduce pipeline e Cesare.
3. **F-ALTO-3** — CTA "Continua sceneggiatura →" su progetto vuoto: dovrebbe essere "Inizia dal Soggetto →".
4. **F-MEDIO-1** — Lingua mista IT/EN ("Synopsis/Outline/Treatment/Screenplay" vs italiano) nelle stesse schermate.
5. **F-MEDIO-2** — Sessione Cesare full-screen + drawer Cesare flottante aperti insieme: due input, ambiguità su dove scrivere.
