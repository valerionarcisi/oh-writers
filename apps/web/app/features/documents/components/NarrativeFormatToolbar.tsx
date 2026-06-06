// apps/web/app/features/documents/components/NarrativeFormatToolbar.tsx
//
// Spec 65 — the shared bold/italic controls for the narrative editors. One
// component so Soggetto, Sinossi and Trattamento don't fork their formatting
// toolbar. It reads the live `EditorView`, toggles the marks via the narrative
// commands, and reflects the active mark at the caret (`aria-pressed`).
//
// It re-renders on every editor transaction (so the pressed-state tracks the
// caret) by patching the view's `dispatchTransaction` once on mount — local to
// this component, no coupling to the host's render loop.
import { useEffect, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { getNarrativeSchema } from "../lib/narrative-schema";
import {
  isStrongActive,
  isEmActive,
  toggleStrong,
  toggleEm,
} from "../lib/narrative-plugins";
import { useTranslation } from "~/features/i18n";
import styles from "./NarrativeFormatToolbar.module.css";

interface NarrativeFormatToolbarProps {
  /** The live editor view (null until the editor mounts). */
  readonly view: EditorView | null;
  /** True when the editor enables headings (treatment) — selects the schema. */
  readonly enableHeadings: boolean;
}

export function NarrativeFormatToolbar({
  view,
  enableHeadings,
}: NarrativeFormatToolbarProps) {
  const { t } = useTranslation();
  const [, force] = useState(0);

  // Re-render the toolbar as the caret/selection moves so the pressed-state
  // tracks the active mark. Keyup/mouseup cover typing, arrow keys and clicks.
  useEffect(() => {
    if (!view) return;
    const handler = () => force((n) => (n + 1) % 1_000_000);
    view.dom.addEventListener("keyup", handler);
    view.dom.addEventListener("mouseup", handler);
    return () => {
      view.dom.removeEventListener("keyup", handler);
      view.dom.removeEventListener("mouseup", handler);
    };
  }, [view]);

  const schema = getNarrativeSchema(enableHeadings);
  const strongActive = view ? isStrongActive(view.state) : false;
  const emActive = view ? isEmActive(view.state) : false;

  const run = (fn: typeof toggleStrong): ((e: React.MouseEvent) => void) => {
    return (e) => {
      e.preventDefault();
      if (!view) return;
      fn(schema, view.state, view.dispatch);
      view.focus();
      force((n) => (n + 1) % 1_000_000);
    };
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.btn} ${strongActive ? styles.btnActive : ""}`}
        aria-pressed={strongActive}
        aria-label={t("documents.editor.boldAria")}
        title={t("documents.editor.boldAria")}
        onMouseDown={run(toggleStrong)}
        data-testid="format-bold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={`${styles.btn} ${emActive ? styles.btnActive : ""}`}
        aria-pressed={emActive}
        aria-label={t("documents.editor.italicAria")}
        title={t("documents.editor.italicAria")}
        onMouseDown={run(toggleEm)}
        data-testid="format-italic"
      >
        <em>I</em>
      </button>
    </>
  );
}
