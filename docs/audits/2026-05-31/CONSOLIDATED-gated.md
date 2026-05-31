# Consolidated audit findings — gated (2026-05-31)

Five parallel audits (A novice · B expert · C l10n+bugs · D cesare-only · E feature-coverage), passed
through the audit quality gate (`../AUDIT-QUALITY-GATE.md`). Findings below are ACCEPTED only:
proof-backed, prioritised, actionable, and false-positives removed via live spot-checks by the Lead.

Triangulation legend: a finding seen by multiple audits is more certain. `[live✓]` = the Lead
reproduced it directly.

## ALTO — fix first

1. **Render loop "Maximum update depth" on the screenplay editor** `[B,C,E · live✓ 79 errors]`
   `/screenplay` pins an infinite re-render (79 errors/load, climbing), correlated with intermittent
   silent logout (C). Likely an effect with an unstable dep in `ScreenplayEditor.tsx` — the SAME class
   already fixed for `/sessions/:id`, not yet for the editor / `sessions/new` / `?peek=cesare`.
   Fix: find the setState-in-useEffect with a per-render dep; stabilise via ref / correct deps.

2. **"Mostra modifiche" no longer renders the diff** `[B,D · live✓ on …011]`
   REGRESSION: the edit applies (doc updates, version created, trace shows "Aggiornato Soggetto · 1
   modifica", toggle flips to "Nascondi"), but NO coloured diff renders (`data-cesare-diff=null`, 0
   `[data-diff-op]` spans). Worked 2 days ago (47d/47e, 57+64 spans verified). Something in specs
   50/51/52/53 or the loop fix regressed the flash highlight. (C reported it "working" but on the
   wrong project — the gate corrected this.)

3. **Write-from-zero chain dead-ends after the logline** `[D · DB-verified]`
   On an EMPTY new project, the next-step chip generates the logline, but "Genera il soggetto dalla
   logline" and the rest report success in chat while writing NOTHING (`documents.content` stays len=0,
   no version; server progress payload says `soggetto:false`). The post-logline generators are
   screenplay-derived and no-op when there's no upstream screenplay. On a project that already has a
   screenplay (…011) the generators DO work `[live✓: synopsis got 871 chars]`. So: spec 50 only
   completes the first link for a from-scratch project. Fix: generators must derive from the upstream
   NARRATIVE doc (logline→soggetto→sinossi…), not only the screenplay; never claim success on a no-op.

4. **Free natural language rarely triggers a tool** `[D]`
   8 plain-language requests returned "Ho letto la tua richiesta ma non ho strumenti da invocare." Only
   the canned chip strings dispatch reliably → a button-wizard wearing a chat UI. Fix: the intent
   classifier / dispatch must map free requests to tools (the universal dispatch A7 should cover this).

5. **Screenplay PDF export unreachable from the UI** `[E]`
   The route renders `ScreenplayEditorShell` without wiring `onExport`; `ExportScreenplayPdfModal` never
   opens. "Altre azioni" menu only has "Versioni". The 5 production export formats are dead. Fix: wire
   `onExport`/`setExportFormat`.

6. **All imports unreachable** `[E]`
   Dashboard "Importa Fountain" is hardcoded `disabled`; `<ToolbarMenu>` (Import PDF/Fountain) is
   imported but never rendered. Fix: render the menu, enable the import entry.

7. **First document of a NEW project shows "Documento non trovato"** `[A]`
   Direct nav to Sinossi/Scaletta/Trattamento on a fresh project shows an error overlay instead of an
   empty editor (Soggetto via the pipeline shows a correct empty state — inconsistent). Reads as
   breakage to a first-timer. Fix: empty doc → empty editor with a CTA, never the not-found body.

8. **Breakdown bulk "Archivia" crashes** `[E]`
   Throws "Attempted to synchronously unmount a root while React was already rendering", doesn't persist,
   crashes the browser. Fix the unmount-during-render in the bulk archive handler.

## MEDIO

