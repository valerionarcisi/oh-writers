# Spec 09b Phase 2 — realtime hardening, presence, Soggetto, multi-instance

> Status: active · Date: 2026-06-02 · Owner: Valerio
> Extends: [09b — ws-server / Yjs realtime](./09b-ws-server.md) (Phase 1 DONE)

Phase 1 shipped real-time collab on the screenplay + narrative editors (Yjs over
y-websocket, Better-Auth-gated, persisted to `yjsState` columns; content bridge
stays client-driven HTTP autosave). Phase 2 closes the four deferred items from
STATUS Priority 3.

## Shared invariants (every agent)
- Read `CLAUDE.md`, `docs/specs/core/09b-ws-server.md`, `docs/conventions/{server-functions,error-handling,react,testing}.md`, this spec.
- **neverthrow** for DB/IO Result paths; no try/catch for expected failures. **Zod** validates inputs. **CSS Modules + tokens.** English identifiers; Italian only for user-facing copy. No new deps without flagging. No AI signatures in commits. Never log/expose tokens.
- The **content bridge stays client-driven** (D2 from Phase 1): ws-server persists ONLY `yjsState`; HTTP autosave owns content/versions. Do not change that.
- Each agent: unit + (where it adds value) E2E; typecheck + tests green; commit `[OHW]` on its worktree branch; do NOT merge.

## A1 — `persistence.test.ts` (ws-server)
Close the test gap. New `apps/ws-server/src/persistence.test.ts` (vitest; the package has `room-id.test.ts` already so config exists).
- Test `flushRoom` → `loadYjsState` **round-trip** for all three room kinds (`screenplay:`, `document:`, `branch:`): build a `Y.Doc` (via `./yjs-shared`), mutate it, `flushRoom`, then `loadYjsState` and assert `encodeStateAsUpdate` of a doc seeded from the loaded bytes equals the original (or apply + compare a shared field).
- Test `loadYjsState` returns `null` for a never-synced row.
- DB access: these hit `@oh-writers/db`. Use the **test DB** (`DATABASE_URL_TEST` / `oh-writers_test`) seeded rows, or mock `@oh-writers/db` the way `apps/web` server tests mock their db (check `pipeline.test.ts` for the `vi.mock` idiom) — prefer a real round-trip against seeded ids if the ws-server vitest can reach the test DB; otherwise mock the three `db.update`/`db.query.*` calls and assert the encoded bytes written. Pick the approach that actually runs in CI and document which.
- Also cover the `persistence-binding` flush path if cheaply mockable (dirty-room set → `flushDirtyRooms` writes + clears).

## A2 — Live presence in project overview
`TeamPresence.tsx` is currently **static** (`collaborators` prop only). Make it show who is **actually online now**.
- Reuse `useYjsRoom(roomId, user, enabled)` from `~/features/realtime` — it already returns live `peers` from awareness and works **awareness-only** (no editor needed). Open it on the overview for the project's primary room (`screenplay:<screenplayId>` if one exists, else skip gracefully — no screenplay = no live room yet).
- Resolve the local user via `useSession()` (same as `NarrativeEditor`). `enabled` = realtime on AND a room id exists.
- Feed live `peers` into `TeamPresence`: render an online dot/ring on collaborators whose `userId` matches a peer, and/or a "N online" count. Keep the static collaborator list as the base; presence is an overlay on top. Use the existing `PresenceIndicator` styling tokens where sensible; do not invent new color tokens (`userColor` from `@oh-writers/utils` already gives per-user color).
- Must degrade silently when `VITE_WS_URL` is unset (status `disabled` → just the static list, no errors).
- Do NOT run DB queries on the client; no server fn needed (awareness is peer-to-peer over the existing provider).

