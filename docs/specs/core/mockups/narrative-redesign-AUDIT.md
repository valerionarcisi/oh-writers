# Narrative Pages — Redesign Audit

Scope: 4 narrative routes (Soggetto, Sinossi, Scaletta/Outline, Trattamento). Source today:
`_app.projects.$id_.soggetto.tsx`, `.synopsis.tsx`, `.outline.tsx`, `.treatment.tsx` +
`NarrativeEditor`, `FreeNarrativeEditor`, `LoglineBlock`, `OutlineEditor`.

## Findings

1. **Forte duplicazione invisibile**: ogni pagina monta `NarrativeEditor` con un branch interno (`isLogline / isSynopsis / isTreatment / isOutline`). Il risultato è una pagina che cambia profilo (toolbar H2/H3 solo per treatment, char counter solo per logline, mode `free/assisted` ovunque) senza che l'utente percepisca la differenza di "documento". Le 4 pagine sembrano una sola pagina con contenuto diverso.
2. **Logline orfana**: vive solo dentro Soggetto (`LoglineBlock`) come card. Sulle altre pagine non è nemmeno visibile come reminder — eppure è la spina dorsale del documento. La sinossi e il trattamento si scrivono "alla cieca" rispetto alla logline.
3. **Metriche scarsissime e duplicate**: oggi solo `cartelle / caratteri` (FreeNarrativeEditor) o `pages × 250 words` (NarrativeEditor). Sceneggiatori italiani ragionano in **cartelle** (1.800 caratteri) ma anche in **parole, tempo di lettura, target di formato** (sinossi 1–2 cart., trattamento 20–40 cart.). Manca completamente la nozione di "sei in target?".
4. **Trattamento senza struttura navigabile**: è il documento più lungo (20–40 cartelle) ma non ha TOC, niente outline laterale, niente jump-to-section. La toolbar H2/H3 c'è, ma la struttura prodotta non è esposta in UI. Per documenti di questa lunghezza è il difetto più grave.
5. **Cesare assente sui doc narrativi**: oggi Cesare è solo nello screenplay editor. Soggetto/sinossi/trattamento hanno un `AIAssistantPanel` legacy attivabile via "Modalità: Assisted", che è una chat laterale generica — esattamente l'anti-pattern che vogliamo evitare (vedi memo "controllore garbato"). La pagina più adatta a Cesare (struttura, tono, densità, beat coverage sullo scaletta) è oggi quella senza Cesare.
6. **Scaletta mal posizionata**: `OutlineEditor` è uno strumento strutturato (atti/sequenze/scene) ma nella nav appare come "documento narrativo" alla pari di sinossi. È in realtà un ponte verso lo screenplay editor — meriterebbe metriche struttura (beat coverage, durata stimata, pacing) e un Cesare dedicato alla narrazione.
7. **Viewbar incoerente fra le 4 pagine**: ognuna ha il proprio header e niente segmentato. L'utente non percepisce le 4 pagine come "stessa famiglia" e non può spostarsi rapidamente (oggi deve passare dal breadcrumb / left nav).
8. **Cartelle counter "embedded" + nessun obiettivo**: oggi dice `4 cartelle · 7.200 caratteri`. Non dice "il tuo target era 1–2 cartelle, sei sopra".
9. **Logline extract è un bottone nascosto**: oggi `★ Estrai dal soggetto` è una `InlineGenerateButton` minuscola dentro la card. Bell'ergonomia ma poca scoperta.
10. **Read-only e save state visivamente debolissimi**: badge "Read only" testuale, `useSaveStatePublisher` invisibile dalle pagine — la TopBar pill è l'unico segnale.

## Decisioni di layout per documento

| Doc          | Layout proposto                                     | Note speciali                                                                 |
|--------------|-----------------------------------------------------|-------------------------------------------------------------------------------|
| Soggetto     | 2 colonne: editor + note (Cesare/utente) a dx       | Logline come card persistente in testa; section label "Soggetto" come ora.    |
| Sinossi      | 1 colonna focus, max ~720px, niente sidebar         | Indicatore "target 1–2 cartelle ✓/✗" sempre visibile in viewbar.              |
| Scaletta     | 3 colonne: TOC scene + editor cards + Cesare/metriche | Beat coverage, durata stimata, pacing alerts. Cesare focalizzato su struttura.|
| Trattamento  | 3 colonne: TOC capitoli + editor lungo + Cesare/metriche | TOC è il valore principale; opzione due-colonne per capitoli (variante B).    |

Tutte e 4 condividono: **stesso viewbar segmentato** (`Soggetto / Sinossi / Scaletta / Trattamento`), **stessa version pill mono**, **stesso FloatingDock**, **stesso save pill**.

## Keep / Change / Drop

**Keep**
- `LoglineBlock` card + `★ Estrai dal soggetto` inline-gen → portarlo anche in viewbar di sinossi e trattamento come pill di referenza ("📌 Logline: …").
- `cartelle` counter (italiano-specifico, ottimo).
- `FloatingDock` con primary "Esporta PDF/DOCX" + secondaria "Versioni".
- `VersionTrigger` pill mono.

**Change**
- Le 4 pagine devono condividere un layout-shell unico con viewbar segmentato. Oggi sono 4 componenti che chiamano `NarrativeEditor` con if/else.
- Metriche: passare da "1 contatore" a un piccolo **stats rail** (cartelle / parole / lettura / target).
- Trattamento: aggiungere **TOC laterale** derivato dagli H2/H3 (già editabili via toolbar).
- Scaletta: smettere di trattarla come "narrativa", costruire un layout dedicato a 3 colonne con beat coverage.
- Cesare: portarlo sulle 4 pagine come pannello laterale non-bloccante coerente con lo screenplay editor (memo `controllore garbato`). Sostituire `AIAssistantPanel` chat-style + `mode: free/assisted` toggle.

**Drop**
- Modalità "Free / Assisted" come toggle nel dock: l'assistente non si accende/spegne, è sempre presente come pannello passivo (può essere collassato).
- `AIAssistantPanel` legacy (chat side-panel).
- Toolbar H2/H3 visibile in cima al treatment: integrarla come floating contextual toolbar (selection-based) come nello screenplay.

## Mockup prodotti

- `narrative-redesign-a-typewriter.html` — dark warm coerente con screenplay editor. Tab interne per i 4 doc.
- `narrative-redesign-b-kindle.html` — paper light editorial, focus sulla lettura, dropcap, due-colonne per capitoli lunghi del trattamento.

Entrambi rispettano: SegmentedControl viewbar, VersionTrigger mono pill, FloatingDock, palette warm, Inter + Fraunces + Courier Prime.
