import {
  forwardRef,
  useCallback,
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
import { useTranslation } from "~/features/i18n";
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
import {
  buildSearchPlugin,
  searchPluginKey,
  dispatchSearch,
  scrollToMatch,
} from "../lib/pm-plugins/search-plugin";
import { buildSceneTestidPlugin } from "../lib/pm-plugins/scene-testid-plugin";
import { GhostPopover } from "./GhostPopover";
import { SearchBar } from "./SearchBar";
import styles from "./ScriptReader.module.css";

const SCROLL_DEBOUNCE_MS = 80;

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

    const { t } = useTranslation();
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
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchIndex, setSearchIndex] = useState(0);
    const [searchTotal, setSearchTotal] = useState(0);
    const lastActiveSceneRef = useRef<string | null>(activeSceneId);

    const ghostElements = useMemo(
      () => mapSuggestionsToElements(suggestions),
      [suggestions],
    );

    const navigateSearch = useCallback((query: string, idx: number) => {
      const view = viewRef.current;
      if (!view) return;
      dispatchSearch(view, query, idx);
      const state = searchPluginKey.getState(view.state);
      const total = state?.matches.length ?? 0;
      setSearchTotal(total);
      const match = state?.matches[Math.min(idx, total - 1)];
      if (match) scrollToMatch(view, match);
    }, []);

    const handleSearchChange = useCallback(
      (q: string) => {
        setSearchQuery(q);
        setSearchIndex(0);
        navigateSearch(q, 0);
      },
      [navigateSearch],
    );

    const handleSearchNext = useCallback(() => {
      const view = viewRef.current;
      if (!view) return;
      const state = searchPluginKey.getState(view.state);
      const total = state?.matches.length ?? 0;
      if (total === 0) return;
      const next = (searchIndex + 1) % total;
      setSearchIndex(next);
      navigateSearch(searchQuery, next);
    }, [searchIndex, searchQuery, navigateSearch]);

    const handleSearchPrev = useCallback(() => {
      const view = viewRef.current;
      if (!view) return;
      const state = searchPluginKey.getState(view.state);
      const total = state?.matches.length ?? 0;
      if (total === 0) return;
      const prev = (searchIndex - 1 + total) % total;
      setSearchIndex(prev);
      navigateSearch(searchQuery, prev);
    }, [searchIndex, searchQuery, navigateSearch]);

    const handleSearchClose = useCallback(() => {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchIndex(0);
      const view = viewRef.current;
      if (view) dispatchSearch(view, "", 0);
    }, []);

    // Cmd+F / Ctrl+F → open search bar.
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          setSearchOpen(true);
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    // Plugins are built once per mount; data updates flow via meta transactions
    // and via refs read inside callbacks.
    const pluginsExtra = useMemo<Plugin[]>(() => {
      const list: Plugin[] = [
        buildSceneTestidPlugin(),
        buildSearchPlugin(),
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
        if (ghost && occurrenceId) {
          const rect = ghost.getBoundingClientRect();
          setPopover({
            occurrenceId,
            x: rect.left,
            y: rect.bottom + 4,
          });
          return;
        }
        // Any click inside the reader: resolve the scene at the click position
        // and update activeScene immediately (don't wait for scroll debounce).
        const v = viewRef.current;
        if (!v) return;
        const pos = v.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!pos) return;
        const sceneIndex = findSceneIndexAtPos(v.state.doc, pos.pos);
        if (sceneIndex === null) return;
        const scenesNow = scenesRef.current;
        const clamped = Math.min(sceneIndex, scenesNow.length);
        const scene = scenesNow[clamped - 1];
        const sid = scene?.id ?? null;
        if (sid !== lastActiveSceneRef.current) {
          lastActiveSceneRef.current = sid;
          onActiveSceneChangeRef.current?.(sid);
        }
      };
      initial.addEventListener("click", handleClick);

      let scrollTimer: ReturnType<typeof setTimeout> | null = null;
      const handleScroll = () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const v = viewRef.current;
          if (!v) return;
          const rect = probeContainer.getBoundingClientRect();
          // When an outer container (e.g. breakdown-script) scrolls and the
          // reader top goes above the viewport, rect.top becomes negative and
          // posAtCoords returns null. Clamp to the visible viewport top so
          // the probe always lands inside the rendered editor content.
          const probeTop = Math.max(rect.top, 0);
          const probe = v.posAtCoords({
            left: rect.left + 16,
            top: probeTop + 8,
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
          {t("breakdown.reader.empty")}
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
        {searchOpen && (
          <SearchBar
            query={searchQuery}
            currentIndex={searchIndex}
            total={searchTotal}
            onChange={handleSearchChange}
            onNext={handleSearchNext}
            onPrev={handleSearchPrev}
            onClose={handleSearchClose}
          />
        )}
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
