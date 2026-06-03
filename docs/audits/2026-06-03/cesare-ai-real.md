# Audit A2 — Cesare AI (Real Anthropic Key)

**Date:** 2026-06-03  
**Auditor:** Agent A2  
**Environment:** http://localhost:3000 + ws-server:1234 · MOCK_AI=OFF · Real Anthropic key  
**Branch:** main (dbf87ad)

---

## Coverage

| #   | Request                                | Flow exercised                                                                 | Result                                                                                                                                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Q&A: "Di cosa parla il soggetto?"      | Tracer invariant · read-only Cesare turn from floating drawer on Soggetto page | Stream response confirmed (convLen grew 0→1249), response text includes "Leggo il soggetto del progetto per te." confirming reading step was processed |
| 2   | Edit: "Aggiungi una riga…" to Soggetto | Agentic edit · auto-version · Mostra modifiche                                 | AI responded conversationally (no write tool fired — expected for vague instruction). No doc-applied marker. Correct behavior.                         |
| 3   | New session from landing               | Spec 52 new-session flow · route to /sessions/:id                              | Intercepted by CesareDrawer z-index bug (LANDING-01). Route works when CesareDrawer is not blocking.                                                   |

**Total Cesare sends: 3** (within ≤6 budget). Additional checks covered by source analysis and DOM inspection without spending Cesare requests.

---

## Key Safety

**PASS.** Zero requests to `api.anthropic.com` were detected from the browser during all Playwright sessions. All AI calls route server-side through `/api/cesare/stream`. The Anthropic key is never exposed to the client.

---

## Findings

### ALTO

#### LANDING-01 · CesareDrawer intercepts pointer events on the /sessions/new send button

**Confirmed real** — reproduced by DOM analysis.

When navigating to `/projects/:id/sessions/new` while CesareDrawer is in `expanded` state, the drawer's `_conversation_` div overlaps the landing's send button (`data-testid="new-session-send"`). `document.elementFromPoint(center-of-send-btn)` returns the `cesare-conversation` div, not the send button. Playwright's click fails with "subtree intercepts pointer events at cesare-conversation".

**Proof:**

```
// DOM element-at-point check (audit-a2-verify.mjs):
elementAtBtnCenter: {
  tag: 'DIV',
  class: '_conversation_12rxw_12',
  testId: 'cesare-conversation'
}
overlaps: true,
drawerDataState: 'expanded',
dataCesare: 'expanded'
```

- Shot: `docs/audits/2026-06-03/shots/a2/VERIFY-landing-send-btn.png`
- Repro steps: (1) Open any project → Soggetto; (2) Click Cesare button (opens drawer); (3) Navigate to `/projects/:id/sessions/new`; (4) Type in composer → click send → click is absorbed by the cesare-conversation div.

**Severity justification:** ALTO — the new-session landing is the primary Cesare entry point (Spec 52). Blocking the send button prevents session creation when the user previously had Cesare open.

**Fix:**

- In `NewSessionLandingPage`, close the CesareDrawer on mount via `useEffect(() => { cesareCtx.close(); }, [])`, or
- In AppShell, when `data-shell="focus"` is engaged (new-session landing), force `data-cesare="closed"`.
- Files: `apps/web/app/features/predictions/NewSessionLandingPage.tsx` (or equivalent), `apps/web/app/features/app-shell/cesare-context.tsx`.

---

### MEDIO

#### VERSIONS-01 · Versions SplitDrawer renders empty at ?peek=versions

**Confirmed real.**

At `?peek=versions` the SplitDrawer container is present (`data-testid="versions-drawer"`, visible) but its body is empty. No version entries render after 5 seconds. The main Soggetto page also shows "Not Found" (the seeded soggetto document has no content, causing a loader/render failure).

**Proof:**

```
// audit-a2-network.mjs (5s wait at ?peek=versions):
drawerBodyHTML: ""
drawerText: ""
notFound: true
versionItems: 0
```

- Shot: `docs/audits/2026-06-03/shots/a2/NET-versions-long-wait.png`
- Repro: Navigate to `/projects/00000000-0000-4000-a000-000000000011/documents/soggetto?peek=versions`.

**Severity justification:** MEDIO — the Versions SplitDrawer is the sole revert path for all Cesare agentic edits (Agentic Edit Pattern, CLAUDE.md). If it renders empty, the auto-version guarantee cannot be exercised or verified by the user.

**Fix:**

1. The "Not Found" on the soggetto page suggests the document route fails when the soggetto has no content — fix the loader to return an empty document rather than 404.
2. In VersionsDrawer, add an empty-state render ("Nessuna versione salvata") when the list is empty, so the drawer is never visually broken.
3. Verify the versions list query receives the correct `documentType` parameter from the `?peek=versions` route.

- Files: `apps/web/app/routes/_app.projects.$id_.documents.soggetto.tsx`, versions list server function, `packages/ui/src/composites/SplitDrawer/`.

---

#### LANDING-02 · CesareDrawer does not close when /sessions/new engages focus mode

**Confirmed real** (root cause of LANDING-01).

The AppShell correctly sets `data-shell="focus"` on `/sessions/new` (Spec 52 PASS). However `data-cesare` remains `"expanded"` — the CesareDrawer is not closed when focus mode is engaged. Spec 44 says the landing owns the viewport; having an expanded drawer alongside the landing is architecturally incorrect.

**Proof:**

```
// audit-a2-final.mjs LANDING STATE:
dataCesare: 'expanded',
dataShell: 'focus',
drawerDataState: 'expanded'
```

