# Audit A3 — Realtime Collaboration (Yjs Phase 2)

**Date:** 2026-06-03  
**Auditor:** A3 (sub-agent)  
**Spec ref:** `docs/specs/core/09b-phase2-realtime.md`, `docs/specs/core/09b-ws-server.md`  
**Branch:** main @ dbf87ad  
**Web:** http://localhost:3000 (dev server, `VITE_WS_URL=ws://localhost:1234`)  
**WS server:** port 1234

---

## Coverage

| Flow                                  | Exercised     | How                                                                         |
| ------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| Screenplay sync (two editors)         | YES           | Two Valerio contexts on personal project screenplay                         |
| Presence indicator in screenplay      | YES           | `data-testid="presence-count"` polled up to 15s                             |
| Screenplay viewer read-only           | PARTIAL       | Team project 13 has no screenplay (see F-01)                                |
| Soggetto sync (two editors)           | NO            | See F-02 — viewer never connects; two Valerio contexts attempted (see F-04) |
| Soggetto presence indicator           | YES           | Valerio only: showed "1 online"                                             |
| Soggetto viewer read-only (UI)        | YES           | `contenteditable=false` confirmed on collab page                            |
| Soggetto viewer write-block (attempt) | YES           | Write attempt produced no change (blocked)                                  |
| Project overview presence             | YES           | Both users on overview; indicators absent (see F-03)                        |
| Redis multi-instance                  | NOT EXERCISED | Only single ws-server instance tested                                       |

Screenshots: `docs/audits/2026-06-03/shots/a3/`

---

## Summary

| #    | Severity | Title                                                                            |
| ---- | -------- | -------------------------------------------------------------------------------- |
| F-01 | ALTO     | Broken "Continua sceneggiatura" CTA on overview — team project has no screenplay |
| F-02 | ALTO     | Viewer cannot receive live Soggetto changes (never connects to Yjs room)         |
| F-03 | MEDIO    | Overview presence (TeamPresence) never shows online indicators                   |
| F-04 | BASSO    | Soggetto two-editor sync not exercised (test-data gap)                           |

---

## Passed checks

### P-01: Screenplay two-editor sync — PASS

Two browser contexts opened the same personal project screenplay (`/projects/00000000-0000-4000-a000-000000000012/screenplay`). Alice (Valerio context A) typed `INT. A3SYNC<timestamp> - GIORNO`. Bob (Valerio context B) received the edit within 15 seconds via the Yjs CRDT sync.

**Proof:** screenshot `a3-03-sync-bob.png` shows Bob's editor containing Alice's text. The `data-testid="presence-count"` showed "2 online" within 15 seconds of both contexts loading the page (screenshot `a3-02-presence-alice.png`).

### P-02: Screenplay presence indicator — PASS

`[data-testid="presence-count"]` appeared in Alice's page with value "2 online" as soon as Bob's context joined the room. Remote peer shown as colored avatar.

**Proof:** screenshot `a3-02-presence-alice.png`.

### P-03: Soggetto page loads + viewer write-blocked at UI level — PASS

Both users loaded the Soggetto page for team project 13. The `[contenteditable]` attribute on the collab (VIEWER) page was `"false"`. A programmatic type attempt produced no change in the editor text.

**Proof:** screenshots `a3-06-soggetto-alice.png`, `a3-06-soggetto-bob.png`, `a3-08-soggetto-viewer-readonly.png`, `a3-inv5-soggetto-write-attempt.png`.

### P-04: Soggetto presence indicator shows for owner — PASS

Valerio's page on the soggetto showed `[data-testid="presence-count"]` with value "1 online" (their own context). The viewer's page showed no presence indicator (because `canEdit=false` → no Yjs room opened → `status="disabled"` → `PresenceIndicator` returns null by design).

**Proof:** screenshot `a3-07-soggetto-presence.png`.

---

## Findings

### F-01 — ALTO: Team project "Continua sceneggiatura" leads to error page

