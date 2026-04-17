# Spec 09 — WebSocket Server (Yjs Real-time Collaboration)

## Overview

The `ws-server` is a standalone Hono process that acts as the Yjs sync provider between clients. It handles document rooms for screenplays and narrative documents, authenticates connections against Better Auth sessions, and persists Yjs state back to PostgreSQL.

---

## Stack

- **Hono** — lightweight HTTP + WebSocket server
- **y-websocket** — Yjs WebSocket provider (server side)
- **Redis** — pub/sub for multi-instance scaling (future); presence state
- **PostgreSQL** (via Drizzle) — Yjs state persistence

---

## Authentication

Every WebSocket connection **must** be authenticated before any Yjs message is processed.

### Flow

```
Client → ws://ws-server/room/:roomId?token=<session-token>
ws-server → looks up token in Redis session store (set by Better Auth)
  → invalid/expired token → close(4001, "Unauthorized")
  → valid token → attach { userId, sessionId } to socket context
ws-server → checks room access (see Room Access below)
  → no access → close(4003, "Forbidden")
  → access granted → join room, start Yjs sync
```

### Token

The client sends the Better Auth session token as a URL query parameter:

```ts
// apps/web — connecting to ws-server
const token = await getSessionToken(); // read from cookie/context
const provider = new WebsocketProvider(
  `ws://localhost:${WS_PORT}`,
  roomId,
  ydoc,
  { params: { token } },
);
```

The ws-server validates the token by looking it up in Redis (Better Auth stores sessions there). No additional HTTP call to the web app is needed.

---

## Room Naming

Rooms map directly to document identifiers:

| Content type       | Room ID format              |
| ------------------ | --------------------------- |
| Screenplay (main)  | `screenplay:<screenplayId>` |
| Screenplay branch  | `branch:<branchId>`         |
| Narrative document | `document:<documentId>`     |

Each room maintains its own independent Yjs document and awareness state.

---

## Room Access Control

Before joining a room, the ws-server checks whether the authenticated user has access:

```
screenplay:<screenplayId>
  → query projects.ownerId = userId OR team_members.userId = userId (role ≥ viewer)

document:<documentId>
  → same check on the parent project

branch:<branchId>
  → same check on the parent screenplay's project
```

Write access (Yjs updates from client) is rejected with a protocol message if the user's role is `viewer`.

---

## Yjs State Persistence

### Source of Truth

The Yjs document in memory (per room) is the live source of truth. PostgreSQL (`yjsState` column) is the persistent source of truth for reconnects.

### On Room Open

1. Load `yjsState` from the DB for the given screenplay/document/branch
2. Apply it to the in-memory Yjs doc
3. Clients connecting receive the current state via standard y-websocket sync

### Flush Strategy

- **On interval**: every 60 seconds, if there are pending changes, flush `Y.encodeStateAsUpdate(ydoc)` to the DB
- **On room close** (last client disconnects): immediate flush
- **On graceful shutdown**: flush all open rooms

```ts
// Pseudo-code for flush
async function flushRoom(roomId: string, ydoc: Y.Doc) {
  const state = Y.encodeStateAsUpdate(ydoc);
  await db
    .update(screenplays)
    .set({ yjsState: state, updatedAt: new Date() })
    .where(eq(screenplays.id, extractScreenplayId(roomId)));
}
```

---

## Awareness (Presence)

Yjs awareness is used for:

- Colored cursors with user name and color
- "N people online" count in the editor toolbar
- Online/offline presence on project overview (via Redis)

Awareness state per user:

```ts
type AwarenessState = {
  userId: string;
  name: string;
  color: string; // deterministic from userId hash
  cursor: { anchor: number; head: number } | null;
};
```

---

## Write Protection for Viewers

When a Yjs update arrives from a client with role `viewer`:

```
ws-server receives update message
  → check role from socket context
  → role === 'viewer' → drop message, send { type: 'error', code: 'WRITE_FORBIDDEN' }
  → role === 'editor' | 'owner' → broadcast to room
```

---

## Environment Variables

```bash
WS_PORT=1234
WS_SECRET=        # not used for external auth; reserved for future inter-service calls
DATABASE_URL=     # same as web app
REDIS_URL=        # same as web app
```

---

## Error Codes

| Close Code | Meaning                                |
| ---------- | -------------------------------------- |
| 4001       | Unauthorized (no valid session token)  |
| 4003       | Forbidden (valid user, no room access) |
| 4004       | Room not found                         |

---

## Test Coverage

- Valid session token → connection accepted, Yjs sync starts
- Invalid/expired token → connection closed with 4001
- Valid user with no project access → closed with 4003
- Viewer user sends a Yjs update → dropped, error message returned
- Two editors in same room → both receive each other's changes
- Last client disconnects → yjsState flushed to DB immediately
- Client reconnects → receives correct state from DB
