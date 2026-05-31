# Audit D — Cesare-only workflow (write a whole project using only Cesare)

Date: 2026-05-31 · Persona: Italian writer who never types into the editors by hand and asks Cesare for everything.
Environment: branch based on `main` (`3e889ad`), `MOCK_AI=true`, dev server on `:3013`, owner account `valerio@ohwriters.dev`.
Project used: **La cena dei ricordi** (`f900a208-8a9f-46d8-9c2c-1b66dbca72d0`), created fresh and verified persisted in the test DB.
Specs in scope: 44 (shell + agentic edit), 46 (SplitDrawer), 47e (Mostra/Nascondi + flash), 49 (versions), 50 (write-from-zero next-step chip), 52 (full-screen new-session landing).

## Verdict: can a project be written end-to-end via Cesare alone?

**No.** Under the only available mode (`MOCK_AI=true`), a Cesare-only writer can produce **exactly one real document — the logline** — via the next-step chip. Every step after that (soggetto → sinossi → scaletta → trattamento → sceneggiatura) **reports success in the chat but writes nothing to the document**, so the narrative chain dead-ends at the first link. Free-typed natural-language requests (which is how this persona works) overwhelmingly return _"Ho letto la tua richiesta ma non ho strumenti specifici da invocare per questo caso."_ The full-screen landing, the next-step chip, versioning-of-the-logline, focus mode, session persistence, and cross-surface chip consistency all work; the actual generation past logline does not.

All findings below were verified against the database (`documents.content` length + `document_versions`) and the dev-server server-fn payloads, not just the chat text. Zero client-side JS console errors were observed throughout — every failure is a server/tool-level no-op that surfaces only as (often misleading) chat copy.

---

## ALTO

### A1 — The narrative chain dead-ends after the logline: every step claims success but persists nothing

- **Flow:** empty project → next-step chip "Scrivi una logline dal tuo spunto" (works, logline persisted) → chip "Genera il soggetto dalla logline" → …
- **What breaks:** clicking "Genera il soggetto dalla logline" makes Cesare reply _"Ho aggiornato il soggetto con una nuova versione v2: l'ho applicata direttamente al documento."_ with a result card "Aggiornata … · 1 MODIFICA". In reality the **soggetto document stays `len=0`, no soggetto version is created**, and the next-step chip never advances (it keeps offering "Genera il soggetto dalla logline"). Verified in DB after clicking: `logline=166 soggetto=0 synopsis=0 outline=0 treatment=0`; only `document_versions` for `logline=1`. The server progress payload itself reports `{logline:true, soggetto:false, …}`, i.e. the backend knows nothing was written, yet the chat says it was.
- **Why it matters:** this is the headline promise of specs 50/52 — start from a spunto and build the chain with Cesare. The user is told their soggetto exists ("versione v2"), navigates to the Soggetto editor, and finds _"0 cartelle · 0 caratteri · Inizia a scrivere…"_. They cannot tell the chain has stalled except by manually opening each empty doc. This is the single most damaging Cesare-only failure: **silent fabricated success.**
- **Root cause (read in code):** the post-logline generators are screenplay-derived (`propose_soggetto_v2`, `propose_synopsis_from_screenplay`, `propose_scaletta_from_soggetto`, …). On a write-from-zero empty project they have no upstream prose/screenplay seed, so under `MOCK_AI` they emit the success message but apply no content. `write_logline` is the only generator that writes from a bare instruction.
- **Fix:** (1) make the soggetto/sinossi/scaletta/trattamento generators write from the upstream _document_ prose (logline→soggetto, soggetto→sinossi, …), not from a screenplay seed, so the chain works on an empty project; (2) **never emit a "Aggiornato …/versione v2 applicata" success message unless a document version was actually created** — gate the success copy on the persisted result (`isOk && wrote===true`), otherwise surface "non sono riuscito a scrivere il <entità>, riprova". The progress payload already carries the `false` flag; wire the chat copy to it.

### A2 — Free-typed natural-language requests almost never trigger a tool (the persona's primary input)

