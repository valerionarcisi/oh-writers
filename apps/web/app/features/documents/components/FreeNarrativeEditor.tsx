import { useMemo } from "react";
import type { DocumentType } from "@oh-writers/domain";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { toCartelle } from "../lib/cartelle-counter";
import { useTranslation } from "~/features/i18n";
import styles from "./FreeNarrativeEditor.module.css";

export interface FreeNarrativeEditorProps {
  readonly content: string;
  readonly onChange: (next: string) => void;
  readonly canEdit: boolean;
  readonly testId?: string;
  /** When true, renders only the editor + counter with no card wrapper. */
  readonly embedded?: boolean;
  /** When true, suppresses the internal cartelle/chars counter. Caller is
   *  expected to render a DocStats at page level instead. */
  readonly hideCounter?: boolean;
  /** Document type for the Cesare inline live-diff highlight (Spec 47d). */
  readonly diffDocumentType?: DocumentType;
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
  testId,
  embedded = false,
  hideCounter = false,
  diffDocumentType,
}: FreeNarrativeEditorProps) {
  const { t } = useTranslation();
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
        placeholder={t("documents.freeNarrative.placeholder")}
        diffDocumentType={diffDocumentType}
      />
      {!hideCounter && (
        <div className={styles.counter} aria-live="polite">
          {cartelle}{" "}
          {cartelle === 1
            ? t("documents.freeNarrative.cartellaOne")
            : t("documents.freeNarrative.cartellaOther")}{" "}
          · {chars.toLocaleString("it-IT")}{" "}
          {t("documents.freeNarrative.characters")}
        </div>
      )}
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