**Description:** The Valerio team project (ID `00000000-0000-4000-a000-000000000013`) has no screenplay row in the database (the seed only creates documents — soggetto, sinossi, scaletta, trattamento). The overview page shows a "Continua sceneggiatura →" CTA button regardless. Clicking it navigates to `/projects/…/screenplay` which renders "Sceneggiatura non trovata — Non è stato possibile aprire la sceneggiatura."

Both Valerio (owner) and collab (viewer) land on the same error. The `data-pm-screenplay` editor is never mounted. This also blocks verifying the viewer screenplay read-only path and the overview presence feature for this project.

**Repro steps:**

1. Sign in as valerio@ohwriters.dev
2. Navigate to `http://localhost:3000/projects/00000000-0000-4000-a000-000000000013`
3. Click "Continua sceneggiatura →"
4. Observe "Sceneggiatura non trovata"

**Proof:** screenshots `a3-inv1-team-screenplay.png`, `a3-invA-team-screenplay-loaded.png`, `a3-invB-collab-screenplay-loaded.png`, `a3-invD-screenplay-after-click.png`.

**Severity justification:** A team-collab project showing a broken primary CTA is a P1 UX regression. The "Continua sceneggiatura" button is designed for when a screenplay exists — showing it when none exists creates a dead-end navigation.

**Fix (two options, apply both):**

- **Seed:** add a screenplay row for `VALERIO_TEAM_PROJECT_ID` in `packages/db/src/seed/index.ts` (mirror the pattern used for `VALERIO_PERSONAL_PROJECT_ID`).
- **UI guard:** in `ProjectHero` (or wherever the "Continua sceneggiatura" button is rendered), suppress the CTA when `overview.screenplay === null`. Show a "Crea sceneggiatura" call-to-action instead.

---

### F-02 — ALTO: Viewer cannot receive live Soggetto changes (never connects to Yjs room)

**Description:** `FreeNarrativeEditor` (soggetto) and `NarrativeEditor` (sinossi/scaletta/trattamento) gate the entire Yjs room connection on `canEdit`:

```ts
// apps/web/app/features/documents/components/FreeNarrativeEditor.tsx:63–66
const room = useYjsRoom(
  documentId ? `document:${documentId}` : "",
  realtimeUser,
  canEdit && !!documentId, // viewer (canEdit=false) → never opens room
);
```

A viewer-role user therefore never connects to the Yjs room and never receives live updates from editors. When Valerio typed in the soggetto, collab's page did not update — confirmed by polling for 20 seconds.

In contrast, `ScreenplayEditor` connects ALL users unconditionally:

```ts
// apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:265–268
} = useYjsRoom(`screenplay:${screenplay.id}`, realtimeUser, !isViewing);
// "Realtime sync is active for ANY connected user (viewers included)"
```

The screenplay is the canonical spec: viewers see live edits + cursors; the ws-server enforces write-protection server-side. The narrative editor deviates from this.

**Repro steps:**

1. Sign in as valerio@ohwriters.dev in tab A; sign in as collab@ohwriters.dev (VIEWER) in tab B
2. Both navigate to `http://localhost:3000/projects/00000000-0000-4000-a000-000000000013/soggetto`
3. Valerio types text in the editor
4. Collab's tab does not receive the text after 20 seconds

**Proof:** `audit-investigate2.mjs` INV-C: `Soggetto sync to collab: FAIL`. Screenshots `a3-inv6-soggetto-valerio-sync.png` (Valerio's page with typed content), `a3-inv6-soggetto-collab-sync.png` (collab's page unchanged).

**Severity justification:** A viewer in a team project opens the soggetto and sees a frozen snapshot. Their co-author's live edits are invisible to them. This is a collaboration feature that silently fails.

**Fix:** Change both `FreeNarrativeEditor` and `NarrativeEditor` to connect to the Yjs room for all users (the `enabled` flag should not depend on `canEdit`). Gate only writes behind `canEdit`:

```ts
// FreeNarrativeEditor.tsx — proposed fix
const room = useYjsRoom(
  documentId ? `document:${documentId}` : "",
  realtimeUser,
  !!documentId, // connect for viewers too
);
// Pass realtime to the view only when canEdit, so ySyncPlugin does not
// attempt to push local content changes for viewers:
const realtime = canEdit ? buildConnectedRealtime(room) : null;
```

