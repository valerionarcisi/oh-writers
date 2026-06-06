# Spec 64 — Start a Cesare session from a margin suggestion

A quick affordance on each Cesare margin note (the `CESARE · STRUTTURA /
CHIAREZZA / TONO …` cards beside the prose editor) to **launch a floating Cesare
session seeded with that suggestion**. One click turns a passive note into an
active working session on that exact point.

## Behaviour

- Each margin note (`CollapsibleNote`, kind `cesare`) shows an **"✦ Avvia
  sessione"** control **inside the card, revealed when the note is open** (in the
  `actions` row, after the body). A closed card shows only its title — you open it
  to read the suggestion AND to get the start-session action. Keeps the column
  quiet: no controls on closed cards.
- Clicking it **opens the floating Cesare drawer, starts a FRESH session, and
  IMMEDIATELY sends** the suggestion as the prompt (`category: message`). A
  suggestion is a new line of work — it must NOT append to the currently-open
  thread. One click = a new started session, no extra typing.
- It opens the **floating** surface (not the split, not a routed page) — the
  margin column lives beside the entity editor, so the live-doc contract holds.

## Implementation

- `CollapsibleNote` gains an optional **`headerAction`** slot: a node pinned
  top-right of the note, hidden until the note is hovered/focused
  (`.note:hover .headerAction`, `.note:focus-within`). It is a sibling of the
  header `<button>` (never nested — no button-in-button).
- `OpenCesareOptions` gains **`prompt?: string`**. `openCesare({ prompt })` stores
  a `{ text, nonce }` seed (nonce = `Date.now()`, so re-clicking the same note
  re-sends) and opens the floating sheet.
- `CesareSheet` gains a **`seedPrompt`** prop; an effect, once per nonce when the
  sheet is open (`sentSeedNonceRef`), **creates a new session** via
  `createSession`, selects it, and sends the prompt into it with the explicit
  `session.id` (so the send doesn't race the state update). Only the floating
  render receives `seedPrompt` (`!isSplit`), never the split lane.
- `useCesareChat.send` / the store `send` accept an optional `sessionId` so the
  seed can target the just-created session deterministically.
- `MarginNotesColumn` renders the `headerAction` `Button` (`ghost`, `sm`) wired to
  `openCesare({ prompt: \`${memo.category}: ${memo.message}\` })`.

## Tests

- Unit: `openCesare({ prompt })` seeds `{ text, nonce }`; nonce changes per call.
  `CesareSheet` sends the seed once per nonce (guarded re-send).
- E2E (`OHW-064`, when asked): hover a margin note → "Avvia sessione" appears →
  click → the floating chat opens and a user bubble with the suggestion text is
  sent; Cesare's turn runs.
