# Spec 12 — Design System v2 "Ambient"

> Refactor del DS dell'intera app verso un sistema **"Kindle radical"**: caldo, editoriale, contestuale.
> Si applica a tutte le pagine ad eccezione degli editor interni (Monaco screenplay, ProseMirror soggetto) che restano invariati nel loro chrome, ma riceveranno la nuova shell esterna.
>
> **Mock di riferimento** (canonici, da seguire pixel-by-pixel durante l'implementazione):
> - [`mockups/budget-redesign-f-ambient.html`](./mockups/budget-redesign-f-ambient.html) — archetipo **Working**
> - [`mockups/screenplay-redesign-f-ambient.html`](./mockups/screenplay-redesign-f-ambient.html) — archetipo **Editorial**
> - [`mockups/shotplan-redesign-f-ambient.html`](./mockups/shotplan-redesign-f-ambient.html) — archetipo **Planner**

---

## 1 · Obiettivo

Sostituire l'attuale UI (Movie-Magic-stale, dock anni-90, trace-bar mono in fondo) con un sistema:

- **Caldo ma neutro** — palette linen (carta), bichromia ink + clay (utente) + leaf (Cesare). Niente glassmorphism, niente gradient pesanti, niente shadow drammatiche.
- **Tipografica** — Fraunces italic per display ed editorial, Inter per UI, IBM Plex Mono per misure e label, Courier Prime per sceneggiatura.
- **Cesare come presenza ambiente, non arredamento** — nessuna sidebar chat, nessuna dock permanente "AI"; Cesare si manifesta dove serve (margine, ghost inline, peek, manifesto, card flottante sul piano).
- **Tre archetipi di pagina** che condividono **lo stesso shell** ma compongono i contenuti diversamente.
- **Resiliente all'aggiunta di temi** — il giorno in cui aggiungiamo dark mode, high-contrast, o un tema commissionato da un cliente, il sistema reggerà senza riscrivere componenti.

---

## 2 · Principi

1. **Accessibility first, non last.** Oh Writers è un prodotto per professionisti del cinema, alcuni con disabilità (visive, motorie, cognitive). **WCAG AA è il minimo non negoziabile**, non un check a fine sprint. Vedi sezione 14 per i criteri operativi.
2. **Un solo DS, tre archetipi.** Stessi token, stessi font, stesse primitive. Cambia solo la composizione (layout, contenuti, voce di Cesare).
3. **Presenza ambiente.** Cesare non è una persona che sta sempre dietro la spalla. È visibile solo quando ha qualcosa da dire (peek count, dock pill count, margin note, card flottante). Idle = invisibile.
4. **Niente decorazione.** L'h1 italic gigante esiste solo se rappresenta un **valore reale**: il titolo della sceneggiatura (editorial) o il KPI numerico (working). Su Planner non c'è — sostituito da meta-line compatta.
5. **Viewbar = come vedo · Dock = cosa faccio.** Le due aree non si sovrappongono. La viewbar in alto contiene toggle-view (sottolineature, filtri, versione). Il dock bottom-right contiene azioni-comando (rigenera, salva, esporta) + pill Cesare.
6. **Token semantici, non visuali.** I componenti non sanno di che colore sono. Usano `--color-surface`, non `--paper-1`. Cambiare tema = riscrivere il file `theme.css`, non i componenti.

---

## 3 · Token system (theme-ready)

Tre layer. I componenti vedono solo il layer 2. Cambiare tema tocca layer 1 + (eventualmente) layer 2.

### 3.1 Layer 1 — Raw tokens (palette)

File: `packages/ui/src/themes/linen.css` (default), `packages/ui/src/themes/<theme>.css` per altri.

```css
/* themes/linen.css — default */
:root {
  /* Linen — paper warm neutrals */
  --linen-50:  #f5f3ee;
  --linen-100: #ebe9e3;
  --linen-200: #e2dfd6;
  --linen-300: #d8d6cd;
  --linen-400: #c4c2b9;
  --linen-500: #a09e96;
  --linen-600: #71706a;
  --linen-700: #44413c;
  --linen-800: #1c1a17;
  --linen-soft: #e3e1d780;

  /* Pure */
  --white: #ffffff;

  /* Clay — user action, page, primary */
  --clay-50:  #f4dccb;
  --clay-500: #8b3a1a;
  --clay-600: #75301a;

  /* Leaf — Cesare, agent */
  --leaf-50:  #e5e9d8;
  --leaf-500: #5a6b3c;

  /* Category accents — muted, low chroma */
  --cat-cast:        #6b3e7a;
  --cat-crew:        #3d6b4a;
  --cat-locations:   #9a5128;
  --cat-vehicles:    #2c6168;
  --cat-scenografia: #8a5a1f;
  --cat-costumi:     #8b3565;
  --cat-fotografia:  #34487a;
  --cat-suono:       #5a6b25;
  --cat-vfx:         #6a3e8a;
  --cat-comparse:    #7a5524;

  /* Plan accents — Shot Plan v2 only */
  --plan-1: #34487a;
  --plan-2: #5a6b3c;
  --plan-3: #8b3a1a;
}
```

### 3.2 Layer 2 — Semantic tokens (theme-agnostic, used by components)

File: `packages/ui/src/tokens/semantic.css`. Mapped from layer 1 — every theme MUST provide values for every semantic token.

```css
:root {
  /* Backgrounds */
  --color-bg:           var(--linen-50);   /* app background */
  --color-surface:      var(--white);      /* card, popover, dock */
  --color-surface-alt:  var(--linen-100);  /* hover bg, subtle */
  --color-surface-deep: var(--linen-200);  /* active bg */

  /* Text */
  --color-text:         var(--linen-800);
  --color-text-2:       var(--linen-700);
  --color-text-3:       var(--linen-600);
  --color-text-mute:    var(--linen-500);
  --color-text-faint:   var(--linen-400);
  --color-text-on-dark: var(--linen-50);

  /* Lines */
  --color-line:      var(--linen-300);
  --color-line-soft: var(--linen-soft);

  /* Brand bichromy */
  --color-action:      var(--clay-500);   /* primary button, page accent */
  --color-action-hover:var(--clay-600);
  --color-action-soft: var(--clay-50);
  --color-agent:       var(--leaf-500);   /* Cesare */
  --color-agent-soft:  var(--leaf-50);

  /* Status */
  --color-saved:    var(--leaf-500);
  --color-saving:   var(--clay-500);
  --color-warning:  var(--clay-500);
  --color-success:  var(--leaf-500);
  --color-info:     #34487a;

  /* Typography stacks */
  --font-sans:    "Inter", -apple-system, system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, monospace;
  --font-script:  "Courier Prime", "Courier New", monospace;

  /* Spacing */
  --space-1: 4px;  --space-2: 8px;   --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px;  --space-8: 32px; --space-10: 48px;
  --space-12: 64px;

  /* Radius */
  --radius-none: 0;
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-pill: 100px;

  /* Shadow — depth hierarchy */
  --shadow-0: 0 1px 2px rgba(28, 26, 23, 0.04);
  --shadow-1: 0 2px 4px rgba(28, 26, 23, 0.06);
  --shadow-2: 0 8px 24px -8px rgba(28, 26, 23, 0.12);
  --shadow-3: 0 12px 32px -8px rgba(28, 26, 23, 0.18);
  --shadow-4: 0 24px 64px -12px rgba(28, 26, 23, 0.3);

  /* Motion */
  --ease:        cubic-bezier(0.2, 0.7, 0.2, 1);
  --duration-1:  150ms;
  --duration-2:  200ms;
  --duration-3:  250ms;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-1: 0ms; --duration-2: 0ms; --duration-3: 0ms; }
}
```

### 3.3 Layer 3 — Component tokens (optional, derived)

Solo dove serve esprimere semantica componente-specifica.

```css
:root {
  --btn-primary-bg:    var(--color-action);
  --btn-primary-fg:    var(--color-text-on-dark);
  --btn-primary-hover: var(--color-action-hover);

  --card-bg:     var(--color-surface);
  --card-border: var(--color-line);

  --dock-bg:     var(--color-surface);
  --dock-shadow: var(--shadow-3);

  --margin-note-rail: var(--color-agent-soft);
  --margin-note-kind: var(--color-agent);
}
```

### 3.4 Aggiungere un tema

Per aggiungere `theme-dark`, `theme-high-contrast`, `theme-cinema` o un tema cliente:

1. Creare `packages/ui/src/themes/<theme>.css` con **tutti** i layer-1 raw token rimappati.
2. Il file deve essere selettivo: `:root[data-theme="dark"] { --linen-50: ...; ... }` oppure usare `@media (prefers-color-scheme: dark)`.
3. **Verificare** che ogni layer-2 semantic token abbia un valore valido nel nuovo tema. Se un raw non esiste, overridare anche la mappa semantica.
4. Nessun componente va toccato. **Test**: caricare il tema, navigare le 3 pagine canoniche (Budget, Screenplay, Shot Plan), verificare zero hardcoded breakages.

**Esempio dark theme — scaffolding minimo per test**:
```css
:root[data-theme="dark"] {
  --linen-50:  #1c1a17;
  --linen-100: #232220;
  --linen-200: #2d2b27;
  --linen-300: #3a3833;
  --linen-400: #5c5a54;
  --linen-500: #8c8a82;
  --linen-600: #b8b6ad;
  --linen-700: #d8d6cd;
  --linen-800: #f5f3ee;
  --white:     #232220;
  --clay-50:   #4a2614;
  --clay-500:  #d97551;
  --leaf-50:   #2e3322;
  --leaf-500:  #9bb37a;
}
```

Switch via `<html data-theme="dark">` — un solo attributo, zero ricaricamento.

---

## 4 · Tre archetipi di pagina

Stesso shell. Stessi token. Cambia solo la composizione del `<main>`.

| | Working | Editorial | Planner |
|---|---|---|---|
| **Quando** | Tabelle, KPI, gestione (Budget, Breakdown, Schedule, Locations, Settings, Overview) | Contenuto è prosa o sceneggiatura (Soggetto, Synopsis, Outline, Treatment, Screenplay, Manifest) | Timeline orizzontale o layout spaziale (Shot Plan, ev. Schedule strip board) |
| **Header pagina** | KPI hero number (gigante Fraunces) + eyebrow mono | Chapter opener: eyebrow mono + h1 italic Fraunces + stats mono | Eyebrow + meta one-line (no h1 decorativo) |
| **Corpo** | Sezioni con card-cluster + tabelle | Foglio bianco centrato max 760px (Courier Prime per screenplay, Fraunces per prosa) + TOC sinistra | Timeline full-width: ruler + N plan tracks + day summary cards |
| **Margin rail destra** | Sì (note Cesare tecniche) | Sì (note Cesare drammaturgo + produttore) | **No** — sostituito da CesareCard flottante sopra track attiva |
| **Dock contenuti** | Azione primaria pagina (Rigenera) + Salva + Esporta + Cesare | Esporta PDF + Versione + Confronta + Cesare | Pre-fill da breakdown + Esporta + Stampa + Cesare |
| **Mock canonico** | Budget | Screenplay | Shot Plan |

**Regola decisiva**: un h1 italic gigante (>40px) esiste solo se rappresenta valore. Sul Planner non c'è equivalente concettuale, quindi non si mette.

---

## 5 · Tre modalità Cesare

Stesso engine, stessa LLM, stesse primitive. Cambia il **system prompt** (modalità), la **voce** e l'**iniziativa**.

| Dimensione | `dramaturg` (editorial) | `producer` (working) | `ad` (planner) |
|---|---|---|---|
| **Ruolo** | Drammaturgo / co-sceneggiatore | Direttore di produzione | Primo aiuto regia |
| **Voce** | Italic Fraunces, dubitativa: "forse qui...", "considera se..." | Mono numerica, assertiva: "supera del 15%" | Mono breve, suggestiva: "OTS+CU consigliato" |
| **Iniziativa** | Bassa — interviene su passaggi critici o su richiesta esplicita (⌘.) | Alta — alza la mano da solo su inconsistenze numeriche | Media — pre-fill ghost + nudge solo se piano sovraccarico |
| **Granularità** | Frase / paragrafo / scena | Riga / totale / scostamento | Inquadratura / pattern / minuti |
| **Inline ghost** | Suggestion testo: `+pizza fumante` leaf-soft underline | Tag automatico (badge `AI` su chip categoria) | Inquadrature `is_suggested` (blocco tratteggiato + `AI` corner badge) |
| **Margin note** | "Personaggio perde voce qui" | "Reparto Trucco +15%" | (n/a — usa CesareCard) |
| **Manifest** | Note del drammaturgo (prosa Fraunces) | Report di produzione (mono + bullet) | Bozzino di giornata (lista + tempi) |
| **Trace** *(badge brand-mark)* | "Sta rileggendo l'atto I…" | "Confronta breakdown e treatment…" | "Calcola minutaggio piano 2…" |

Implementazione: `cesareMode: "dramaturg" | "producer" | "ad"` derivata automaticamente dalla `currentRoute`. Mapping in `packages/domain/src/cesare/modes.ts`.

---

## 6 · Shell components

Tutti vivono in `packages/ui/src/shell/`. Stateless, prop-driven, framework-agnostic per l'eventuale companion mobile.

### 6.1 TopBar

48px sticky. Grid `1fr auto 1fr`. Border-bottom appare solo on-scroll (`.is-scrolled`).

| Slot | Cosa | Mock ref |
|---|---|---|
| **BrandMark** (sinistra) | 22px cerchio nero + "O" Fraunces italic + pallino leaf bottom-right che pulsa quando Cesare lavora | Sezione `<button class="brand-mark">` |
| **ProjectSwitcher** | Nome progetto Fraunces italic cliccabile → popover 380px con search + 3 gruppi (In scrittura / In produzione / Archiviati) + "+ Nuovo progetto" | Sezione `.proj-popover` |
| **SectionSwitcher** | Sezione corrente in font-sans + chevron → popover 320px con 3 gruppi (Scrittura / Pre-produzione / Produzione) | Sezione `.nav-popover` |
| **SavePill** (centro-destra) | `· Salvato 12s fa` mono · pallino leaf · diventa clay+pulse durante save | `.save-pill` |
| **SearchTrigger** | Bottone `⌘K` con icona magnifying glass → apre command palette globale | `.topbar-btn#searchBtn` |
| **Bell** | Icona campana 30×30 + badge counter clay top-right → apre notifications (commenti, @menzioni, approvazioni) | `.bell` |
| **AskCesare** | Bottone `Chiedi a Cesare ⌘.` → apre QuickAsk centrato | `.topbar-btn#askBtn` |
| **Presence** | Pila orizzontale di avatar 24px overlap -8px con bordo 2px paper — fino a 4, poi `+N` | `.presence` |
| **Avatar** | Cerchio 26px clay con iniziali utente → menu utente | `.avatar` |

### 6.2 Viewbar

Sticky `top: 48px`. Padding 8/24. Contiene **view-toggles** della pagina corrente. Border-bottom on-scroll.

- Working: `Per categoria · Per scena · Per giornata · Tutti i reparti` + version selector
- Editorial: `Sottolinea: ● Cast ● Locations ● Props ● Costumi ● Fotografia ● Suono` (ToggleChip con pallino colorato per categoria) + separator + `Overlay: ● Cesare ⌥C · Commenti ⌥M · Numeri scena · Revisioni` + version selector
- Planner: `Giorno N · Tutti i giorni · Per scena` + version selector

**ToggleChip** — primitiva nuova. Pill 28px con pallino colorato a sinistra e label. `.is-on` = bordo + background; `.is-off` = transparent. Click toggle, hotkey opzionale.

### 6.3 Floating Action Dock

Pill galleggiante bottom-right (`bottom: 20px, right: 20px`). Sempre visibile. `padding: 6px`, `border-radius: 100px`, `border: 1px solid line`, `shadow-3`.

Struttura:
```
[ LABEL_MONO_UPPERCASE ] [ btnPrimary ] [ btnGhost ] [ btnGhost ] [ sep ] [ CesarePill ]
```

- **Label**: mono uppercase 10px, ti dice sempre dove sei (`BUDGET`, `SCREENPLAY`, `PIANO`).
- **btnPrimary**: clay, 34px, azione principale pagina + hotkey badge (`⇧⌘P`).
- **btnGhost**: hover paper-1, 34px, azioni secondarie + hotkey badge.
- **CesarePill**: leaf-soft, pulse dot leaf, label "Cesare", counter mono leaf-on-paper-1. Click → apre Manifesto.

**Tutti i bottoni** hanno `title=""` come tooltip nativo + hotkey badge inline (`<span class="btn-key">`).

---

## 7 · Pattern Cesare

7 modi diversi in cui Cesare appare. Lo stesso engine produce dati per tutti; ogni superficie ha latency, persistenza e tono differenti.

| Pattern | Quando | Dove | Persistenza |
|---|---|---|---|
| **Brand peek** | Click su BrandMark → popover ~340px con ultime 3 note | Top-left | Effimero (chiude on outside-click) |
| **Margin note** (working/editorial) | Note persistenti su scene/righe specifiche | Rail destro 280px sticky | Persistente fino accept/ignore |
| **CesareCard flottante** (planner only) | Suggestion contestuale su un piano | Sopra il PlanTrack attivo | Effimera per piano (un singolo dismiss) |
| **QuickAsk** (`⌘.`) | Domanda esplicita dell'utente | Popover centrato 540px + scrim | Effimero |
| **Manifesto** (`⌘M`) | Analisi narrativa estesa (drammaturgo) o report di produzione | Drawer destro 480px | Persistente per versione/giornata |
| **Inline ghost** | Suggestion testuale o tagging | Inline nel contenuto (sottolineatura leaf-soft, o blocco tratteggiato) | Persistente fino accept/edit |
| **Dock pill counter** | Indicatore numerico note pendenti | Bottom-right dock | Reattivo allo stato globale |

**Selection mini-toolbar** — quando l'utente seleziona testo o clicca una riga, appare un mini-menu dark sopra la selezione con `✦ Chiedi a Cesare · Riformula · Analizza`. Dura 2.5s o fino click fuori.

---

## 8 · Primitives (`packages/ui/src/primitives/`)

Tutte stateless, CSS Modules, prop tipizzate via Zod schema dove sensato.

| Componente | Props chiave | Note |
|---|---|---|
| `Button` | `variant: primary \| ghost \| danger`, `size: sm \| md`, `icon?`, `hotkey?` | hotkey appare come `<span class="btn-key">` |
| `Card` | `as?`, `interactive?: bool` | hover lift -1px solo se interactive |
| `Chip` | `category?`, `tone?`, `count?` | pallino colorato facoltativo |
| `ToggleChip` | `isOn: bool`, `category?`, `hotkey?`, `onToggle` | nuovo, per viewbar sottolineature |
| `Pill` | `tone: clay \| leaf \| neutral`, `count?` | brand di stato (es. CONFERMATO/CANDIDATO) |
| `Tabs` | `items`, `activeId`, `onChange` | minimal underline |
| `EditableCell` | `value`, `onCommit`, `numeric?`, `formatter?` | dashed border on-hover, clay focus |
| `Tooltip` | `content`, `placement`, `kind: dark \| info` | dark mono per shot, info linen per icons |
| `Popover` | `anchor`, `placement`, `width?` | base per nav/proj/peek popover |
| `Drawer` | `side: left \| right`, `width`, `onClose` | usato da Manifesto |
| `Scrim` | sotto popover modali + QuickAsk | backdrop-filter blur 4px |

**Composites (`packages/ui/src/composites/`)** — composti dai primitives:

- `HeroKPI` — eyebrow mono + numero Fraunces gigante + delta pill
- `StackBar` — barra stack per allocazione categorie
- `CatBar` — barra categoria con valori
- `DonutChart` — donut SSR-friendly (SVG puro)
- `DayBarSparkline` — micro-bar per giornata
- `BenchmarkCard` — confronto con media di mercato
- `MarginNote` — rail destra con note Cesare
- `CesareCardFloating` — card flottante con arrow tail
- `ManifestoDrawer` — drawer destro pieno
- `QuickAskPopover` — popover centrato per ⌘.
- `BrandPeek` — popover ~340px da BrandMark
- `ProjectSwitcher` — popover 380px con search + groups
- `SectionSwitcher` — popover 320px con groups
- `FloatingDock` — pill bottom-right con slot azioni
- `OrConfirmRow` — riga piano con radio + badge + lucchetto (Shot Plan)

---

## 9 · Pattern complessi

### 9.1 OR Confirmation (Shot Plan)

I piani di una giornata sono mutualmente esclusivi: solo uno verrà eseguito. Pattern UI:

- Header bar in alto: titolo + sottotitolo che spiegano l'OR, badge hotkey `1·2·3`.  
  > **Nota implementativa**: il banner OR del mock attuale è un'approssimazione visiva. Versione finale = **radio + bottone `Conferma piano A` + icona lucchetto per lock piano o lock-scene**. Ridefinito durante l'integrazione della worktree `crazy-goldstine-f9db2f` (spec 22b).
- Ogni piano ha:
  - **Radio circolare** 18×18 a sinistra del plan-meta. Vuoto = candidato, pieno clay = confermato.
  - **Badge mono uppercase**: `CONFERMATO` (clay) o `CANDIDATO` (linen-100).
  - Opacità 0.55 se candidato, 1.0 se confermato. Hover su candidato porta a 0.85 per scopribilità.
- **Hotkey** `1`, `2`, `3` (e `4`, `5` se più piani) confermano il piano corrispondente.
- **Lucchetto** (futuro) blocca il piano o singole scene contro modifiche da parte di Cesare o altri membri.

### 9.2 Inline ghost suggestion

Cesare propone modifiche **dentro** il contenuto, l'utente le accetta o le rifiuta senza uscire dal flow.

- **Editorial**: `<span class="ghost">testo proposto</span>` con `color: leaf` + `background: leaf-soft` + `border-bottom: 1px dashed leaf`. Click sul ghost → menu accept/reject.
- **Working** (chip categoria con AI tagging): chip ha `::after` con label `AI` corner-pinned, colore leaf. Hover mostra "Suggerito da Cesare · da breakdown sc.3". Click → menu accept/reject.
- **Planner** (shot suggested): blocco `.is-suggested` ha `opacity: 0.55`, `border-style: dashed`, `::after` badge `AI`. Click su shot → menu accept/edit/reject.

Accept = il ghost diventa reale, perde lo stile speciale. Reject = il ghost sparisce con fade 200ms.

### 9.3 Selection mini-toolbar

Pattern contestuale per qualsiasi selezione (riga tabella, span testo, blocco shot).

- Appare ~40px sopra la selezione
- Dark `ink-800` bg, paper-1 fg
- Bottoni: `✦ Chiedi a Cesare` (leaf accent) · `Riformula` · `Analizza` (sensitive al contesto)
- Sparisce dopo 2.5s o click fuori

---

## 10 · Keyboard shortcuts

Discoverable tramite tooltip sui bottoni + cheatsheet in `Settings → Tastiera`. Hotkey badge visibili dove naturali.

### Globali
| Combo | Azione |
|---|---|
| `⌘K` | Command palette globale (search progetti, scene, persone) |
| `⌘.` | QuickAsk Cesare (popover centrato) |
| `⌘M` | Apri Manifesto (drawer destro) |
| `⌘/` | Toggle cheatsheet hotkey |
| `⌘B` | Toggle TOC / sidebar sinistra (su editorial) |
| `Esc` | Chiude qualunque popover/drawer/modal |

### Editorial (Screenplay/Soggetto/Outline/Treatment)
| Combo | Azione |
|---|---|
| `⌥C` | Toggle margin notes Cesare |
| `⌥M` | Toggle commenti |
| `⌘E` | Esporta PDF |
| `⌘⇧V` | Apri Versioni |

### Working (Budget/Breakdown/Schedule/Locations)
| Combo | Azione |
|---|---|
| `⌘R` | Rigenera (azione primaria pagina) |
| `⌘S` | Salva preventivo / configurazione |
| `⌘E` | Esporta |

### Planner (Shot Plan)
| Combo | Azione |
|---|---|
| `1·2·3` | Conferma piano corrispondente |
| `⌘⇧P` | Pre-fill da breakdown |
| `⌘E` | Esporta piano confermato |
| `⌘P` | Stampa per troupe |
| `⌘⇧B` | Apri blocking editor |
| `⌘⇧V` | Apri vista 3D (futuro) |

---

## 11 · Typography

| Token | Famiglia | Uso | Esempi |
|---|---|---|---|
| `--font-display` | Fraunces (variable, opsz 9-144) | h1 editorial, KPI hero, nomi progetto, note Cesare in italic | "Non fa ridere", "1.247.000 €" |
| `--font-sans` | Inter | UI generale, body, label form, button | "Salva preventivo" |
| `--font-mono` | IBM Plex Mono | Numeri tabulari, metadata, eyebrow, hotkey badge, mono-uppercase labels | "GIORNATA 4", "001", "+4,2%" |
| `--font-script` | Courier Prime | Sceneggiatura nel foglio bianco | "SC. 3 INT. PIZZERIA" |

**Quando usare italic Fraunces**:
- Titoli di opere (sceneggiatura, soggetto, episodio)
- Hero KPI numerici
- Voce diretta di Cesare (margin notes, peek notes, manifest)
- Nomi progetto nel ProjectSwitcher

**Quando NON usare italic Fraunces**:
- UI generica → Inter
- Numeri tabulari (totali, percentuali, durate) → IBM Plex Mono
- Label uppercase → IBM Plex Mono uppercase

---

## 12 · Iconography

Sprite SVG inline `<svg class="icon">` con `stroke: currentColor` e `stroke-width: 1.8` (1.6 per icone piccole nei nav-item).

- Stile: **Lucide-like**, line-based, no fill (eccetto pochi caso dove serve massa).
- File: `packages/ui/src/icons/sprite.svg` con `<symbol id="icon-xxx">`.
- Componente wrapper: `<Icon name="search" />` che fa `<svg><use href="#icon-xxx"/></svg>`.
- Lista icone minime: `search`, `bell`, `clock`, `plus`, `chevron-down`, `chevron-right`, `external`, `download`, `upload`, `refresh`, `pin`, `lock`, `unlock`, `eye`, `eye-off`, `comment`, `at`, `mic`, `play`, `pause`, `arrow-left-right`, `git-branch`, `compass`, `map-pin`, `camera`, `clipboard`, `book`, `file-text`.

---

## 13 · Layout & spacing

- App wrapper: `max-width: 1440px`, padding lateral var(--space-6) (24px).
- Working main: grid `1fr 280px` (content + margin rail) con gap `--space-10` (48px).
- Editorial main: grid `280px 1fr 280px` (TOC + foglio + margin rail) con gap `--space-8` (32px).
- Planner main: full-width, no rail.
- Foglio bianco editorial: `max-width: 760px`, padding `--space-10` 72px, `font-script` 13.5px.

**Logical properties** ovunque (`margin-inline-end`, `padding-block`, `border-inline-start`) per RTL-ready future.

---

## 14 · Accessibility (requisito non negoziabile)

WCAG 2.2 AA è il minimo. Ogni primitive, composite, layout e pagina deve verificare i criteri sotto prima del merge. **Non è un audit finale, è un check di ogni task.**

### 14.1 Tastiera e focus

- Ogni elemento interattivo è raggiungibile via `Tab` nell'ordine logico (DOM-order = visual-order).
- `Enter`/`Space` attivano bottoni e link-button. `Esc` chiude popover, drawer, modal, command palette.
- **Focus visible obbligatorio**: `:focus-visible { outline: 2px solid var(--ds-action); outline-offset: 2px; }` — mai rimosso, mai sostituito da nulla di meno contrastato.
- **Focus trap** dentro Drawer (Manifest), Dialog (Conferma), QuickAsk popover. Restoring focus all'elemento trigger alla chiusura.
- Skip-link `Salta al contenuto` come primo elemento focusable, visibile on-focus.

### 14.2 Semantic HTML & ARIA

- `<button>` non `<div onClick>`. `<nav>`, `<main>`, `<aside>` con landmark espliciti.
- Bottoni icon-only: `aria-label` obbligatoria. Icon component lo gestisce: passare `aria-label="Chiudi"` promuove l'svg a `role="img"`.
- Popover trigger: `aria-haspopup="menu"`, `aria-expanded` sincronizzato con lo stato open/closed.
- ToggleChip: `role="switch"` + `aria-checked`. ToggleChip per categoria: `aria-label="Mostra sottolineature Cast"` esplicito.
- Margin notes: `role="complementary"` sul rail destro, `aria-label="Note di Cesare"`.
- Tabelle dati (Budget, Schedule): `<table>` con `<th scope="col">` e `<caption>`.

### 14.3 Contrasto colore

Ogni combinazione testo-su-sfondo deve essere verificata su **entrambi i temi** (linen + dark).

| Combinazione | Ratio | WCAG |
|---|---|---|
| `--ds-text` (linen-800) su `--ds-bg` (linen-50) | ≥ 13:1 | AAA |
| `--ds-text-2` (linen-700) su `--ds-bg` | ≥ 8:1 | AAA |
| `--ds-text-3` (linen-600) su `--ds-bg` | ≥ 5:1 | AA |
| `--ds-text-mute` (linen-500) su `--ds-bg` | ≥ 3.5:1 | AA per large text (≥18px o ≥14px bold) |
| `--ds-text-faint` (linen-400) | ❌ **MAI** usare per testo, solo per decorazioni/disabled visuals |
| `--ds-action` (clay-500) su `--ds-bg` | ≥ 4.5:1 | AA |
| `--ds-agent` (leaf-500) su `--ds-bg` | ≥ 4.5:1 | AA |
| `--ds-text-on-dark` su `--ds-action` (clay button bg) | ≥ 4.5:1 | AA |

Componenti UI (bordi bottoni, icone, dividers): ratio ≥ 3:1 vs adiacent background.

### 14.4 Motion

- `prefers-reduced-motion: reduce` → tutte le `transition` e `animation` durano 0ms (già hookato nei token DS-v2).
- Pulse Cesare (BrandMark, dock-cesare-dot, peek-head-dot): sostituito da color-shift statico se reduced-motion.
- Scroll-driven effects (border on `.is-scrolled`): rispetta reduced-motion = applica immediatamente, no transizione.

### 14.5 Screen reader

- Annunci dinamici via `aria-live="polite"` per: SavePill ("Salvato 12 secondi fa"), Toast notifications, Cesare margin notes nuove.
- `aria-live="assertive"` solo per errori critici (save failed).
- Modal/Drawer: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` puntando al titolo.
- Icone decorative: `aria-hidden="true"`. Icone informative: `aria-label` esplicito.

### 14.6 Form e input

- Ogni `<input>` ha `<label>` esplicita associata (non solo placeholder).
- Errori: `aria-describedby` collega input a messaggio errore con `role="alert"`.
- EditableCell: già wrappata in label virtuale, mantenere `aria-label` con il context ("Effettivo Pizzeria Sottoscala, modifica importo").

### 14.7 Verifica obbligatoria per ogni task

Prima del merge di **qualsiasi** componente o pagina:

1. **Automated audit**: `axe-core` o Lighthouse a11y → score ≥ 95, zero violazioni critiche.
2. **Keyboard-only test**: completare il flow principale senza toccare il mouse.
3. **Contrast check**: verificare via DevTools o tool dedicato su entrambi i temi.
4. **Screen reader spot-check**: VoiceOver (`⌘F5` su macOS) sui flussi critici della feature.
5. **Reduced-motion**: emulate `prefers-reduced-motion: reduce` in DevTools → no animation persistente.

Se un punto sopra fallisce, non è "da rifare dopo" — è un bug bloccante.

### 14.8 Hotkey come supporto, non sostituto

Le hotkey arricchiscono l'esperienza ma non sostituiscono la accessibilità:

- Ogni azione raggiungibile via hotkey deve essere raggiungibile anche via UI visibile.
- Hotkey hint: ogni hotkey ha rappresentazione visiva (badge) + tooltip che la annuncia (es. `title="Chiedi a Cesare (Cmd+.)"`).
- Cheatsheet `⌘/` mostra TUTTE le hotkey disponibili. Stampabile + indicizzata per archetipo.

---

## 15 · File structure

```
packages/ui/
├── src/
│   ├── themes/
│   │   ├── linen.css        ← default theme, layer 1
│   │   └── _theme-shape.css ← documenta i raw token richiesti
│   ├── tokens/
│   │   └── semantic.css     ← layer 2 + layer 3
│   ├── fonts/
│   │   └── fonts.css        ← @font-face + preload hints
│   ├── icons/
│   │   ├── sprite.svg
│   │   └── Icon.tsx
│   ├── primitives/
│   │   ├── Button/ Card/ Chip/ ToggleChip/ Pill/ Tabs/ EditableCell/
│   │   ├── Tooltip/ Popover/ Drawer/ Scrim/
│   │   └── index.ts
│   ├── composites/
│   │   ├── HeroKPI/ StackBar/ CatBar/ DonutChart/ DayBarSparkline/ BenchmarkCard/
│   │   ├── MarginNote/ CesareCardFloating/ ManifestoDrawer/ QuickAskPopover/ BrandPeek/
│   │   ├── ProjectSwitcher/ SectionSwitcher/ FloatingDock/ OrConfirmRow/
│   │   └── index.ts
│   ├── shell/
│   │   ├── TopBar/ Viewbar/ AppShell/
│   │   └── index.ts
│   └── layouts/
│       ├── WorkingLayout/ EditorialLayout/ PlannerLayout/
│       └── index.ts
```

Tutto framework-agnostic (pure React + CSS Modules). Nessuna dipendenza da Monaco, Yjs, TanStack — quei moduli importano da `@oh-writers/ui`, non viceversa.

---

## 16 · Migration plan

Ordine di refactor. Ogni task produce un commit pulito, regression-tested. Niente big-bang.

| Task | Cosa | Dipendenze | Stima |
|---|---|---|---|
| **12a** | Foundation: themes/linen.css, semantic.css, fonts, sprite icone, Icon wrapper | — | 0.5g |
| **12b** | Primitives: Button, Card, Chip, ToggleChip, Pill, Tabs, EditableCell, Tooltip, Popover, Drawer, Scrim | 12a | 1.5g |
| **12c** | Shell: TopBar (Brand+Project+Section+Save+Search+Bell+Ask+Presence+Avatar), Viewbar, FloatingDock | 12b | 1g |
| **12d** | Composites Cesare: BrandPeek, MarginNote, QuickAskPopover, ManifestoDrawer, CesareCardFloating | 12b, 12c | 1g |
| **12e** | Composites data: HeroKPI, StackBar, CatBar, DonutChart, DayBarSparkline, BenchmarkCard | 12b | 1g |
| **12f** | Layouts: WorkingLayout, EditorialLayout, PlannerLayout | 12c, 12d | 0.5g |
| **12g** | BudgetPage refactor (assorbe 11d task 3-8: CategoryLineWidget, LocationsWidget, VehiclesWidget, DayView, TotalWidget, BudgetPage wire-up + E2E) | 12e, 12f | 2g |
| **12h** | Breakdown refactor (WorkingLayout + ToggleChip per sottolineature inline + AI badge su tag automatici) | 12f, 12g | 1.5g |
| **12i** | Schedule refactor (WorkingLayout, strip board diventa eventuale PlannerLayout) | 12f, 12g | 1g |
| **12j** | Screenplay shell refactor: WorkingLayout esterno, Monaco editor interno invariato, chapter opener + TOC + margin rail dramaturg+producer | 12f | 1.5g |
| **12k** | Soggetto / Synopsis / Outline / Treatment refactor: EditorialLayout, ProseMirror invariato, margin rail | 12f, 12j | 1g |
| **12l** | Locations + Overview + Settings refactor: WorkingLayout | 12f | 1g |
| **12m** | Shot Plan v2 refactor (convergenza dalla worktree `crazy-goldstine-f9db2f`): PlannerLayout + render 2D + OR confirm pattern finale (radio + bottone Conferma + lucchetto) + CesareCard flottante | 12f, dipende dalla merge della worktree | 2g |
| **12n** | Theme additions: `dark.css` + `high-contrast.css` come test di tenuta token; toggle in Settings | tutto | 1g |
| **12o** | Cleanup: rimozione vecchio chrome (header legacy, sidebar chat se esiste, trace bar mono); audit hardcoded hex/px residui | tutto | 0.5g |

**Stima totale**: ~16-18 giorni-uomo. Va parallelizzato: 12a-b-c-d-e-f sono sequenziali (foundation), poi 12g-h-i-j-k-l-m sono indipendenti e parallelizzabili.

**Criterio di "done" globale**: tutte le pagine producono lo stesso DS-v2 ambient, nessun import diretto a `--paper-*` o `--ink-*` o `--clay-*` raw nei feature files (solo semantic), `pnpm grep "--paper-\|--ink-\|--clay-\|--leaf-" apps/web/app/features` deve tornare zero match.

---

## 17 · Out of scope (per spec separate)

- **Tema dark "cinema"**: solo lo scaffolding di `dark.css` qui (task 12n). Il design dark vero — palette, comportamento Cesare di notte, contrast tuning — è materia per spec a parte.
- **Render 3D scene blocking**: il pannello 2D è SVG schematico, sufficiente per ora. Il 3D (Three.js o WebGPU) verrà in spec dedicata, integrabile dietro il bottone `⌘⇧V`.
- **Mobile / PWA / Expo companion**: le primitives nascono framework-agnostic per essere portabili, ma il layout mobile non è scope qui. Spec dedicata.
- **Cesare model selection / streaming UI**: come l'utente sceglie modello, gestisce token, vede streaming — spec separata su Cesare backend.
- **Multi-tenant theming**: il sistema regge l'aggiunta di temi cliente, ma l'UI per selezionarli e il billing relativo sono parte di spec multi-tenancy.

---

## 18 · Verifica visiva pre-merge

Prima del merge finale (dopo task 12o), validare a occhio + screenshot:

1. **Budget page** — mock canonico è [`budget-redesign-f-ambient.html`](./mockups/budget-redesign-f-ambient.html). Confronto: TopBar identica · ProjectSwitcher con i progetti reali · Viewbar filtri funzionanti · Hero number + cat cards + tabella editabile · Margin notes con 3 note Cesare seed · Dock `BUDGET: Rigenera · Salva · Esporta · ● Cesare N`.
2. **Screenplay page** — mock canonico è [`screenplay-redesign-f-ambient.html`](./mockups/screenplay-redesign-f-ambient.html). Confronto: TOC sinistra · Chapter opener + foglio bianco · Margin con note `✦ SCRITTURA` (leaf) e `✦ PRODUZIONE` (clay) · Dock `SCREENPLAY: Esporta PDF · Versione · Confronta`. Editor Monaco interno invariato.
3. **Shot Plan page** — mock canonico è [`shotplan-redesign-f-ambient.html`](./mockups/shotplan-redesign-f-ambient.html). Confronto: header compatto (no h1) · Render 2D · Plan tracks con radio+badge+confirm · CesareCard flottante · Dock `PIANO: Pre-fill · Esporta · Stampa`.
4. **Tema dark**: caricare `<html data-theme="dark">`, ricontrollare le 3 pagine. Nessun layout-break, contrasti ancora AA, Cesare ancora distinguibile.

Se uno qualunque di questi quattro check fallisce, il task del DS-v2 non è done.
