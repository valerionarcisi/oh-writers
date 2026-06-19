# Bugs — live ledger

The detail home for bugs we are actively tracking. `docs/BACKLOG.md` queues them (one
line + link here); this file holds the repro + proof. Point-in-time audit findings live
in their audit report (e.g. `docs/audits/2026-06-03/CONSOLIDATED.md`); when one is pulled
into work, copy its detail here.

**Entry format:**

```
### BUG-NNN — short title (YYYY-MM-DD)
- Severity: ALTO | MEDIO | BASSO
- Status: open | in-progress | fixed (commit)
- Repro: page → action → observed result
- Proof: screenshot path / file:line / repro steps
- Notes / suspected cause
```

A bug is fixed only per `docs/conventions/definition-of-done.md` (tests at every layer,
E2E first; screenshots in a recap; gates green).

---

## Open

### BUG-N70 — Cesare rename UX: 7 stacked cards, wrong case, blank reply, name change routed to per-occurrence edit (2026-06-19, real-use session, real AI)

- Severity: MEDIO (rename is a common screenplay action; broken UX + partial coverage)
- Status: fixed (branch `fix/screenplay-rename-ux`)
- Repro: screenplay → Cesare → "cambia il nome di John in Jack" / "cambia il nome di John nella prima scena".
- Observed (4 sub-bugs): (1) ~7 identical proposal cards stacked on the first occurrence; (2) ALL-CAPS cue "JOHN" replaced with lowercase "Jack", breaking the screenplay convention; (3) the reply was a mute spinner (no text); (4) "nella prima scena" routed to `propose_screenplay_edit` (per-occurrence find/replace) which picked 3 occurrences by hand and MISSED the dialogue cues — partial coverage.
- Fixes: dedup identical rename proposals in the bucket (one card); `matchCase` mirrors each occurrence's case (JOHN→JACK, John→Jack); a tool-only turn emits an honest one-liner instead of a blank reply; guidance routes EVERY name change to `propose_rename_entity` (every occurrence, one proposal); proposal widget anchors after the textblock (no mid-line split).
- Proof: E2E `[OHW-572b]` (mock-ui) + `matchCase` unit test; owner screenshots 2026-06-19.

### BUG-N71 — screenplay version actions broken: Attiva/Promuovi don't update the editor, Apri-diff dead, Cesare-split layers under Versions (2026-06-19, real-use session)

- Severity: ALTO (the whole screenplay versioning flow looked non-functional)
- Status: fixed (branch `fix/screenplay-versioning-ux`)
- Repro: screenplay → Versioni → Attiva on a version; or Cesare draft banner → Promuovi a attiva / Apri il diff; or open Versions then promote Cesare to split.
- Observed: (1) "Attiva" did not change the editor (DB updated `content` + `current_version_id` but left the old Yjs CRDT — the editor reads the CRDT, not `content`); the drawer also didn't close; (2) "Promuovi a attiva" was a no-op (same CRDT bug + never set `current_version_id` + invalidated the stale `["screenplay"]` key instead of `["screenplays", …]`); (3) "Apri il diff" linked to a route that now just redirects to the editor (the diff page was removed in Spec 66); (4) opening Cesare-split while Versions was open made Cesare fall back to the floating box layered over the Versions lane (no ↗/←/✕ controls).
- Fixes: `restoreVersion` + `promoteDraftToActive` reseed the CRDT from the version's Fountain (clear pmDoc, rebuild yjsState) and set `current_version_id`; the lane closes on Attiva; promote invalidates the real editor + current-version keys; "Apri il diff" opens the unified Versions split lane; Option B precedence — an explicit Cesare split wins the single aux track over Versions (BUG-N64 invariant preserved: one lane, main track survives).
- Proof: E2E `[OHW-571]` (Apri-diff opens the lane) + `[BUG-N64]` (Option B precedence) green; owner screenshots 2026-06-19. NOTE: Attiva/Promuovi CRDT reseed verified by code + needs a live confirm (editor/Yjs behaviour).

### BUG-N63 — screenplay PDF export loses dialogue, title page incomplete, scene-heading bold mismatch (2026-06-11, real-use session)

