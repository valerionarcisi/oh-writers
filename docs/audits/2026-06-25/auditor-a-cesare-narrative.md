# Auditor A — Cesare + Narrative document flows

Date: 2026-06-25
Base: `main` @ `0dd14cbf`
Scope: Cesare assistant + narrative documents (logline · soggetto · sinossi · scaletta · trattamento) — generation, edit, versions, the chat/peek/sessions, the large-edit ask flow, the tracer, next-step suggestions, markdown rendering, autosave/save-pill, "Mostra modifiche".

Method: code reading (primary, cost-free) + live drive of the seed project `00000000-0000-4000-a000-000000000012` on an isolated dev server (`:3010`). Live driving was partially blocked by a heavily-contended shared browser (4 parallel auditors, 4 dev servers `:3000/:3010/:3011/:3012` on the SAME `oh-writers_dev` DB; the chrome-devtools snapshot context desynced from page selection). I therefore leaned on precise code citations and spot-checked the two top findings against the exact source. **No source was edited and no destructive mutation was made to the sacred seed project** (only a read-only Versions panel was opened).

Already-known bugs (#35, #36, #42, #44, #45–#59) were excluded; everything below is NEW or a genuinely-distinct facet.

---

## ALTO

### A1. `accept_ghost` / `reject_ghost` mislabel the edited entity as "Budget" (it's the Breakdown)

**Severity: ALTO** (wrong-entity — violates the tracer-honesty invariant and lies to the user about what changed)

`apps/web/app/features/predictions/cesare-tool-entity-map.ts:97-98`

```ts
accept_ghost: { access: "write", domain: "budget" },
reject_ghost: { access: "write", domain: "budget" },
```

Both tools are defined inside the **breakdown** tool set (`cesare-tools.ts:600` `accept_ghost`, `:615` `reject_ghost`) and their job is to "trasforma in elemento confermato del **breakdown**" / "Rifiuta un suggerimento ghost". They touch breakdown occurrences, never the budget.

The entity map is the single source of truth for BOTH the streamed live trace (`writing{domain}` → `Cesare scrive …`) and the result card (`entity-applied` marker → `labelForDomain(domain)`). `DOMAIN_LABEL` (`cesare-tool-entity-map.ts:22-34`) maps `budget → "Budget"`. So accepting/rejecting a breakdown ghost streams **"Cesare scrive Budget"** and renders the result card **"Aggiornato Budget"** while only the breakdown changed.

Proof: code citations above; confirmed `accept_ghost`/`reject_ghost` are breakdown tools by reading their definitions and `executeSetGhostStatus`.

Fix direction: both entries should be `domain: "breakdown"`.

Pre-existing (entity map predates this audit; not a recent regression).

---

## MEDIO

### M1. In-place document edits always trace as "Soggetto" regardless of the open document

**Severity: MEDIO** (wrong-entity in the live trace; the result card itself is correct)

`apps/web/app/features/predictions/cesare-tool-entity-map.ts:72-74`

```ts
apply_text_edit:  { access: "write", domain: "soggetto" },
expand_section:   { access: "write", domain: "soggetto" },
compress_section: { access: "write", domain: "soggetto" },
```

These three tools edit **whatever narrative document is open** (`DocumentContext.documentType` — soggetto / synopsis / outline / treatment). Because the streamed `writing` step is derived purely from this static name→domain map, an in-place edit of the **Sinossi / Scaletta / Trattamento** streams "Cesare scrive **Soggetto**".

The result card is NOT wrong here — the `doc-applied` / `live-diff` markers carry the real `doc.documentType` computed at commit time (`cesare-tools.ts` `commitDocumentEdit`). So only the live trace lies. But the tracer invariant (CLAUDE.md "Tracer is mandatory") requires the streamed `writing{entity}` to name the real target. Unlike the cross-domain `propose_*` tools whose target is fixed, these three have a _dynamic_ target that a static map cannot encode; the step must be emitted from the resolved `documentType`.

Proof: code citations above; `buildTargetPageRefForDocument` (`cesare-show-changes.ts:127-141`) confirms the correct per-type mapping exists, so the trace is the only place that hardcodes soggetto.

Pre-existing.

### M2. MOCK_AI / legacy tool loop drops `userInstruction`, breaking the large-edit confirm round-trip in the E2E path

**Severity: MEDIO** (says-asked-then-re-asks; affects the entire Playwright/mock suite, not production)

`apps/web/app/features/predictions/cesare-tools.ts:2367-2377` (document loop) and `:2549-2555` (universal loop) call:

```ts
executeDocumentGenTool(
  block,
  dbArg,
  projectIdArg,
  ctx.userIdFallback,
  ctx.sessionId,
);
//                                                                      ^ no 6th arg (userInstruction)
```

`executeDocumentGenTool` (`cesare-document-tools.ts:1449-1458`) takes `userInstruction: string | null = null` as its 6th parameter, threaded so the confirm-card choice is honoured **turn-wide** (Spec 78 §A5 comment). `commitOptions` (`cesare-document-tools.ts:44-60`) matches the "nuova versione" / "sovrascrivi" trigger against BOTH the per-tool `instruction` AND `userInstruction`:

```ts
userRequestedNewVersion: userRequestedNewVersion(instruction) || userRequestedNewVersion(userInstruction),
largeEditOverwriteConfirmed: userConfirmedOverwrite(instruction) || userConfirmedOverwrite(userInstruction),
```

The production AI-SDK path threads `userInstruction` correctly (`createUniversalCesareTools`); the **legacy `executor`** used by `runLegacyToolLoopEffect` (MOCK_AI=true → all E2E) omits it. So under mock mode the re-sent "Sì, fanne una nuova versione…" / "Sovrascrivi…" turn never reaches the resolver, and the iterative-edit tools (`write_logline` edit-mode, `apply_text_edit`) re-ask instead of applying. The ask-loop the §A5 fix targeted is still reproducible in the mock path.

Note: the `propose_*` derive-from generators (`propose_soggetto_v2`, `propose_scaletta_from_soggetto`, `propose_treatment_from_narrative`, …) commit with `commitOptions(sessionId, null)` and apply directly, deliberately bypassing the ask (`cesare-document-tools.ts:1172-1183`), so they are unaffected — the impact is limited to the iterative-edit tools.

Proof: signature at `cesare-document-tools.ts:1449-1458`; the two 5-arg call sites at `cesare-tools.ts:2371` and `:2549`.

Pre-existing.

### M3. Final narrative chip prompt is phrased too weakly to fire its generator

**Severity: MEDIO** (chain dead-end — the last next-step chip likely lands in a chat reply with no generation)

`apps/web/app/features/predictions/narrative-next-step.ts:86-91`

```ts
screenplay: {
  chipLabel: "Imposta la sceneggiatura dal trattamento",
  prompt: "Aiutami a impostare la sceneggiatura a partire dal trattamento esistente del progetto.",
},
```

Every other chip prompt in the same map uses an imperative the generator's tool description keys on — "Riscrivi il soggetto" (`:66`), "Genera la sinossi" (`:72`), "Genera la scaletta" (`:78`), "Scrivi il trattamento" (`:84`). The screenplay chip is the ONLY one phrased "Aiutami a impostare" / "Imposta". The `generate_screenplay_from_narrative` description triggers on "scrivi la sceneggiatura" / "scrivimi la prima stesura" / "partendo dal soggetto fammi la sceneggiatura" — none of which match "aiutami a impostare". This is the most likely chip to dead-end into a plain chat reply, defeating the chain's last hop.

Fix direction: "Scrivi la prima stesura della sceneggiatura a partire dal trattamento esistente."

Proof: code citation above; the imperative pattern of the other five entries is visible in the same file.

Pre-existing.

---

## BASSO

### B1. Ask-card buttons hardcode Italian copy, bypassing i18n

**Severity: BASSO** (i18n-contract violation — would show IT buttons in the EN market)

`apps/web/app/features/predictions/components/CesareConversation.tsx:810` and `:823` render the literals `Sovrascrivi` and `Nuova versione`. Every other user-facing string in the same component is resolved through `t(...)` (trace verbs `TRACE_VERB_KEY` `:941-971`, show/hide changes, etc.). Not an English-in-IT leak (the product is IT-first), but the two confirm-card actions are the only conversation-renderer strings not routed through `useTranslation`, so the EN market would surface Italian here.

Proof: code citations above.

Pre-existing.

### B2. Inline "Rinomina" silently discards an empty label — cannot reset a version name to default

**Severity: BASSO** (silent no-op; no feedback)

`apps/web/app/features/versions/components/VersionsSplitDrawer.tsx:212-217`

```ts
const submitRename = (versionId: string) => {
  const label = renameLabel.trim();
  if (label.length > 0) onRename(versionId, label); // empty → no-op, no feedback
  setRenamingId(null);
  setRenameLabel("");
};
```

Clearing the field and pressing Enter just closes the editor with no save and no message. The server (`renameVersion`, `versions.server.ts:348-393`) accepts `label: z.string().max(80).nullable()`, so clearing a label to `null` (restoring the auto fallback `Versione N`) IS supported server-side; the UI blocks the only path to it. A user who wants to drop a stale custom label has no affordance.

Proof: code citations above.

Pre-existing.

---

## Checked and FOUND OK (no bug — recorded so the next auditor doesn't re-walk these)

- **Version-action policy** (`resolve-version-action.ts`, `classify-edit-size.ts`) — precedence mint/overwrite/ask and the 40%-or-250-words threshold are pure, deterministic, and sound. `changedWordRatio` is computed in one place and reused.
- **`commitOrAsk`** (`auto-version.effect.ts:558-592`) — on `ask` writes NOTHING and returns `AskedNewVersion`; the engine stays apply-only. Transaction abort/rollback bridge (`runInTransaction`) preserves the typed error across the PG rollback.
- **`buildTargetPageRefForDocument`** (`cesare-show-changes.ts:127-141`) — `synopsis→sinossi`, `outline→scaletta`, `treatment→trattamento`, `logline→soggetto` are all correct; no mis-mapping, so the "Mostra modifiche" preview targets the right doc.
- **Result-card honesty (client)** — `hasAppliedEdit` / `parseToolUpdates` gate the "Fatto / Aggiornato X" card strictly on real `doc-applied` / `entity-applied` / `rewrite` markers, so a chat-only or failed turn never fabricates success.
- **Markdown renderer** (`renderInline` / `extractChangeSummary`, `CesareConversation.tsx:295-363`) — outputs React nodes (`<strong>`/`<em>`/`<code>`), never `dangerouslySetInnerHTML`; no XSS. (Minor cosmetic edge: a bare `a * b * c` arithmetic line could be mis-italicised, not worth a finding.)
- **Versions data-loss on "+ Nuova versione"** — initially a candidate (`createVersionFromScratch` blanks content + clears the CRDT), but `openVersionsDrawer` flushes pending autosave before the drawer opens (`NarrativeEditor.tsx:308-309`), so the active version is persisted before the blank version is minted. Mitigated.
- **Versions panel label vs number** — `${label} (v${number})` (`VersionsSplitDrawer.tsx:152-155`) and the "Attuale" badge keyed on the live `currentVersionId` are intentional, not the `#56` wrong-active facet.
- **Seed soggetto in English** — the seed project's active soggetto content is English prose; this is the director's real session output ("mi fai questa versione in inglese"), intentional, not an i18n leak.

---

## Summary

| #   | Title                                                                             | Severity |
| --- | --------------------------------------------------------------------------------- | -------- |
| A1  | `accept_ghost`/`reject_ghost` mislabel edited entity as "Budget" (it's Breakdown) | ALTO     |
| M1  | In-place doc edits always trace as "Soggetto" regardless of open doc              | MEDIO    |
| M2  | MOCK/legacy loop drops `userInstruction` → large-edit confirm re-asks in E2E      | MEDIO    |
| M3  | Final narrative chip prompt too weak to fire the screenplay generator             | MEDIO    |
| B1  | Ask-card buttons hardcode IT copy, bypass i18n                                    | BASSO    |
| B2  | Inline rename silently discards an empty label (can't reset name)                 | BASSO    |

NEW findings: 1 ALTO, 3 MEDIO, 2 BASSO (6 total).
