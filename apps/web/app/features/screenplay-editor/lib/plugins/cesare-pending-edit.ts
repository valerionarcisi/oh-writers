import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { Fragment } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { fountainToDoc } from "../fountain-to-doc";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PendingEdit {
  /** 1-based scene number targeted by the rewrite */
  readonly sceneNumber: number;
  /** ProseMirror position: start of target scene node */
  readonly sceneFrom: number;
  /** ProseMirror position: end of target scene node */
  readonly sceneTo: number;
  /** Characters received so far from the typewriter animation */
  readonly streamedText: string;
  /** Whether the animation is still running */
  readonly status: "streaming" | "done";
}

// ─── Plugin state ─────────────────────────────────────────────────────────────

interface CesarePendingState {
  pendingEdit: PendingEdit | null;
  decos: DecorationSet;
}

// ─── Meta shapes ──────────────────────────────────────────────────────────────

interface StartPendingEditMeta {
  readonly kind: "start";
  readonly sceneNumber: number;
  readonly sceneFrom: number;
  readonly sceneTo: number;
}

interface AppendStreamChunkMeta {
  readonly kind: "appendChunk";
  readonly chunk: string;
}

interface FinishStreamingMeta {
  readonly kind: "finishStreaming";
}

interface AcceptPendingEditMeta {
  readonly kind: "accept";
}

interface RejectPendingEditMeta {
  readonly kind: "reject";
}

type CesarePendingMeta =
  | StartPendingEditMeta
  | AppendStreamChunkMeta
  | FinishStreamingMeta
  | AcceptPendingEditMeta
  | RejectPendingEditMeta;

export const cesarePendingEditKey = new PluginKey<CesarePendingState>(
  "cesare-pending-edit",
);

// ─── Public meta constructors ─────────────────────────────────────────────────

export const startPendingEdit = (
  sceneNumber: number,
  sceneFrom: number,
  sceneTo: number,
): StartPendingEditMeta => ({
  kind: "start",
  sceneNumber,
  sceneFrom,
  sceneTo,
});

export const appendStreamChunk = (chunk: string): AppendStreamChunkMeta => ({
  kind: "appendChunk",
  chunk,
});

export const finishStreaming = (): FinishStreamingMeta => ({
  kind: "finishStreaming",
});

export const acceptPendingEdit = (): AcceptPendingEditMeta => ({
  kind: "accept",
});

export const rejectPendingEdit = (): RejectPendingEditMeta => ({
  kind: "reject",
});

// ─── Decoration builder ───────────────────────────────────────────────────────

const PENDING_CLASS = "cesare-pending-edit";
const PENDING_BLOCK_CLASS = "cesare-pending-edit-block";

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

const buildDecos = (doc: PMNode, edit: PendingEdit | null): DecorationSet => {
  if (!edit) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  // Block decoration over the entire scene range — the green overlay.
  // We use a node decoration on the scene node itself so it covers the
  // entire original text without modifying the document.
  decorations.push(
    Decoration.node(edit.sceneFrom, edit.sceneTo, {
      class: PENDING_BLOCK_CLASS,
      "data-scene-number": String(edit.sceneNumber),
      "data-pending-status": edit.status,
    }),
  );

  // Widget at the top of the scene — renders the streamed text as a preview.
  // The original content is hidden by CSS (the block decoration) and this
  // widget shows the incoming text as an overlay.
  decorations.push(
    Decoration.widget(
      edit.sceneFrom,
      () => {
        const el = document.createElement("div");
        el.className = `${PENDING_CLASS}${edit.status === "done" ? " is-done" : ""}`;
        el.setAttribute("data-testid", "cesare-pending-edit");
        el.setAttribute("contenteditable", "false");
        el.setAttribute("data-pending-status", edit.status);
        // Use a <pre> to preserve fountain line breaks
        const pre = document.createElement("pre");
        pre.className = "cesare-pending-edit-text";
        pre.textContent = edit.streamedText;
        el.appendChild(pre);
        return el;
      },
      {
        side: -1,
        key: "cesare-pending-widget",
      },
    ),
  );

  return DecorationSet.create(doc, decorations);
};

// ─── Accept helper ────────────────────────────────────────────────────────────

