# Spec 41 — Cesare Inline Edits

> **Note**: shell-level UX is now governed by [Spec 44](./44-shell-refactor-notion-style.md). This spec's recommendations remain authoritative for inline edit proposals and diff overlay behaviour but defer to Spec 44 for AppShell layout decisions.

**Status:** ⬜ To do  
**Scope:** Screenplay editor only  
**Depends on:** Spec 38 (scene summaries), Spec 40 (local context)

---

## Problem

When the user asks Cesare to rewrite a scene (e.g. "opzione B"), the current behavior:

- Creates a full screenplay version (wrong — versions are for manual snapshots)
- Does not show the rewrite inline in the editor
- Leaves the drawer open during generation (passive, chatbot-like)

The right behavior: Cesare acts directly in the editor, the user sees the result immediately, and decides with a single gesture.

---

## Design

### Mental model

Cesare is not a chatbot suggesting a rewrite. Cesare **writes in the editor** while the user watches. The user then accepts or rejects — like reviewing a diff, not reading a message.

### Flow

1. User says "opzione B" (or any rewrite/edit instruction) in the Cesare drawer
2. **Drawer closes** immediately — Cesare is working, not chatting
3. The Cesare button in the bottom toolbar enters `is-writing` state: a **glow loop animation** pulses around it (CSS only, `prefers-reduced-motion` respected)
4. The target scene's existing text is **replaced in streaming** — characters arrive one by one as a typewriter effect, the new text rendered as a **green pending decoration** (ProseMirror decoration, not a real doc change)
5. Stream completes → glow stops, decoration stays
6. **Hover on the green block** → inline toolbar appears: `✓ Accetta` · `✗ Rifiuta` (two buttons, nothing else)
7. **Accept** → `tr.replaceWith(...)` applies the pending text as a real doc change, decoration removed, normal save flow
8. **Reject** → decoration removed, doc unchanged. Also triggered by `Cmd+Z` at any point during or after streaming

### No version created

Cesare inline edits do NOT create screenplay versions. Versions are user-initiated snapshots only.

---

## Technical design

### ProseMirror: `CesarePendingDecoration`

A new plugin `cesare-pending-edit` manages the pending state:

```typescript
interface PendingEdit {
  sceneFrom: number; // ProseMirror pos: start of target scene
  sceneTo: number; // ProseMirror pos: end of target scene
  streamedText: string; // grows as stream arrives
  status: "streaming" | "done";
}
```

- While `status === "streaming"`: decoration renders `streamedText` as a green overlay over the original scene range. The original content is NOT removed from the doc — only hidden by the decoration.
- While hovering the decoration: a `HoverToolbar` React component (portal) renders `✓ / ✗` at the top-right of the block.
- On accept: dispatch `tr.replaceWith(from, to, parsedNodes)` + clear plugin state.
- On reject / `Cmd+Z`: clear plugin state only. Doc untouched.

### Streaming

The existing `askCesare` streaming infrastructure is reused. A new tool `rewrite_scene` is added to the screenplay skill:

```typescript
// tool input
{ scene_number: number, new_content: string }
```

When Cesare calls `rewrite_scene`, the client:

1. Closes the drawer
2. Finds the scene range in ProseMirror
3. Starts feeding `new_content` characters into the plugin state via streaming chunks

### Glow animation (CSS)

```css
.cesareBtnInner {
  /* existing styles */
}

.cesareBtnInner.isWriting {
  animation: cesare-glow 1.4s ease-in-out infinite;
}

@keyframes cesare-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(var(--ds-agent-rgb), 0);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(var(--ds-agent-rgb), 0.45);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cesareBtnInner.isWriting {
    animation: none;
    opacity: 0.7;
  }
}
```

### HoverToolbar (inline accept/reject)

Small React component, portal-mounted at the decoration's bounding rect:

```tsx
// Positioned absolute top-right of the green block
<div className={styles.hoverToolbar}>
  <button onClick={onAccept}>✓ Accetta</button>
  <button onClick={onReject}>✗ Rifiuta</button>
</div>
```

Appears on `mouseenter` of the decoration node, disappears on `mouseleave` unless focus is inside.

---

## Scope boundaries

This spec covers **screenplay editor only**. Document pages (soggetto, scaletta) have a different edit model and are out of scope.

This spec does NOT cover:

- Multi-scene rewrites (one scene at a time for now)
- Partial inline highlights (word/line level) — full scene replacement only
- Collaboration conflict resolution with pending edits

---

## Files to create / modify

| File                                                                     | Change                              |
| ------------------------------------------------------------------------ | ----------------------------------- |
| `features/screenplay-editor/lib/plugins/cesare-pending-edit.ts`          | New plugin                          |
| `features/screenplay-editor/components/HoverToolbar.tsx`                 | New component                       |
| `features/screenplay-editor/components/HoverToolbar.module.css`          | New styles                          |
| `features/screenplay-editor/components/ScreenplayCesarePanel.tsx`        | Wire `rewrite_scene` tool → plugin  |
| `features/screenplay-editor/components/ScreenplayCesarePanel.module.css` | Add `isWriting` glow                |
| `features/predictions/skills/screenplay.skill.ts`                        | Add `rewrite_scene` tool definition |
| `apps/web/app/mocks/ai-responses.ts`                                     | Add mock for `rewrite_scene`        |

---

## Tests

| Tag      | File                                | Scenario                                                      |
| -------- | ----------------------------------- | ------------------------------------------------------------- |
| OHW-041a | `tests/cesare-inline-edits.spec.ts` | Cesare rewrites scene → green decoration visible in editor    |
| OHW-041b | `tests/cesare-inline-edits.spec.ts` | Accept → text changes in doc, no version created              |
| OHW-041c | `tests/cesare-inline-edits.spec.ts` | Reject → text unchanged                                       |
| OHW-041d | `tests/cesare-inline-edits.spec.ts` | Drawer closes during streaming, glow visible on Cesare button |
| OHW-041e | `tests/cesare-inline-edits.spec.ts` | Cmd+Z while streaming → reject, doc unchanged                 |