- Severity: ALTO (the export is the deliverable a writer hands out; silent content loss)
- Status: (b) REDONE as WYSIWYG + (d) shipped (merged to main); the real PDFs (2026-06-13) reframed the rest. **(b2) frontespizio now reads the AUTHORED `titlePageDoc`** (branch `fix/n63-export-wysiwyg-titlepage`): the owner DID author the cover in /title-page (titolo + "Valerio Narcisi e Giordano Viozzi" + footers) but it lives in `titlePageDoc`, while the 7 scalar fields are all null — the N63b fix read the null scalars → PDF showed only the title. Now `prependTitlePageToFountain` prefers `titlePageDoc` (WYSIWYG), scalars are fallback. Verified live: credits land in the PDF. Owner principle recorded: **every export must follow the editor formatting to the letter** ([[feedback_export_wysiwyg]]). STILL OPEN from the real PDFs: **(e) blank first page** on exports (afterwriting emits an empty leading page — PDF #2); **(a) dialogue UPPERCASE is an EDITOR CSS bug, NOT export** (stored + PDF are lowercase "Luca, ascolta"; the editor shows it uppercase via text-transform — separate front, the "img 3" bug); **(c) heading bold** still needs the original to compare.
- Repro: real project "Scienze Naturali - Federico II" → export PDF. Observed: (a) DIALOGUE lines present in the editor are missing from the PDF; (b) the frontespizio carries only the title — author/contact info missing; (c) scene-heading bold in the PDF does not match the editor's settings.
- Proof: owner screenshots 2026-06-11 (title page bare; p.2 shows sceneggiatura where later dialogue runs are dropped).
- Notes: three distinct surfaces (doc→PDF serializer dropping dialogue nodes; title-page template fields; heading style mapping) — triage as one export-fidelity front.

#### Export audit (2026-06-13) — all active export surfaces

Driven on real data: dumped "Scienze Naturali - Federico II" active version, rendered through the REAL screenplay export pipeline (awc.js), extracted PDF text with pdf-parse, and diffed every source line against the PDF.

- **(a) dialogue loss — NOT reproducible on current data.** Every non-blank source line (incl. all dialogue, e.g. "Luca, ascolta · Non interrompermi") survives into the PDF text; the only diff was one long action line wrapped across PDF lines (a substring artifact, not loss). The first "missing" signal was a false negative from substring-matching a FlateDecode-compressed PDF stream. The screenplay content has changed since the 2026-06-11 repro (now ~32 lines / 3208 chars, likely Cesare-regenerated), so the originally-problematic content no longer exists. **Need the owner's original PDF or a fresh repro to chase (a).** Suspected mechanism if it recurs: a CHARACTER cue followed by a BLANK line before its dialogue (Fountain spec requires cue immediately followed by dialogue) — the current stored content does NOT exhibit this, and afterwriting rendered cue+dialogue correctly anyway in the test.
- **(b) title page incomplete — REAL, deterministic, and BROADER than screenplay.** The canonical title page is the project's 7 fields (`titlePageAuthor/basedOn/contact/draftDate/draftColor/wgaRegistration/notes`) + the rich `titlePageDoc`. TWO exports rebuild the cover from a thin ad-hoc subset and drop the rest:
  - Screenplay PDF (`title-page-prepend.ts` + `screenplay-export.server.ts`): emits ONLY `Title/Credit/Author/Draft date` → contact, basedOn, wgaRegistration, notes are silently dropped; `titlePageDoc` ignored.
  - Soggetto DOCX (`subject-export-docx.server.ts` `buildSoggettoDocxSections`): cover = title + "Soggetto" + `users.name` (NOT `titlePageAuthor`) → all title-page fields dropped, author uses the account name instead of the declared author.
    Fix = a single shared title-page→export mapping that reads the canonical model, used by both. (SIAE cover is its own structured form — full fidelity, not affected.)
- **(c) bold scene-heading — not verifiable without the owner's original PDF** (print-profile bold vs editor display). No current repro.
- **(d) NEW — breakdown PDF truncates the scene list per element to 6 + "…"** (`breakdown/lib/export-pdf.ts:44`): an element appearing in >6 scenes loses the rest in the handed-out PDF (real fidelity gap for production). Same file emits **English category labels (`labelEn`) in an IT product** — an i18n leak in the export.
- Custom PDF builders (budget/schedule/shooting-plan, pdfkit) paginate correctly with `addPage` — no truncation. CSV exports (breakdown/budget/schedule/locations/shooting-plan) are full-fidelity by construction.

Decision pending (owner): fix (b) [+ (d)] now as the deterministic export-fidelity slice; keep (a)/(c) open as "needs original repro".

### BUG-N64 — `?vcur=…&versions=…&peek=cesare` combo blanks the whole page (2026-06-11, real-use session)

- Severity: ALTO (page fully broken, only the Versions lane renders; no error fallback)
- Status: fixed (branch `fix/n64-route-combo-failclosed`, NOT merged — owner reviews Monday)
- Repro: `/projects/:id/soggetto?vcur=<id>&versions=<docId>&peek=cesare` → main lane EMPTY (white), Versions SplitDrawer on the right, no editor, no Cesare lane, no error boundary.
- Proof: owner screenshot 2026-06-11. Likely the two routed surfaces (versions lane + cesare peek) contend for the split slot and the host lane unmounts; should be fail-closed (one surface wins) per Spec 46/49.
- Root cause (code-traced): the shell grid has exactly ONE auxiliary (3rd) track, but `AppShell` computed `isCesareSplitActive`, `isVersionsSplitActive`, `isPreviewSplitActive` independently — each setting its own `body[data-*-split]` attr + rendering its own lane. With `?versions` AND `?peek=cesare` both set, TWO lanes rendered into the single 3rd slot and the main (middle) track collapsed to ~0 → blank white page, no error boundary (nothing threw).
- Fix: a single fail-closed resolver in `AppShell` — at most ONE auxiliary lane is active, deterministic precedence Versions > Cesare peek > preview drawer. The raw activations (`*Raw`) feed the resolved mutually-exclusive booleans that the body-attr effects + lane JSX consume; the losers render nothing and set no body attr, so the host page always keeps a real middle track.
- Verified: live (chrome-devtools) on the combo URL → grid `240px 540px 420px` (rail · main 540 · versions 420), Cesare lane absent, soggetto prose renders; cesare-only + versions-only still work alone. E2E `tests/versions-splitdrawer.spec.ts` [BUG-N64] (versions wins, cesare suppressed, main track >200px).

### BUG-N69 — bell notifications don't show while Cesare peek is open (2026-06-13, N64 family)

- Severity: MEDIO (an explicit user action produces nothing visible — the bell looks broken)
- Status: fixed (`fix/notifications-vs-cesare-split`)
- Repro: `/projects/:id/soggetto?peek=cesare` → click the TopBar bell → nothing visible happens. The notifications/preview SplitDrawer mounts but lands behind the Cesare peek column. In the DOM `body` carried `data-cesare-split="open"` + `data-split-drawer="open"` (+ would-be `data-preview-split`) at once.
- Proof: `tests/notifications-vs-cesare-split.spec.ts` (red on old code: `?peek` stays `cesare`, notifications never get the lane; green after fix). `pnpm -C apps/web exec tsc --noEmit` = 0.
- Cause: the BUG-N64 single auxiliary-lane resolver gives the Cesare peek HIGHER precedence than the shell preview/notifications drawer, so opening the bell while `?peek=cesare` is live suppressed the notifications (no 3rd grid track). Fix: opening the bell is an explicit user action that must WIN the lane — `AppShell.handleBell` clears `?peek` (closes the Cesare peek) before opening the bell drawer, so the two never coexist in the third track and the notifications are always visible. Preserves the N64 invariant (at most one auxiliary lane live).

### BUG-N65 — Cesare composer textbox is rigid and uncomfortable for writing (2026-06-11, real-use session)

- Severity: MEDIO (UX, hit on every interaction)
- Status: fixed (branch `fix/n65-composer-autogrow`, NOT merged — owner reviews Monday)
- Repro: the "Chiedi a Cesare…" input is a fixed single-line box; writing multi-sentence prompts (the normal case in a real session) is cramped. Owner: "deve essere più comodo ed elastico".
- Fix direction: auto-growing textarea (min 1 row → grows with content up to a cap, Shift+Enter newline), in both the floating drawer and the session page composer.
- Fix: the auto-grow pattern already existed on `SessionConversationPage` (the in-session composer); it was MISSING on the `CesareDrawer` composer (floating + split surface, `packages/ui`) and on the `NewSessionLandingPage` composer. Added the same effect to both: on each value change, `height='auto'` then `height=min(scrollHeight, cap)` — cap 96px in the drawer (matching its `max-block-size`), 40vh on the landing. Shift+Enter newline + Enter-sends were already in place. Verified live via chrome-devtools: drawer composer 20px (1 line) → 96px (6 lines, then scrolls internally). E2E `tests/cesare-agentic-chat-ux.spec.ts` [N-65] (offsetHeight grows then caps ≤96).

### BUG-N66 — Cesare creates a version for EVERY attempt/draft; owner policy: overwrite current unless a new version is asked (2026-06-11, real-use session)

- Severity: ALTO (version list floods — v13/v14/v15 "Cesare · modifica" + 5-6 drafts for one screenplay request; the Versions surface becomes unusable)
- Repro: iterative Cesare work on soggetto/screenplay → every turn lands a new version; a single "write the screenplay" request produced 5/6 drafts before the right one.
- OWNER POLICY (decided 2026-06-11, applies to EVERY narrative part): by default Cesare OVERWRITES the current version with surgical edits; a NEW version only when the user explicitly asks — or Cesare may ASK the user ("ne faccio una nuova versione?") when the requested change is large. Reconcile with the auto-version invariant (CLAUDE.md point 3: snapshot-before-apply for revertibility) — e.g. ONE auto-checkpoint per session/turn-group instead of per turn, or collapse consecutive Cesare versions.
- Status: **fixed — [Spec 76](specs/76-cesare-version-checkpoints.md) merged to main (2026-06-19)**. Full model shipped: `document_versions.kind` + `cesare_session_id`, default OVERWRITE on small edits, MINT on large/explicit, large-edit ASK streamed as the `[Sovrascrivi]/[Nuova versione]` card; the working-rows collapse under their checkpoint in the Versions drawer. Both INSERT seams (the generation tools AND the surgical edits `apply_text_edit`/`expand`/`compress`, formerly `persistDocumentContent`) converge on the shared `commitOrAsk` boundary. 44 OHW-N66 unit + 3 E2E green. Scope: narrative `document_versions`; screenplay `screenplay_versions` checkpointing remains a follow-up. **Live confirm pending** (merged per owner's call before the manual real-use pass).

### BUG-N67 — asked Cesare for the SCREENPLAY from the soggetto; it wrote the TREATMENT (2026-06-11, real-use session, real AI)

- Severity: ALTO (wrong entity written — trust-breaking; user said "scrivimi la prima stesura della sceneggiatura" and the reply says "Ho applicato la prima stesura nel documento Trattamento")
- Status: fixed (Spec 75 — branch `fix/n67-cesare-entity-routing`)
- Repro: flow logline → soggetto → then "partendo dal soggetto attivo, riesci a scrivermi la prima stesura della sceneggiatura?" → Cesare wrote the Trattamento document instead of the screenplay.
- Proof: owner screenshot of the session (reply card "Aggiornato Soggetto" then "…nel documento Trattamento").
- Root cause (code-traced): the narrative chain `logline → soggetto → sinossi → scaletta → trattamento → SCENEGGIATURA` had a from-narrative generator for EVERY step EXCEPT the screenplay — the screenplay only had scene-EDIT tools (`propose_screenplay_revision/rewrite_scene/…`, all needing an existing screenplay). With no whole-screenplay-from-narrative tool, the model fell back to the nearest neighbour `propose_treatment_from_narrative` ("write the next narrative thing from upstream"). The system-prompt WORKFLOW also had no "scrivi la sceneggiatura" entry.
- Fix: new `generate_screenplay_from_narrative` Cesare tool — reads the upstream narrative, generates Fountain, applies it LIVE as the new ACTIVE screenplay version via `importAsActiveVersionTx` (Spec 71/72; prior version preserved + restorable). New `write_screenplay` classifier intent (both prompts) + WORKFLOW line + treatment line tightened. Registered at all 5 sites + the skill registry (`CESARE_DOCUMENT_GEN_TOOLS` + `document-gen.skill.ts`) — the registry miss was caught by the live verify ("Tool not found in provided tools"). Marker gate (`extractSideChannelMarkers`) updated so the screenplay generation emits the doc-applied marker.
- Verified: real-AI routing smoke [OHW-N67] (3 phrasings incl. the exact repro → `generate_screenplay_from_narrative`, never the treatment tool) + LIVE end-to-end on project "Non fa ridere" (real AI): screenplay got a new active version "Prima stesura · Cesare" (15 scenes), TREATMENT stayed 235 chars untouched. Screenshot `docs/audits/n67-screenplay-generated.png`. Unit: `cesare-document-tools.test.ts` (recognises tool + loud-fail on empty upstream), `cesare-tools.test.ts` (doc-applied marker), `cesare-intent-classifier.test.ts` (write_screenplay routing).

### BUG-N68 — breakdown "Per scena" is mis-paginated; spoglio needs a correct AI-free algorithmic basis (2026-06-11, real-use session)

- Severity: MEDIO (core production surface; wrong scoping/layout on a real project)
- Status: FIXED. Part B verified + locked (branch `fix/n68b-deterministic-spoglio`). Part A (UX) DONE — owner decision (2026-06-15): the "Per scena" reader defaults to a "Scena singola" / "Copione intero" toggle, default single. `BreakdownPage` now slices the Fountain to the active scene via the existing Sides extractor (`extractScenesFromFountain`) and narrows `scenes` to that one scene; highlight elements are passed through unchanged (the highlight plugin matches by NAME against the rendered text, so slicing already scopes the underlines — no separate element filter, which avoids dropping a name shared with the active scene). The Indice scene-switcher is enabled in single scope (selecting re-slices; no scroll anchor needed) so the user can move between scenes; it stays hidden in full scope (the scroll-anchor TODO is unresolved). New i18n keys `breakdown.scope.{single,full,aria}` (en+it). E2E `tests/breakdown/breakdown-scene-scope.spec.ts` [OHW-N68a] (single default = 1 heading; toggle → full = N headings; red-on-old verified) + [OHW-N68b] (Indice switches scene in single scope). `openSceneInBreakdown` helper now switches to full scope first (heading-click navigation is a full-script affordance).
- Part A follow-up (owner screenshots 2026-06-15, real project): (1) "Ri-spogliare con AI" moved from the bottom-left FloatingDock to the TopBar right slot, beside the `⋯` actions menu — published into the shell `actions` slot, gated on `canEdit` (this RESTORES the viewer-never-sees-it contract; OHW-330-permissions un-skipped). (2) Element underlines were misaligned: the screenplay is set at line-height 1.0, so the highlight's `border-block-end` overflowed the line and collided with the row below — switched to `text-decoration: underline` (baseline-anchored, category-coloured, with `text-underline-offset`) for the solid/stale/ghost variants. E2E: OHW-330-ui (CTA via testid), OHW-330-permissions (viewer hidden), OHW-N68c (underline via text-decoration, red-on-old verified).
- Part B result (verified live against "Scienze Naturali" SC.1): the deterministic AI-free basis is ALREADY CORRECT — scene records parse INT/EXT·location·day-night for IT headings; `extractAll(SC.1)` → cast=Marco only (the `(V.O.)` extension collapses; the blank line between cue and dialogue does not split the cue), location parsed, V.O.→sound, telefono/microfono→props; the recap counts are scene-scoped. No extraction fix was needed. Added a golden-fixture regression to `packages/domain/.../extract-all.test.ts` ([BUG-N68], 4 cases incl. determinism) that LOCKS this verified output. The "spaginato" is purely Part A (the continuous ScriptReader UX — owner decision).
- Repro: real project "Scienze Naturali - Federico II" → `/breakdown`, "Per scena" tab: the header says SC. 1 (€3360/giornata, Cast 1 · Location 1 · Oggetti 3 · Suono 2) but the sheet below renders the WHOLE screenplay (scenes 1..N) in one continuous run, with element underlines spanning scenes that are not SC. 1. Owner: "lo spoglio sembra spaginato".
- Proof: owner screenshot 2026-06-11.
- Owner ask: audit the breakdown code, improve it, fix the bugs found, AND determine what a CORRECT spoglio requires with NO AI — purely algorithmic/deterministic extraction from the screenplay structure (scene scoping, headings → INT/EXT·location·day/night, character cues → cast, counts). Analysis spec + concrete fixes.

### BUG-N61 — 3 mock-ui E2E red on main: honest-card entity label + updated-banner show-changes/stack (2026-06-10)

- Severity: MEDIO (contract gap, not a regression)
- Status: triaged 2026-06-11 — `test.fixme` ×11 total (Valerio's explicit go), all pointing here/N-38
- Failing (full sweep from the pre-push ci:repro): the 3 above PLUS `cesare-agentic-audit-f-versions` F-A1/F-M2 (assert the diff removed by ADR-0004), `cesare-agentic-chat-ux` N-09, `cesare-agentic-logline-unified` ×2, `cesare-agentic-logline` ×1, `cesare-agentic-show-changes` OHW-062, `cesare-agentic-treatment` ×1 — six of these share ONE assert: `cesare-show-changes-btn` toHaveCount(0).
- OPEN PRODUCT DECISION (owner, with N-38): the ADR-0003-era tests demand the chat card SUPPRESS "Mostra modifiche" when the editor is in front (banner owns the feedback); CLAUDE.md's canonical agentic pattern prescribes the Mostra/Nascondi toggle on the card. The product implements CLAUDE.md. Settle the contract in N-38, then either implement the suppression and un-fixme, or realign the 11 tests to the toggle contract.
- VERDICT (code-traced): the three tests pin the **deferred half of Spec 63** — the in-editor card owns the highlight, so the chat result card suppresses `cesare-show-changes-btn`, and multiple turns stack with a counter. The suppression was never implemented (`CesareSheet` passes `onShowChanges` unconditionally → `ChangeTrace` always renders the button) and the stack/counter is part of the same deferred work (backlog item **N-38 / Spec 63**, top of NEXT). The tests were written with N-37 (`4bb75a6f`, 2026-06-06) and merged already-red the same day Spec 66 landed — aspirational pins, not regressions. They become the ready-made acceptance tests for N-38. These reds also blocked every push to main (the pre-push `ci:repro` mirrors the mock-ui job).

### BUG-N58 — OBSERVATION: seeded demo screenplay (project `…011` "Team Thriller", version `…023`) found clobbered to empty during a dev session (2026-06-10)

- Severity: BASSO as observed (seed data, no real loss) — ALTO if the signature reproduces on real data
- Status: open (observation only — the session was too polluted for a clean repro)
- Observed: at ~14:33 the editor rendered ~13.9k chars for `…011` and survived a reload; by 15:05 (db backup) the version row was already `content` ≈ empty with a ~1.1 KB `yjs_snapshot`, and the page now renders blank. The REAL projects (`…010` v13, `…012` First draft) are intact (14366 chars / 25876-byte snapshots) and `…010` renders 13924 chars on merged main with realtime ON.
- Pollution caveats: during that window the dev stack was killed with `pkill` (no clean room flush), branches were switched main↔branch with the dev server + an open browser page live (main lacked the N54 fixes), and the page sat connected throughout. Any of these can explain the wipe — or mask a real one.
- Next: if a blank seeded/real screenplay shows up again under a CLEAN stack, treat it as a live N54-class clobber and capture `yjs_snapshot`+`content` immediately. Until then, no repro to chase.

### BUG-N57 — a reachable-but-rejecting ws-server puts the narrative editor in a skeleton↔editor REMOUNT LOOP that eats keystrokes (2026-06-10)

- Severity: ALTO (silent data loss while typing — the editor node is replaced every ~100ms, focus dies, typed text lands nowhere; persists a truncated save)
- Status: fixed (two-layer latch — `fix/n57-realtime-latch`)
- Fix: (1) `useYjsRoom` now treats pre-sync drops as `connecting` (the provider is still retrying — never a transient `offline` that flips editors onto the HTTP path and back) and LATCHES a terminal `offline` after 3 pre-sync drops within 15s (`recordPreSyncDrop` in `realtime/lib/sync-latch.ts`, pure + unit-tested) or after a 20s sync deadline for a server that accepts but stays mute — the provider is destroyed, the status never changes again for that mount. (2) `useRealtimeEditorGate`/`useLatchedRealtime` (shared by NarrativeEditor, FreeNarrativeEditor, ScreenplayEditor): the realtime `{ydoc, provider}` is latched from the FIRST sync on (post-sync flaps never rebuild the ProseMirror view — Yjs buffers the disconnected stretch) and the skeleton is for the first load only — a mounted editor is never swapped back. The N54 contract is preserved: realtime still mounts only after `synced`, and the latch re-arms when the room/document changes. Unit coverage: `realtime/lib/sync-latch.test.ts`, `realtime/hooks/useYjsRoom.test.tsx`, `documents/components/free-narrative-remount-loop.test.tsx`.
- Still open (follow-up): playwright's webServer should explicitly set `VITE_WS_URL=""` so the test stack can never adopt the dev ws-server.
- Repro (deterministic): web app pointed at a ws-server whose auth/persistence DB does NOT match the app's (locally: playwright's test server on :3002/test-DB while the dev ws-server on :1234/dev-DB is up — `apps/web/.env` `VITE_WS_URL` leaks into the test server). Open any NarrativeEditor doc: `useYjsRoom` connects, the server rejects/never syncs, the provider retries → `realtimeAwaitingSync` oscillates → the `realtimeAwaitingSync ? <Skeleton/> : <NarrativeProseMirrorView/>` ternary remounts the editor continuously (DOM marker on the wrapper dies in ≤100ms; `activeElement` falls back to BODY). Typing mid-loop lands partially ("aut" of "autosaved-…") and the autosave persists the stub.
- Impact: this is what redded 5/11 of `tests/documents/narrative-editor.spec.ts` whenever the dev stack runs alongside the test run (the realigned suite is green with the stack down — verified 11/11). In production the same loop fires for any client whose ws connection is accepted then repeatedly dropped (auth expiry, proxy flap).
- Fix direction: `useYjsRoom` must LATCH `offline` after N failed connect/sync cycles (it already latches on token-fetch failure — N54 #3 — but not on a server that accepts then never syncs); and/or the editors should never swap an already-mounted HTTP editor back to a skeleton — the skeleton gate is for first mount only. Also consider: playwright's webServer should explicitly set `VITE_WS_URL=""` so the test stack can never adopt the dev ws-server.

### BUG-N56 — first autosave of a fresh doc can stomp the keystrokes typed while it was in flight (2026-06-10)

- Severity: MEDIO (data loss window of one save round-trip, only on the FIRST save of a doc with no version row)
- Status: fixed (`useVersionResync` — shared own-save guard at all three resync sites)
- Mechanism (code-traced): fresh doc with NO version row → first autosave creates "Versione 1" (`saveDocument` → `ensureFirstDocumentVersion`, `currentVersionId` null→v1) → the query refetch fires the version-resync effect (keyed on `currentVersionId`) → `setContent(document.content)` replaces the editor with the content AS OF THE SAVE REQUEST — keystrokes typed during the save round-trip are stomped and the next autosave persists the truncated text. Real for a human typing with pauses ≥ the debounce on a brand-new doc.
- Cause: the resync effects (NarrativeEditor + soggetto route ×2 for soggetto/logline) could not tell an EXTERNAL version switch (switchToVersion/restore — must resync) from the version id their OWN save had just created (must not). Skip-mount (the N54 fix) was not enough — the first save bumps the id mid-session.
- Fix: `useVersionResync(currentVersionId, save, resync)` in `useDocument.ts` — skips the mount run AND any version id matching `save.data.currentVersionId` (the id returned by this editor's own last save). All three sites now share it; switchToVersion still resyncs (different id than the last save's).
- Note: first suspected as the cause of the 5 red narrative-editor tests — those turned out to be BUG-N57 (the remount loop). This guard is kept as the correct semantics for the resync regardless.

### BUG-N55 — soggetto save pill vanished on the very click that saved (2026-06-10)

- Severity: MEDIO (the save LANDED — but the pill disappearing on press read as "il salvataggio non funziona")
- Status: fixed (sticky `soggettoEdited` flag in the soggetto route publisher)
- Repro (pre-fix): soggetto → type → pill "Non salvato" → click the pill (Salva) → save succeeds, query refetches → the pill VANISHES instead of reading "Salvato". Other narrative pages unaffected.
- Cause: the soggetto route gated `useSaveStatePublisher` on a RAW equality (`soggettoContent !== soggettoDoc.content`). The post-save refetch made the two equal, flipping the gate false and unpublishing the pill. `NarrativeEditor` (synopsis/treatment) uses a STICKY `hasEdited` state — that's why those pages were fine. Fix mirrors it: `soggettoEdited` flips true on the first canonical-dirty and stays true, so after a flush the pill reads "Salvato".
- Proof: verified live on :3000 (edit → "Non salvato" → click → "Salvato" persists across refetch, caret moves, and the content round-trips a reload). E2E: `tests/documents/narrative-editor.spec.ts` [OHW-N55] (also asserts caret moves never publish the pill — the BUG-N45 symptom). Same gate flapping explains N45's "pill appears on every click": any re-render while raw-unequal republished the pill mid-autosave.

### BUG-N54 — soggetto realtime clobber: opening the page emptied the document for every peer (2026-06-10)

- Severity: ALTO (silent data loss on a live document; reported as "il salvataggio non funziona" — the user's text vanished and the save pill showed nothing)
- Status: fixed (4-layer fix, see below)
- Repro (deterministic, pre-fix): soggetto with content + populated CRDT → open the page with realtime ON → editor renders EMPTY, the shared fragment is wiped (delete-all propagated to every peer), the room flush persists the empty CRDT and the autosave writes `content=""` into BOTH `documents` and the active `document_versions` row. Every later visit then reads the empty version row and re-kills any repair that only fixes `documents.content`.
- Root chain (verified live with instrumentation):
  1. **ws-server**: y-websocket calls `bindState` (the async DB load) WITHOUT awaiting it and replies syncStep1 immediately → the first client completes its sync against a still-EMPTY doc; `provider.synced` fires before the persisted state lands.
  2. **y-prosemirror**: passing `doc: initialDoc` to `EditorState` does NOT seed the room — on bind the plugin renders the fragment over the editor (`_forceRerender`), so an empty fragment WIPES the initial doc; the wipe leaks into `onChange` → autosave → version row, and a later editor→fragment diff deletes the server content when it arrives.
  3. **FreeNarrativeEditor** (soggetto only) mounted the PM view on `connected` without the `synced` gate NarrativeEditor has (N41), maximising the race window.
  4. Route + version-backed reads: `getDocument` serves the ACTIVE VERSION row's content; once the clobber wrote `""` there, every mount passed `value=""` and the mount-firing `[currentVersionId]` resync effect pushed it over the CRDT.
- Fix:
  1. ws-server `ws-handler`/`persistence-binding`: `whenRoomLoaded(docName)` — the connection handler triggers doc creation, AWAITS the persisted load, and only then runs `setupWSConnection`; client messages arriving during the wait are buffered and replayed (otherwise the client's syncStep1 is lost and `synced` never fires).
  2. `NarrativeProseMirrorView`: realtime seeding now merges the initial doc INTO the fragment as a CRDT update with a content-hash `clientID` (two racing first-clients generate identical ops → double-apply dedupes) when the fragment is genuinely empty; the editor state always starts `{schema}` in realtime. A post-mount external value that EMPTIES a populated doc still applies (authoritative: blank-version flows) but logs the clobber signature.
  3. `FreeNarrativeEditor`: mounts the editor only after `synced` (skeleton while connecting/syncing), mirroring NarrativeEditor; `useYjsRoom` reports `offline` on token failure so the gate falls back to the HTTP editor instead of an infinite skeleton.
  4. Version-resync effects (`NarrativeEditor`, soggetto route) skip their mount run. Server-side, a failed room load refuses the connection (1011) + evicts the half-bound doc, and a socket that closed mid-load is never attached (zombie-conn flush blocker).
- Proof: deterministic kill reproduced 5× pre-fix (yjs 96→121-byte empty paragraph, decoded); post-fix the same flow renders the text, typing autosaves to BOTH rows (30s debounce), reload persists (CRDT 146 bytes), synopsis/treatment unaffected. Unit: `free-narrative-realtime-gate.test.tsx` (4) — gate, fragment-seeding, empty-value guard. Screenshot: `sog-save-fixed.png`.
- Note: the screenplay `ProseMirrorView` shares the `doc: initialDoc` non-seeding pattern but is shielded by server-seeded version snapshots (Spec 71/72); its genuinely-blank-room case renders blank either way. Worth migrating to the same fragment-merge seeding when touched next.

### BUG-N53 — seeded screenplay renders EMPTY in the editor (content unreachable to the realtime room) (2026-06-09)

- Severity: ALTO (blocks the import-version-choice E2E suite and confuses manual testing; the screenplay looks blank despite having content)
- Status: fixed (Spec 72 — seed-time CRDT snapshots; `apps/web/scripts/seed-yjs-snapshots.ts` chained into `db:seed`/`db:seed:reset`)
- Fix: the seed now populates the CRDT server-side after the db seed — `screenplay_versions.yjs_snapshot` via `yjsSnapshotFromFountain` and narrative `documents.yjs_state` via the new `yjsStateFromNarrativeContent` (soggetto/synopsis/treatment; outline's OutlineEditor and logline have no PM room) — so no room depends on the first-client seed race. Idempotent: only NULL CRDTs are written. Bonus: `seed/reset.ts` was missing the `load-env` import, so `pnpm db:seed:reset` failed locally without an exported `DATABASE_URL`.
- Verified live (2026-06-10): `pnpm db:seed:reset` → all 3 screenplay versions + 10 narrative docs get snapshots; screenplay renders 9 scenes (Indice 1/9, Salvato, version chip) and soggetto renders the full template with realtime ON (1 online); reload stable, DB byte sizes unchanged after editing sessions (no clobber, no growth). Unit: `yjs-seed.server.test.ts` 7/7. Screenshots: `n53-screenplay-fixed.png`, `n53-soggetto-fixed.png`. The narrative variant was observed live too (project `…010` soggetto clobbered to empty content + 2-byte `yjs_state`) — same race, same fix.
- Repro: reseed (`pnpm db:seed:reset`) → open `/projects/:id/screenplay` for the seeded "Non fa ridere". Observed: editor blank, scene index `1/1`, "Esporta PDF" disabled (`hasContent` false), even though the DB seed created 9 scenes + a populated `pm_doc`.
- Proof: DB shows `screenplay_versions.content` length 1 (empty) with `pm_doc` populated on `screenplays`; the version-scoped realtime room (`screenplay:{id}:{versionId}`) loads `yjs_snapshot` (NULL on a fresh seed) and seeds from an empty fragment, so the editor shows nothing. `getScreenplay` returns the active version's `content` (empty), not the `pm_doc`/scenes.
- Cause (suspected): the seed stores the body in `pm_doc` + the `scenes` table but leaves `screenplay_versions.content` empty and seeds no per-version `yjs_snapshot`. The editor in realtime mode loads from the version's CRDT snapshot (NULL → empty), and `content` (the seed-from-Fountain fallback source) is also empty. The seed must populate the active version's `content` AND `yjs_snapshot` (mirror of the pm_doc), the way Spec 71's `yjsSnapshotFromFountain` now does for imports.
- Impact: reds `tests/editor/import-version-choice.spec.ts` entirely (OHW-178/179 pre-existing, OHW-071 added as `.fixme` until this is fixed) — the import-confirm dialog needs `hasContent` true. Related to N-31 (seed gap) but distinct: this is the _runtime empty-render_, not stale test locators.

### BUG-N44 — screenplay opening on "FADE IN:" shows a phantom extra scene (2026-06-09)

- Severity: MEDIO (wrong scene count in footer + index; throws off breakdown/schedule scene numbering)
- Status: fixed (`fountainToDoc` emits a leading transition as a top-level node, not a synthetic empty-heading scene)
- Repro: import/open a screenplay that opens with `FADE IN:` and has 2 scenes. Observed: footer "SCENE 3", Indice "1/3", and the index dropdown listed a phantom empty `SC.1 —` before the two real scenes.
- Proof: verified live re-importing `with-title-page.pdf` (FADE IN: + 2 scenes) → footer "SCENE 2", Indice "1/2", index lists only the two real headings; `FADE IN:` renders as a transition node.
- Cause: `fountainToDoc` wrapped ALL content before the first heading (the opening `FADE IN:` transition) in a synthetic `scene` with an empty heading — but the doc schema (`(scene | transition)+`) allows a top-level `transition`. The synthetic scene counted as scene 1. Fix: emit leading transition nodes directly under `doc`; only wrap the first non-transition stray node (rare: action before any heading) in the synthetic scene, order preserved.

### BUG-N51 — tidy PDF with no blank separators imported as one undifferentiated action run (2026-06-09)

- Severity: ALTO (every character cue + dialogue in a clean screenplay was tagged action; breakdown/character extraction unusable)
- Status: fixed (`fountain-from-pdf` relaxed character-cue detection — no preceding blank required)
- Repro: import a tidy PDF where pdf-parse stripped all blank-line separators between elements (the real "Non fa ridere" v13). Observed: "JOHN", "PUBBLICO", "FILIPPO", "VECCHIA 1" etc. and all their dialogue rendered as flush-left action — the classifier's cue rule required a preceding blank, which this PDF never had.
- Proof: verified live importing `Non_fa_ridere-v13-2025-11-11.pdf` → cues are CHARACTER (6-space), speeches are DIALOGUE (10-space), scene headings correct. 4 new unit tests; screenplay lib suite green.
- Cause: `isCharacterCue` short-circuited on `!prevBlank`. Fix: split out `looksLikeCue` (shape test) and accept a cue WITHOUT a preceding blank when it is short (≤38 chars), cue-shaped, and the previous emitted line was not itself a cue/parenthetical (a cue never directly follows a cue). Length cap rejects long ALL-CAPS action fragments.
- KNOWN GAP (not blocking): action embedded mid-scene after a parenthetical, with no blank, can still be absorbed as dialogue; a rare short ALL-CAPS action fragment ("PROVINCIALE\"") can be mis-tagged as a cue. Tracked for the deeper parser pass.
- HISTORY: an earlier attempt (BUG-N50, reverted) added a Pass 2b "unwrap" that merged consecutive same-type lines. On blank-less PDFs that fused whole action+dialogue blocks into a wall of text (regression seen on "Non fa ridere"), so it was reverted; the wrap-joining for clean-blank PDFs is deferred until it can be done safely on top of correct classification.

### BUG-N50 — PDF import mangled paragraphs (hard-wrap → split lines) + dialogue after a cue parsed as action (2026-06-09)

- Severity: ALTO (corrupts the imported screenplay: re-export emits more lines than the original; dialogue mis-typed as action breaks breakdown/character extraction)
- Status: REVERTED (the Pass 2b unwrap fused blank-less PDFs into a wall of text; see BUG-N51). Wrap-joining deferred.
- Repro: import a real screenplay PDF (e.g. the "Non fa ridere" import). Observed: (a) action/dialogue paragraphs were split mid-sentence into one block per visual PDF line, so the editor showed stubs and a re-export produced extra line breaks; (b) "TEA (V.O.)" with its lines rendered as Action instead of Character + Dialogue.
- Proof: verified live re-importing `no-country-for-old-men-2007.pdf` — the VOICE OVER speech is now one dialogue paragraph (was ~6 wrapped lines), action paragraphs are single lines, and a cue's first line is dialogue. Unit tests: 7 new in `fountain-from-pdf.test.ts` (unwrap action/dialogue, no-merge across blank, no-merge into cue, hyphen rejoin, orphan-dialogue recovery) — 68/68 green; full screenplay lib suite 282/282.
- Cause: the parser treated every pdf-parse line as a logical line. PDFs hard-wrap at the page column width, so one paragraph arrives as several consecutive same-type lines with no blank between — each became its own Fountain block. Fix: **Pass 2b** merges consecutive `action`/`dialogue` blocks (those the classifier produced back-to-back, i.e. not separated by a blank or a different element) into one space-joined logical line; a trailing hyphen rejoins with no space. Separately, pdf-parse sometimes inserts a spurious blank between a CHARACTER cue and its first dialogue line, dropping it to `action`; the classifier now recovers dialogue when `lastNonBlankType === "character"`.

### BUG-N43 — importing a screenplay PDF with a title page silently renamed the project (2026-06-09)

- Severity: ALTO (data corruption: the project name is overwritten by a foreign PDF's title)
- Status: fixed (`updateTitlePageState` gains `syncProjectTitle`, default true; import passes false)
- Repro: open project "Non fa ridere" (`…012`) → ⋯ → Importa PDF → `with-title-page.pdf` → Sovrascrivi → "Sostituisci" on the frontespizio prompt. Observed: the project was renamed "NON FA RIDERE" → "THE LAST FRAME" (sidebar, dashboard, recents) because the imported title page carried that title.
- Proof: verified live — after the fix the same import keeps the project name "Non fa ridere" while the title-page doc still adopts "THE LAST FRAME / Jane Doe / Draft 3".
- Cause: `updateTitlePageState` writes `projects.title = extractTitle(doc)` — correct when the writer edits the title page by hand (the title page IS the project title), wrong for import (adopting a foreign title renames the project). Fix: `syncProjectTitle` flag (default true preserves manual-edit behaviour; the import path sends false, so `nextTitle` is empty and the title write is skipped).
- TEST DEBT: same harness gap as N-42 — the import suite isn't in CI and the realtime path has no ws-server. Add a unit test on `updateTitlePageState` asserting `syncProjectTitle:false` leaves `projects.title` untouched while persisting the doc.

### BUG-N42 — screenplay PDF/Fountain import (and version restore) did nothing in realtime mode (2026-06-09)

- Severity: ALTO (core feature silently broken: Sovrascrivi / "Salva come Versione N e importa" left the editor showing the old content)
- Status: fixed (`ProseMirrorView` external-value sync no longer bails in realtime; `useYjsRoom` orphan-provider guard)
- Repro: open a screenplay with realtime ON (ws-server up), ⋯ → Importa PDF → pick a PDF → Sovrascrivi (or "Salva come Versione N e importa"). Observed: the editor kept the previous text; the version-then-import path created a version but never applied the import.
- Proof: verified live — imported `no-country-for-old-men-2007.pdf` into project `…012`, editor replaced the pizzeria scene with "FADE IN: / EXT. MOUNTAINS - NIGHT" and survived a reload (reached the CRDT). Title-page import also re-verified (`with-title-page.pdf` → "THE LAST FRAME / Jane Doe", persisted).
- Cause: `ProseMirrorView` guarded the external value→editor sync with `if (isRealtime) return` (the editor went realtime-only after the recent CRDT seed-guard commits). Import/version-restore set the `content` React state but never the live Yjs doc. Fix: drop the bail — the one-shot `replaceWith` flows through `ySyncPlugin` into the shared fragment, so the replacement propagates and persists.
- Bonus (same session): `useYjsRoom` could leak a provider whose socket opened after the effect was already disposed (fast nav away during the token fetch) → a ghost "N online" peer for ~30s. Fixed by destroying the provider/ydoc when `disposed` flipped mid-fetch.
- TEST DEBT: this regression has **zero E2E coverage** because `playwright.config.ts` starts **no ws-server** and sets no `VITE_WS_URL`, so the test editor always runs **non-realtime** — the exact path that broke is never exercised. ~~Compounds [N-31] (the `tests/editor/` import suite is not in CI and already fails on clean HEAD)~~ — N-31 update 2026-06-10: the "not in CI" half was already outdated (`qa.yml`'s `e2e-chromium` job runs the full `--project=chromium` suite, which includes `tests/editor/` and `tests/screenplay-editor/`), and the Spec-66 locator rot was realigned on `test/realign-spec66-stale-e2e`. To cover N-42 the test harness must run a ws-server + point `VITE_WS_URL` at it; track as its own infra front.

### BUG-N41 — narrative realtime editor double-seeds the CRDT → unbounded growth → "Invalid string length" freeze (2026-06-07)

- Severity: ALTO (freezes the whole page; Attiva / Nuova versione appear broken because the page is already frozen when clicked)
- Status: fixed (`NarrativeProseMirrorView` seed guard + corrupted-CRDT data cleanup)
- Repro: open a narrative doc with realtime ON (ws-server up) whose `documents.yjs_state` already holds content — e.g. project `…012` Soggetto (doc `5903948d`). The editor loaded clean (3735 chars) then ballooned to ~112 MB within ~5s, the save pill stuck on "Salvataggio…", and `RangeError: Invalid string length` froze the tab. With ws-server DOWN the same doc loaded clean and stayed stable — isolating the cause to the realtime CRDT, not the HTML converter (which unit-tests as perfectly idempotent on the real content).
- Proof: `documents.yjs_state` for `5903948d` measured **129 MB** while its text was 3.7 KB (project `…013`'s healthy Soggetto was 2.6 KB). After the fix + cleanup, a single fresh client loads at exactly the content length (4556), 1 online, stable across repeated samples; Attiva + Nuova versione both work with no freeze. Regression test: `apps/web/app/features/documents/components/narrative-realtime-seed.test.ts`.
- Notes / cause: `NarrativeProseMirrorView` created the `EditorState` with `doc: initialDoc` unconditionally while `ySyncPlugin` was bound to the shared fragment. When the fragment was already populated (a reconnecting client), y-prosemirror merged the initial doc ON TOP of the existing content, growing the CRDT every connect; `flushRoom` persisted the bloat, compounding across sessions. The screenplay editor already guards this (`ProseMirrorView` `seedFromInitial = !isRealtime || isFragmentEmpty(ydoc)`); the narrative view was missing the same guard. Fix mirrors it: seed from `initialDoc` only when `isFragmentEmpty(realtime.ydoc)`, else build the state empty (`{ schema }`) and let the CRDT populate. Data fix: nulled the bloated `documents.yjs_state` so the room reseeds clean (ws-server restart required — it caches the room in memory).

### BUG-N40 — /api/test/fundraising-seed returns 503 in dev (route module won't load) (2026-06-07)

- Severity: BASSO (test-only endpoint; blocks the Spec 35 fundraising E2E)
- Status: open
- Repro: `curl -X POST http://localhost:3002/api/test/fundraising-seed -d '{"title":"T","guid":"g1"}'` against the dev server → generic vinxi `503 Server Unavailable` (HTML), not the handler's 200/400. Persists across many retries (~30s), so it's not just lazy-compile warmup.
- Proof: the four Spec 35 E2E (`tests/fundraising-classify.spec.ts` OHW-353/354, `tests/fundraising-ui.spec.ts` OHW-355/356) all fail at the seed call (`seed responded 503`). They are `test.fixme` until the endpoint loads. The sibling test routes load fine: `set-locale` / `mock-context` / `reset-cesare-state` / `set-narrative-state` return 400 on an empty body, and `POST /api/cron/fundraising-ingest` returns 200 — only `fundraising-seed` 503s.
- Notes / suspected cause: the route imports the same `@oh-writers/db/schema` tables as the (working) `set-narrative-state` route and `getDb` like the (working) cron, so it's not an obviously missing export. Something in the `fundraising-seed` route module throws at load under vinxi dev. Investigate with the route module's actual load error (vinxi server log didn't surface one). Un-fixme the four tests once it loads. A `seedFundraising` helper with 503-retry is already in `tests/fundraising-helpers.ts`.

### BUG-N39 — Tab from a dialogue block goes to Parenthetical, not Action (2026-06-06)

- Severity: BASSO
- Status: fixed (`tabCommand` empty-dialogue special case removed — dialogue now follows `nextElementOnTab`)
- Repro: screenplay editor → place cursor in an empty block → Alt+D (dialogue) → Tab. Expected the block to cycle to Action (Spec 05e Tab matrix: dialogue → action); observed it becomes Parenthetical.
- Proof: `tests/screenplay-editor/screenplay-editor-ux.spec.ts` [OHW-417] re-enabled and green (17/17 in the file). Unit: `keymap.test.ts` "empty dialogue → action" + `fountain-element-transforms.test.ts` (30/30).
- Root cause: the Tab keymap (`apps/web/app/features/screenplay-editor/lib/plugins/keymap.ts`, `tabCommand`) had an explicit empty-dialogue branch that converted the block to a parenthetical pre-filled with "()" instead of routing through `nextElementOnTab` — exactly the post-Enter state the repro hits. The branch was removed; every non-prefix block now follows the Spec 05e Tab matrix.

### BUG-N38 — TopBar center pill overlaps the right cluster below ~900px (2026-06-06)

- Severity: MEDIO
- Status: fixed (TopBar container query drops the center slot to its own line below 1180px of bar width + Popover measures layout size, not the mid-animation rect)
- Repro: any narrative page (Soggetto/Sinossi/…) → shrink the viewport below ~900px (768 or 390) → the TopBar center slot (logline pill) and the right cluster (version chip + ⋯ "Altre azioni") overlap. The `topbar-version-chip` ("Versioni") renders on top of the logline pill, so `elementFromPoint` at the pill's centre returns the version chip — the pill is not clickable and the logline popover can't be opened.
- Proof: `tests/documents/logline-popover-viewport.spec.ts` 768px + 390px cases re-enabled and green (3/3). Live measurements (Soggetto, rail open): before at 768px the right cluster's left edge (369px) crossed the row midpoint (384px) — no centred pill can fit, `elementFromPoint` at the pill centre hit the chip label; after, the pill sits on its own line and the hit-test returns the pill at 1440/768/390. Screenshots: `docs/audits/2026-06-10-n38/`.
- Root cause (two-part): (1) `TopBar.module.css` `.center` is an absolutely-positioned overlay, so the in-flow right cluster slid under it at narrow widths — fixed with a container query (`@container (max-width: 1180px)`, threshold derived from the measured worst case: 433px cluster + 156px pill half-extent → collision below ≈1178px) that drops the center slot into the flow as a full-width second line. (2) `Popover.tsx` measured the overlay with `getBoundingClientRect()` while the `popIn` animation scales from 0.96, understating the width 4% — the viewport clamp then landed the dialog 7px off-screen at 390px; fixed by measuring `offsetWidth`/`offsetHeight` (transform-free layout size).

### BUG-067 — TopBar status shows "online" then flips to "offline" (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: any narrative page (Soggetto seen) → top-right presence indicator briefly shows "online" then switches to "offline" and stays there.
- Proof: reported live by Valerio on :3000 (visible in every recent screenshot — the "offline" label top-right of the editor card).
- Notes / suspected cause: the realtime/presence indicator (`PresenceIndicator`, Yjs room `document:<id>`) reports connected then drops to disconnected. Likely the y-websocket provider never connects (no/wrong `VITE_WS_URL` in dev) so it falls back to "offline", or a connect→disconnect race on mount. Investigate `useYjsRoom` status transitions + the dev ws-server. Decide: is "offline" expected in single-instance dev (no ws-server running) — if so, hide/soften the label — or is the ws-server meant to be up?
- PLACEMENT DECIDED (2026-06-10, with N-59): the presence/sync status MOVES to the rail FOOTER as a discreet ambient dot + label ("Sincronizzato · 2 online" / "Offline"), out of the document header where it flaps in the writer's face. This bug keeps the transport half (why it flips connected→offline — see also BUG-N57's latch direction); N-59 owns the footer rendering.

### BUG-066 — Cesare bell: missing "go to document" link + duplicated start/done notifications (2026-06-06)

- Severity: MEDIO
- Status: fixed (2026-06-10, branch `fix/bug-066-bell-dedupe`)
- Repro: trigger several Cesare turns that touch a document → open the bell (NotificationCenter) → (a) NO explicit "Vai al <documento>" link on applied-change notifications; (b) the list fills with repeated "Cesare sta lavorando…/ha risposto" rows (≈8 seen) instead of one entry per turn.
- Proof: img #6 (NotificationCenter full of repeated "CESARE STA LAVORANDO SUL SOGGETTO…" rows).
- Desired (decided 2026-06-06): one notification PER TURN (collapse start→done into a single row that goes "sta lavorando" → "ha aggiornato il <doc>"); an explicit "Vai al <documento>" link ONLY on applied-change notifications (not on "sta lavorando"). The Mostra/Nascondi underline stays in the document with Cesare open on the right page — NOT in the bell. Scenario: on Location, a change lands on Soggetto via floating Cesare → the float/bell shows the link to Soggetto → click navigates there → in the doc with Cesare open, Mostra/Nascondi is available.
- Root cause: (1) every row rendered the in-progress action label ("Cesare sta lavorando sul …") as its headline TWICE (page label + actionLabel were the same string) regardless of status, so N completed turns read as a flood of duplicated "sta lavorando" rows; (2) the legacy emission lived in the non-streaming fallback (`wrappedAskCesare`), so streamed turns could leave start rows that never settled, persisted forever via sessionStorage; (3) the N-33 patch then emitted start+complete back-to-back at turn END (no live in-progress row at all, `useCesareIsThinking` dead).
- Fix: turn-lifecycle emission — the chat store fires `onTurnStart` (creates ONE in-progress row, returns its id as correlation token) and `onTurnSettled` (the SAME row completes/fails/dismisses in place via `decideTurnSettle`, `cesare-turn-notifications.ts`). Applied-change rows get the headline "Cesare ha aggiornato il <doc>" + a "Vai al <documento>" button (`notification-go-to`) that navigates to the AFFECTED document's page (cross-domain safe, logline→soggetto). Persisted in-progress rows are dropped on hydrate. Tests: `cesare-turn-notifications.test.ts`, `cesare-notification-context.test.tsx`, E2E `tests/cesare-agentic-bell-notifications.spec.ts` [OHW-066].

### BUG-065 — Cesare needs a presence "glow" effect (closed pill + open chat header) (2026-06-06)

- Severity: BASSO (polish)
- Status: open
- Repro: n/a — enhancement. The Cesare floating pill (closed) and the chat header (open) have no presence/activity glow.
- Desired: a subtle glow effect on the Cesare pill when closed AND on the chat header when open. Decorative, signals presence/activity.
- Notes: pure CSS on the floating pill + `CesareDrawer` header. Respect `prefers-reduced-motion`.

### BUG-064 — "Avvia sessione" from a margin suggestion triggers a stray re-render (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: Soggetto → open a margin suggestion card → "✦ Avvia sessione" → a new session is created and the prompt sends, BUT a strange re-render flicker still happens around the open (Spec 64).
- Proof: reported live by Valerio on :3000 (real AI). The infinite-loop variant was fixed (effect now deps only on `[seedNonce, isOpen]`, chat/createSession read from a ref) — but a residual rerender remains.
- Notes / suspected cause: likely the `onActiveSessionChange` → AppShell `setFocusedSessionId` → re-render chain, or `setActiveSessionId` inside the seed effect racing the session-adopt effect. Investigate the seed-session open path in `CesareSheet.tsx` (seedPrompt effect) + the focused-session mirror in `AppShell.tsx`. Defer per Valerio — fix in a later pass.

Narrative UI/UX manual walk — 2026-06-03 (Valerio). Grouped by topic; image refs are
the walk screenshots. Severity is provisional (to confirm during one-by-one analysis).

### Topic 1 — Action placement / TopBar standard (Spec 55)

The recurring "everything near the lens" pattern. Confirms + enriches `docs/specs/55-shell-action-standard.md`.

- **N-01** ALTO — Notifications still bottom-left; must move to the TopBar; they open in a SplitDrawer, and the **old notification drawer is removed** (img #3, #18).
  - `Done =` bell lives in the TopBar action zone on every narrative page; clicking it opens notifications in a SplitDrawer; `NotificationCenterDrawer` (bottom-left) deleted; E2E asserts bell-in-topbar + split open + no legacy drawer in DOM.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Bell moved to a new TopBar account zone (`packages/ui/src/shell/TopBar/TopBarAccount.tsx`), wired in `AppShell.tsx`; rail-footer `AccountRow` no longer rendered by the shell. Bell opens the notifications SplitDrawer. E2E `tests/shell/spec55-shell-backbone.spec.ts`.
- **N-02** ALTO — **Versions missing on all narrative pages**; must open in a SplitDrawer, **old VersionsDrawer removed**; place "Versioni" near the lens (img #15). (Spec 49 + 55.)
  - `Done =` "Versioni" action registered in the TopBar zone on all narrative document pages; opens the Versions SplitDrawer (`?peek=versions`); legacy VersionsDrawer removed; E2E asserts action present + split opens + rollback path intact.
  - **FIXED for narrative (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** "Versioni" is registered in the shared registry (`context-actions.ts`) and rendered in the TopBar `ActionsMenu` on soggetto/sinossi/scaletta/trattamento; it opens the routed Versions SplitDrawer (`?versions=<docId>`, the real impl — NOT `?peek=versions`). Narrative pages no longer use the legacy `VersionsDrawer`. **Caveat:** the legacy `VersionsDrawer` shell mount is KEPT because screenplay/budget/breakdown still consume it (out of scope — A5/N-28); deleting it would break those. E2E: action+split in `spec55-shell-backbone.spec.ts`; rollback in `versions-splitdrawer.spec.ts`.
- **N-03** ALTO — **Exports** must sit near the lens, as a **per-page tool pattern across ALL narrative pages** (img #16, #20). One pattern, page-specific tools.
  - `Done =` narrative document pages register their export actions (SIAE/PDF) via the shared TopBar action registry — one pattern, page-specific tools; no mid-page export menu/modal on narrative docs; E2E asserts export action in TopBar zone per narrative page. (Screenplay export registration owned by A5.)
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Built the registry backbone (`packages/domain/src/actions/context-actions.ts` + `use-context-actions.ts`). Soggetto (DOCX + SIAE) and synopsis/outline/treatment (PDF) export actions now come from the registry into the TopBar `ActionsMenu`. Export modals still open from those actions (placement, not redesign). Unit: `context-actions.test.ts`; E2E: `spec55-shell-backbone.spec.ts`.
- **N-04** MEDIO — Drawers are ALWAYS SplitDrawer; clean up any legacy drawer (img #18).
  - `Done =` no drawer pattern other than Cesare (floating bottom-right) + SplitDrawer (`?peek=`) remains in the narrative surface; BottomDock/FloatingDock/AccountRow retired per Spec 55; grep + E2E confirm no legacy drawer/dock mounts.
  - **PARTIAL (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Rail `AccountRow` retired from the shell (bell/avatar/gear now in the TopBar). On the narrative surface the only drawers are Cesare (floating) + SplitDrawer (routed). `BottomDock` is KEPT — it is the Cesare launcher pill per the updated CLAUDE/Spec 44 invariant, not a per-page action bar. `FloatingDock` is only used on the (non-routed) logline editor, not narrative pages; retiring it app-wide is Slice C / N-28. E2E asserts no `rail-account` on narrative pages.

### Topic 2 — Cesare drawer & chat UX

- **N-05** ALTO — Cesare **auto-opens**; it should **start closed** (img #4).
  - `Done =` on first load of any narrative page Cesare is `closed` (no auto-open); `body[data-cesare]` is `closed` until the user opens it; E2E asserts closed-on-load across narrative pages. (Owned by A1 — `cesare-context.tsx`.)
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Root cause was `AppShell.readPersistedCesare()` restoring a persisted `expanded` on every load. Now it always returns `closed` (persisted state never acted on at mount). E2E in `spec55-shell-backbone.spec.ts` pre-seeds `ohw.cesare.state=expanded` and still asserts `body[data-cesare]=closed` on load.
- **N-06** ALTO — In split view (`?peek=cesare`) the **text input to talk to Cesare is missing / not visible** (img #12, #13).
  - `Done =` the composer is present AND inside the viewport in the `?peek=cesare` split surface, even beside a tall document; E2E asserts the composer is on-screen and usable.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Root cause: the shell grid is `min-block-size: 100vh` and GROWS with the main document, so a tall soggetto stretched the grid (and the Cesare lane, at `block-size: 100%`) past the viewport, pushing the composer footer ~175px below the fold at 1440×900. Fix: the lane is now `position: sticky; inset-block-start: 0; block-size: 100dvh; align-self: start` (`CesarePeekLane.module.css`) so it pins to the viewport and the composer stays in view. Measured: composer at y≈855/900 (was 1075/900). E2E `tests/cesare-agentic-chat-ux.spec.ts`.
- **N-07** MEDIO — Chat layout: **fixed header + footer always visible, body scrolls, "go to end of chat" button** — same as Claude (img #13).
  - `Done =` header pinned at top, footer (composer) pinned at bottom, scrollable body in between; scroll-to-end pill present; verified in the split surface.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The `CesareDrawer` frame already lays out header (`flex-shrink:0`) / body (`flex:1; overflow:auto`) / footer (`flex-shrink:0`) with a sticky `scrollNudge` ("↓ Vai alle nuove risposte"); N-06's viewport-bounding fix is what made it hold in the split surface. E2E asserts header.top≈0, footer at the viewport bottom, body `overflow-y:auto`.
- **N-08** MEDIO — Improve the **response bubbles** UI (img #12).
  - `Done =` assistant replies read as a distinct soft card with an agent marker; user bubble distinct.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** `.bubbleMarkdown` is now a left-aligned surface card (`--ds-surface-alt` + 1px line + `--ds-radius-lg`) with a ✦ agent marker; user bubble uses `--ds-radius-lg`. CSS-only in `CesareSheet.module.css`. Screenshot `a2-n08-bubble-and-card.png`.
- **N-09** MEDIO — **"Mostra/Nascondi modifiche" shows nothing** when toggled (img #11). (Spec 47e flash.) **CONFIRMED 2026-06-03** on the logline-from-Cesare result card.
  - `Done =` clicking Mostra modifiche on a logline edit renders a visible inline diff; E2E asserts the flash with green additions.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Root cause: the live-diff marker pipeline was intact for the logline (`write_logline` → `diff_segments` → `ohw:live-diff-b64` → `flashLiveDiff("logline")`), but **no `<CesareLiveDiff documentType="logline"/>` was ever mounted** — the prose docs mount it inside the editor, the logline lives in a collapsed `LoglinePill` with no diff surface, so the flash had no consumer. Fix: `LoglinePill` now subscribes to the live-diff store, auto-opens its popover on a new logline flash, and renders `<CesareLiveDiff documentType="logline"/>` inside it. E2E asserts `data-flash-mode="mostra"` + visible `[data-diff-op="add"]`.
- **N-10** MEDIO — **Markdown rendering problem** in Cesare messages (img #8).
  - `Done =` numbered lists and inline code render correctly in Cesare replies.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The hand-rolled `renderMarkdown` (CesareConversation) only handled bullets/headings/bold/italic — numbered lists fell through to plain paragraphs and inline code rendered as literal backticks. Added ordered-list (`<ol>`) + inline-code (`<code>`) support, and fixed `.mdList` to use real list markers (`list-style`) instead of a flex list that suppressed them. New `.mdCode` token-styled chip.
- **N-11** BASSO — Suggestion cards (Cesare structure cards) placement needs rethinking (img #14).
  - `Done =` the inline next-step suggestion sits after the last reply (near the composer), not pinned above stale history.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Moved the inline `NextStepChip` to render AFTER the conversation in `CesareSheet`, so the forward-looking nudge is contextual to where the user is reading rather than a banner above old messages. Empty-state cold-start menu unchanged.
- **N-26** MEDIO — **Trace repeats the "sta scrivendo" step many times** during a Cesare edit (new, 2026-06-03).
  - `Done =` the live trace shows ONE clear `writing{entity}` step per phase; the step is never removed (tracer invariant); unit test asserts collapse, E2E asserts one writing step at the transport.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The server emits one `writing` event per tool call, but a single edit can run the same writing tool across model iterations / chunks. Fix: the client reducer (`use-cesare-chat-reducer.ts`) now collapses a CONSECUTIVE duplicate of the same phase (same kind + entity domain, or same text for entity-less steps) via `appendTraceStep` — one clean step per phase, the step itself preserved. Unit tests in `use-cesare-chat-reducer.test.ts`; transport-level E2E asserts exactly one `writing{logline}` event.
- **N-27** ALTO — **Cesare margin-note suggestions invent elements not in the document** (new, 2026-06-03, **real AI** — confirmed `MOCK_AI=false`, key set). The `MarginNotesColumn` notes from `polishNarrativeDoc` (`apps/web/app/features/documents/server/narrative-polish.server.ts`) are mostly grounded (Marta, manoscritto, libreria are in the text) but (a) **propose example elements as if plausible-present** (e.g. "un parente geloso, il notaio" — not in the soggetto) and (b) **impose a 3-act frame** ("Atto II") on free-form prose that declares no acts. For a screenwriting tool this erodes trust. **Spans the whole narrative area** — soggetto/sinossi/scaletta/trattamento share `SYSTEM_PROMPTS` + the `submit_narrative_suggestions` tool. Fix: add grounding constraints to the prompt (base every note on text actually present; never assert non-present characters/events/structure; frame any addition explicitly as a proposal, "potresti introdurre…"; optionally anchor each note to a short quote). **Must be tuned + verified against REAL AI** (mock returns static fixtures, so mock can't validate this) — use `pnpm cost:smoke:cesare` / manual on `:3000`.
  - **FIXED (cherry-picked from `agent/a3-cesare-grounding` onto `main`).** Added a centralized `GROUNDING_RULES` preamble prepended to every narrative system prompt via `buildNarrativeSystemPrompt` (soggetto/sinossi/scaletta/trattamento), plus reinforced the tool schema (`category` "Do NOT use act labels unless declared"; `message` "grounded only in what the document says; new elements framed as proposals"). The pure prompt assets were extracted to `narrative-polish-prompt.ts` (no `~/server` deps) so they can be unit-tested + exercised by a real-AI smoke; the `.server.ts` re-exports them. **Verified against REAL AI** with a new `pnpm cost:smoke:narrative-grounding` (controlled soggetto with no notaio/relative/acts → all notes grounded, no invented elements asserted, no "Atto I/II/III"). Structural Vitest in `narrative-polish.server.test.ts` (14 tests). Tool name/transport unchanged so the tracer invariant holds.

### Topic 3 — Cesare sessions (pages & model)

- **N-12** MEDIO — Sessions list page UI too basic (img #5).
  - `Done =` the sessions list renders inside the AppShell as Notion-style cards (sparkle header, primary "+ Nuova" CTA, session count, card per session with glyph/title/relative-activity/hover chevron), `SkeletonCard` loading, a proper empty state; all copy via i18n keys (IT), tokens only; E2E asserts list-in-shell + cards + count.
  - **FIXED (branch `agent/a4-sessions-pages`).** Rewrote `SessionsLandingPage.tsx` + `.module.css`. Added i18n keys `cesare.landing.{lastActivity,countOne,countMany,emptyTitle}` (EN+IT). E2E `tests/cesare-sessions-pages-ui.spec.ts` `[N-12]`. Screenshot `/tmp/a4-after-list.png`.
- **N-13** MEDIO — New-session **full-screen landing should live INSIDE AppShell**, not a bare takeover (img #6).
  - `Done =` the new-session landing renders inside the AppShell (rail + TopBar present), centring the glowy composer within the main lane — no focus mode / `data-shell="focus"`; E2E asserts rail present (non-zero width) + non-focus on click-through and deep-link.
  - **FIXED (branch `agent/a4-sessions-pages`).** Removed `useRequestShellFocus()` from `NewSessionLandingPage.tsx`; `.page` now `flex:1 1 auto` centred in the lane; softened the glow ring (wider inset + heavier blur + lower opacity — was a hard conic "X"). Updated the legacy focus-mode assertions in `tests/cesare-new-session-fullscreen.spec.ts` + new `[N-13]` E2E. Spec 52 revised. Screenshot `/tmp/a4-after-new.png`.
- **N-14** MEDIO — Session conversation page: **EN/IT language mix** + UI too basic (img #7).
  - `Done =` all conversation-page copy routes through i18n keys (IT values present — no hardcoded strings); chat layout with a pinned header, scrolling thread, and a composer docked at the bottom; tokens only; E2E asserts IT copy (subtitle + composer placeholder) + composer docked below the thread.
  - **FIXED (branch `agent/a4-sessions-pages`).** Audit confirmed the page already routes every string through `t()` (the walk's EN was the account locale); reworked `SessionConversationPage.tsx` + `.module.css` into a full-height chat layout (header / scroll thread / docked composer). E2E `[N-14]` in `tests/cesare-sessions-pages-ui.spec.ts`. Screenshot `/tmp/a4-after-conversation.png`. NOTE: the conversation **header title** still reads the DB `session.title` ("Nuova sessione") — auto-naming from first message is **Spec 53 (not built, out of A4 scope)**.
- **N-15** QUESTION — Navigating between pages: should it spawn a **new session** or keep the same one? Design decision (img #10).

### Topic 4 — Logline & narrative nav

- **N-16** ALTO — ~~**Clicking the logline opens nothing** in some state~~ **FIXED (Spec 57)**. Root cause: the shared `Popover` primitive positioned itself with absolute CSS + a fixed width and **no viewport-collision handling**. At 1440 the centred TopBar pill's 480px popover just fit; on any narrower width (smaller window or a split/peek lane compressing the lane) it overflowed off the right edge → appeared to open nothing. Fix: primitive now portals + clamps/flips to the viewport (`computeAnchoredPosition`) and caps `max-inline-size`. Regression: `tests/documents/logline-popover-viewport.spec.ts` (1440/768/390).
- **N-17** MEDIO — ~~**"Soggetto" missing from the sidebar nav"**~~ **FIXED (Spec 57)**. Not missing — the EN label for `soggetto` was wrongly "Treatment outline" (colliding with the real "Treatment" item); with EN labels showing, Valerio read the first item as not-Soggetto. Corrected the EN label to "Soggetto" in all four key sites.

### Topic 5 — Narrative editor chrome

- **N-18** MEDIO — Screenplay: **remove the white border**, want only the centered text page (img #16).
  - `Done =` no `.editorSlot` card frame around the editor; the page shell carries no box-shadow; the centered text column sits flat on the `--ds-bg` canvas (`--radius-none`, the only surface allowed it). E2E asserts the page-shell ancestor has `border-top-width: 0px` + `box-shadow: none`.
  - **FIXED (`agent/a5-screenplay-chrome`, Spec 55a).** `ScreenplayEditorShell` renders the editor directly (the `.editorSlot` card border/radius/bg dropped); `.pageShell` lost its `box-shadow`. E2E `tests/screenplay-editor/screenplay-chrome.spec.ts` N-18.
- **N-19** ALTO — Screenplay top element-tabs (SCENE/ACTION/…) look hardcoded or buggy; **imports + previously-available functionality missing** from the toolbar; move these controls (img #17).
  - `Done =` element-type tabs are a react-aria `useToolbar` strip with roving arrow-key focus (one tab stop); export PDF/Fountain + import PDF/Fountain + Versioni (+ renumber + title page) all live in the single TopBar `screenplay-actions-menu`, registered via the A1 context-action registry; the in-editor `actionsBar`/`ToolbarMenu` is retired.
  - **FIXED (`agent/a5-screenplay-chrome`, Spec 55a).** Registry `screenplay` segment in `context-actions.ts`; `ScreenplayEditor` builds the handlers, calls `useContextActions("screenplay", …)` and publishes the `ActionsMenu` into the TopBar via `useTopBarSlotPublisher`; `ScreenplayElementChips` wrapped in `useToolbar`. Unit `context-actions.test.ts`; E2E `screenplay-chrome.spec.ts` N-19 + migrated export/import/versions specs.

### Topic 6 — i18n leaks

- **N-20** ALTO — EN/IT mix across narrative + sessions + shell (e.g. "Continue screenplay", "Export PDF", "Saved", "2 online", session titles) (img #3,#7,#8,#16,#17,#20). Maps to audit A-05/A-06.
  - **FIXED (narrative+sessions+shell scope) on `main`.** Two classes: (a) **hardcoded `it-IT`/`en-US` formatters** → centralized in `packages/domain/src/i18n/format.ts` (added `formatTime`/`formatDateTime`/`formatInteger`/`formatCurrencyEUR`, joining the pre-existing `formatDate`/`formatNumber`), now consumed via `useLocale()` in `VersionsSplitDrawer`, `versions/VersionsList`, `NotificationCenterDrawer` (the `formatTime`→`formatRelativeTime` rename), `NarrativeCesarePanel`, `FreeNarrativeEditor`. (b) **hardcoded user-visible English** → `SaveStatus` ("Saved/Saving…/Unsaved/Error") now `documents.saveStatus.*`; `PresenceIndicator` ("N persone online" + the EN `online` suffix + `offline`) now `shell.presence.*`. Tests: `format.test.ts` (6, locale-discriminating), `keys.test.ts` parity green; E2E `narrative-editor` saved-status locator made locale-robust (matches the `saved` CSS-module class, not the text). **DEFERRED to N-28/A-05 (production pages):** budget/breakdown/schedule/fundraising formatters (~40 sites) + `RecapStrip`/`cesare.server.ts` (breakdown/AI-context currency, not narrative UI) — out of the narrative-walk scope. **packages/ui IT defaults are NOT bugs** — they are framework-agnostic fallback props meant to be overridden by app-passed `t()` labels (mobile-companion rule); the app already overrides them.

### Topic 7 — Shell & settings polish

- **N-21** BASSO — Redundant **"Oh Writers" label under the logo** (project switcher when no project) (img #3).
  - `Done =` the redundant "Oh Writers" text under the logo is removed (logo stands alone when no project); Design judge screenshot-approves; matches Notion-style minimal header.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Root cause: `_app.tsx` defaulted `projectName` to `"Oh Writers"` when no project, so the shell rendered a redundant project row + wordmark. Now it is empty when no project → no project row, and `LeftRail brand.showLabel` hides the wordmark (the "O" mark stands alone). Screenshot `07-dashboard-no-wordmark.png`.
- **N-22** MEDIO — **Avatar click and gear both open the same page**; should differ: avatar → user settings, gear → project settings (img #17).
  - `Done =` avatar (TopBar account menu) → user settings route; gear → project settings route; they are distinct destinations; E2E asserts each opens its own page.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** In `AppShell` the avatar `onAvatar` → `/settings` (user) and gear `onGear` → `/projects/:id/settings` (project) — split into two handlers (was both `/settings`). E2E asserts each lands on its own pathname.
- **N-23** MEDIO — **Account settings page too narrow** (cramped column) (img #19).
- **N-24** BASSO — Project icon (e.g. "Non fa ridere"): unclear what it should open (img #4).

### Topic 9 — Spec 55 rollout to production surface (DEBT, deferred)

- **N-28** DEBT — **Spec 55 TopBar action standard not yet applied to the production pages** (budget, breakdown, schedule, locations). This fleet (Narrative Walk) intentionally scopes Spec 55 to the **narrative** surface (soggetto/sinossi/scaletta/trattamento/screenplay). The shell backbone (TopBar zones + action registry) lands app-wide via A1, but per-page action registration (export/versions) for the production pages is **out of scope** here. Valerio will analyse the production zones and file the specific bugs. Until then, Spec 56's single-home / shell-zone CI checks may report those routes as non-compliant — that is expected, not a regression. Tracked in `docs/BACKLOG.md` (ICEBOX).

- **N-29** BASSO (test debt) — **Two E2E specs hardcode `http://localhost:3002`** in `page.goto` instead of using `BASE_URL`: `tests/schedule/schedule-export.spec.ts:140` and `tests/shooting-plan/shooting-plan-export.spec.ts:105`. They pass on the default port but misfire under a `WEB_PORT`/`BASE_URL` override (the exact confound that broke the A1 gate before `fixtures.ts`/`helpers.ts` were fixed in `82202c6`). Fix: route both through `BASE_URL`. Found during the A1 gate; out of scope there.

- **N-32** FIXED (`fix/n32-focus-toggle`) — **Screenplay focus mode had no clickable ENTER affordance and the in-editor "Exit Focus" button was hardcoded English.** Fix: a clickable **Focus** button (👁) in the editor Viewbar (`ScreenplayEditorShell`, `screenplay-focus-enter`) that dispatches the same `screenplay:toggleFocusMode` event the keyboard shortcut fires — so the editor keeps owning the focus state, and touch/iPad (no keyboard) can now enter focus mode. The in-editor exit button now reads the existing `screenplay.shell.exitFocus` key ("Esci da Focus" / "Exit Focus"). E2E: `screenplay-chrome.spec.ts` N-32 (enter → localised exit → exit restores chrome). _(Bonus: hardened the N-19 menu test — `menu-item-export-fountain` is `hasContent`-gated and the clean seed leaves the screenplay's live doc empty (N-31 seed gap), so it's no longer asserted there; export-Fountain stays covered by `screenplay-export.spec.ts`.)_

- **N-31** MEDIO (test debt) — **The `tests/editor/` + `tests/screenplay-editor/` suites are NOT in CI** (qa.yml runs only `tests/route-smoke.spec.ts`), so they rotted silently. Two rot classes surfaced during the A5 gate: (a) **stale EN form locators** — `getByLabel(/title|format/i)` + `getByRole("button", { name: /create/i })` on the now-IT `/projects/new` form (`save-indicator`, `screenplay-authoring`, and others; `pdf-import` already fixed in A5 to `#title`/`#format`/`button[type=submit]`); (b) **stale content assertions** — `expect(getEditorContent()).toContain("NON FA RIDERE")` in `editor.spec.ts:31` (the title moved to the title-page doc in `33dbe58`, never in the body fountain); (c) **DB-truncation races** — specs that create their own project in `beforeAll` (e.g. `pdf-import`'s "The Wolf") lose it when another spec's seed truncates mid-run, so they pass solo but flake in a full-file/suite run. A5 fixed the shared `testProjectId` fixture (now returns the stable seeded `TEST_PERSONAL_PROJECT_ID` instead of a non-deterministic dashboard scrape) which recovered ~24 of these; the rest are pre-existing, out of A5 scope. Fix: wire these suites into CI + sweep the stale locators/assertions + give per-spec projects isolation from the global truncate.

### Topic 10 — Resilience

- **N-30** FIXED (`fix/route-error-boundary`, Spec 60) — **`Cannot use 'in' operator to search for 'IP_DIFF' in null` rendered as a bare, unstyled full-page crash** on a session/event detail during the walk. The _specific_ throw was **not reproducible on current `main`** (every session/conversation/edit/diff/version/event-detail path verified live with real AI — likely already fixed by a post-walk merge, or a rare data condition). The real bug class fixed here: **a render throw had no app-owned boundary**, so it escaped to TanStack's bare default page (whole app blanked, real stack lost). Fix = one app-wide `defaultErrorComponent` (`RouteErrorBoundary` → `RouteErrorFallback` in `packages/ui`): branded fallback, shell chrome survives, "Riprova"/"Torna alla dashboard", collapsible stack, and the real error logged as a structured `route.error.boundary` client event. Tests: `RouteErrorFallback.test.tsx` (4), E2E `route-error-boundary.spec.ts` (3, forced via dev/test-only `/crash-test`).

### Topic 8 — Feature idea (ICEBOX, needs spec)

- **N-25** FEATURE — **Live-draft via Cesare**: ask Cesare to write the soggetto → opens a SplitDrawer with a blank sheet → user dictates, Cesare writes & applies live → "ok, caricalo" commits it. Cesare can also **upload/attach a document**. (img #8) → own spec, not now.

## Archived

### BUG-001/002/003 — narrative editor (Enter, counters, list button) — **Fixed, spec 04e (2026-04-18)**

Tiptap ↔ React 19 re-render coupling; replaced Tiptap with vanilla ProseMirror. Placeholder
fix: `Decoration.node` + CSS `::before`. E2E: `tests/documents/narrative-editor-regressions.spec.ts`.

### BUG-004 — "32 failing Playwright tests" (2026-04-18) — **Likely obsolete, revalidate**

Triaged as tech debt in April (screenplay pmDoc mount + title-page autosave race). The UI
had a full v3 redesign since and CI E2E (mock-ui) is green, so this snapshot is almost
certainly stale. Do NOT treat as open — if a specific spec is red today, log it as a fresh
BUG-NNN with a current repro.
