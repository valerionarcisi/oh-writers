import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { Fragment } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { fountainToDoc } from "../fountain-to-doc";
import { splitInlineCues } from "../split-inline-cues";

// ─── Pending scene rewrite ────────────────────────────────────────────────────
//
// Cesare's rewrite_scene applies the new scene text LIVE and IN-PLACE (WYSIWYG),
// highlighted green ("this is new, not yet confirmed"), with a single
// accept/reject bar anchored to the scene. There is NO overlay box and NO
// dimmed original — the editor shows the real new text exactly as it will read.
//
// On accept the green highlight clears and the text stays. On reject the
// original scene nodes (captured at apply time) are restored verbatim.

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PendingEdit {
  /** 1-based scene number targeted by the rewrite */
  readonly sceneNumber: number;
  /** Original scene nodes, kept so a reject restores them verbatim. */
  readonly originalSlice: Fragment;
  /** Streaming is instantaneous now — status is always "done" once applied. */
  readonly status: "done";
}

interface CesarePendingState {
  pendingEdit: PendingEdit | null;
  decos: DecorationSet;
}

// ─── Meta shapes ──────────────────────────────────────────────────────────────

interface ApplyRewriteMeta {
  readonly kind: "apply";
  readonly sceneNumber: number;
  readonly originalSlice: Fragment;
}

interface ClearPendingMeta {
  readonly kind: "clear";
}

type CesarePendingMeta = ApplyRewriteMeta | ClearPendingMeta;

export const cesarePendingEditKey = new PluginKey<CesarePendingState>(
  "cesare-pending-edit",
);

// ─── Scene lookup ──────────────────────────────────────────────────────────────

// Find the start and end positions of the nth scene node (1-based).
// Returns null when the scene is not found.
export const findSceneRange = (
  doc: PMNode,
  sceneNumber: number,
): { from: number; to: number } | null => {
  let count = 0;
  let result: { from: number; to: number } | null = null;
  doc.forEach((node, offset) => {
    if (result) return;
    if (node.type.name === "scene") {
      count += 1;
      if (count === sceneNumber) {
        result = { from: offset, to: offset + node.nodeSize };
      }
    }
  });
  return result;
};

// ─── Decoration builder ───────────────────────────────────────────────────────

const NEW_SCENE_CLASS = "cesare-scene-new";

// A green node decoration over the just-rewritten scene(s). No overlay, no
// dimming — the highlight sits ON the real new text.
const buildDecos = (doc: PMNode, sceneNumber: number): DecorationSet => {
  const range = findSceneRange(doc, sceneNumber);
  if (!range) return DecorationSet.empty;
  return DecorationSet.create(doc, [
    Decoration.node(range.from, range.to, {
      class: NEW_SCENE_CLASS,
      "data-scene-number": String(sceneNumber),
      "data-testid": "cesare-pending-edit",
    }),
  ]);
};

// ─── Plugin factory ───────────────────────────────────────────────────────────

export interface CesarePendingEditCallbacks {
  /** Called when the pending edit is accepted by the user. */
  onAccept: () => void;
  /** Called when the pending edit is rejected by the user. */
  onReject: () => void;
}

