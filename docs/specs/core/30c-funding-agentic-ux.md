# Spec 30c — Bandi & Finanziamenti: UX Agentica per Artisti

Sub-spec di Spec 30. Definisce come il modulo Bandi si comporta per filmmaker senza esperienza finanziaria — il caso d'uso più comune.

---

## Il Problema

La Spec 30 definisce il motore di match e il catalogo. Ma il filmmaker italiano tipico — autore, regista, artista — ha un rapporto conflittuale con il denaro. Non conosce la differenza tra MiC e Creative Europe. Non sa cosa significa "co-produzione" ai fini burocratici. Non vuole compilare form. Vuole fare film.

Se la prima cosa che vede è una griglia di campi da compilare o una lista di bandi con percentuali e importi, chiude la tab.

---

## Principio Guida

**Cesare fa il lavoro burocratico. Il filmmaker parla di cinema.**

L'utente non "compila il profilo di finanziamento". L'utente racconta il suo progetto a Cesare, e Cesare ricava le informazioni necessarie al match — senza che l'utente sappia di stare compilando un form.

---

## Flusso Agentico — Prima Apertura

Quando il filmmaker apre `/projects/:id/funding` per la prima volta e il `project_funding_profile` è vuoto:

### Step 1 — Cesare si presenta

Nessun form, nessuna lista vuota. Cesare parla:

```
"Ciao. Ho letto la tua sceneggiatura — una storia ambientata a Napoli, genere drammatico,
lungometraggio. Vediamo insieme come finanziare questo progetto.

Ti faccio qualche domanda, ma parlami come parleresti a un amico:
dove sei con il progetto adesso? Hai ancora tutto da scrivere, stai sviluppando la storia,
o è già pronto per girare?"
```

L'utente risponde liberamente. Cesare estrae `productionPhase`.

### Step 2 — Budget senza parlare di soldi

```
"E hai un'idea di quanto potrebbe costare girarlo? Anche solo una cifra di massima —
non deve essere precisa. Un corto si fa con 50mila euro, un lungometraggio italiano
independente parte da 400–500mila. Dove ti immagini?"
```

Cesare mostra opzioni cliccabili se l'utente non sa rispondere:

- Micro (< €100k)
- Indipendente (€100k – €500k)
- Medio (€500k – €2M)
- Ambizioso (> €2M)

Cesare estrae `estimatedBudget`.

### Step 3 — Territorio

```
"Il film ha un legame con un territorio specifico? Una regione, una città?
Oppure è un progetto che non ha radici geografiche particolari?"
```

Cesare estrae `productionRegion`. Se l'utente nomina una città, Cesare mappa alla regione corretta.

### Step 4 — Struttura produttiva (senza gergo)

```
"Hai già una struttura intorno al progetto? Un produttore, una società di produzione?
O per ora sei solo tu?"
```

Cesare estrae `hasProductionCompany`. Non usa mai le parole "società di produzione" nella domanda — le usa solo se l'utente le usa per primo.

### Step 5 — Risultato immediato

Cesare aggiorna `project_funding_profile` silenziosamente mentre parla. Alla fine:

```
"Perfetto. Ho trovato 11 opportunità che potrebbero fare al caso tuo.
Le tre più interessanti per ora sono queste:"
```

→ Lista con 3 card (score ≥ 70), poi link "Vedi tutte".

---

## Flusso Agentico — Ritorno

Se il profilo è già parzialmente compilato, Cesare non riparte da zero:

```
"Bentornato. Dall'ultima volta il MiC ha aperto un nuovo bando per la produzione —
sembra compatibile con [Titolo]. Vuoi che ti spieghi di cosa si tratta?"
```

Cesare porta nuove opportunità in modo narrativo, non come notifica tecnica.

---

## Conversazione con Cesare sul Bando

Quando l'utente clicca "Come mai?" su un bando (Spec 30, sidebar dettaglio), Cesare spiega senza burocrazia:

**Input interno (non mostrato)**: score 87%, motivi: regione Campania match, fase sviluppo match, budget nel range ottimale.

**Output Cesare**:

```
"Questo bando è pensato esattamente per progetti come il tuo: un lungometraggio
in sviluppo, con radici nel Sud Italia. Il budget che hai indicato è nella fascia
che di solito finanziano. L'unica cosa che potrebbe mancare è una società di produzione —
ma se ce l'hai o puoi trovarne una, questo potrebbe essere il tuo punto di partenza."
```

Nessuna percentuale, nessun gergo, nessuna tabella. Solo cinema.

---

## Spiegazione dei Bandi — Glossario Agentico

Cesare ha un layer di traduzione per ogni tipo di bando. L'utente non vede il tipo tecnico — vede la descrizione umana.

