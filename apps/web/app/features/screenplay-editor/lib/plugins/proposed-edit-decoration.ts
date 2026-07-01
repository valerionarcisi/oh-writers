import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import styles from "./proposed-edit-decoration.module.css";
import {
  cesareAppliedHighlightKey,
  highlightAppliedRange,
} from "./cesare-applied-highlight";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ProposedEditKind = "edit" | "rename_character" | "rename_location";

export interface ProposedEdit {
  readonly id: string;
  readonly kind: ProposedEditKind;
  /** Verbatim string to find in the doc. For rename proposals this is the
   *  whole entity name; matching is whole-word case-insensitive. For
   *  `edit` proposals it must match verbatim. */
  readonly find: string;
  readonly replace: string;
  readonly reason: string;
  /** 1-based ordinal of the scene the edit targets. When set, an `edit`
   *  proposal is decorated ONLY inside that scene, so a `find` collision in
   *  another scene can't hijack the highlight (#86). Null for rename proposals,
   *  which are global by design. */
  readonly sceneNumber: number | null;
}

export interface ProposalCallbacks {
  /** Invoked when the user clicks ✓. Receives the proposal id so the parent
   *  can dispatch the DB-side `removeScreenplayProposal` mutation. */
  onAccept: (proposalId: string) => void;
  /** Invoked when the user clicks ✕. */
  onReject: (proposalId: string) => void;
}

// ─── Plugin state ─────────────────────────────────────────────────────────────

interface ProposedEditState {
  proposals: ProposedEdit[];
  decos: DecorationSet;
}

interface SetProposalsMeta {
  readonly kind: "setProposals";
  readonly proposals: ProposedEdit[];
}

interface RemoveProposalMeta {
  readonly kind: "removeProposal";
  readonly proposalId: string;
}

type ProposalMeta = SetProposalsMeta | RemoveProposalMeta;

export const proposedEditPluginKey = new PluginKey<ProposedEditState>(
  "screenplay-proposed-edit",
);

// ─── Public meta actions ──────────────────────────────────────────────────────

export const setProposedEdits = (
  proposals: ProposedEdit[],
): SetProposalsMeta => ({
  kind: "setProposals",
  proposals,
});

export const removeProposedEditMeta = (
  proposalId: string,
): RemoveProposalMeta => ({ kind: "removeProposal", proposalId });

// ─── Leaf-text walk algorithm (server-equivalent) ─────────────────────────────
//
// Walks the doc collecting text leaf segments with their exact PM positions.
// Returns ALL non-overlapping matches of `find`. For rename proposals we use
// whole-word case-insensitive matching; for plain edits we use exact match
// to avoid surprising the writer.

interface TextSegment {
  readonly text: string;
  readonly from: number;
}

// Collect text leaves with their PM positions. When `range` is given, only
// leaves fully inside it are kept — used to confine an `edit` proposal to its
// target scene so a `find` collision elsewhere can't steal the highlight (#86).
const collectTextSegments = (
  doc: PMNode,
  range?: { from: number; to: number },
): TextSegment[] => {
  const segments: TextSegment[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      if (!range || (pos >= range.from && pos + node.text.length <= range.to)) {
        segments.push({ text: node.text, from: pos });
      }
    }
    return true;
  });
  return segments;
};

interface MatchRange {
  readonly from: number;
  readonly to: number;
  /** The exact matched text (its case), so a rename can mirror it: an ALL-CAPS
   *  character cue 'JOHN' → 'JACK', a Capitalized 'John' → 'Jack'. */
  readonly text: string;
}