- **Flow:** in the session/drawer composer, type requests the way a writer would: "Scrivi la scaletta.", "Genera il trattamento.", "Migliora il finale del soggetto.", "Aggiungi un personaggio antagonista.", "Rendi la sinossi più commovente.", "Fai un riassunto di cosa abbiamo scritto finora."
- **What breaks:** **all six** returned _"Ho letto la tua richiesta ma non ho strumenti specifici da invocare per questo caso."_ The opening spunto "…Scrivimi una logline da questo spunto." also hit the no-tool fallback. Across the session the no-tool fallback fired **8 times**. Even a pure conversational ask that needs no tool ("fai un riassunto di cosa abbiamo scritto finora") gets the no-tool refusal instead of a plain answer.
- **Why it matters:** a Cesare-only user types in natural language, not canned chip phrasings. If only the exact chip strings dispatch, the product is effectively a button-driven wizard wearing a chat UI. Worse, the no-tool fallback for a conversational request makes Cesare look unable to even talk about the project.
- **Fix:** (a) broaden intent→tool routing so common phrasings ("scrivi la scaletta", "genera il trattamento", "migliora X") map to the corresponding generator/edit tool; (b) when no tool matches but the user asked a conversational question, **answer conversationally** instead of returning the no-tool template — reserve that template for genuinely unactionable input. (Note: this is partly a `MOCK_AI` matcher limitation, but it is the only mode available and it is what a tester/demo hits.)

### A3 — "Mostra modifiche" opens a diff panel with no readable before/after content

- **Flow:** after the logline edit, click **Mostra modifiche** on the result card.
- **What breaks:** the SplitDrawer diff panel opens (MODIFICHE · REPLACE · Accetta/Rifiuta/Accetta tutto/Rifiuta tutto) but **shows no actual old-vs-new text** — there is nothing to read. "Review what changed" yields an empty diff.
- **Why it matters:** the entire point of the agentic-edit pattern is that the user can review the AI's change before trusting it. With no visible diff, a Cesare-only user cannot tell what was written or replaced.
- **Fix:** render the actual document diff (old → new content) in the MODIFICHE panel; if the diff is empty because nothing was written, show that explicitly rather than an empty REPLACE card.

### A4 — No working revert: the promised "↩ Annulla" is missing and the diff-panel "Rifiuta" does not roll back an applied edit

- **Flow:** every result card's copy says _"Se non ti convince usa ↩ Annulla."_ Look for that button; then try the diff panel's "Rifiuta tutto".
- **What breaks:** there is **no ↩ Annulla button on any result card** — the cards expose only "Mostra modifiche". The only "Annulla" buttons in the DOM belong to the delete-session dialog. Using the diff panel's **"Rifiuta tutto"** on the already-applied logline left the document unchanged (`logline` still `len=166`), i.e. it did not revert the committed edit.
- **Why it matters:** the Agentic Edit Pattern (CLAUDE.md) mandates an inline **↩ Annulla** on every edit. The copy tells the user to use it, but it does not exist, and the available reject control is a no-op on applied edits. A Cesare-only user has no one-click way to undo what Cesare did.
- **Fix:** render the inline **↩ Annulla** on the result card and wire it to revert to the auto-created pre-edit version; ensure the diff panel's Rifiuta/Rifiuta-tutto actually restores the prior document version.

---

## MEDIO

### M1 — Every document edit is mislabeled "Sceneggiatura" in the trace and diff

- **Flow:** logline and soggetto edits both render a result card titled **"Aggiornata Sceneggiatura"**, and the diff panel labels everything **SCENEGGIATURA** (header, chip, REPLACE row, trace title).
- **Why it matters:** the user can't tell which document Cesare touched. A logline edit announced as "Sceneggiatura" is confusing and erodes trust — especially given A1, where the user is already unsure whether anything happened.
- **Fix:** use the real target entity in the result card title, trace title, and diff header (`Aggiornata Logline`, `Aggiornato Soggetto`, …). The tool→entity map exists (`cesare-tool-entity-map.ts`); ensure the chip/next-step generators resolve to the correct entity, not the screenplay default.

### M2 — The trace is a bare "1 passaggio ▾", not the mandated streamed step trace

- **Flow:** each edit shows only "1 passaggio ›" with no streamed `reading{entity} → reasoning → writing{entity} → done` sequence.
- **Why it matters:** CLAUDE.md makes the live step trace a product invariant ("no silent action, no mute spinner"). A Cesare-only user gets no visibility into what Cesare read or wrote — which, combined with A1's fabricated success, means they have no signal that nothing actually happened.
- **Fix:** emit and render the streamed step events (reading/reasoning/writing/tool/done) for every generation, including the next-step chip generators.

### M3 — The full-screen landing "glow" renders as a vertical brown smear, not a focus ring around the composer

- **Flow:** rail "+ Nuova" → `/sessions/new` full-screen landing (spec 52). Heading "Cosa scriviamo oggi?" and the centred input render correctly; rail/topbar correctly recede (focus mode works).
- **Why it matters:** instead of the intended soft animated focus ring/gradient border hugging the composer, the glow is a tall blurred vertical bar crossing the whole viewport behind and far beyond the input (see `01-new-session-landing.png`). It reads as a rendering artifact, not a deliberate Notion-AI glow.
- **Fix:** constrain the conic-gradient ring to the composer bounds (clip/contain to the input), as the spec describes; verify under default and `prefers-reduced-motion`.

