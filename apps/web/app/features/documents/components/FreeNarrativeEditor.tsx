import { useEffect, useMemo, useRef } from "react";
import { SOGGETTO_INITIAL_TEMPLATE } from "@oh-writers/domain";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { toCartelle } from "../lib/cartelle-counter";
import styles from "./FreeNarrativeEditor.module.css";

export interface FreeNarrativeEditorProps {
  readonly content: string;
  readonly onChange: (next: string) => void;
  readonly canEdit: boolean;
  readonly initialTemplate?: string;
  readonly testId?: string;
  /** When true, renders only the editor + counter with no card wrapper. */
  readonly embedded?: boolean;
}

const stripHtmlTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

export function FreeNarrativeEditor({
  content,
  onChange,
  canEdit,
  initialTemplate = SOGGETTO_INITIAL_TEMPLATE,
  testId,
  embedded = false,
}: FreeNarrativeEditorProps) {
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (content === "") {
      onChange(initialTemplate);
    }
  }, [content, initialTemplate, onChange]);

  const { cartelle, chars } = useMemo(() => {
    const plain = stripHtmlTags(content);
    const c = plain.length;
    return { cartelle: toCartelle(c), chars: c };
  }, [content]);

  const inner = (
    <>
      <NarrativeProseMirrorView
        value={content}
        onChange={onChange}
        enableHeadings={true}
        readOnly={!canEdit}
      />
      <div className={styles.counter} aria-live="polite">
        {cartelle} {cartelle === 1 ? "cartella" : "cartelle"} ·{" "}
        {chars.toLocaleString("it-IT")} caratteri
      </div>
    </>
  );

  if (embedded) {
    return <div data-testid={testId}>{inner}</div>;
  }

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.page}>{inner}</div>
    </div>
  );
}
