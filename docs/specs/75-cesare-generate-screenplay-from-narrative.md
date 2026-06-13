# Spec 75 — Cesare: generate the first-draft screenplay from the narrative chain

Fixes **BUG-N67**: the user asked Cesare "partendo dal soggetto attivo, scrivimi la prima
stesura della sceneggiatura" and Cesare wrote the **Trattamento** instead. Real-AI bug.

## Root cause (code-traced)

The narrative chain is `logline → soggetto → sinossi → scaletta → trattamento → sceneggiatura`.
Every step up to the treatment has a "write the whole thing from upstream" generator
(`write_logline`, `propose_synopsis_from_screenplay`, `propose_soggetto_v2`,
`propose_scaletta_from_soggetto`, `propose_treatment_from_narrative`). The **screenplay has
no from-narrative generator** — only scene EDIT tools (`propose_screenplay_edit`,
`rewrite_scene`, `propose_screenplay_revision`, `merge_scenes`, `delete_scene`), each of
which loads and revises an EXISTING screenplay. On a from-scratch project (soggetto written,
screenplay empty) there was no whole-screenplay tool, so the model fell back to the nearest
neighbour — `propose_treatment_from_narrative` ("write the next narrative thing from
upstream") — and wrote the treatment. The system-prompt WORKFLOW likewise had no
"scrivi la sceneggiatura" entry.

## Decision

Add one tool: **`generate_screenplay_from_narrative({ instruction?, target_page_count? })`**.

- Reads the upstream narrative chain (scaletta → trattamento → sinossi → soggetto → logline,
  nearest-first; same `loadUpstreamNarrative` pattern as the other generators), fails loudly
  when there is genuinely nothing upstream.
- Generates a first-draft **Fountain** screenplay (Sonnet; mock output under `MOCK_AI`).
- Applies it **LIVE as the new ACTIVE screenplay version** by reusing
  `importAsActiveVersionTx` (Spec 71/72) — the proven path that inserts a
  `screenplay_versions` row, seeds its CRDT snapshot server-side (so the editor renders
  without a first-client race, BUG-N53), points `screenplays.current_version_id` at it,
  syncs scenes, and carries breakdown tagging forward. No new persistence surface.
- Auto-version invariant is satisfied: the prior active version is preserved (a new row is
  inserted, the old one is left intact and restorable from the Versions panel) — the
  screenplay analogue of `applyVersionLive`'s "version before apply".

### Why reuse `importAsActiveVersionTx` rather than the revision path

`propose_screenplay_revision` inserts an `isDraft: true` row and pushes an ephemeral proposal
banner the user must accept — wrong contract for a first generation, which the user expects
APPLIED live (canonical Agentic Edit Pattern, CLAUDE.md). `importAsActiveVersionTx` is the
single deep module that already makes a Fountain body the live active version with full
seeding; the generator is a thin wrapper over it.

## Tool registration (every site — a new gen tool touches FIVE places)

The live verify caught a missed site: a new document-gen tool must be added to **all**
of these or the streaming loop rejects the forced `tool_choice` with
`Tool '…' not found in provided tools`:

1. `createDocumentGenTools` factory (the AI-SDK `tool()` execute) — the runtime handler.
2. `CESARE_DOCUMENT_GEN_TOOLS` (Anthropic tool-definition array) — **the list the skill
   registry passes to `generateText`/Anthropic**. Missing here = "not found in provided
   tools" even though the factory has it.
3. `isDocumentGenToolName` — so the executor routes to `executeDocumentGenTool`.
4. `executeDocumentGenTool` switch — the non-SDK marker/result path.
5. `cesare-tools.ts` `extractSideChannelMarkers` doc-applied gate — so `applied_live`
   emits the `ohw:doc-applied` marker (honest card + "Vai al documento" navigation).

Plus the classifier (`write_screenplay` intent → tool, in both prompts) and the
`document-gen.skill.ts` guidance block.

## Entity map + trace

- `cesare-tool-entity-map.ts`: add `generate_screenplay_from_narrative → { write, screenplay }`
  so the tracer renders `writing{Sceneggiatura}` (cross-domain from any page). Tracer
  invariant (CLAUDE.md) holds — the tool emits its step like every other.

## System prompt

Add to the document-gen WORKFLOW:
`"scrivi la sceneggiatura" / "prima stesura della sceneggiatura" / "dal soggetto fammi la sceneggiatura" → generate_screenplay_from_narrative({ instruction?, target_page_count? })`
and tighten the treatment line so the model does not grab `propose_treatment_from_narrative`
for screenplay requests.

## Tests

- **Unit** (`cesare-screenplay-from-narrative.test.ts`): upstream loader returns empty →
  loud error; mock generation → `importAsActiveVersionTx` called with the generated Fountain;
  entity-map mapping present.
- **Unit** (`cesare-tool-entity-map.test.ts`): `generate_screenplay_from_narrative` →
  `{ write, screenplay }`.
- **Real-AI smoke** (`cost:smoke:cesare`-style, [OHW-N67]): on a project with a soggetto and
  an empty screenplay, "scrivimi la prima stesura della sceneggiatura partendo dal soggetto"
  → the SCREENPLAY (not the treatment) becomes the active version with Fountain content; the
  reply names "Sceneggiatura". Mandatory per the bug's real-AI nature — mock alone does not
  prove the routing.

## Out of scope

- The versioning-flood policy (BUG-N66) — separate spec.
- Regenerating over an existing non-empty screenplay (this tool is for the first draft /
  explicit "scrivi la sceneggiatura"; structural rewrites of an existing screenplay stay on
  `propose_screenplay_revision`).