// Mirror the case pattern of `sample` onto `replacement`, so a rename keeps the
// screenplay's casing convention (cues/headings are uppercase). ALL-CAPS sample
// ⇒ upper; a leading-capital sample ⇒ capitalised; otherwise verbatim.
export const matchCase = (sample: string, replacement: string): string => {
  if (sample.length === 0) return replacement;
  const isAllCaps = sample === sample.toUpperCase() && /[A-Z]/.test(sample);
  if (isAllCaps) return replacement.toUpperCase();
  const isCapitalized =
    sample[0] === sample[0]!.toUpperCase() &&
    sample.slice(1) === sample.slice(1).toLowerCase();
  if (isCapitalized) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

// Map a flat-index range over the concatenated text back into PM positions.
// Returns null when the flat range straddles a non-text gap (which shouldn't
// happen for verbatim matches but defensively guards against bad input).
const mapFlatRangeToPm = (
  segments: TextSegment[],
  flatStart: number,
  flatEnd: number,
): { from: number; to: number } | null => {
  let posStart = -1;
  let posEnd = -1;
  let cursor = 0;
  for (const seg of segments) {
    const segEnd = cursor + seg.text.length;
    if (posStart < 0 && cursor <= flatStart && flatStart < segEnd) {
      posStart = seg.from + (flatStart - cursor);
    }
    if (posEnd < 0 && cursor < flatEnd && flatEnd <= segEnd) {
      posEnd = seg.from + (flatEnd - cursor);
    }
    if (posStart >= 0 && posEnd >= 0) break;
    cursor = segEnd;
  }
  if (posStart < 0 || posEnd < 0) return null;
  return { from: posStart, to: posEnd };
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Exported for unit tests: pure (doc, proposal) → match ranges. Screenplay
// proposals are now only renames (a global whole-word entity swap); the
// per-scene find/replace edit path was retired with propose_screenplay_edit
// (spec 80 — single-scene edits go through rewrite_scene instead).
export const findAllMatches = (
  doc: PMNode,
  proposal: ProposedEdit,
): MatchRange[] => {
  // rename — whole-word, case-insensitive, all occurrences (global by design)
  const segments = collectTextSegments(doc);
  const fullText = segments.map((s) => s.text).join("");
  const re = new RegExp(`\\b${escapeRegex(proposal.find)}\\b`, "gi");
  const results: MatchRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    const mapped = mapFlatRangeToPm(segments, m.index, m.index + m[0].length);
    if (mapped) results.push({ ...mapped, text: m[0] });
    // Defensive: avoid pathological infinite loops on zero-width regex.
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return results;
};

// ─── Decorations ──────────────────────────────────────────────────────────────

const buildWidget = (
  proposal: ProposedEdit,
  callbacks: ProposalCallbacks,
  view: EditorView,
): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.className = styles["bubble"] ?? "";
  wrap.setAttribute("data-proposal-id", proposal.id);
  wrap.setAttribute("data-proposal-kind", proposal.kind);
  wrap.contentEditable = "false";

  const replaceLine = document.createElement("span");
  replaceLine.className = styles["replace"] ?? "";
  replaceLine.textContent = `→ ${proposal.replace}`;
  wrap.appendChild(replaceLine);

  if (proposal.reason.length > 0) {
    const reason = document.createElement("span");
    reason.className = styles["reason"] ?? "";
    reason.textContent = proposal.reason;
    wrap.appendChild(reason);
  }

  const actions = document.createElement("span");
  actions.className = styles["actions"] ?? "";

  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = styles["accept"] ?? "";
  accept.setAttribute("aria-label", "Accetta proposta");
  accept.setAttribute("data-testid", "proposal-accept");
  accept.textContent = "✓";
  accept.addEventListener("mousedown", (e) => e.preventDefault());
  accept.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyProposalToView(view, proposal);
    callbacks.onAccept(proposal.id);
  });
  actions.appendChild(accept);

  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = styles["reject"] ?? "";
  reject.setAttribute("aria-label", "Rifiuta proposta");
  reject.setAttribute("data-testid", "proposal-reject");
  reject.textContent = "✕";
  reject.addEventListener("mousedown", (e) => e.preventDefault());
  reject.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onReject(proposal.id);
    // Optimistically remove from local state so the bubble disappears
    // immediately; the parent will refetch on success.
    view.dispatch(
      view.state.tr.setMeta(
        proposedEditPluginKey,
        removeProposedEditMeta(proposal.id),
      ),
    );
  });
  actions.appendChild(reject);

  wrap.appendChild(actions);
  return wrap;
};

// Apply a rename proposal to the doc as a single transaction: replace every
// whole-word occurrence at once so undo restores the screenplay in one step.
const applyProposalToView = (
  view: EditorView,
  proposal: ProposedEdit,
): void => {
  const matches = findAllMatches(view.state.doc, proposal);
  if (matches.length === 0) return;

  // A rename mirrors each occurrence's case (cues/headings stay uppercase).
  const replacementFor = (m: MatchRange): string =>
    matchCase(m.text, proposal.replace);
  // Sort descending so earlier replacements don't shift later positions.
  const sorted = [...matches].sort((a, b) => b.from - a.from);
  let tr = view.state.tr;
  for (const m of sorted) {
    tr = tr.replaceWith(
      m.from,
      m.to,
      view.state.schema.text(replacementFor(m)),
    );
  }
  // Flash on the first (top-most after sort, last in original order)
  // replacement position so the writer sees something animate.
  const first = matches[0];
  if (first) {
    const mappedFrom = tr.mapping.map(first.from);
    const mappedTo = mappedFrom + replacementFor(first).length;
    tr.setMeta(
      cesareAppliedHighlightKey,
      highlightAppliedRange(mappedFrom, mappedTo),
    );
  }
  view.dispatch(tr);
};

