# Context — Oh Writers

A glossary of the domain language. Definitions only — no implementation detail.

## Cesare edit

A change Cesare (the AI assistant) makes to a project entity. Cesare edits are
**always applied live**: the open entity holds the new version immediately; there
is no side draft tray and no accept/reject gate as the primary flow. A version is
auto-created before the change so it remains revertible.

## Mostra / Nascondi modifiche (Show / Hide changes)

The control that lets the writer see what a Cesare edit changed, **for a prose
narrative document** (Soggetto, Sinossi, Trattamento, logline — Scaletta is a
structured outline, not prose, and is out of scope). It is an
**in-editor highlight on the modified entity** — green on added/changed words for
"Mostra", a peek at the prior text for "Nascondi". It is NOT a separate
accept/reject surface and NOT a draft tray. The document always keeps the change
when the chat is closed.

The Cesare edit enters the editor **as an ordinary edit**, so native **Cmd-Z**
undoes it exactly as if the writer had typed it (and Cmd-Shift-Z redoes it).

"Mostra/Nascondi" always follows the **entity Cesare actually modified** (e.g. a
logline edit made from the Soggetto page acts on the logline), not the page that
happens to be open. Where the highlight appears depends on where the writer is:

- **On the modified entity's page** → highlight inline in that editor. No
  SplitDrawer.
- **In the chat session** (`/sessions/:sessionId`) → "Mostra" opens the
  **SplitDrawer** with the modified page beside the conversation, highlight inline
  inside that preview.
- **On any other page** → "Mostra" **navigates** to the modified entity's page and
  highlights inline there. No SplitDrawer outside the chat.

The button is **contextual** to the applied state of the edit:

- Edit currently present in the document → button is **Nascondi** (peek the prior
  text, then it fades; the change stays).
- Edit no longer present (the writer pressed Cmd-Z) → button becomes **Riapplica**:
  it re-applies Cesare's same change as a fresh edit (so it does not rely on the
  fragile redo stack). The edit can never be "lost" — it is always either applied
  (Nascondi available) or removed (Riapplica available).

## SplitDrawer

The **one and only** drawer in the app. There is no other drawer kind. It is
always an **in-flow lane that COMPRESSES the page** when it opens — the app is
fluid, the main content reflows narrower beside it; it is **never** a fixed
overlay floating over the page. This is mandatory for every surface the
SplitDrawer hosts (Cesare change-preview, notifications, versions, and any future
panel): opening the SplitDrawer always collapses the page. No exceptions.

Only **one** SplitDrawer lane is visible at a time (the Notion peek /
Claude-Desktop artifact model): opening a new content **replaces** what is shown.
The page compresses exactly once and stays readable.

The SplitDrawer keeps a **navigation history** of the contents shown in it.
Opening a new content **pushes** it (and shows it); the header's **← / →** move
back and forward through that history so a replaced content is never lost. **×**
closes the whole drawer (clears the history) and the page un-compresses. Opening a
content identical to one already in the history does not duplicate it — it brings
the existing entry forward instead of pushing a copy.

There is **no word-level diff highlight in the editor**, ever. A word-by-word
green/red diff is programmer language; the audience is writers/directors/producers.
The change is communicated in human terms instead:

