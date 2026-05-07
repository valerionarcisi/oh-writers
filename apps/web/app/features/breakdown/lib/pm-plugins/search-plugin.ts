import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export interface SearchMeta {
  query: string;
  currentIndex: number;
}

export interface SearchPluginState {
  query: string;
  currentIndex: number;
  matches: { from: number; to: number }[];
  decorations: DecorationSet;
}

export const searchPluginKey = new PluginKey<SearchPluginState>("search");

function findMatches(
  doc: EditorState["doc"],
  query: string,
): { from: number; to: number }[] {
  if (query.length === 0) return [];
  const lower = query.toLowerCase();
  const results: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let idx = text.indexOf(lower);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + lower.length });
      idx = text.indexOf(lower, idx + 1);
    }
  });
  return results;
}

function buildDecorations(
  doc: EditorState["doc"],
  matches: { from: number; to: number }[],
  currentIndex: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? "pm-search-current" : "pm-search-match",
    }),
  );
  return DecorationSet.create(doc, decos);
}

export const buildSearchPlugin = (): Plugin<SearchPluginState> =>
  new Plugin<SearchPluginState>({
    key: searchPluginKey,
    state: {
      init: () => ({
        query: "",
        currentIndex: 0,
        matches: [],
        decorations: DecorationSet.empty,
      }),
      apply(tr, prev) {
        const meta: SearchMeta | undefined = tr.getMeta(searchPluginKey);
        if (meta === undefined) {
          return {
            ...prev,
            decorations: prev.decorations.map(tr.mapping, tr.doc),
          };
        }
        const matches = findMatches(tr.doc, meta.query);
        const currentIndex = Math.min(
          meta.currentIndex,
          Math.max(0, matches.length - 1),
        );
        return {
          query: meta.query,
          currentIndex,
          matches,
          decorations: buildDecorations(tr.doc, matches, currentIndex),
        };
      },
    },
    props: {
      decorations(state) {
        return (
          searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty
        );
      },
    },
  });

export function dispatchSearch(
  view: EditorView,
  query: string,
  currentIndex: number,
) {
  const tr: Transaction = view.state.tr.setMeta(searchPluginKey, {
    query,
    currentIndex,
  } satisfies SearchMeta);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

export function scrollToMatch(
  view: EditorView,
  match: { from: number; to: number },
) {
  const coords = view.coordsAtPos(match.from);
  const scrollEl =
    view.dom.closest<HTMLElement>("[data-testid='breakdown-script']") ??
    view.dom.parentElement;
  if (!scrollEl) return;
  const rect = scrollEl.getBoundingClientRect();
  const targetTop =
    coords.top - rect.top + scrollEl.scrollTop - scrollEl.clientHeight / 3;
  scrollEl.scrollTo({ top: targetTop, behavior: "smooth" });
}