// The position just AFTER the textblock that contains `pos`, so a widget anchors
// at the end of the whole line/paragraph (after "JOHN (35)" or after a dialogue
// line) instead of splitting it mid-text ("JOHN" │card│ "(35)"). Walks UP to the
// nearest block-level node (its end), not the deepest inline node. Falls back to
// `pos` if no block is resolved.
const blockEndAfter = (doc: PMNode, pos: number): number => {
  try {
    const $pos = doc.resolve(Math.min(pos, doc.content.size));
    // Climb to the nearest block-level node and anchor JUST AFTER it (a
    // block-boundary position), so the widget renders on its own line below the
    // cue/dialogue instead of inline in the middle of it. `after(d)` is the
    // position after the block node at depth d.
    for (let d = $pos.depth; d >= 1; d--) {
      if ($pos.node(d).isTextblock) {
        return $pos.after(d);
      }
    }
    return $pos.end($pos.depth);
  } catch {
    return pos;
  }
};

const buildDecorationSet = (
  doc: PMNode,
  proposals: ProposedEdit[],
  callbacks: ProposalCallbacks,
  view: EditorView | null,
): DecorationSet => {
  const decorations: Decoration[] = [];
  for (const proposal of proposals) {
    const matches = findAllMatches(doc, proposal);
    if (matches.length === 0) continue;
    // Inline highlight on every match (visible difference from regular text)
    for (const m of matches) {
      decorations.push(
        Decoration.inline(m.from, m.to, {
          class: styles["matchHighlight"] ?? "",
          "data-proposal-id": proposal.id,
        }),
      );
    }
    // ONE widget bubble per proposal, anchored at the END of the line holding
    // the first match — so it never breaks a character cue ("JOHN (35)") or any
    // other line in two. The inline highlights above already mark every match,
    // so the writer sees all occurrences while deciding once.
    const first = matches[0]!;
    if (view) {
      decorations.push(
        Decoration.widget(
          blockEndAfter(doc, first.to),
          () => buildWidget(proposal, callbacks, view),
          {
            side: 1,
            key: `proposal-widget-${proposal.id}`,
          },
        ),
      );
    }
  }
  return DecorationSet.create(doc, decorations);
};

// ─── Plugin factory ───────────────────────────────────────────────────────────

export const buildProposedEditPlugin = (
  callbacks: ProposalCallbacks,
): Plugin<ProposedEditState> => {
  let cachedView: EditorView | null = null;
  return new Plugin<ProposedEditState>({
    key: proposedEditPluginKey,
    state: {
      init: () => ({ proposals: [], decos: DecorationSet.empty }),
      apply(
        tr: Transaction,
        prev: ProposedEditState,
        _old: EditorState,
        newState: EditorState,
      ): ProposedEditState {
        const meta = tr.getMeta(proposedEditPluginKey) as
          | ProposalMeta
          | undefined;
        let nextProposals = prev.proposals;
        if (meta?.kind === "setProposals") {
          nextProposals = meta.proposals;
        } else if (meta?.kind === "removeProposal") {
          nextProposals = prev.proposals.filter(
            (p) => p.id !== meta.proposalId,
          );
        } else if (!tr.docChanged) {
          // Selection-only change: keep cached decoration set.
          return prev;
        }
        const decos = buildDecorationSet(
          newState.doc,
          nextProposals,
          callbacks,
          cachedView,
        );
        return { proposals: nextProposals, decos };
      },
    },
    props: {
      decorations(state: EditorState) {
        return proposedEditPluginKey.getState(state)?.decos ?? null;
      },
    },
    view(view: EditorView) {
      cachedView = view;
      // Re-build decorations now that we have a view to attach widget
      // callbacks to. The init step ran without a view reference.
      const state = proposedEditPluginKey.getState(view.state);
      if (state && state.proposals.length > 0) {
        view.dispatch(
          view.state.tr.setMeta(
            proposedEditPluginKey,
            setProposedEdits(state.proposals),
          ),
        );
      }
      return {
        destroy() {
          cachedView = null;
        },
      };
    },
  });
};