// Apply the streamed text as a real doc change. We parse the streamed fountain
// text back into PM nodes and replace the original scene range.
const applyAccept = (view: EditorView, edit: PendingEdit): void => {
  const { sceneFrom, sceneTo, streamedText } = edit;

  // Parse the streamed fountain text into a PM doc and extract the scenes.
  // If parsing fails (e.g. empty text) we fall back to a no-op.
  let replacementNodes: PMNode[] = [];
  try {
    const parsed = fountainToDoc(streamedText);
    parsed.forEach((child) => {
      replacementNodes.push(child);
    });
  } catch {
    // Parsing failed — silently reject rather than corrupt the doc.
    view.dispatch(
      view.state.tr.setMeta(cesarePendingEditKey, rejectPendingEdit()),
    );
    return;
  }

  if (replacementNodes.length === 0) {
    view.dispatch(
      view.state.tr.setMeta(cesarePendingEditKey, rejectPendingEdit()),
    );
    return;
  }

  const fragment = Fragment.fromArray(replacementNodes);
  const tr = view.state.tr;
  // Set meta to clear the pending decoration, then apply the replacement.
  tr.setMeta(cesarePendingEditKey, rejectPendingEdit());
  tr.replaceWith(sceneFrom, sceneTo, fragment);
  view.dispatch(tr);
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
  let cachedView: EditorView | null = null;
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

        if (meta?.kind === "start") {
          const edit: PendingEdit = {
            sceneNumber: meta.sceneNumber,
            sceneFrom: meta.sceneFrom,
            sceneTo: meta.sceneTo,
            streamedText: "",
            status: "streaming",
          };
          return { pendingEdit: edit, decos: buildDecos(newState.doc, edit) };
        }

        if (meta?.kind === "appendChunk" && prev.pendingEdit) {
          const edit: PendingEdit = {
            ...prev.pendingEdit,
            streamedText: prev.pendingEdit.streamedText + meta.chunk,
          };
          return { pendingEdit: edit, decos: buildDecos(newState.doc, edit) };
        }

        if (meta?.kind === "finishStreaming" && prev.pendingEdit) {
          const edit: PendingEdit = {
            ...prev.pendingEdit,
            status: "done",
          };
          return { pendingEdit: edit, decos: buildDecos(newState.doc, edit) };
        }

        if (meta?.kind === "accept") {
          return { pendingEdit: null, decos: DecorationSet.empty };
        }

        if (meta?.kind === "reject") {
          return { pendingEdit: null, decos: DecorationSet.empty };
        }

        // Map decorations through doc changes (e.g. if user types elsewhere)
        if (tr.docChanged && prev.pendingEdit) {
          const mapped = prev.decos.map(tr.mapping, tr.doc);
          // Remap the scene positions
          const newFrom = tr.mapping.map(prev.pendingEdit.sceneFrom);
          const newTo = tr.mapping.map(prev.pendingEdit.sceneTo);
          const edit: PendingEdit = {
            ...prev.pendingEdit,
            sceneFrom: newFrom,
            sceneTo: newTo,
          };
          return { pendingEdit: edit, decos: mapped };
        }

        return prev;
      },
    },
    props: {
      decorations(state: EditorState) {
        return cesarePendingEditKey.getState(state)?.decos ?? null;
      },
      // Handle Cmd/Ctrl+Z while a pending edit is active: reject the edit.
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const state = cesarePendingEditKey.getState(view.state);
        if (!state?.pendingEdit) return false;
        const isUndo =
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z" &&
          !event.shiftKey;
        if (!isUndo) return false;
        event.preventDefault();
        view.dispatch(
          view.state.tr.setMeta(cesarePendingEditKey, rejectPendingEdit()),
        );
        callbacksRef.current.onReject();
        return true;
      },
    },
    view(view: EditorView) {
      cachedView = view;
      return {
        update(currentView: EditorView) {
          cachedView = currentView;
        },
        destroy() {
          cachedView = null;
        },
      };
    },
  });
};

// ─── Public accept/reject dispatchers ────────────────────────────────────────

export const dispatchAcceptPendingEdit = (view: EditorView): void => {
  const state = cesarePendingEditKey.getState(view.state);
  if (!state?.pendingEdit) return;
  applyAccept(view, state.pendingEdit);
};

export const dispatchRejectPendingEdit = (view: EditorView): void => {
  const state = cesarePendingEditKey.getState(view.state);
  if (!state?.pendingEdit) return;
  view.dispatch(
    view.state.tr.setMeta(cesarePendingEditKey, rejectPendingEdit()),
  );
};

export const hasPendingEdit = (view: EditorView): boolean => {
  const state = cesarePendingEditKey.getState(view.state);
  return state !== undefined && state.pendingEdit !== null;
};

export const getPendingEditStatus = (
  view: EditorView,
): "streaming" | "done" | null => {
  const state = cesarePendingEditKey.getState(view.state);
  return state?.pendingEdit?.status ?? null;
};