## A3 — Realtime on the Soggetto free editor
`FreeNarrativeEditor` (rendered by `routes/_app.projects.$id_.soggetto.tsx`) has NO `useYjsRoom` — the only narrative surface still HTTP-only. Wire it like `NarrativeEditor.tsx` (the canonical model — read it):
- Thread the Soggetto **document id** into `FreeNarrativeEditor` (the route/caller has it; add a `documentId` prop).
- `const { ydoc, provider, status, peers } = useYjsRoom(`document:${documentId}`, realtimeUser, canEdit)`; build the `realtime` object exactly as `NarrativeEditor` does (only when `status==="connected"`).
- Pass `ydoc/provider/realtime` down to `NarrativeProseMirrorView` (same prop contract Phase 1 added there). Keep the existing `onChange(html)` HTTP autosave as the content bridge.
- Render `<PresenceIndicator status={status} peers={peers} />` when `status !== "disabled"` (match NarrativeEditor placement).
- Viewing/read-only (`!canEdit`) → no connect, behaves as today.
- Verify the Cesare inline live-diff highlight (`diffDocumentType`) still works alongside `ySyncPlugin` (Phase 1 already reconciled these on NarrativeProseMirrorView — confirm no regression on Soggetto).

## A4 — Multi-instance ws-server via Redis pub/sub
Today one ws-server holds rooms in-process; two instances behind a load balancer would NOT see each other's updates/awareness. Add Redis fan-out so N instances share rooms.
- Redis is already a dep in the graph (Phase 1 added `ioredis` for Better-Auth `secondaryStorage`; confirm `ioredis` is available to `apps/ws-server` — if not, flag before adding).
- On every local Yjs `update` for a room, publish `{docName, update}` to a Redis channel; subscribe on each instance and `applyUpdate` incoming updates to the local `Y.Doc` (guard against echoing your own update — tag with an instance id or use the update origin). Do the same for **awareness** updates (publish/subscribe the encoded awareness so presence is cross-instance).
- Must be **opt-in / no-op when `REDIS_URL` is unset** — single-instance dev/personal runs keep working with zero Redis. Gate the whole pub/sub behind the env var; when absent, behaviour is exactly Phase 1.
- Keep persistence (`flushRoom`) unchanged — only ONE instance needs to flush a given room; either let each flush idempotently (last-writer-wins on `yjsState` is fine since it's a full state encode) or note the race is benign (full-state writes converge). Document the choice.
- Wire it into `persistence-binding`/`ws-handler` where the managed `Y.Doc` + awareness live. Do NOT fork y-websocket internals beyond the existing `setPersistence`/`docs` hooks.
- Tests: a unit test that two in-process "instances" sharing a mock Redis pub/sub channel converge a doc (publish from A → applied on B). A real Redis integration test is optional; if it needs a live Redis, gate it like the existing integration tests.

## Waves
- **Wave 1 (parallel, disjoint):** A1 (ws-server test), A2 (overview presence — `apps/web` only), A3 (Soggetto — `apps/web` only). No file overlap.
- **Wave 2:** A4 (multi-instance) — touches `apps/ws-server` `persistence-binding`/`ws-handler`/`index`; merge after A1 so the new `persistence.test.ts` validates the still-correct flush path. (A4 can start in parallel but merges last.)

## Done criteria
- `pnpm typecheck` 8/8 · `pnpm test:unit` green · ws-server vitest green (incl. new `persistence.test.ts`) · lint clean.
- Overview shows a live online indicator that changes when a second tab joins/leaves (live-verified, two contexts).
- Soggetto free editor syncs char-by-char between two contexts + shows presence; degrades to HTTP autosave when `VITE_WS_URL` unset.
- With `REDIS_URL` set + two ws-server instances, an edit on instance A appears on a client connected to instance B (or the unit-level convergence test proves the fan-out). With `REDIS_URL` unset, single-instance behaviour is byte-identical to Phase 1.
- Content bridge + versioning untouched (a version snapshot still captures `content`).

## Out of scope
- Presence avatars in the LeftRail / global shell (overview + editors only).
- Redis-backed horizontal autoscaling policy / infra manifests (just the app-level pub/sub).
- Any change to the HTTP autosave debounce or version model.
