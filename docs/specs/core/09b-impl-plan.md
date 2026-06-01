# Spec 09b — Yjs Real-time Collaboration (Phase 1)

## Context

Spec 09b (`docs/specs/core/09b-ws-server.md`) describes a Hono WebSocket server that
syncs Yjs documents between clients, authenticates connections, and persists Yjs state to
PostgreSQL. Today it is the single real gap remaining after the export audit (Spec 28) was
confirmed already implemented. Current state:

- `apps/ws-server/src/index.ts` is a 22-line stub: `/health` + `/room/:roomId` returning HTTP 426.
- No client Yjs wiring (`y-prosemirror@1.2.6` installed but unused; `y-websocket` missing).
- `yjsState bytea` columns exist on `screenplays`, `screenplayBranches`, `documents`
  (+ `yjsSnapshot` on `screenplayVersions`) but are **never read or written**.
- Saving is HTTP debounce (2s screenplay / 30s narrative), not collaborative.

**Goal of Phase 1:** real-time collaborative editing on BOTH the screenplay and narrative
editors, with remote colored cursors + an online-count, authenticated via Better Auth
(Redis-backed), persisted to the existing `yjsState` columns — **without breaking versioning
or any downstream consumer** (breakdown, export, Cesare).

## Confirmed decisions

- **D1 — Transport:** standard `y-websocket` `setupWSConnection` over a raw `ws.WebSocketServer({ noServer: true })`, sharing the `http.Server` that `@hono/node-server`'s `serve()` returns (Hono keeps `/health`). Auth + access run in the `upgrade` handler **before** `setupWSConnection`. Avoids hand-rolling the y-protocol message loop.
- **D2 — Content bridge: CLIENT-DRIVEN.** ws-server persists ONLY the opaque `yjsState` binary. The web client keeps the existing HTTP autosave (which already serializes `doc → fountain/html` and writes `content`/`pmDoc`/versions). Yjs = live transport between clients; HTTP save = content-of-record. **Versioning and all downstream consumers stay untouched.** No PM schema in the Node server. Accepted trade-off: DB `content` can lag the live doc by up to the debounce window (2s screenplay / 30s narrative).
- **D3 — Seeding when `yjsState` IS NULL:** done client-side. First client mounts the editor from `pmDoc`/`content` as today; `ySyncPlugin` writes the initial PM doc into the shared `Y.XmlFragment`. Guard the seed behind `yXmlFragment.length === 0`; concurrent seeds converge via CRDT.
- **D4 — Undo/redo:** when realtime is ON, remove `prosemirror-history` `history()` + its `Mod-z/y` keymap, replace with `yUndoPlugin()` + `yUndo`/`yRedo`. When OFF, keep current chain. Per-mount branch on the `realtime` flag.
- **D5 — Auth sharing:** extract Better Auth config into a shared module importable by both web and ws-server (no dragging the rest of the web server graph). Add Redis `secondaryStorage` for fast session lookup.
- **D6 — Fallback flag:** web env `VITE_WS_URL`. Empty → realtime disabled, editor behaves exactly as today. Set but unreachable → editor degrades to HTTP autosave + "offline" pill. Fallback is automatic and additive (HTTP save always stays mounted).

## Phase 1a — Foundation

**Extract shared auth (D5).** New `packages/auth/` (or `apps/web/app/server/auth-config.ts` promoted to a workspace package) exporting the configured `auth` instance, importable by web and ws-server. Wire Redis:

- Add `ioredis@5.4.1`; `new Redis(process.env.REDIS_URL)`; pass `secondaryStorage: { get, set, delete }` to `betterAuth(...)` per the documented contract. DB adapter stays primary; Redis is the fast read path. Verify `auth.api.getSession({ headers })` resolves through Redis.
- `apps/web/app/server/auth.ts` re-exports from the shared module (no behavior change for the web app).

**Color helper.** Create `packages/utils/src/color.ts` — `userColor(userId: string): string` deterministic HSL from a djb2/FNV-1a hash (hue = hash % 360, fixed S/L). **Pure, browser-safe — must NOT import `node:crypto`** (unlike existing `hash.ts`). Re-export from `index.ts`. Co-locate `color.test.ts` (5+ cases: determinism, distinctness, empty-string boundary, valid CSS).

**Deps (pinned, match installed tree):**

- `apps/web`: `y-websocket@1.5.4`, `y-protocols@1.0.7`, promote `yjs@13.6.30` to direct dep. (`y-prosemirror@1.2.6` already present.)
- `apps/ws-server`: `yjs@13.6.30`, `y-protocols@1.0.7`, `y-websocket@1.5.4`, `ws@8.18.0`, `ioredis@5.4.1`, `drizzle-orm@0.45.1`, `@oh-writers/db@workspace:*`, `@oh-writers/utils@workspace:*`, the shared auth package `@workspace:*`; devDep `@types/ws@8.5.13`.

