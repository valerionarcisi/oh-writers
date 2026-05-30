# Spec 47c — Logline unified (single source of truth) + Cesare write/edit (A8)

Sub-spec of [Spec 47](./47-cesare-fix-fleet.md), task **A8**. Builds on the
streaming layer ([47a](./47a-cesare-stream-transport.md)) and universal dispatch
([47b](./47b-cesare-universal-dispatch-active-path.md)).

## PHASE 1 — Diagnosis (what was actually broken)

The brief suspected "two loglines that should be one". The codebase does hold two
representations, but only ONE is wired to the product:

| Representation                         | Cap | Read by                                                                                        | Written by                                                                                      | State today                        |
| -------------------------------------- | --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `documents` row of `type = "logline"`  | 200 | `LoglinePill` (TopBar pill on every narrative page), `SoggettoPage`, `NarrativeEditor`, Cesare | overview pill (`onLoglineChange` → `useSaveDocument`), Cesare `propose_logline_from_screenplay` | **Canonical — holds real content** |
| `projects.logline` text column (≤ 500) | 500 | nothing                                                                                        | `updateProject` ONLY if a caller passes `data.logline` — **no caller ever does**                | **Dead — NULL for every project**  |

### Empirical reproduction (test DB, `MOCK_AI=true`)

Querying the seeded test DB directly:

```
projects.logline           → NULL for every project (4/4)
documents(type=logline)    → holds the actual logline text for every project
```

So in the running app the overview pill, the narrative editors, and Cesare ALL
read and write the **document**. They do not actually diverge at runtime, because
nothing touches `projects.logline`. The real defect is structural, not a visible
data split:

1. **A dead, shadowing column.** `projects.logline` (≤ 500) exists, is exposed in
   `UpdateProjectInput` (`logline: z.string().max(500)`), and is writable by
   `updateProject` — but no UI reads it and no UI writes it. It is a trap: any
   future caller wiring "save the project logline" to `updateProject` would write
   a 500-char value into a column nobody reads, silently diverging from the
   200-char document the rest of the app shows. This is the latent "two loglines"
   bug — it has simply not been triggered yet.
2. **Cap mismatch.** The dead column allows 500; the live document caps at 200
   (`LOGLINE_MAX`). `LoglineBlock` (an unused legacy component) even hardcodes
   `MAX_LENGTH = 500`, contradicting the live `LoglinePill` (`LOGLINE_MAX = 200`).
3. **Cesare can only EXTRACT, never AUTHOR.** `propose_logline_from_screenplay`
   requires a non-empty screenplay and derives the logline from it. There is no
   way to ask Cesare "scrivimi una logline su un detective…" (author from a free
   instruction) or "rendila più corta / cambia il protagonista" (edit the existing
   one) without a screenplay. That is PHASE 3.

### Canonical decision

The **document-backed logline is canonical.** Justification:

- It already owns versioning (`documentVersions`) → the agentic-edit pattern
  (auto-version before AI write + ↩ Annulla) works for free.
- Every reader/writer in the app already points at it.
- `projects.logline` carries zero data and zero readers; keeping it is pure
  cognitive load and an invitation to diverge.

## PHASE 2 — Unify (single source of truth)

1. **Drop `projects.logline`.** Drizzle migration removes the column. No data
   migration is needed (every value is NULL — confirmed empirically); the
   migration drops the column directly.
2. **Remove `logline` from `UpdateProjectInput`.** The project update path can no
   longer write a logline; the only way to change a logline is through the logline
   document (overview pill autosave or Cesare). One door.
3. **Delete the unused `LoglineBlock`** component (and its 500-char constant) so
   the 200-cap `LoglinePill` is the single editing surface.
4. All readers already point at the document, so no reader changes are required.

## PHASE 3 — Cesare authors + edits the logline (free prompt)

New universal-dispatch tool **`write_logline`** added to the `document-gen` skill
(so it is available on EVERY page, per 47b), alongside the existing
`propose_logline_from_screenplay`:

- **WRITE from instruction** — "scrivimi una logline su un detective che…". Does
  NOT require a screenplay. Generates from the instruction.
- **EDIT the existing one** — "rendila più corta / più tesa / cambia il
  protagonista". Loads the current logline document content and rewrites it per
  the instruction.

Both reuse the EXACT existing plumbing (no per-feature variant):

- `applyVersionLive` — auto-creates a revertible version BEFORE applying, points
  the document at it, mirrors content so the open editor updates LIVE behind the
  floating chat.
- `draftPayload` — emits the `ohw:doc-applied` marker (`document_type: "logline"`,
  `version_id`, `previous_version_id`) the client wires into the inline trace's
  **Mostra/Nascondi modifiche** + **↩ Annulla**.
- `executeDocumentGenTool` / `isDocumentGenToolName` / `createDocumentGenTools` —
  the new tool is registered exactly like the other `propose_*` tools, so all
  three dispatch surfaces (legacy V1 combined executor, V2 skill executor, AI-SDK
  tool factory) pick it up with no extra wiring.
- The tool→entity map gains a `logline` domain so the stream emits
  `writing{logline}` (a dedicated label, not "Soggetto"). The existing
  `propose_logline_from_screenplay` mapping is corrected from `soggetto` to
  `logline` at the same time.

### Tool contract

```
write_logline({ instruction: string, mode?: "auto" | "write" | "edit" })
```

- `instruction` — required, the natural-language request.
- `mode` — optional hint. `"edit"` forces rewriting the existing logline;
  `"write"` forces authoring fresh; `"auto"` (default) edits when a non-empty
  logline already exists, otherwise authors fresh.

Output / failure modes (all typed `CesareError`, surfaced as Italian copy):

- empty/blank model output → rejected ("contenuto vuoto").
- output identical to an existing version → rejected (duplicate guard in
  `applyVersionLive`).
- over-length → `sanitizeLogline` hard-caps at 200 (`LOGLINE_HARD_CAP`). An
  over-length instruction cannot produce an over-length stored logline.
- `mode: "edit"` with an empty existing logline → rejected, instructing the user
  to give content / use write mode.

## Cross-page availability proof

`write_logline` is part of `CESARE_DOCUMENT_GEN_TOOLS`, which the `document-gen`
skill exposes in the universal base set (47b). A request posted to
`POST /api/cesare/stream` with `pageContext.page = "screenplay"` (a non-document
page) can invoke `write_logline` and the stream carries `writing{logline}` with
the terminal `ohw:doc-applied` marker. The E2E asserts exactly this.

## Tests

| Tag            | What                                                                                                                                                                | File                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vitest         | `sanitizeLogline` cap; `write_logline` mode resolution; `mappingForTool("write_logline")` → write/logline                                                           | `cesare-document-tools.test.ts`, `cesare-tool-entity-map.test.ts` |
| `[OHW-047-A8]` | happy: edit logline by hand persists; Cesare writes from prompt → live + version + Annulla; Cesare edits existing → live + version. sad: empty/over-length rejected | `tests/cesare-agentic-logline-unified.spec.ts`                    |

E2E lives under `/tests`, `mock-ui` project (matches `cesare-agentic-*.spec.ts`).
