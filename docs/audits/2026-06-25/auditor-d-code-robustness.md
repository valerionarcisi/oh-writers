# Auditor D — Code-level robustness audit (2026-06-25)

Base: `main` @ `0dd14cbf`. Method: code reading (no app driving) of the data-integrity,
neverthrow, validation, realtime/CRDT, cost/AI, and permission paths. Subagents fanned
out for the noisy sweeps (permission checks, useEffect loops, neverthrow/zod); findings
folded in below.

## Gate baseline (verified on main)

- `pnpm -C apps/web exec tsc --noEmit` → **exit 0** (clean).
- `pnpm -C apps/web exec vitest run` → **2036 passed / 3 skipped / 0 failed**. No RED unit tests.

So nothing below is a pre-existing test failure; these are latent issues the green suite does not exercise.

ALREADY-KNOWN issues (#35, #36, #44, #45/#47, #46/#51/#53, #48, #50, #54, #55, #56, #57, #58) are NOT re-reported.

---

## Findings by severity

### HIGH

#### D1 — Cesare turn lets a project VIEWER mutate every entity (write gated only at `"view"`)

**Severity: HIGH (privilege escalation).** Needs a one-line product decision, not live repro.

- `apps/web/app/features/predictions/cesare.server.ts:2353` — `askCesare` runs `withProjectAccess(data.projectId, "view", …)`.
- `apps/web/app/features/predictions/cesare.server.ts:2378` — `resolveCesareStreamAccess` (used by the streaming route `apps/web/app/routes/api/cesare/stream.ts:52`) runs `withProjectAccessHeaders(projectId, "view", …)`.

Both hand the access into `handleAskCesareV2`, whose tools perform real entity writes with **no role check anywhere in the turn**. Confirmed mutating surface: `persistDocumentContent` (`cesare-tools.ts` ~1360-1378) inserts a `documentVersions` row and repoints `documents.currentVersionId` + content; breakdown/budget/location/schedule/screenplay tool executors insert/update their tables.

The guard model (`apps/web/app/server/access.ts:75-90`): `"view"` passes for any member including a read-only VIEWER; `"edit"` is the one that runs `canEdit` (OWNER/EDITOR). So a viewer can open Cesare and instruct it to rewrite the soggetto, add budget lines, tag breakdown elements, etc. — the writes land. Per-tool writes are correctly project-scoped (not cross-project), so this is a viewer→writer escalation on the viewer's own project, through the AI.

**Fix direction:** require `"edit"` for any turn that can invoke a mutating tool (or split read-only Q&A from mutating Cesare). Same change makes `commitOrAsk`/`applyVersionLive` unreachable by viewers.

#### D2 — `shooting-plan.server.ts` + `blocking.server.ts`: mutating server fns with NO project guard

**Severity: HIGH (any authenticated user can mutate any project's data).**

- `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts` — every write handler calls **only `requireUser()`** (e.g. lines 344, 374, 403, 488, 553, 652, 697, 734, 774, 812, 853, 892, 925, 955, 1037, 1064, 1088, 1152, 1234, 1354, 1403, 1523, 1606, 1688). No `withProjectAccess`/`requireProjectAccess` import in the file. Several handlers accept a `projectId`/row-UUID from the client and never check it against membership. Affected: `createShotPlanAndScenario`, `setActiveScenario`, `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`, `updateSceneNotes`, `updateSceneEffort`, `applyPattern`, `getOrCreateInitialPlan`, `updateEffortWeights`, `moveShot`, `addReverseShot`, `generateShotPlansFromEffort`, etc.
- `apps/web/app/features/shooting-plan/server/blocking.server.ts` — all 6 write handlers call only `requireUser()` (lines 151, 312, 341, 378, 411, 442). Keyed off raw row UUIDs (`sceneId`, `planId`, `sceneBlockingId`, `planSceneCamerasId`, `locationId`) with no ownership check: `getOrCreateBlocking` (inserts `locations`, `sceneBlockings`, `planSceneCameras`), `saveActorPositions`, `saveCameraPin`, `deleteCameraPin`, `detachBlocking`, `saveLocationPrimitives`.

**Exploit:** any logged-in user (incl. a non-member) supplying a known/guessed `projectId`/UUID can create/modify/delete the entire shot plan, scenarios, shots, transitions, scene notes/effort, blocking, camera pins, and location floor-plan primitives of any project. The correct pattern already exists in `schedule.server.ts`/`locations.server.ts`: wrap each write in `withProjectAccess(projectId, "edit", …)`, or for row-id-only handlers resolve the owning projectId first (scene→screenplay→project / scenario→shotPlan→project) then `requireProjectAccess(db, projectId, "edit")`.

Whether these routes are feature-flagged off in the live build is worth confirming, but the server fns themselves are unguarded as written.

#### D3 — ws-server reseed↔flush race can persist a STALE narrative CRDT over a fresh reseed (BUG-N72 survives a window)

**Severity: HIGH if hit (silent content clobber); LOW probability. Needs live confirmation.**

Files: `apps/ws-server/src/persistence-binding.ts` (`reseedRoom` L139-163, `flushDirtyRooms` L113-125, `writeState` L97-105) + `apps/ws-server/src/persistence.ts` (`flushRoom` L59-96).

The flow after a Cesare apply / narrative version activate:

1. The web server commits the DB reseed (`documents.yjsState = newCRDT`) inside the tx, then fires `notifyRoomReseed(documentId)` **fire-and-forget** (`auto-version.effect.ts:525`, `documents/server/versions.server.ts:266,334,438` — all `void notifyRoomReseed(...)`).
2. `notifyRoomReseed` (`realtime/server/notify-room-reseed.ts`) does an HTTP POST → ws-server `reseedRoom(docName)`.
3. `reseedRoom` is `async` and first `await getYWebsocketUtils()` before it reaches `utils.docs.delete(docName)`.

There is **no per-room lock or sequence guard** between "DB reseeded" and "live stale room dropped". In the window before `reseedRoom` deletes the doc, either the **60s `flushDirtyRooms` interval** or **`writeState`** (last client disconnects) can call `flushRoom`, which unconditionally writes `encodeStateAsUpdate(staleYdoc)` back over the fresh `yjsState` (`persistence.ts:84-88` — no check that the DB was reseeded since this doc loaded). That is exactly the BUG-N72 clobber the mechanism exists to prevent, surviving in a sub-second-to-60s race. It is timing-dependent (needs the interval tick or a disconnect to fall in the window right after an apply), hence LOW probability — but the absence of any ordering guarantee is real in the code, and the reseed is `void` (a failed/slow reseed POST never even retries).

**Fix direction:** stamp a monotonic reseed marker on the row at reseed time and have `flushRoom` refuse to write if the room's loaded-generation is older than the DB marker; or make `notifyRoomReseed` awaited within the apply tx boundary (it currently is not); or have `reseedRoom` take a room lock that `flushRoom` respects.

Screenplay is NOT affected here: import/activate creates a NEW version row, so the room id changes (`screenplay:<id>:<versionId>`, `room-id.ts`) and the client reopens a fresh room — no stale-room reuse. The legacy `screenplay:<id>` room is only used when `currentVersionId` is null, which `importAsActiveVersionTx` always populates. (See note N3.)

---

### MEDIUM

#### D4 — `NarrativeEditor` TopBar `actions` slot published without `useMemo` — render-loop mechanics

**Severity: MEDIUM (potential loop / excess re-render). Worth a live check.**

`apps/web/app/features/documents/components/NarrativeEditor.tsx:618-623` publishes a fresh `<ActionsMenu/>` element each render via `useTopBarSlotPublisher("actions", …)` (`NarrativeDocsShell.tsx:133`) with **no `useMemo`** on the element. `useTopBarSlotPublisher`'s `setSlot` compares by identity, so a new element every render never short-circuits → new `slots` object → provider re-renders `NarrativeEditor` → new element → repeat. This is the exact loop the slot context's own docstring warns against; the sibling slots (`loglinePill`, `versionChip`) ARE memoized — only `actions` is not. Live on Sinossi/Trattamento/Scaletta (`hasTopBarDocActions === true`). Whether it spins or merely over-renders depends on whether `TopBarSlotsProvider`'s state change re-renders `NarrativeEditor` synchronously each tick — open one of those pages and watch the profiler/console. Fix: `useMemo` the element.

#### D5 — `ScreenplayEditor` page-info → metrics effect fires per keystroke (shell re-render cascade)

**Severity: MEDIUM (excess re-render, not a loop — self-limiting).**

`ScreenplayEditor.tsx:1289` `onPageChange={(current, total) => setPageInfo({ current, total })}` allocates a new `pageInfo` object on **every ProseMirror transaction (keystroke)**, with no equality guard. That feeds the unconditional `setMetrics({...})` effect at `:577-584` → route re-renders → `acts` useMemo recomputes → whole shell re-renders at keystroke rate. No feedback into the editor, so not a loop. Fix: equality-guard `setPageInfo` on `{current,total}`.

#### D6 — `LocationDetailModal` prop→state sync clobbers in-progress edits on refetch

**Severity: MEDIUM (user edit loss on background refetch).**

`apps/web/app/features/locations/components/LocationDetailModal.tsx:56-61` — the prop→state sync effect lists the whole `candidate` object (a fresh `.find()` from `LocationsPage` each render) in its deps, on top of the three primitive deps that already cover the sync. It fires on every parent re-render and resets contact/notes state from props — so a background refetch while the user is typing in the modal clobbers the in-progress edit. Fix: drop `candidate` from the dep array (keep the primitives).

#### D7 — Document-generation AI calls cannot cache (cacheWrite=0 explained, but minor)

**Severity: MEDIUM→LOW (cost only, no correctness impact).**

`apps/web/app/features/ai/anthropic-client.ts:148-163` (`callHaiku`) marks BOTH system blocks `cacheControl: ephemeral` — block 0 is the per-op system prompt (e.g. `LOGLINE_SYSTEM` ≈ 150 tokens), block 1 is `JSON.stringify(params.fewShot)` = `"[]"` (~1 token). Document tools route through this with `model = SONNET_MODEL = "claude-sonnet-4-6"` (`cesare-model-router.ts:6`, `cesare-document-tools.ts:814-819`). Per the Anthropic prompt-caching reference, Sonnet 4.6's **minimum cacheable prefix is 2048 tokens** — both system blocks are far below it, so the breakpoints are silently no-ops (`cache_creation_input_tokens: 0`). The variable content (screenplay/upstream, ≤18K chars) IS correctly placed in `messages[]` after the breakpoints — placement is right, the prefix is just too small to ever cache. So document-gen calls pay full input price every time and never warm a cache. This is one source of the cacheWrite=0 observation.

Note: the **Cesare turn/tool-loop path is NOT affected** — it uses a deliberately-correct 4-breakpoint layout (ROLE_TEXT + bible + production-context in `cesare.server.ts:1550-1556`, plus the static tool array via `withCachedTools` in `cesare-tools.ts:3087`), a stable prefix, and `logCacheUsage` observability. That path caches correctly and is well-engineered; the cost-smoke test asserts a warm hit. The fix for the document path (if worth it) is to drop the no-op markers there, or fold the per-op system prompt into the shared cached prefix.

---

### LOW

#### D8 — `_unsafeUnwrap()` on a production-fallible Result (latent footgun)

`apps/web/app/features/shooting-plan/server/shooting-plan.server.ts:1729-1731` — `(await resolveWeights(db, data.projectId))._unsafeUnwrap()` unwraps a `ResultAsync<…, DbError>` that CAN be Err in production (DB failure). Currently defused: the line sits inside an enclosing `ResultAsync.fromPromise(async () => {…})` whose mapErr re-wraps a thrown `DbError`, so the error is not lost today. But it violates the neverthrow rule and silently becomes an uncaught throw if the line is moved out of the wrapper. Convert to `.andThen`/`.map`.

#### D9 — `cloneBreakdownToVersion` source not access-checked (cross-project data copy)

`apps/web/app/features/breakdown/server/clone-version.server.ts:20` — edit is verified on the destination `toVersionId`'s project, but the source `fromVersionId` (read ~L62) is not access-checked. An editor on project A could copy another project's breakdown occurrences into their own version. Not a foreign-project write; a data-exposure/integrity edge. (Same shape for `locations.server.ts` candidate/requirement mutations that don't re-verify the candidate belongs to the gated project.)

#### D10 — Lazy backfill writes under `"view"`/`requireUser()` GETs

Several read paths perform a write on first access, gated weaker than an edit:

- `apps/web/app/features/projects/server/draft-meta.server.ts:50-53` — `loadProjectDraftMeta` backfills `draftColor='white'`/`draftDate=today` on legacy null rows, from GETs gated by `requireUser()` only (`getProjectDraftMeta` L63-67; title-page read paths). A non-member with a valid `projectId` triggers a one-time idempotent write on another project's row.
- `apps/web/app/features/breakdown/server/breakdown.server.ts:856` (`buildBreakdownContext` writes ~L761/773/804/820) and `documents/server/documents.server.ts:86` (`ensureFirstDocumentVersion` L64-79, lazy insert L138) — `"view"` GETs that find-or-create version/scene/doc rows. Self-healing lazy-init, looks intentional, but they are schema-meaningful writes under `"view"`. Gate behind at least `"view"` consistently / confirm by-design.

---

## Notes (checked, NOT bugs — recorded so they aren't re-investigated)

- **N1 — neverthrow discipline is clean.** No try/catch used for expected failures; every DB/AI/network call that reaches the user goes through `ResultAsync.fromPromise` with a typed error. The try/catch blocks that exist all guard `JSON.parse`/`PMNode.fromJSON` of model/stored output with a typed fallback (`cesare-tools.ts:2695,2707,2741,2854,4613`, `cesare-intent-classifier.ts:238`, `cesare-stream-events.ts:92`, `parse-scene-stream.ts:120`, `documents.schema.ts:81`). The flagged `.catch(()=>…)` sites are legitimately best-effort (error-logging tees, read fallbacks, fire-and-forget cache-busts) — no swallowed mutation failures. Only D8 above is a real (low) discipline issue.
- **N2 — Zod/validation at trust boundaries is clean.** Every `createServerFn` that reads client `data.*` has a real `.validator(...)` backed by a `z.object({...})` (60+ schemas traced; no identity/`z.any()` validators). The streaming API route validates with `CesareInputSchema.safeParse(await request.json().catch(()=>null))` before use. The handlers without a validator derive identity from the server session and never touch client input.
- **N3 — `auto-version.effect.ts` is sound.** `acquireUseRelease` (version-before-apply + rollback-on-failure) is correct; the `db.transaction` is the real atomicity boundary; `resolveSessionId` defends against the stale-session-FK abort; the overwrite path restores the working row's prior content on rollback (not a delete), the mint path deletes the freshly-minted row. Empty-content + duplicate-content guards fail fast before any write. `TransactionAbort` carries the typed error/defect through the throw that aborts Postgres. No content↔version divergence found in this engine.
- **N4 — No NEW useEffect infinite loops** beyond the two known ones (#45/#47, #48). The predictions chat, shell context publishers, and editor sync paths are ref-bridged + equality-guarded against exactly this class. D4/D5/D6 above are the closest live candidates (excess re-render / prop clobber), not confirmed spins.
- **N5 — Screenplay reseed is correct by design** (version-scoped rooms; new version ⇒ new room ⇒ client reopens). The stale-room hazard (D3) is narrative-only.