**Risk:** `y-websocket@1.5.4` `bin/utils` is CJS — under NodeNext ESM use `import { setupWSConnection } from "y-websocket/bin/utils"` and validate resolution early (may need `createRequire`). `secondaryStorage` JSON shape mismatch silently breaks sessions — test login after wiring.

## Phase 1b — ws-server

All new files under `apps/ws-server/src/`. Keep neverthrow `Result` for DB/access paths (no try/catch — `ResultAsync.fromPromise`).

- `index.ts` — keep `/health`; capture `http.Server` from `serve(...)`; attach upgrade handler; `process.on("SIGTERM"/"SIGINT", flushAll → server.close())`.
- `auth-bridge.ts` — `validateSession(headers): Promise<{userId, sessionId} | null>` via the shared `auth.api.getSession({ headers })`. Build `Headers` from the upgrade request (forward cookie; support `?token=` per spec by setting it as Cookie/Authorization).
- `room.ts` — `parseRoomId` (`screenplay:`/`branch:`/`document:`/garbage→null); `resolveProjectAndRole(db, parsed, userId): ResultAsync<{projectId, role}, …>` replicating `apps/web/app/server/permissions.ts`. **Extract the pure predicates `canEdit`/`isOwner`/`canView` into `@oh-writers/utils`** so web and ws-server share one source (avoid drift).
- `persistence.ts` — `loadYjsState(db, parsed)` and `flushRoom(db, parsed, ydoc)` (`Y.encodeStateAsUpdate` → `Buffer.from` → `update().set({ yjsState, updatedAt })` on the matching table by kind).
- `rooms-manager.ts` — `Map<roomId, { ydoc, conns, dirty, flushTimer }>`; `getOrCreateRoom` (apply `loadYjsState`, register `ydoc.on("update", ⇒ dirty=true)`, start 60s interval); 60s interval flushes when dirty; `onLastDisconnect` immediate flush + teardown; `flushAll` for shutdown. **Ensure y-websocket uses OUR managed `Y.Doc`** (pre-populate its `docs` map / `getYDoc` override) so DB-loaded state + update listener apply.
- `ws-handler.ts` — on `"upgrade"`: parse room; `validateSession` (null → 4001); `resolveProjectAndRole` (no access → 4003; unknown → 4004); `wss.handleUpgrade` → attach `{userId, role, roomId}` → `setupWSConnection(ws, req, { docName: roomId, gc: true })`. **Viewer write-protection:** register a `ws.on("message")` guard BEFORE setupWSConnection; if `role==="viewer"` inspect y-protocol message type via `lib0/decoding`, drop sync/update messages, send `{type:"error", code:"WRITE_FORBIDDEN"}`, but allow awareness + sync replies (viewers still see live edits + cursors).

**Risk:** y-websocket keeps its own doc map keyed by `docName` — our `Y.Doc` instance must be the one it uses or state diverges. Viewer guard couples to y-protocols internals (pinned, acceptable).

## Phase 1c — Client: screenplay editor

New shared feature `apps/web/app/features/realtime/`:

- `lib/provider.ts` — `createYjsProvider({roomId, token})` → `{ydoc, provider}` via `new WebsocketProvider(VITE_WS_URL, roomId, ydoc, { params:{token}, connect:true })`; returns null when `VITE_WS_URL` empty. `isRealtimeEnabled()`.
- `hooks/useYjsRoom.ts` — `useYjsRoom(roomId, {enabled}) → {ydoc, provider, status, peers}`; tracks `status`/`sync`, derives `peers` from awareness, cleans up on unmount; sets local awareness `{name, color: userColor(userId), userId}`.

Modify `apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx`:

- New optional props `ydoc?`, `provider?`, `realtime?`.
- Plugin array (~131–171): when `realtime && ydoc`, insert `ySyncPlugin(ydoc.getXmlFragment("prosemirror"))` after `buildCesareAppliedHighlightPlugin()` and before the `...pluginsExtra` spread (~168); replace `history()` + `Mod-z` keymap with `yUndoPlugin()` + y-undo keymap. Non-realtime keeps the exact current chain.
- Keep `dispatchTransaction`'s `onChange(fountain)`/`onDocChange` exactly as-is (the content bridge, D2).
- **Gate the version-restore `replaceWith` effect (~297–311) on `!realtime`** so it doesn't fight the CRDT.

Modify `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`:

