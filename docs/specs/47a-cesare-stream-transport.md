# Spec 47a — Cesare message round-trip + streamed step events (A1 + A2)

Sub-spec of [Spec 47](./47-cesare-fix-fleet.md). Implements agents **A1** (client
message lifecycle) and **A2** (real streamed step transport), which share the
single Cesare send path.

## Problem

1. **A1** — On submit the user bubble is appended optimistically, but a session
   swap (`handleSessionSelect` / `handleSessionNew` resetting `messages` to `[]`)
   can wipe a just-sent bubble, and there is no explicit per-message delivery
   state (in-flight / delivered / failed). A failed send shows a generic
   assistant line but the user's own bubble never carries a status.
2. **A2** — `cesare.server.ts` is pure request/response: `askCesare` returns a
   single string after the whole tool loop completes. There is no live trace
   (`Cesare sta leggendo la sceneggiatura → sta scrivendo la v2 del soggetto →
Fatto`). The `<!--ohw:tools=N-->`, `<!--ohw:doc-applied:…-->`,
   `<!--ohw:rewrite-scene-b64:…-->`, `<!--ohw:blocking-proposal:…-->` markers are
   only readable AFTER the call resolves.

## A1 — client message lifecycle

- Each chat message gets a stable `id` and a `status` of
  `pending | delivered | failed` (assistant messages are always `delivered`).
- The send path appends the user bubble synchronously and **never** lets a
  session reset drop an in-flight bubble. The message list is namespaced per
  session, so switching sessions swaps the visible thread without mutating the
  thread that owns the in-flight bubble; switching back restores it.
- The send pipeline is owned by a `useReducer` + `ts-pattern` reducer
  (`use-cesare-chat.ts`) so the optimistic append, status transitions, and
  session-scoped reset are a single deep module with one narrow interface.
- The user bubble renders a status affordance: a spinner dot while `pending`,
  nothing when `delivered`, and a `↻ Riprova` control + error tint when
  `failed`.

## A2 — streamed step transport

### Event contract (Zod — single source of truth)

`cesare-stream-events.ts` exports the discriminated union (the `_tag` field is
the discriminant so ts-pattern can match without `instanceof`):

```ts
export const EntityRefSchema = z.object({
  domain: z.enum([
    "soggetto",
    "synopsis",
    "outline",
    "treatment",
    "screenplay",
    "breakdown",
    "budget",
    "schedule",
    "shooting-plan",
    "locations",
  ]),
  label: z.string(), // user-facing IT label, e.g. "Soggetto", "Sc.2"
});

export const CesareStreamEventSchema = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("reasoning"), text: z.string() }),
  z.object({ _tag: z.literal("reading"), entity: EntityRefSchema }),
  z.object({ _tag: z.literal("writing"), entity: EntityRefSchema }),
  z.object({ _tag: z.literal("tool"), name: z.string() }),
  z.object({
    _tag: z.literal("done"),
    result: z.string(), // final assistant text + legacy markers
    toolsExecuted: z.number().int(),
  }),
  z.object({ _tag: z.literal("error"), message: z.string() }),
]);
```

The `done.result` string keeps carrying the existing `<!--ohw:…-->` markers, so
the live-doc apply / Annulla / blocking-proposal side-channels keep working
unchanged. **Reconciliation decision:** markers are NOT migrated into typed
events — they stay in `done.result`. Migrating them would force the
documents/screenplay features to re-subscribe to a new channel for zero user
benefit; keeping them in the final result is the smaller, reversible change. The
new typed events are PURELY additive: they drive the live trace, nothing else.

### Tool → entity mapping (cross-domain)

A `tool` step is mapped to a `reading`/`writing` entity by the tool name, NOT by
the page the user is on. This is what makes cross-domain work: a
`propose_synopsis_from_screenplay` issued on the Sceneggiatura page emits
`reading{screenplay}` (the page scope) then `writing{synopsis}` (the tool
target). The mapping lives in `cesare-tool-entity-map.ts` and is shared by the
server emitter and the client reducer.

### Transport

A dedicated API route `POST /api/cesare/stream` returns a `ReadableStream` of
newline-delimited JSON (NDJSON) events. It is page-agnostic and domain-agnostic
— the same route serves every page. It runs the SAME `handleAskCesareV2` path,
wired with an `onStreamEvent` callback the tool loop invokes from `onStepFinish`
(production) and the legacy mock loop. The route is auth-gated through
`withProjectAccess(projectId, "view")` exactly like `askCesare`; the Anthropic
key never reaches the client.

`askCesare` (the createServerFn) stays as the non-streaming fallback so existing
callers and tests keep working. The client prefers the stream and falls back to
`askCesare` when the stream route is unreachable.

### Client rendering

`use-cesare-chat.ts` consumes the NDJSON stream, parses each line with
`CesareStreamEventSchema`, and reduces events into a `liveTrace` attached to the
in-flight assistant message. The trace renders with the existing `ChangeTrace`
primitive: `reasoning` → thoughts, `reading`/`writing` → updates list, `done` →
final result card. While streaming, an aria-live status line shows
`Cesare sta leggendo <entity> / sta scrivendo <entity>` so the live trace is
observable by E2E + screen readers.

## Tests

| Tag            | What                                                                                                                 | File                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vitest         | stream-event Zod parse (happy/edge/error) + reducer + tool-entity map                                                | `cesare-stream-events.test.ts`, `use-cesare-chat-reducer.test.ts` |
| `[OHW-047-A1]` | bubble appears <100ms; survives a session swap; failed send marks bubble                                             | `tests/cesare-agentic-stream-roundtrip.spec.ts`                   |
| `[OHW-047-A2]` | write request streams reading→writing→done before result card; cross-domain (Sceneggiatura request writing Soggetto) | `tests/cesare-agentic-stream-roundtrip.spec.ts`                   |

E2E lives under `/tests` (the repo's Playwright `testDir`) in the `mock-ui`
project, matching the `cesare-agentic-*.spec.ts` glob. **Reconciliation:** the
brief said `apps/web/tests/e2e/`, which does not exist in this repo — the actual
convention is root `/tests`, mock-ui project. Tags `[OHW-047-A1]`/`[OHW-047-A2]`
are preserved.
