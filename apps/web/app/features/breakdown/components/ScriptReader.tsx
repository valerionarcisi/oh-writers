import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import { ReadOnlyScreenplayView } from "~/features/screenplay-editor";
import {
  useAddBreakdownElement,
  useSetOccurrenceStatus,
} from "../hooks/useBreakdown";
import {
  buildHighlightPlugin,
  highlightPluginKey,
  type HighlightMeta,
} from "../lib/pm-plugins/highlight-decoration";
import {
  buildGhostPlugin,
  ghostPluginKey,
  type GhostMeta,
} from "../lib/pm-plugins/ghost-decoration";
import { buildSelectionToolbarPlugin } from "../lib/pm-plugins/selection-toolbar-plugin";
import {
  scrollToScene as scrollFn,
  findSceneIndexAtPos,
} from "../lib/pm-plugins/scene-anchors";
import {
  mapSuggestionsToElements,
  type CesareSuggestionLite,
} from "../lib/pm-plugins/map-suggestions";
import type { ElementForMatch } from "../lib/pm-plugins/find-occurrences";
import type { BreakdownSceneSummary } from "../server/breakdown.server";
import { GhostPopover } from "./GhostPopover";
import styles from "./ScriptReader.module.css";

const SCROLL_DEBOUNCE_MS = 150;

export interface ScriptReaderHandle {
  scrollToScene: (index: number) => void;
}

interface Props {
  projectId: string;
  versionId: string;
  versionContent: string;
  scenes: BreakdownSceneSummary[];
  elements: ElementForMatch[];
  suggestions: CesareSuggestionLite[];
  canEdit: boolean;
  activeSceneId: string | null;
  onActiveSceneChange?: (sceneId: string | null) => void;
}

interface PopoverState {
  occurrenceId: string;
  x: number;
  y: number;
}

