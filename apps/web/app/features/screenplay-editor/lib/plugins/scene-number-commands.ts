/**
 * Scene-number mutations + the event bus that lets the heading NodeView
 * (vanilla DOM) hand a conflict decision to a React modal (spec 05i block 3).
 *
 * The NodeView dispatches `scene-number-conflict` as a window CustomEvent
 * carrying a `resolve` callback. A React host listens, renders the modal,
 * and invokes `resolve(choice)` which runs the matching PM transaction.
 *
 * Keeping the commands here (not inline in the NodeView) lets block 4's
 * popover + block 5's toolbar reuse them.
 */
import type { EditorView } from "prosemirror-view";
import type { Node as PmNode } from "prosemirror-model";
import { resequenceAll } from "@oh-writers/domain";

export interface HeadingInfo {
  readonly pos: number;
  readonly number: string;
  readonly locked: boolean;
}

export const listHeadings = (doc: PmNode): HeadingInfo[] => {
  const out: HeadingInfo[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    out.push({
      pos,
      number: (node.attrs["scene_number"] as string) ?? "",
      locked: Boolean(node.attrs["scene_number_locked"]),
    });
    return false;
  });
  return out;
};

/**
 * True if any heading other than `selfPos` already carries `candidate`.
 * Empty strings never collide (they mean "unnumbered").
 */
export const hasConflict = (
  doc: PmNode,
  selfPos: number,
  candidate: string,
): boolean => {
  if (candidate.length === 0) return false;
  return listHeadings(doc).some(
    (h) => h.pos !== selfPos && h.number === candidate,
  );
};

/**
 * Apply `proposed` to the heading at `pos` with `scene_number_locked=true`,
 * regardless of whether it duplicates another scene's number.
 * Used for the "Keep locked" conflict choice.
 */
export const setSceneNumberLocked = (
  view: EditorView,
  pos: number,
  proposed: string,
): boolean => {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "heading") return false;
  const tr = view.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    scene_number: proposed,
    scene_number_locked: true,
  });
  view.dispatch(tr);
  return true;
};

/**
 * Apply `proposed` at `pos` (locked), then re-run `resequenceAll` over every
 * heading from that index forward. Existing locked flags on later scenes are
 * preserved; only unlocked ones get reassigned.
 *
 * Returns `{ ok: false, reason }` if resequenceAll can't solve the constraints —
 * the caller (modal host) shows the reason as a toast and leaves the doc
 * untouched.
 */
export const resequenceFromHere = (
  view: EditorView,
  pos: number,
  proposed: string,
): { ok: true } | { ok: false; reason: string } => {
  const headings = listHeadings(view.state.doc);
  const selfIdx = headings.findIndex((h) => h.pos === pos);
  if (selfIdx < 0) return { ok: false, reason: "scene not found" };

  const input = headings.map((h, i) => {
    if (i === selfIdx) return { number: proposed, locked: true };
    return { number: h.number, locked: h.locked };
  });

  const result = resequenceAll(input);
  if (!result.ok) return { ok: false, reason: result.error.reason };

  // setNodeMarkup preserves node size → positions stay valid across a single tr.
  const tr = view.state.tr;
  headings.forEach((h, i) => {
    const node = tr.doc.nodeAt(h.pos);
    if (!node || node.type.name !== "heading") return;
    const nextNumber = result.numbers[i] ?? h.number;
    const nextLocked =
      i === selfIdx ? true : Boolean(node.attrs["scene_number_locked"]);
    if (
      nextNumber === h.number &&
      nextLocked === Boolean(node.attrs["scene_number_locked"])
    )
      return;
    tr.setNodeMarkup(h.pos, null, {
      ...node.attrs,
      scene_number: nextNumber,
      scene_number_locked: nextLocked,
    });
  });
  view.dispatch(tr);
  return { ok: true };
};

/**
 * "Resequence from here" — treats every scene before `pos` as a locked
 * anchor, then reruns `resequenceAll`. Scenes before stay untouched; the
 * scene at `pos` and everything after get renumbered within the remaining
 * gap, honouring any locked flags they carry.
 */
export const resequenceFrom = (
  view: EditorView,
  pos: number,
): { ok: true } | { ok: false; reason: string } => {
  const headings = listHeadings(view.state.doc);
  const selfIdx = headings.findIndex((h) => h.pos === pos);
  if (selfIdx < 0) return { ok: false, reason: "scene not found" };

  const input = headings.map((h, i) => ({
    number: h.number,
    locked: i < selfIdx ? true : h.locked,
  }));
  const result = resequenceAll(input);
  if (!result.ok) return { ok: false, reason: result.error.reason };

  const tr = view.state.tr;
  headings.forEach((h, i) => {
    const node = tr.doc.nodeAt(h.pos);
    if (!node || node.type.name !== "heading") return;
    const nextNumber = result.numbers[i] ?? h.number;
    if (nextNumber === h.number) return;
    tr.setNodeMarkup(h.pos, null, {
      ...node.attrs,
      scene_number: nextNumber,
    });
  });
  view.dispatch(tr);
  return { ok: true };
};

/**
 * Clear the locked flag on a single heading. The number itself is kept —
 * the next run of `resequenceAll` is what actually reassigns it.
 */
export const unlockSceneNumber = (view: EditorView, pos: number): boolean => {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "heading") return false;
  if (!node.attrs["scene_number_locked"]) return false;
  const tr = view.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    scene_number_locked: false,
  });
  view.dispatch(tr);
  return true;
};

/**
 * Rerun `resequenceAll` over the entire doc, respecting every heading's
 * current locked flag. Used by the toolbar "Resequence scenes" action.
 */
export const resequenceWholeDoc = (
  view: EditorView,
): { ok: true } | { ok: false; reason: string } => {
  const headings = listHeadings(view.state.doc);
  const result = resequenceAll(
    headings.map((h) => ({ number: h.number, locked: h.locked })),
  );
  if (!result.ok) return { ok: false, reason: result.error.reason };
  const tr = view.state.tr;
  headings.forEach((h, i) => {
    const node = tr.doc.nodeAt(h.pos);
    if (!node || node.type.name !== "heading") return;
    const nextNumber = result.numbers[i] ?? h.number;
    if (nextNumber === h.number) return;
    tr.setNodeMarkup(h.pos, null, {
      ...node.attrs,
      scene_number: nextNumber,
    });
  });
  view.dispatch(tr);
  return { ok: true };
};

// ─── Event bus ────────────────────────────────────────────────────────────

export type ConflictChoice = "lock" | "resequence-from" | "cancel";

export interface SceneNumberConflictDetail {
  readonly current: string;
  readonly proposed: string;
  readonly resolve: (choice: ConflictChoice) => void;
}

export const SCENE_NUMBER_CONFLICT_EVENT = "scene-number-conflict" as const;

export const dispatchConflict = (detail: SceneNumberConflictDetail): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SCENE_NUMBER_CONFLICT_EVENT, { detail }),
  );
};

export const SCENE_NUMBER_TOAST_EVENT = "scene-number-toast" as const;

export interface SceneNumberToastDetail {
  readonly message: string;
}

export const dispatchSceneNumberToast = (message: string): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SCENE_NUMBER_TOAST_EVENT, { detail: { message } }),
  );
};