- `roomId = \`screenplay:${id}\``; `realtime = isRealtimeEnabled() && !isViewing && canEdit`; viewers connect read-only (write blocked server-side). `useYjsRoom(roomId, { enabled: realtime || (canView && !isViewing) })`. Pass `ydoc/provider/realtime`to`ProseMirrorView`. Keep `useAutoSave`mounted. When`isViewing` (snapshot) → no connect, read-only as today.

**Risk:** Cesare pending/proposed-edit plugins dispatch normal PM transactions → relayed by `ySyncPlugin` (fine). Confirm nested scene-schema cursor mapping doesn't throw.

## Phase 1d — Client: narrative editor

- `apps/web/app/features/documents/lib/narrative-plugins.ts` — `buildNarrativePlugins(schema, {placeholder, ydoc, realtime})`: when realtime, prepend `ySyncPlugin`, swap `history()`+keymap (~81–90) for `yUndoPlugin()`+y-undo keymap.
- `apps/web/app/features/documents/components/NarrativeProseMirrorView.tsx` — add `ydoc/provider/realtime` props; gate external-`value` `replaceWith` effect (~103–118) on `!realtime`; keep `onChange(html)` (bridge).
- `NarrativeEditor.tsx` + `FreeNarrativeEditor.tsx` — `roomId = \`document:${documentId}\``; same `useYjsRoom`wiring; keep 30s`useDocument` autosave as bridge (optionally shorten when realtime on, to reduce export lag).

## Phase 1e — Awareness

- `useYjsRoom` already sets local awareness + exposes `peers`.
- Both PM views: when realtime, add `yCursorPlugin(provider.awareness, { cursorBuilder })` after `ySyncPlugin`; caret + name label colored by `state.user.color`. Add `.ProseMirror-yjs-cursor` CSS in the respective module files.
- `apps/web/app/features/realtime/components/PresenceIndicator.tsx` — "N persone online" pill + colored avatars. Mount in `ScreenplayEditor` actionsBar (~1024) and the narrative toolbar. Read name/userId once from a session context client-side (no per-render server call).

**Risk:** `yCursorPlugin` selection mapping can throw on rapid remote structural edits in the nested scene schema — test heavily.

## Tests (per docs/conventions/testing.md + spec coverage list)

**Vitest:**

- `packages/utils/src/color.test.ts` — 5+ cases.
- `apps/ws-server/src/room.test.ts` — `parseRoomId` variants; `resolveProjectAndRole` vs seeded DB (owner/editor/viewer/non-member→null) → spec "no access → 4003".
- `apps/ws-server/src/persistence.test.ts` — `flushRoom` writes `yjsState`; `loadYjsState` round-trip → spec "reconnect → correct state".
- Add `apps/ws-server/vitest.config.ts` (none today).

**ws-server integration (real `ws` client):** valid token→accepted; invalid→4001; no access→4003; two editors→both receive updates; last disconnect→`yjsState` written immediately; viewer update→dropped + `WRITE_FORBIDDEN`. Covers all 7 spec bullets.

**Playwright (mock E2E, `MOCK_AI=true`, tag `[OHW-09b]`):**

- Two-context screenplay: type in A → appears in B; "2 persone online" pill; remote cursor visible.
- Version-viewing → no WS connect / read-only.
- Fallback: `VITE_WS_URL` unset → editor loads, HTTP autosave works.
- Narrative two-context happy path.

**Vernissage:** `vernissage/_stories/realtime-collab.story.json` + report. No cost smoke (no Cesare surface added).

## Verification (end-to-end)

1. `pnpm dev` (web + ws-server). Two logged-in users, same project, both on the screenplay.
2. Live char-by-char sync; colored cursors with names; online count = 2.
3. Close one tab → count drops to 1; assert `screenplays.yjsState` row non-NULL (DB check).
4. Reload remaining tab → content intact (reconnect from DB).
5. Demote a user to viewer → their edits rejected, but they still see live changes + cursors.
6. Stop the ws-server → editor degrades to HTTP autosave with an "offline" pill.
7. Confirm a version snapshot still captures `content` correctly (versioning untouched).
8. Run Vitest + ws-server integration + Playwright `[OHW-09b]`.

## Out of scope (Phase 2+)

- Multi-instance ws-server scaling via Redis pub/sub.
- Project-overview presence via Redis.
- Server-side authoritative content derivation (would require PM schema in the Node server).

## Docs to update on completion

- `docs/specs/core/09b-ws-server.md` — mark implemented; correct the auth section (Redis `secondaryStorage` + shared `auth.api.getSession`, not raw Redis token lookup).
- `docs/specs/STATUS.md` — move 09b from PARTIAL to DONE.
- `CLAUDE.md` Stack note + `docs/conventions/` if a realtime pattern rule emerges.
- `docs/specs/NN-…` is not needed (09b already exists); update the existing spec per the hygiene rule.