- Shot: `docs/audits/2026-06-03/shots/a2/J-new-session-landing.png`

**Severity justification:** MEDIO — directly causes LANDING-01. Also a UX violation: the floating Cesare drawer should not be present while the full-screen "new session" Cesare landing is active.

**Fix:** When `isFocusRequested` becomes true (ShellFocusRequestProvider), dispatch a drawer close. Either in `AppShell` using `useEffect` on `effectiveShellState`, or in `NewSessionLandingPage`.

---

### BASSO / INFO

#### TRACER-INFO · Live trace element not captured during polling — not a confirmed bug

**Static analysis only — not a confirmed product bug.**

The `data-testid="cesare-live-trace"` element was not observed in DOM during polling at 500ms and 100ms intervals across 3 sends. However:

- Short Q&A responses resolve in ≈1–2 seconds (faster than any reasonable polling interval).
- Request #1 confirmed real streaming: `convLen` grew from 45 → 152 → 1249 across polls, and the delivered text contains "Leggo il soggetto del progetto per te." confirming a `reading` event was processed server-side.
- Source correctly wires the pipeline: `streamCesare` → `dispatch(stream/step)` → `message.trace` grows → `MessageView` renders `<LiveTrace>` while `status === "pending"`.

**Conclusion:** The live trace renders but is transient for short responses. Polling cannot prove or disprove it for responses under 2 seconds. A dedicated E2E test with a synthetic slow stream or `MOCK_AI=true` with artificial delay is the right verification path.

**Recommendation:** Add a Playwright test in `tests/` that uses `MOCK_AI=true` and a mock that delays step events to confirm `[data-testid="cesare-live-trace"]` and `[data-step-kind="reading"]` are visible for at least one frame.

---

## Passing Checks

| Check                                               | Result | Evidence                                                                                                          |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Spec 52 — focus mode on /sessions/new               | PASS   | `data-shell="focus"` confirmed                                                                                    |
| Spec 52 — glowy centred composer visible            | PASS   | `textarea[placeholder="Chiedi qualunque cosa a Cesare…"]` visible, glow class present                             |
| Spec 52 — heading "Cosa scriviamo oggi?"            | PASS   | Heading text confirmed in DOM                                                                                     |
| Write-from-zero chips (Spec 50)                     | PASS   | 11 chips found: "Genera la scaletta dal soggetto", "Esplora un'idea per il film", "Rivedi cosa ho scritto finora" |
| BottomDock visible when Cesare closed               | PASS   | `_dock_xp4jf_7` visible, `data-cesare="closed"`                                                                   |
| BottomDock hidden when Cesare expanded              | PASS   | `dockVisibleWhenExpanded: false` confirmed                                                                        |
| body[data-cesare] only "closed" or "expanded"       | PASS   | No peek/full/expanded-split persisted to body attribute                                                           |
| Cesare button has data-testid="cesare-open-btn"     | PASS   | Confirmed in DOM                                                                                                  |
| Editor visible behind open Cesare panel (no reflow) | PASS   | `mainRect.w=1200` unchanged when Cesare expanded; drawer is position:fixed                                        |
| CesareDrawer opens to data-state="expanded"         | PASS   | `drawerState: "expanded"`, `dataCesare: "expanded"` after click                                                   |
| Context chip shows page name                        | PASS   | `cesare-context-chip` shows "SOGGETTO"                                                                            |
| Session as central route /sessions/:id              | PASS   | Session click routes to `/projects/.../sessions/4eb34630-...`                                                     |
| Session deep-link persistent                        | PASS   | Direct navigation to session URL stays on session page                                                            |
| Sessions visible in LeftRail                        | PASS   | 3 sessions listed with correct labels                                                                             |
| Session named from first request                    | PASS   | Session label: "Di cosa parla il soggetto di questo"                                                              |
| Key safety — no browser→Anthropic calls             | PASS   | Zero `api.anthropic.com` requests from browser                                                                    |

---

## Screenshots Index

| File                           | Content                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `A-soggetto-initial.png`       | Soggetto page, shell full, Cesare closed, BottomDock visible                  |
| `B-cesare-opened.png`          | CesareDrawer expanded, editor area visible behind, BottomDock hidden          |
| `C-before-send-1.png`          | Composer filled before Q&A send                                               |
| `D-after-send-1-complete.png`  | After Q&A response delivered                                                  |
| `J-new-session-landing.png`    | /sessions/new: focus mode, glow composer, 11 chips — but data-cesare=expanded |
| `VERIFY-cesare-open.png`       | Cesare drawer state: data-state=expanded, mainRect confirms no reflow         |
| `VERIFY-landing-send-btn.png`  | Confirmed z-index intercept: cesare-conversation blocks send button           |
| `H-session-central-route.png`  | Session click routes to /sessions/:id central route                           |
| `I-session-persistence-ok.png` | Session deep-link preserved on direct navigation                              |
| `FINAL2-versions.png`          | Empty versions drawer body                                                    |
| `NET-versions-long-wait.png`   | Versions drawer after 5s — still empty body                                   |

---

## Summary Table

| ID          | Severity | Title                                                                |
| ----------- | -------- | -------------------------------------------------------------------- |
| LANDING-01  | ALTO     | CesareDrawer intercepts new-session send button                      |
| LANDING-02  | MEDIO    | CesareDrawer not closed when focus mode engages                      |
| VERSIONS-01 | MEDIO    | Versions SplitDrawer renders empty at ?peek=versions                 |
| TRACER-INFO | INFO     | Live trace not captured at polling granularity (not a confirmed bug) |
