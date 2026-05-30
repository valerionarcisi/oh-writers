# Spec 47b — Universal dispatch in the active Cesare path (A7)

Sub-spec of [Spec 47](./47-cesare-fix-fleet.md), task **A7**. Extends
[Spec 43](./43-cesare-universal-tools.md) (the original universal-dispatch
design) and depends on the streaming layer from
[Spec 47a](./47a-cesare-stream-transport.md).

## Problem

Spec 43 introduced universal dispatch (every Cesare tool callable from any page),
but it landed in the **legacy V1 path** (`handleAskCesare` → `callCesareUniversal`
in `cesare.server.ts`). That path is no longer wired to anything: the active
request/stream path is `askCesare` / `POST /api/cesare/stream` →
`handleAskCesareV2`, which used the **skills registry** to GATE the tool surface
per page via `PAGE_SKILL_MAP` (`skills/registry.ts`).

Concretely: a request on the Sceneggiatura page could only reach the
`screenplay-edit` + `read-scene` skills, so a cross-domain ask like "fammi un v2
del soggetto" emitted a tool the loop could not own → `Unknown tool`. The
user-visible promise — "Cesare is a layer above the SaaS; the page is where the
user is, not a gate" — was true only in dead code.

The streaming layer (47a) already maps `tool → entity` by **tool name** in
`cesare-tool-entity-map.ts`, so once a tool is EXPOSED, the stream emits the
correct `writing{entity}`. The only missing piece was exposing the tool.

## What changed

### 1. `selectForPage` returns the universal superset (`skills/registry.ts`)

`PAGE_SKILL_MAP` is renamed `PAGE_PRIMARY_SKILLS` and demoted from a **gate** to
an **ordering hint**. `selectForPage(page)` now returns the FULL skill superset
with the page-primary skills leading (so their guidance is emitted first), then
every remaining skill deduped. The page is context, not a filter.

`allTools` now dedups tool definitions by name (defensive — no skill overlap in
practice; audited 46 unique tools across the universal screenplay set).

### 2. New always-available `document-gen` skill (`skills/document-gen.skill.ts`)

The page-bound `document-edit` skill needs a live `DocumentContext` (for the
section tools `apply_text_edit` / `expand_section` / `compress_section`), so it
cannot be in the universal base set. But the document **generators**
(`propose_logline_from_screenplay`, `propose_synopsis_from_screenplay`,
`propose_soggetto_v2`, `propose_scaletta_from_soggetto`) resolve their target
document by `projectId` + type internally and auto-create a version via
`applyVersionLive` — they need NO active document context. They are split into a
new `document-gen` skill that is part of the universal base set, so cross-domain
document writes work from any page (e.g. write the Soggetto from the
Sceneggiatura page).

When the user is on a document page, `document-edit` is injected as an override
(carrying both the section tools and the generators) and the standalone
`document-gen` skill is dropped to avoid duplicate tool definitions.

### 3. Context loading stays page-scoped (`primarySkillsForPage`)

`buildLocalContext` unions `requiredData` across the skills it receives. Feeding
it the universal set would load every domain's data on every request. A new
`primarySkillsForPage(page)` returns only the page-primary skills, and
`handleAskCesareV2` uses it to scope `buildLocalContext`. The universal toolset
still drives `allTools` + the executor. Cross-domain write tools resolve their
own target data inside the executor, so they need no pre-loaded context. This
keeps DB round-trips proportional to the page, not the whole toolset.

### 4. Intent classifier wired into the active path (`callCesareV2`)

Before 47b the V2 path never ran the intent classifier at all (the
`forcedFirstTool` nudge only existed in the dead V1 path). `callCesareV2` now
forwards an optional `forcedFirstTool` (added to `runUnifiedToolLoop` →
`runGenericToolLoop`) and runs the cheap Haiku classifier — but ONLY when the
user is actually on the screenplay page (`page === "screenplay"`).

Deliberate scoping decision: the classifier prompt is screenplay-framed and its
`TOOL_BY_INTENT` maps only to screenplay tools. Even though universal dispatch
now exposes those tools everywhere, running the screenplay-framed classifier
from a budget/schedule/locations page would (a) add a Haiku call to pages that
never had one and (b) risk forcing a screenplay tool onto an unrelated domain
request. So we keep the classifier scoped to the screenplay page; other pages
let `tool_choice: "auto"` choose. On any error / low confidence / `MOCK_AI` it
falls back to `"auto"` too.

## Guards kept (NOT loosened)

- **Project-access authorization**: `withProjectAccess(projectId, "view")` still
  gates `askCesare` and the stream route. A foreign project never streams.
- **Zod validation**: every tool input is still validated by its `inputSchema`;
  the route still validates the request body with `CesareInputSchema`.
- **Agentic-edit auto-versioning**: every document write still auto-creates a
  revertible version (`applyVersionLive` / `persistDocumentContent`) BEFORE the
  change is applied live. No destructive write bypasses the version.

## Safety trade-off (for Lead / security review)

Every tool's description now ships in the system prompt on every page, and any
write tool can run from any page. Authorization is unchanged (project-level), so
this does NOT widen who can write — only WHERE a write can be initiated from.
The residual considerations:

- **Larger prompt / cost**: the full tool inventory is sent every turn.
  Mitigated for data loading by `primarySkillsForPage` scoping; prompt-size cost
  tuning is explicitly out of scope (same as spec 43).
- **No per-tool role scoping**: a user with `view` access reaches the stream
  route; write executors rely on `withProjectAccess`'s permission level. If a
  finer "viewer cannot invoke write tools" gate is wanted, it belongs at the
  executor layer (spec 43 deferred this too). Flagged for the Lead.

## Tests

- Vitest (`skills/registry.test.ts`): universal `selectForPage` exposes the full
  superset on every page; a foreign-domain skill (`document-gen`) is selectable
  and dispatchable from the screenplay page; `document-edit` injection drops
  `document-gen`; `primarySkillsForPage` stays narrow; `allTools` dedups; the
  combinedExecutor still rejects unknown tools (guard intact).
- E2E `[OHW-047-A7]` (`tests/cesare-agentic-universal-dispatch.spec.ts`,
  `mock-ui` project): a request with `pageContext.page = "screenplay"` posted to
  `/api/cesare/stream` writes the Soggetto — the stream carries
  `writing{soggetto}` and the terminal `done.result` carries the
  `ohw:doc-applied` marker with a non-null `version_id` and
  `document_type: "soggetto"` (version applied live). A second case asserts the
  route still rejects a foreign project (ownership guard intact).
