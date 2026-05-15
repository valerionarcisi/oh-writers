import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * Temporary visual highlight applied to the range substituted by a Cesare
 * "Applica" action. The decoration auto-clears after ~1.6s so the writer
 * notices the change without long-lived noise. The timer is owned by the
 * plugin's view (not the React caller) so a unmounted editor never leaves
 * a dangling setTimeout reference.
 */
export const CESARE_APPLIED_HIGHLIGHT_CLASS = "cesareAppliedHighlight";

export const HIGHLIGHT_TTL_MS = 1600;

interface SetMeta {
  readonly from: number;
  readonly to: number;
}

interface ClearMeta {
  readonly clear: true;
}

type HighlightMeta = SetMeta | ClearMeta;

export const cesareAppliedHighlightKey = new PluginKey<DecorationSet>(
  "cesareAppliedHighlight",
);

/** Returns the meta object the panel must `setMeta` on the highlight plugin
 *  key to trigger a flash on the [from, to) range. */
export const highlightAppliedRange = (from: number, to: number): SetMeta => ({
  from,
  to,
});

export const buildCesareAppliedHighlightPlugin = (): Plugin<DecorationSet> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return new Plugin<DecorationSet>({
    key: cesareAppliedHighlightKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, old) {
        const meta = tr.getMeta(cesareAppliedHighlightKey) as
          | HighlightMeta
          | undefined;
        if (meta && "clear" in meta) {
          return DecorationSet.empty;
        }
        if (meta && "from" in meta && "to" in meta) {
          if (meta.to <= meta.from) return DecorationSet.empty;
          const deco = Decoration.inline(meta.from, meta.to, {
            class: CESARE_APPLIED_HIGHLIGHT_CLASS,
          });
          return DecorationSet.create(tr.doc, [deco]);
        }
        if (!tr.docChanged) return old;
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return cesareAppliedHighlightKey.getState(state) ?? null;
      },
    },
    view(view) {
      return {
        update(currentView, prevState) {
          const prev = cesareAppliedHighlightKey.getState(prevState);
          const next = cesareAppliedHighlightKey.getState(currentView.state);
          if (prev === next) return;
          const isActive = next && next !== DecorationSet.empty;
          clearTimer();
          if (isActive) {
            timer = setTimeout(() => {
              timer = null;
              const v = currentView;
              if (v.isDestroyed) return;
              v.dispatch(
                v.state.tr.setMeta(cesareAppliedHighlightKey, {
                  clear: true,
                } satisfies ClearMeta),
              );
            }, HIGHLIGHT_TTL_MS);
          }
        },
        destroy() {
          clearTimer();
        },
      };
    },
  });
};