---

## BASSO

### B1 — Italian typo "1 modificha in sospeso"

- The diff panel footer reads **"1 modificha in sospeso"** — should be "1 **modifica** in sospeso". User-facing copy must be correct Italian. (See `05-mostra-modifiche.png`.)

### B2 — No `notFoundComponent` configured → generic "Not Found" on bad project/route

- The dev log repeatedly warns: _"A notFoundError was encountered on the route `__root__`, but a notFoundComponent option was not configured."_ A Cesare-only user who lands on a missing project sees TanStack's generic `<div>Not Found</div>`. Configure a project-level `notFoundComponent`.

---

## What works well (worth keeping)

- **Spec 52 landing**: full-screen route, centred composer, two quick-prompts, focus mode receding rail/topbar — all render and the empty→docked transition works once the project genuinely exists.
- **Spec 50 next-step chip**: correctly derived from the documents that exist (empty → "Scrivi una logline dal tuo spunto"; logline → "Genera il soggetto dalla logline"). It surfaces **consistently in both** the routed session view and the floating drawer (same chip on the soggetto page).
- **Logline generation + auto-version**: the one step that fully works — content persisted (`len=166`), one `document_versions` row auto-created before apply.
- **Session persistence & longevity**: a long single session held up — **22 `cesare_messages` across ~11+ turns**, fully reloadable, history intact after navigation. The feared "long session hard-breaks agentic edits / stops accepting input" did **not** reproduce: turns kept being accepted and answered. The breakage in long sessions is **not** a freeze — it is A1/A2 (claimed-but-empty writes and no-tool fallbacks) recurring on every turn.
- **No client JS errors** anywhere in the flow.

---

## Long-session stress test — explicit result

Ran one continuous session of ~11+ turns (logline chip + 9 free-text turns + repeat soggetto chip), reaching 22 persisted messages. The session never crashed, never stopped accepting input, and reloaded with full history. **The known "long sessions break agentic edits" risk did not manifest as a break in the session machinery.** What a Cesare-only user actually hits over a long session is the steady-state failure of A1 (every generate-step claims success, persists nothing) and A2 (free text → no tool), which makes the long session _feel_ broken even though the transport is fine.

---

## Where the Cesare-only path is impossible / forced to type by hand

- **Soggetto, sinossi, scaletta, trattamento, sceneggiatura**: cannot be produced via Cesare on this project (A1). To have any of these, the user must open the editor and type — which violates the Cesare-only mandate.
- **Reviewing a change**: impossible via Cesare (A3 empty diff).
- **Undoing a change**: impossible via the chat (A4 missing ↩ Annulla; Rifiuta no-op). The only recourse is the Versions drawer — again outside the Cesare flow.

## Evidence (screenshots in /tmp/audit-cesare/, copied alongside this report)

- `01-new-session-landing.png` — full-screen landing + glow smear (M3)
- `02-landing-start-failed.png` — "Impossibile avviare la sessione" on a non-persisted project (env, see note)
- `03-logline-from-spunto-no-tool.png` — free-text spunto → no-tool fallback (A2)
- `04-logline-applied-trace.png` — logline applied, card mislabeled "Sceneggiatura" (M1), bare "1 passaggio" (M2), no ↩ Annulla (A4)
- `05-mostra-modifiche.png` — empty diff panel (A3) + "modificha" typo (B1)
- `06-soggetto-claimed-but-empty.png` — chat claims soggetto v2 applied (A1)
- `07-soggetto-doc-empty.png` — Soggetto editor shows 0 characters (A1)
- `08-floating-drawer-nextstep.png` — next-step chip consistent in floating drawer
- `09-session-long-thread.png` — long session, repeated no-tool fallbacks (A2)

## Environment note (not a product finding)

Five dev servers (3010–3014) ran in parallel for concurrent audits. Better Auth's cookie is scoped to `localhost` (not port), so the servers share one cookie jar and a server-fn redirect occasionally resolved to a sibling origin, bouncing the browser between ports and once invalidating the session mid-flow. A project created while bounced to `:3011` never appeared in `:3013`'s DB, producing the `ProjectNotFoundError` / "Impossibile avviare la sessione" in `02-*.png`. This is an artifact of running parallel servers on shared `localhost`, **not** a Cesare-only product defect; the audit was completed on a freshly-created, DB-verified project on `:3013` in an isolated browser session.