- **In a chat session** (`/sessions/:sessionId`) the result card shows **"Vedi
  modifica"** (opens the read-only split-preview: the final document text, clean,
  no highlight, with a bullet summary of what changed) and **"Apri \<Entity>"**
  (navigates to the entity's real page).
- **On the entity's own page** the feedback is INLINE — the SplitDrawer is **never**
  opened on the entity you are editing (it would duplicate the document you are
  already reading). A discreet card/banner says "✦ Cesare ha aggiornato il
  \<Entity>" with **"Vedi modifiche"**, **"↩ Annulla"** (reverts the edit for real),
  and **× / Ho visto** (closes the card). "Vedi modifiche" is **adaptive**: a
  **surgical** edit underlines the changed blocks in place; a **large rewrite**
  (too much to underline) expands the bullet "cosa cambia" summary **inside the
  card**, not the split. Threshold ≈ 40% of words changed.

This in-editor card is the **canonical way agentic edits are shown when the writer
is ON the touched page**. Granularity: **one card per Cesare turn** on the prose
documents (the individual changes are bullets inside it; ↩ Annulla reverts the
whole turn), and **one card per scene** on the screenplay (scenes are separable
units; ↩ Annulla reverts that scene). **↩ Annulla restores the document to the
state BEFORE the turn began** — the snapshot captured pre-turn, skipping any
intermediate versions Cesare created mid-turn (e.g. on a version conflict) — not a
single step back. Multiple cards **stack collapsed** — a single
card visible with the others hinted behind it and a "N modifiche" counter / ‹ ›
nav to move between them; expandable to a full list on demand. On the screenplay the
per-scene cards float pinned near their scene (`[data-scene-number]`) rather than
stacking in one spot, with an indicator to jump between edited scenes.

The stack lives in **browser-session memory** (a singleton store): it **survives
client-side routing** (changing page, the bell navigating you to the entity, opening
drawers) so the bell can carry you to the entity and find the card waiting — but it
**dies on a tab reload**. The durable history is the **Versions** surface.

The three notification contexts are **complementary, same visual language (the
card), different entry points**:

- **In a chat session** → the SplitDrawer shows the modified page (the editor is
  not in front of the user there).
- **On the touched entity's page** → the in-editor card stack (above) — never the
  split.
- **Anywhere else** ("it happened while you were elsewhere") → the **bell /
  NotificationCenter** stays as the cross-page channel; clicking it navigates to the
  entity, where the same card stack is waiting. The bell is NOT replaced by the
  stack — the stack only exists on the touched page.

Version rollback lives in the **Versions surface** (master→detail: read an old
version, then **Attiva** it). There is no two-column before/after diff there.

## Version

A saved snapshot of a document's content. Versions exist for **every** document —
narrative (Soggetto, Sinossi, Trattamento, logline, Scaletta) and screenplay alike
— and share one model: each has a number, an optional human label, a creation time,
a **draft colour** (a stable per-version identifier dot, Notion-style) and an
optional **draft date**. (Page count is a screenplay-only attribute and is absent
on narrative versions.) Versions are created automatically before each Cesare edit
and can also be created manually ("Nuova versione").

**Attiva** is the single verb for making a version the live/current content — for a
narrative document it switches the active version; for the screenplay it restores
that version. There is no separate "restore" concept: Attiva _is_ restore.

## Versions surface

The **durable** home for a document's version history and the only place a change
can be rolled back for real (the in-editor card stack and the bell are transient;
see _SplitDrawer_). It is hosted in the **SplitDrawer** (the one drawer) and is
**master→detail**: a list of versions on the left; clicking one opens its **full
content, formatted and read-only** (rendered like the editor) on the right, with
**Attiva** and **Indietro** (back to the list). It is reached from a **version
control in the TopBar** that shows the current version (e.g. `● v3`) and opens the
surface on click — the single entry point.

There is **no side-by-side diff and no "compare two versions" mode**. The audience
is writers/directors/producers; the comparison they need is "read this old version,
then bring it back", not a programmer's two-column diff. (See ADR.)

## Per-feature action menu

A single **Notion-style popover** anchored top-right near the gear, holding the
**contextual** actions for the page in view — export, import, and any page-specific
tools — resolved per feature (e.g. Soggetto offers PDF/DOCX/SIAE export; the
screenplay offers FDX import/export). It is the one home for these per-page tools;
they are not scattered as standalone buttons. The menu's contents come from the
shared action registry, gated by feature flags.

## Proposed scene edit (screenplay)

Distinct from a narrative-document Cesare edit: a scene-level proposed change in
the **screenplay** editor that the writer accepts or rejects inline (scene-aware,
ProseMirror decoration). This accept/reject flow is legitimate and specific to the
screenplay; it is NOT the narrative-document flow and is not governed by
"Mostra/Nascondi modifiche" above.
