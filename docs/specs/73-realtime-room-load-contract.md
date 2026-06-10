# Spec 73 — Realtime room load contract (BUG-N54)

## Problem

Opening the soggetto emptied the document for every peer (silent data loss,
surfaced as "il salvataggio non funziona"). Root chain:

1. y-websocket's `setupWSConnection` calls `bindState` (our async DB load)
   without awaiting it and replies syncStep1 immediately → the first client
   completes its sync against a still-empty doc and `provider.synced` fires
   before the persisted state lands. "Synced + empty fragment" was therefore
   ambiguous: genuinely-empty room OR room whose content hadn't loaded yet.
2. y-prosemirror does not seed a room from `EditorState`'s `doc`: on bind it
   renders the fragment over the editor (`_forceRerender`). With an empty
   fragment that WIPES the initial doc; the wipe leaks into `onChange` →
   autosave (writes `""` into `documents` + the active version row), and the
   editor→fragment diff deletes the server content when it arrives late.
3. The soggetto editor (`FreeNarrativeEditor`) mounted the ProseMirror view on
   `connected` without the `synced` gate `NarrativeEditor` has had since
   BUG-N41, maximising the race window.

## Contract (the fix)

1. **The ws-server replies to sync only after the room is loaded.**
   `persistence-binding` exposes `whenRoomLoaded(docName)`; the connection
   handler triggers doc creation (which fires `bindState`), AWAITS it, then
   runs `setupWSConnection`. Client messages arriving during the wait are
   buffered and replayed — without that, the client's own syncStep1 is lost
   and its `synced` never fires (editor hangs on the loading skeleton).
   Consequence: an empty fragment after `synced` now MEANS the room is
   genuinely empty. Two failure paths are handled explicitly: a FAILED load
   refuses the connection (1011) and evicts the half-bound doc — serving an
   empty doc as authoritative is exactly the clobber; and a socket that
   closed during the load is never attached (a zombie in `doc.conns` would
   block the final-disconnect flush + eviction forever).
2. **Client seeding writes the fragment, never the editor state.** When the
   fragment is genuinely empty, `NarrativeProseMirrorView` merges the initial
   doc into it as a CRDT update built with a content-hash `clientID`
   (`updateYFragment` on a scratch `Y.Doc`): two clients racing the first
   open of the same content generate byte-identical ops, so the double-apply
   deduplicates instead of rendering the text twice. The editor state always
   starts `{ schema }` in realtime and the binding renders the (now
   populated) fragment.
3. **Editors mount only after `synced`.** `FreeNarrativeEditor` gains the
   same skeleton gate as `NarrativeEditor`, and `useYjsRoom` reports
   `offline` when the realtime token cannot be obtained — the gates fall
   back to the HTTP editor instead of holding the skeleton forever.
4. **Stale HTTP values can no longer reach a live CRDT passively.** The
   version-resync effects (`NarrativeEditor`, soggetto route) skip their
   mount run. A post-mount external value that EMPTIES a populated realtime
   doc still applies — it is authoritative ("riparti da zero" / activating a
   blank version flow through the same prop) — but it logs the N54 clobber
   signature (`[narrative-editor] external value emptied a populated
realtime doc`) so a regression is visible instead of silent.

## Known remaining

- The screenplay `ProseMirrorView` still uses the `doc: initialDoc` pattern;
  it is shielded by server-seeded version snapshots (Spec 71/72) and a blank
  room renders blank either way. Migrate it to fragment-merge seeding when
  next touched.
- The E2E harness still runs without a ws-server (BUG-N42 TEST DEBT), so this
  contract is covered by unit tests (`free-narrative-realtime-gate.test.tsx`,
  ws-server suite) + live verification, not Playwright.

## Tests

- `apps/web/app/features/documents/components/free-narrative-realtime-gate.test.tsx`:
  skeleton while connected-not-synced; editor once synced; genuinely-empty
  fragment seeded from the initial value (and never wiped); an authoritative
  empty external value applies but logs the N54 clobber signature.
- Live (2026-06-10): pre-fix deterministic kill (CRDT 96→121-byte empty
  paragraph) reproduced 5×; post-fix the page renders the text, autosave
  persists to both rows, reload survives, synopsis/treatment unaffected.
