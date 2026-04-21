import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import { ReadOnlyScreenplayView } from "../../screenplay-editor/components/ReadOnlyScreenplayView";
import { useAddBreakdownElement } from "../hooks/useBreakdown";
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
import styles from "./ScriptReader.module.css";

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
  onActiveSceneChange?: (sceneId: string | null) => void;
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
      onActiveSceneChange,
    } = props;

    const viewRef = useRef<EditorView | null>(null);
    const add = useAddBreakdownElement(projectId, versionId);

    const ghostElements = useMemo(
      () => mapSuggestionsToElements(suggestions),
      [suggestions],
    );

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
                sceneIndex !== null ? scenes[sceneIndex - 1] : undefined;
              if (!scene) return;
              add.mutate({
                projectId,
                category,
                name: text,
                occurrence: {
                  sceneId: scene.id,
                  screenplayVersionId: versionId,
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
          if (onActiveSceneChange) {
            const scene = scenes[index - 1];
            onActiveSceneChange(scene?.id ?? null);
          }
        },
      }),
      [scenes, onActiveSceneChange],
    );

    if (!versionContent) {
      return (
        <p className={styles.empty} data-testid="script-reader-empty">
          Nessuna versione disponibile per questa sceneggiatura.
        </p>
      );
    }

    return (
      <ReadOnlyScreenplayView
        content={versionContent}
        pluginsExtra={pluginsExtra}
        onReady={(view) => {
          viewRef.current = view;
        }}
        className={styles.reader}
      />
    );
  },
);
