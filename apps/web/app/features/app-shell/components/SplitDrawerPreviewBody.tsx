// apps/web/app/features/app-shell/components/SplitDrawerPreviewBody.tsx
//
// Read-only body of the Cesare "Mostra modifiche" SplitDrawer preview, used only
// from inside a chat session (ADR-0001). Claude-Desktop-style artifact: it renders
// the **final modified document text, clean and readable**, with only the ADDED
// words highlighted in soft green — NOT a word-level diff soup (removals struck
// through made it unreadable). A short summary header (Cesare's "Cosa cambia"
// reply) sits on top, visible only here.
//
// The edit is already applied live to the document; this preview only lets the
// writer look at the modified page beside the conversation. One section per touched
// document (`liveDiffs`).
import { DocumentTypes } from "@oh-writers/domain";
import type { SplitDrawerPreviewDiff } from "../split-drawer-context";
import { useTranslation } from "~/features/i18n";
import {
  OutlineEditor,
  OutlineContentSchema,
  type OutlineContent,
} from "~/features/documents";
import styles from "./SplitDrawerPreviewBody.module.css";

const noop = () => {};

// `parseOutline` (documents.schema.ts) collapses malformed JSON into an empty
// outline — the right default for a fresh document, but indistinguishable
// from "the diff's word-level reassembly broke mid-JSON-token" here. This
// preview needs to tell the two apart so a Cesare edit is never silently
// shown as "no scenes." Returns null on any parse/validation failure instead
// of swallowing it.
const tryParseOutlineStrict = (raw: string): OutlineContent | null => {
  try {
    const result = OutlineContentSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

interface SplitDrawerPreviewBodyProps {
  readonly title: string;
  readonly liveDiffs: ReadonlyArray<SplitDrawerPreviewDiff>;
  /** Cesare's human "Cosa cambia" prose, shown at the top of the preview only. */
  readonly summary?: string;
}

export function SplitDrawerPreviewBody({
  title,
  liveDiffs,
  summary,
}: SplitDrawerPreviewBodyProps) {
  const { t } = useTranslation();
  // Keep the additions visible: a "final text" segment is `eq` (kept) or `add`
  // (newly written). Drop `del` — the removed words are not part of the result.
  const diffs = liveDiffs
    .map((d) => ({
      ...d,
      finalSegments: d.segments.filter((s) => s.op === "eq" || s.op === "add"),
    }))
    .filter((d) => d.finalSegments.length > 0);

  if (diffs.length === 0) {
    return (
      <div className={styles.empty} data-testid="split-preview-empty">
        {t("shell.targetPreview.empty")}
      </div>
    );
  }

  const summaryLines = (summary ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <div className={styles.root} data-testid="split-preview-body">
      {summaryLines.length > 0 && (
        <ul className={styles.summary} data-testid="split-preview-summary">
          {summaryLines.map((line, i) => (
            <li key={i} className={styles.summaryItem}>
              {line}
            </li>
          ))}
        </ul>
      )}
      {diffs.map((diff, idx) => (
        <section
          key={`${diff.documentType}-${idx}`}
          className={styles.section}
          data-document-type={diff.documentType}
        >
          <p className={styles.sectionLabel}>{diff.label || title}</p>
          {/* The FINAL document text, clean — no highlight. The change is already
              applied; this is the result as it now reads (the bullet summary on
              top says what changed). Outline is structured JSON, not prose — it
              renders as the real scene cards instead of raw text (no highlight
              there either, same as every other doc type here). */}
          {(() => {
            const finalText = diff.finalSegments
              .map((seg) => seg.text)
              .join("");
            const outline =
              diff.documentType === DocumentTypes.OUTLINE
                ? tryParseOutlineStrict(finalText)
                : null;
            // outline === null covers both "not an outline doc" and "the
            // diff's word-level reassembly broke mid-JSON-token" — either
            // way, showing the raw text beats silently rendering zero scenes.
            if (!outline) {
              return <p className={styles.body}>{finalText}</p>;
            }
            return (
              <div className={styles.outlinePreview}>
                <OutlineEditor value={outline} onChange={noop} readOnly />
              </div>
            );
          })()}
        </section>
      ))}
    </div>
  );
}