9. **Systemic Italian localisation leaks** `[A,C,E · 23 items pinned to file:line by C]`
   - Screenplay element legend `Scene/Action/Character/Dialogue/Paren/Transition` →
     Scena/Azione/Personaggio/Dialogo/Parentetica/Transizione (`ScreenplayElementChips.tsx:10-17`,
     dup in `ScreenplayToolbar.tsx`, `fountain-element-picker.ts`).
   - Pipeline `Screenplay` → SCENEGGIATURA (`ProjectPipeline.tsx:131`).
   - Overview cards `Synopsis/Outline/Treatment` (stored English titles) → IT (`NarrativeCardGrid.tsx:82`
     + `seed/index.ts`).
   - Budget `contingency/Production/Contingency/crew` → imprevisti/Produzione/Imprevisti/troupe
     (`OverviewSection.tsx:100,139,145`, `RateCardSection.tsx:203`).
   - Calendar `Strip Board` → Spannografo (`SchedulePage.tsx:56`).
   - Breakdown filter `Locations/Props` (`BreakdownPage.tsx:92,98`).
   - Role badges `Owner/Editor/Viewer` (4 places) → Proprietario/Editor/Visualizzatore.
   - `Import PDF`, `AI Assistant`, `Cesare assistant` aria, `shot` empty state, title-page placeholders
     (Author/Based on/Draft date/Notes/Contact info), all CSV headers, `Screenplay not found.` error.
   - Terminology: pick "Spoglio" OR "Breakdown" (verb is correctly "spoglio"; the feature is "Breakdown").

10. **Every Cesare edit mislabeled "Sceneggiatura"/"Soggetto"** `[B,D · live✓]`
    The result card / trace names the wrong document (a synopsis edit said "Aggiornato Soggetto"). User
    can't tell which doc Cesare touched. Fix: label from the actually-edited entity.

11. **Stale "usa Annulla" copy but no Annulla button** `[B,D]`
    The assistant message says "se non ti convince usa Annulla", but spec 47e intentionally REMOVED the
    inline Annulla (flash model; rollback lives in Versions). Fix the mock/prompt copy to stop promising
    a button that no longer exists (NOT re-adding Annulla — that was a deliberate removal). Verify the
    PO still wants no inline Annulla given users expect it.

12. **⌘K command palette near-empty** `[B]`
    Only "Vai alla Dashboard"; "budget"/"scen" → no results despite the placeholder. Fix: index
    sections/scenes/characters for keyboard jump.

13. **Two Cesare composers open at once** `[A]`
    The full-screen new-session landing input + the floating drawer input both visible → ambiguous which
    is "the real one". Fix: when the landing is up, suppress/dock the floating drawer.

14. **Empty CTA "Continua sceneggiatura →" on a 0-scene project** `[A,B]` → should be "Inizia dal
    Soggetto" when empty; it currently jumps into the screenplay editor (which then shows "not found").

15. **button-in-button hydration error on /schedule** `[B,C,E]` (invalid a11y, 2 console errors).

16. **Slow navigation + session switching** `[B]` 2.5–4.3s per hop; session switch navigates when it
    shouldn't. Fix: router preload-on-hover, non-blocking session-history load.

17. **Teams: viewers see enabled write CTAs that fail silently; non-members get a raw English
    "Forbidden: read project" dev overlay** `[E]` (server enforcement is correct; the UI/overlay is the
    bug). Calendar leaks raw DB column names (`locationId`, `requiredDepartmentIds`) to users `[E]`.

18. **The landing "glow" renders as a vertical brown smear, not a focus ring** `[D]` (spec 52 glow
    broken on at least one path). Fix the gradient/ring CSS.

## BASSO

- Favicon 404 site-wide `[A,C]`.
- "OOh Writers" brand glyph spacing on login `[A,D]`.
- Budget CSV exports manual lines only, not AI-estimated totals `[E]`.
- Trace shows a bare "1 passaggio", not the full streamed step trace, for some flows `[D]`.
- Typos: "1 modificha in sospeso" `[D]`.
- No `notFoundComponent` for bad routes `[D]`.
- 2-step login: Enter doesn't advance step 1 `[B]`.

## Environment artifacts (NOT product bugs — excluded by the gate)

- Better Auth cookie is `localhost`-scoped, not port-scoped → the 5 parallel dev servers stole each
  other's sessions (logouts mid-audit). A multi-auditor harness issue, not a defect. Some "silent
  logout" sightings during the audits trace to this; finding #1's logout (single-server) is separate.
- playwright-cli raw-DOM screenshots show no CSS — not a styling bug.

## Verdicts by feature (from E)

PASS: Locations + map, Settings. ISSUE: Spoglio, Budget, Calendario, Inquadrature, Export(ALTO),
Import(ALTO), Teams, Frontespizio. Working well & protect: CSV exports, most PDFs (breakdown/schedule/
shotlist/SIAE/narrative-DOCX), budget inline edit + cap, schedule strip board, team invite/roles,
locale toggle, title-page persistence, Cesare agentic edit on a screenplay-backed project.