| Tipo tecnico | Come lo dice Cesare |
|---|---|
| `public_national` | "Fondi del Ministero della Cultura — i più stabili, aperti ogni anno" |
| `public_regional` | "Fondo della Regione [X] — spesso preferiscono progetti legati al territorio" |
| `european_media` | "Creative Europe — il programma europeo per il cinema indipendente, ottima reputazione" |
| `eurimages` | "Eurimages — fondo del Consiglio d'Europa, per co-produzioni tra paesi europei" |
| `tax_credit` | "Tax Credit — lo Stato ti rimborsa il 40% delle spese. Non è un bando con scadenza, è una possibilità sempre aperta se hai una struttura produttiva" |
| `crowdfunding` | "Crowdfunding — ottimo per documentari e progetti di nicchia. Il pubblico finanzia direttamente" |
| `festival_residency` | "Lab e residenze — non ti danno soldi per produrre, ma ti danno tempo e mentorship per sviluppare il progetto" |

---

## Tracker Candidature — Vista Agentica

Invece di un kanban con colonne "Watching / Applied / Funded", Cesare mostra uno stato narrativo:

```
"Hai salvato 4 bandi. Di questi:
— Il bando MiC Sviluppo scade tra 23 giorni. Hai già i materiali?
— Film Commission Puglia chiede una lettera di intenti — posso aiutarti a scriverla.
— Tax Credit: appena hai una società di produzione, questo diventa automaticamente disponibile."
```

Il tracker tecnico (`user_opportunity_interests`) esiste nel DB, ma l'interfaccia è sempre conversazionale.

---

## Materiali per la Candidatura — Pre-fill Cesare

Per bandi con `otherRequirements` strutturato (MiC, Creative Europe), Cesare può generare una bozza di materiali:

- **Lettera di intenti** — basata su logline, sinossi, note di regia già presenti nel progetto
- **Dossier artistico** — estratto da scaletta e note di regia
- **Budget di sviluppo** — basato sul budget già presente in Oh Writers

L'utente non "compila la domanda". Cesare prepara una bozza, l'utente la legge e approva.

```
"Per questo bando serve una lettera di intenti di max 2 pagine.
Ho preparato una bozza basandomi su quello che hai già scritto.
[Vedi bozza →]

Puoi modificarla o dirmi cosa cambiare."
```

---

## Onboarding — Primo Accesso alla Piattaforma

Se il progetto è nuovo e non ha ancora scaletta, sceneggiatura, o budget:

```
"Non ho ancora abbastanza informazioni sul progetto per trovare i bandi giusti.
Man mano che lavori su scaletta e budget, tornerò qui con suggerimenti più precisi.

Per ora posso dirti che esistono bandi aperti a progetti in fase di idea —
vuoi che te ne mostri qualcuno?"
```

Cesare non blocca l'utente. Mostra bandi generici (sviluppo, residenze) e affina quando il progetto cresce.

---

## Cosa NON fa questa UX

- Non mostra tabelle di requisiti burocratici come prima cosa
- Non chiede mai "Qual è il vostro budget di produzione previsto?"
- Non usa le parole: bando, requisiti, ammissibilità, co-produzione (a meno che l'utente non le usi prima)
- Non mostra score numerici nell'onboarding — solo dopo che l'utente è orientato
- Non manda notifiche push per ogni nuovo bando — solo per scadenze imminenti e match eccellenti (≥90)

---

## Dipendenze

- Spec 30 — catalogo bandi e logica di match (prerequisito)
- Spec 30b — centro notifiche (per le notifiche narrative)
- Spec 17 — Cesare assistant (per la conversazione e il pre-fill materiali)
- Spec 29 — Cesare UI (per il rendering della conversazione in-page)

---

## Roadmap

Questa spec si implementa in parallelo alla Fase 3 di Spec 30 (Semi-automazione + Cesare).

### Fase A — Onboarding Agentico

- Conversazione Cesare su prima apertura `/projects/:id/funding`
- Estrazione automatica dei campi `project_funding_profile` dalla conversazione
- Risultato immediato: 3 card suggerite

### Fase B — Spiegazione Narrativa e Glossario

- "Come mai?" → Cesare spiega senza gergo
- Glossario agentico per ogni tipo bando
- Tracker narrativo ("scade tra 23 giorni, hai i materiali?")

### Fase C — Pre-fill Materiali

- Bozza lettera di intenti per MiC e Creative Europe
- Bozza dossier artistico
- Connessione con budget e breakdown già presenti

---

## Tests

| Tag | File | Scenario |
|-----|------|---------|
| OHW-330 | `tests/funding/funding-agentic-onboarding.spec.ts` | Happy: prima apertura → Cesare fa domande → profilo compilato → 3 bandi mostrati |
| OHW-331 | `tests/funding/funding-agentic-onboarding.spec.ts` | Sad: utente non risponde alle domande → Cesare mostra bandi generici senza bloccare |
| OHW-332 | `tests/funding/funding-agentic-explain.spec.ts` | Happy: click "Come mai?" → Cesare spiega senza percentuali né gergo |
| OHW-333 | `tests/funding/funding-agentic-tracker.spec.ts` | Happy: tracker mostra stato narrativo con scadenze e azioni suggerite |
| OHW-334 | `tests/funding/funding-agentic-materials.spec.ts` | Happy: Cesare genera bozza lettera di intenti per bando MiC compatibile |
