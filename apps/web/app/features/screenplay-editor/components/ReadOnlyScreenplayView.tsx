import { useEffect, useRef } from "react";
import { EditorState, type Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { migratePmDoc } from "@oh-writers/domain";
import { schema } from "../lib/schema";
import { fountainToDoc } from "../lib/fountain-to-doc";
import { createHeadingNodeView } from "../lib/plugins/heading-nodeview";
import { injectProseMirrorStyles } from "../lib/plugins/prosemirror-styles";

interface Props {
  /** Fountain string used when initialDoc is null. */
  content: string;
  /** Optional pre-parsed PM doc JSON. Wins over `content` when provided. */
  initialDoc?: Record<string, unknown> | null;
  /** Extra plugins injected by the consumer (decorations, view plugins). */
  pluginsExtra?: Plugin[];
  /** Called once after mount. Use it to keep a ref to the view. */
  onReady?: (view: EditorView) => void;
  /** Optional className for the mount node. */
  className?: string;
}

export function ReadOnlyScreenplayView({
  content,
  initialDoc,
  pluginsExtra,
  onReady,
  className,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    injectProseMirrorStyles();

    const doc = initialDoc
      ? schema.nodeFromJSON(migratePmDoc(initialDoc))
      : fountainToDoc(content);

    const state = EditorState.create({
      doc,
      plugins: pluginsExtra ?? [],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => false,
      nodeViews: {
        heading: (node, v, getPos) => createHeadingNodeView(node, v, getPos),
      },
    });

    viewRef.current = view;
    onReady?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally re-mount when content changes; simpler than diffing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, initialDoc]);

  return (
    <div
      ref={mountRef}
      className={className}
      data-testid="readonly-screenplay-view"
      data-pm-screenplay="true"
    />
  );
}