export const buildCesarePendingEditPlugin = (
  callbacks: CesarePendingEditCallbacks,
): Plugin<CesarePendingState> => {
  const callbacksRef = { current: callbacks };
  callbacksRef.current = callbacks;

  return new Plugin<CesarePendingState>({
    key: cesarePendingEditKey,
    state: {
      init: () => ({ pendingEdit: null, decos: DecorationSet.empty }),
      apply(
        tr: Transaction,
        prev: CesarePendingState,
        _old: EditorState,
        newState: EditorState,
      ): CesarePendingState {
        const meta = tr.getMeta(cesarePendingEditKey) as
          | CesarePendingMeta
          | undefined;

        if (meta?.kind === "apply") {
          const edit: PendingEdit = {
            sceneNumber: meta.sceneNumber,
            originalSlice: meta.originalSlice,
            status: "done",
          };
          return {
            pendingEdit: edit,
            decos: buildDecos(newState.doc, meta.sceneNumber),
          };
        }

        if (meta?.kind === "clear") {
          return { pendingEdit: null, decos: DecorationSet.empty };
        }

        // Re-map the decoration through doc changes (e.g. the accept/reject
        // replacement, or the user typing elsewhere while it's pending).
        if (tr.docChanged && prev.pendingEdit) {
          return {
            pendingEdit: prev.pendingEdit,
            decos: buildDecos(newState.doc, prev.pendingEdit.sceneNumber),
          };
        }

        return prev;
      },
    },
    props: {
      decorations(state: EditorState) {
        return cesarePendingEditKey.getState(state)?.decos ?? null;
      },
      // Cmd/Ctrl+Z while a pending edit is active rejects it (restore original).
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const state = cesarePendingEditKey.getState(view.state);
        if (!state?.pendingEdit) return false;
        const isUndo =
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z" &&
          !event.shiftKey;
        if (!isUndo) return false;
        event.preventDefault();
        dispatchRejectPendingEdit(view);
        callbacksRef.current.onReject();
        return true;
      },
    },
  });
};

// ─── Public dispatchers ────────────────────────────────────────────────────────

// Apply the rewritten scene LIVE and in-place: parse the new Fountain, replace
// the target scene's nodes, capture the original nodes for a possible reject,
// and mark the new range green. Returns false if the scene isn't found or the
// new text fails to parse (no-op — the doc is left untouched).
export const startPendingEdit = (
  view: EditorView,
  sceneNumber: number,
  newFountain: string,
): boolean => {
  const range = findSceneRange(view.state.doc, sceneNumber);
  if (!range) return false;

  let replacementNodes: PMNode[] = [];
  try {
    // The normaliser already ran server-side; splitInlineCues here is a cheap
    // idempotent safety net before parsing.
    const parsed = fountainToDoc(splitInlineCues(newFountain));
    parsed.forEach((child) => replacementNodes.push(child));
  } catch {
    return false;
  }
  if (replacementNodes.length === 0) return false;

  // Capture the original scene nodes verbatim so a reject restores them.
  const originalSlice = view.state.doc.slice(range.from, range.to).content;

  const fragment = Fragment.fromArray(replacementNodes);
  const tr = view.state.tr;
  tr.replaceWith(range.from, range.to, fragment);
  tr.setMeta(cesarePendingEditKey, {
    kind: "apply",
    sceneNumber,
    originalSlice,
  } satisfies ApplyRewriteMeta);
  view.dispatch(tr);
  return true;
};

// Accept: keep the applied text, just clear the green highlight.
export const dispatchAcceptPendingEdit = (view: EditorView): void => {
  const state = cesarePendingEditKey.getState(view.state);
  if (!state?.pendingEdit) return;
  view.dispatch(
    view.state.tr.setMeta(cesarePendingEditKey, {
      kind: "clear",
    } satisfies ClearPendingMeta),
  );
};

// Reject: restore the original scene nodes captured at apply time.
export const dispatchRejectPendingEdit = (view: EditorView): void => {
  const state = cesarePendingEditKey.getState(view.state);
  if (!state?.pendingEdit) return;
  const range = findSceneRange(view.state.doc, state.pendingEdit.sceneNumber);
  const tr = view.state.tr;
  if (range) {
    tr.replaceWith(range.from, range.to, state.pendingEdit.originalSlice);
  }
  tr.setMeta(cesarePendingEditKey, {
    kind: "clear",
  } satisfies ClearPendingMeta);
  view.dispatch(tr);
};

export const hasPendingEdit = (view: EditorView): boolean => {
  const state = cesarePendingEditKey.getState(view.state);
  return state !== undefined && state.pendingEdit !== null;
};

export const getPendingEditStatus = (view: EditorView): "done" | null => {
  const state = cesarePendingEditKey.getState(view.state);
  return state?.pendingEdit?.status ?? null;
};