export const ScriptReader = forwardRef<ScriptReaderHandle, Props>(
  function ScriptReader(props, ref) {
    const {
      projectId,
      versionId,
      versionContent,
      scenes,
      elements,
      suggestions,
      canEdit,
      activeSceneId,
      onActiveSceneChange,
    } = props;

    const viewRef = useRef<EditorView | null>(null);
    const add = useAddBreakdownElement(projectId, versionId);
    const setStatus = useSetOccurrenceStatus(activeSceneId ?? "", versionId);

    // Refs avoid stale closures inside the once-built PM plugins.
    const scenesRef = useRef(scenes);
    const addRef = useRef(add);
    const projectIdRef = useRef(projectId);
    const versionIdRef = useRef(versionId);
    const onActiveSceneChangeRef = useRef(onActiveSceneChange);
    useEffect(() => {
      scenesRef.current = scenes;
      addRef.current = add;
      projectIdRef.current = projectId;
      versionIdRef.current = versionId;
      onActiveSceneChangeRef.current = onActiveSceneChange;
    });

    const [popover, setPopover] = useState<PopoverState | null>(null);
    const lastActiveSceneRef = useRef<string | null>(activeSceneId);

    const ghostElements = useMemo(
      () => mapSuggestionsToElements(suggestions),
      [suggestions],
    );

    // Plugins are built once per mount; data updates flow via meta transactions
    // and via refs read inside callbacks.
    const pluginsExtra = useMemo<Plugin[]>(() => {
      const list: Plugin[] = [
        buildHighlightPlugin({
          initial: elements,
          className: styles.highlight ?? "highlight",
        }),
        buildGhostPlugin({
          initial: ghostElements,
          className: styles.ghost ?? "ghost",
        }),
      ];
      if (canEdit) {
        list.push(
          buildSelectionToolbarPlugin({
            onTag: (category, text, fromPos) => {
              const view = viewRef.current;
              if (!view) return;
              const sceneIndex = findSceneIndexAtPos(view.state.doc, fromPos);
              const scene =
                sceneIndex !== null
                  ? scenesRef.current[sceneIndex - 1]
                  : undefined;
              if (!scene) return;
              addRef.current.mutate({
                projectId: projectIdRef.current,
                category,
                name: text,
                occurrence: {
                  sceneId: scene.id,
                  screenplayVersionId: versionIdRef.current,
                  quantity: 1,
                },
              });
            },
          }),
        );
      }
      return list;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionContent, canEdit]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const meta: HighlightMeta = { setElements: elements };
      view.dispatch(view.state.tr.setMeta(highlightPluginKey, meta));
    }, [elements]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const meta: GhostMeta = { setElements: ghostElements };
      view.dispatch(view.state.tr.setMeta(ghostPluginKey, meta));
    }, [ghostElements]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToScene: (index: number) => {
          const view = viewRef.current;
          if (!view) return;
          scrollFn(view, index);
          const scene = scenesRef.current[index - 1];
          lastActiveSceneRef.current = scene?.id ?? null;
          onActiveSceneChangeRef.current?.(scene?.id ?? null);
        },
      }),
      [],
    );

    // Ghost click → popover; scroll → debounced onActiveSceneChange.
    // Collect every ancestor with overflow-y: auto/scroll. The actual scroll
    // may happen on any of them depending on layout (Breakdown nests a
    // scrollable .script around a scrollable .reader); we listen on all.
    const collectScrollAncestors = (start: HTMLElement): HTMLElement[] => {
      const out: HTMLElement[] = [];
      let el: HTMLElement | null = start;
      while (el && el !== document.body) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === "auto" || oy === "scroll") out.push(el);
        el = el.parentElement;
      }
      return out;
    };

    const handleViewReady = (view: EditorView) => {
      viewRef.current = view;
      const initial = view.dom.parentElement;
      if (!initial) return;
      const scrollAncestors = collectScrollAncestors(initial);
      // posAtCoords must be probed against the editor mount's viewport rect:
      // that's the element whose content PM knows how to resolve. Using a
      // higher ancestor risks landing in page chrome (header, sidebars).
      const probeContainer = initial;

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const ghost = target?.closest<HTMLElement>("[data-ghost='true']");
        const occurrenceId = ghost?.getAttribute("data-occurrence-id");
        if (!ghost || !occurrenceId) return;
        const rect = ghost.getBoundingClientRect();
        setPopover({
          occurrenceId,
          x: rect.left,
          y: rect.bottom + 4,
        });
      };
      initial.addEventListener("click", handleClick);

      let scrollTimer: ReturnType<typeof setTimeout> | null = null;
      const handleScroll = () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const v = viewRef.current;
          if (!v) return;
          const rect = probeContainer.getBoundingClientRect();
          const probe = v.posAtCoords({
            left: rect.left + 16,
            top: rect.top + 8,
          });
          if (!probe) return;
          const sceneIndex = findSceneIndexAtPos(v.state.doc, probe.pos);
          if (sceneIndex === null) return;
          // PM may report more heading nodes than the DB scenes table holds
          // (e.g. when fountain parsing yields a trailing heading that wasn't
          // persisted). Clamp to the last known scene to keep the TOC in sync.
          const scenesNow = scenesRef.current;
          const clamped = Math.min(sceneIndex, scenesNow.length);
          const scene = scenesNow[clamped - 1];
          const sid = scene?.id ?? null;
          if (sid !== lastActiveSceneRef.current) {
            lastActiveSceneRef.current = sid;
            onActiveSceneChangeRef.current?.(sid);
          }
        }, SCROLL_DEBOUNCE_MS);
      };
      for (const a of scrollAncestors) {
        a.addEventListener("scroll", handleScroll, { passive: true });
      }
      // Defensive: also listen on the window capture phase so we catch
      // scrolls on ancestors we didn't classify (e.g. <main> with an
      // implicit scroll from flex/grid layout, or nested shells).
      window.addEventListener("scroll", handleScroll, {
        passive: true,
        capture: true,
      });

      // Stash cleanup on the view for the unmount effect to find.
      (view as unknown as { _ohwCleanup?: () => void })._ohwCleanup = () => {
        initial.removeEventListener("click", handleClick);
        for (const a of scrollAncestors) {
          a.removeEventListener("scroll", handleScroll);
        }
        window.removeEventListener("scroll", handleScroll, { capture: true });
        if (scrollTimer) clearTimeout(scrollTimer);
      };
    };

    useEffect(() => {
      return () => {
        const v = viewRef.current as
          | (EditorView & { _ohwCleanup?: () => void })
          | null;
        v?._ohwCleanup?.();
      };
    }, []);

    if (!versionContent) {
      return (
        <p className={styles.empty} data-testid="script-reader-empty">
          Nessuna versione disponibile per questa sceneggiatura.
        </p>
      );
    }

    const acceptGhost = () => {
      if (!popover) return;
      setStatus.mutate({
        occurrenceIds: [popover.occurrenceId],
        status: "accepted",
      });
      setPopover(null);
    };

    const ignoreGhost = () => {
      if (!popover) return;
      setStatus.mutate({
        occurrenceIds: [popover.occurrenceId],
        status: "ignored",
      });
      setPopover(null);
    };

    return (
      <>
        <ReadOnlyScreenplayView
          content={versionContent}
          pluginsExtra={pluginsExtra}
          onReady={handleViewReady}
          className={styles.reader}
        />
        {popover &&
          createPortal(
            <GhostPopover
              x={popover.x}
              y={popover.y}
              onAccept={acceptGhost}
              onIgnore={ignoreGhost}
              onDismiss={() => setPopover(null)}
            />,
            document.body,
          )}
      </>
    );
  },
);