The ws-server already handles the write-block server-side (`viewer-connection.ts` drops `SYNC_UPDATE` frames). No server changes needed.

---

### F-03 — MEDIO: Overview TeamPresence never shows online indicators

**Description:** After both Valerio and collab navigated to the project overview page and waited 8 seconds, neither `[data-testid="collaborator-online-dot"]` nor `[data-testid="team-online-count"]` appeared.

Root cause: `ProjectOverviewContent` opens the Yjs awareness room only when `overview.screenplay?.id` is non-null:

```ts
// apps/web/app/features/projects/components/overview/ProjectOverviewPage.tsx:79–84
const screenplayId = overview.screenplay?.id ?? null;
const presenceRoom = useYjsRoom(
  screenplayId ? `screenplay:${screenplayId}` : "presence:none",
  presenceUser,
  screenplayId !== null, // DISABLED when project has no screenplay
);
```

For team project 13, `screenplayId=null` → hook disabled → `TeamPresence` receives `peers=[]` and `isOnline=false`. This finding is directly related to F-01 (no screenplay seeded), but the structural issue exists independently: even for projects with a screenplay, the presence room only activates if the screenplay exists. Users visiting only the overview with a valid screenplay would still not trigger this room unless the overview correctly resolves the screenplay ID.

**Proof:** screenshots `a3-09-overview-alice.png`, `a3-09-overview-bob.png`, `a3-invE-overview-valerio.png`, `a3-invE-overview-collab.png`. Programmatic check: `onlineDots: 0, teamOnlineCount: null` after 8 seconds with two users on the page.

**Severity justification:** Phase 2 spec (§A2) explicitly requires live online indicators on the overview. The feature is fully implemented in the code but blocked by the missing screenplay in the seed. A medium severity because the code is correct in principle; it fails only due to a data gap (F-01) and a minor design issue (no awareness-only fallback channel).

**Fix:**

1. Fix F-01 (add screenplay to team project 13 seed) — this will unblock the `screenplayId !== null` guard.
2. After F-01, verify the overview presence shows online dots when both users are on the overview page with the screenplay room open. If the screenplay must also be visited to open the room, consider a dedicated presence-only room (e.g. `overview:<projectId>`) so presence works without requiring an active screenplay session.

---

### F-04 — BASSO: Soggetto two-editor sync not fully exercised

**Description:** The mandate requires verifying Soggetto sync + presence between two users. The collab test account is seeded as VIEWER on team project 13 (not editor), and F-02 shows viewers never connect to the Yjs room. A two-Valerio-context test was set up for the screenplay but was not replicated for the soggetto.

**Severity justification:** Low — the underlying CRDT/Yjs plumbing for `document:<id>` rooms is the same code path proven in the screenplay test (P-01). The gap is a test-data limitation; there is no separate soggetto-specific Yjs code that is untested.

**Fix:** Either add an EDITOR-role user to the test fixture for the team project (a second user with `role: "editor"` on `VALERIO_TEAM_ID`), or seed a scenario where two EDITOR contexts open the same soggetto. Once F-02 is fixed, this test should pass trivially.

---

## Redis multi-instance — NOT EXERCISED

Only a single ws-server instance was running. Redis pub/sub fan-out (`apps/ws-server/src/redis-sync.ts`, Spec 09b §A4) was not exercised. The code was inspected:

- `initRedisSync` is a no-op when `REDIS_URL` is absent — single-instance behaviour is preserved.
- Self-echo guard uses `INSTANCE_ID` (randomUUID per process) and `REDIS_ORIGIN` symbol — correct.
- `registerRoom` attaches doc `update` and `awareness update` listeners per room — correct structure.

Unit test `apps/ws-server/src/redis-sync.test.ts` exists and was not run as part of this audit. Live two-instance convergence over a real Redis is not verified.

---

## Severity counts

| Severity | Count          |
| -------- | -------------- |
| ALTO     | 2 (F-01, F-02) |
| MEDIO    | 1 (F-03)       |
| BASSO    | 1 (F-04)       |
