import { useState } from "react";
import { Button } from "@oh-writers/ui";
import type { DocumentVersion } from "@oh-writers/db/schema";
import type { DocumentType } from "@oh-writers/domain";
import {
  useDocumentDrafts,
  usePromoteDocumentDraft,
  useDiscardDocumentDraft,
} from "../hooks/useDocumentDrafts";
import { diffDocumentLines, type DocumentDiffLine } from "../lib/diff-document";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";
import styles from "./DraftBanner.module.css";

type Translate = (key: TranslationKey) => string;

interface DraftBannerProps {
  readonly documentId: string;
  readonly projectId: string;
  readonly docType: DocumentType;
  readonly currentContent: string;
  readonly canEdit: boolean;
}

/**
 * Sticky banner shown above the document editor when Cesare has proposed one
 * or more drafts (rows in document_versions with isDraft=true). The user can
 * compare each draft against the current content, promote it (becomes the new
 * active version), or discard it.
 */
export function DraftBanner({
  documentId,
  projectId,
  docType,
  currentContent,
  canEdit,
}: DraftBannerProps) {
  const { t } = useTranslation();
  const draftsQuery = useDocumentDrafts(documentId);
  const promote = usePromoteDocumentDraft(documentId, projectId, docType);
  const discard = useDiscardDocumentDraft(documentId, projectId, docType);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!draftsQuery.data || !draftsQuery.data.isOk) return null;
  const drafts = draftsQuery.data.value;
  if (drafts.length === 0) return null;

  return (
    <section
      className={styles.banner}
      role="region"
      aria-label={t("documents.draftBanner.ariaLabel")}
      data-testid="document-draft-banner"
    >
      <header className={styles.header}>
        <span className={styles.title}>
          {drafts.length === 1
            ? t("documents.draftBanner.readyOne")
            : t("documents.draftBanner.readyMany").replace(
                "{count}",
                String(drafts.length),
              )}
        </span>
        <span className={styles.hint}>{t("documents.draftBanner.hint")}</span>
      </header>
      <ul className={styles.list}>
        {drafts.map((d) => {
          const isExpanded = expandedId === d.id;
          return (
            <li key={d.id} className={styles.item} data-draft-id={d.id}>
              <div className={styles.row}>
                <span className={styles.label}>
                  {d.label ??
                    t("documents.draftBanner.draftFallback").replace(
                      "{number}",
                      String(d.number),
                    )}
                </span>
                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setExpandedId(isExpanded ? null : d.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`draft-diff-${d.id}`}
                    data-testid={`draft-compare-${d.id}`}
                  >
                    {isExpanded
                      ? t("documents.draftBanner.hideCompare")
                      : t("documents.draftBanner.compare")}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canEdit || promote.isPending}
                    onPress={() => promote.mutate(d.id)}
                    data-testid={`draft-promote-${d.id}`}
                  >
                    {t("documents.draftBanner.promote")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canEdit || discard.isPending}
                    onPress={() => discard.mutate(d.id)}
                    data-testid={`draft-discard-${d.id}`}
                  >
                    {t("documents.draftBanner.discard")}
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <DraftDiff
                  id={`draft-diff-${d.id}`}
                  currentContent={currentContent}
                  draft={d}
                  docType={docType}
                  t={t}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface DraftDiffProps {
  readonly id: string;
  readonly currentContent: string;
  readonly draft: DocumentVersion;
  readonly docType: DocumentType;
  readonly t: Translate;
}

function DraftDiff({ id, currentContent, draft, docType, t }: DraftDiffProps) {
  // Outline docs are JSON-encoded. A line-by-line diff over the raw JSON is
  // unreadable for a writer (parentheses, braces, ids, etc). Render a visual
  // act → sequence → scene preview instead, with new scenes highlighted.
  if (docType === "outline") {
    return (
      <OutlineVisualDiff
        id={id}
        current={parseOutlineSafe(currentContent)}
        next={parseOutlineSafe(draft.content)}
        t={t}
      />
    );
  }
  const left = prettify(currentContent);
  const right = prettify(draft.content);
  const lines = diffDocumentLines(left, right);
  return (
    <div id={id} className={styles.diff} data-testid="draft-diff">
      <pre
        className={styles.diffSide}
        aria-label={t("documents.draftBanner.currentVersion")}
      >
        {lines.map((line, i) => (
          <DiffLineRow key={`l-${i}`} line={line} side="left" />
        ))}
      </pre>
      <pre
        className={styles.diffSide}
        aria-label={t("documents.draftBanner.cesareDraft")}
      >
        {lines.map((line, i) => (
          <DiffLineRow key={`r-${i}`} line={line} side="right" />
        ))}
      </pre>
    </div>
  );
}

// ── Outline visual diff ────────────────────────────────────────────────────
// Each side renders the outline as a stack of <Act> cards. Acts/scenes only
// present on the right (draft) get `data-added` for the highlight CSS.

interface OutlineScene {
  readonly id?: string;
  readonly heading?: string;
  readonly description?: string;
}
interface OutlineSequence {
  readonly id?: string;
  readonly title?: string;
  readonly scenes?: ReadonlyArray<OutlineScene>;
}
interface OutlineAct {
  readonly id?: string;
  readonly title?: string;
  readonly sequences?: ReadonlyArray<OutlineSequence>;
}
interface OutlineDoc {
  readonly acts?: ReadonlyArray<OutlineAct>;
}

function parseOutlineSafe(raw: string): OutlineDoc {
  const trimmed = raw.trim();
  if (!trimmed) return { acts: [] };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "acts" in parsed &&
      Array.isArray((parsed as { acts: unknown }).acts)
    ) {
      return parsed as OutlineDoc;
    }
  } catch {
    /* fall through */
  }
  return { acts: [] };
}

function OutlineVisualDiff({
  id,
  current,
  next,
  t,
}: {
  readonly id: string;
  readonly current: OutlineDoc;
  readonly next: OutlineDoc;
  readonly t: Translate;
}) {
  const currentSceneKeys = new Set<string>(collectSceneKeys(current));
  return (
    <div id={id} className={styles.outline} data-testid="draft-diff-outline">
      <section
        className={styles.outlineSide}
        aria-label={t("documents.draftBanner.currentVersion")}
      >
        <span className={styles.outlineSideLabel}>
          {t("documents.draftBanner.outlineCurrent")}
        </span>
        <OutlineSide doc={current} sceneKeysFromOther={new Set()} t={t} />
      </section>
      <section
        className={styles.outlineSide}
        aria-label={t("documents.draftBanner.cesareDraft")}
      >
        <span className={styles.outlineSideLabel}>
          {t("documents.draftBanner.outlineDraft")}
        </span>
        <OutlineSide doc={next} sceneKeysFromOther={currentSceneKeys} t={t} />
      </section>
    </div>
  );
}

function OutlineSide({
  doc,
  sceneKeysFromOther,
  t,
}: {
  readonly doc: OutlineDoc;
  readonly sceneKeysFromOther: ReadonlySet<string>;
  readonly t: Translate;
}) {
  const acts = doc.acts ?? [];
  if (acts.length === 0) {
    return (
      <p className={styles.outlineEmpty}>
        {t("documents.draftBanner.noActs")}
      </p>
    );
  }
  return (
    <>
      {acts.map((act, ai) => {
        const actKey = `${act.id ?? `act-${ai}`}`;
        // Mark whole act as added when none of its scenes existed before.
        const actSceneKeys = collectSceneKeysInAct(act);
        const allNew =
          actSceneKeys.length > 0 &&
          actSceneKeys.every((k) => !sceneKeysFromOther.has(k));
        return (
          <article
            key={actKey}
            className={styles.act}
            data-added={
              sceneKeysFromOther.size > 0 && allNew ? "true" : undefined
            }
          >
            <h4 className={styles.actTitle}>
              {act.title ??
                t("documents.draftBanner.actFallback").replace(
                  "{number}",
                  String(ai + 1),
                )}
            </h4>
            {(act.sequences ?? []).map((seq, si) => (
              <div
                key={`${actKey}-seq-${seq.id ?? si}`}
                className={styles.sequence}
              >
                {seq.title && (
                  <div className={styles.sequenceTitle}>{seq.title}</div>
                )}
                {(seq.scenes ?? []).map((sc, sci) => {
                  const sceneKey = sceneKey3(act, seq, sc, ai, si, sci);
                  const added =
                    sceneKeysFromOther.size > 0 &&
                    !sceneKeysFromOther.has(sceneKey);
                  return (
                    <div
                      key={sceneKey}
                      className={styles.scene}
                      data-added={added ? "true" : undefined}
                    >
                      {sc.heading && (
                        <div className={styles.sceneHeading}>{sc.heading}</div>
                      )}
                      {sc.description && (
                        <div className={styles.sceneDesc}>{sc.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </article>
        );
      })}
    </>
  );
}

const sceneKey3 = (
  act: OutlineAct,
  seq: OutlineSequence,
  sc: OutlineScene,
  ai: number,
  si: number,
  sci: number,
): string =>
  `${act.id ?? `a${ai}`}::${seq.id ?? `s${si}`}::${sc.id ?? `c${sci}`}::${sc.heading ?? ""}`;

function collectSceneKeys(doc: OutlineDoc): string[] {
  const out: string[] = [];
  (doc.acts ?? []).forEach((act, ai) => {
    (act.sequences ?? []).forEach((seq, si) => {
      (seq.scenes ?? []).forEach((sc, sci) => {
        out.push(sceneKey3(act, seq, sc, ai, si, sci));
      });
    });
  });
  return out;
}

function collectSceneKeysInAct(act: OutlineAct): string[] {
  const out: string[] = [];
  (act.sequences ?? []).forEach((seq, si) => {
    (seq.scenes ?? []).forEach((sc, sci) => {
      out.push(sceneKey3(act, seq, sc, 0, si, sci));
    });
  });
  return out;
}

function DiffLineRow({
  line,
  side,
}: {
  line: DocumentDiffLine;
  side: "left" | "right";
}) {
  if (line.type === "equal") {
    return (
      <span className={styles.lineEqual}>
        {line.text || " "}
        {"\n"}
      </span>
    );
  }
  if (line.type === "delete") {
    if (side === "left") {
      return (
        <span className={styles.lineDelete}>
          − {line.text || " "}
          {"\n"}
        </span>
      );
    }
    return <span className={styles.linePlaceholder}>{" \n"}</span>;
  }
  // insert
  if (side === "right") {
    return (
      <span className={styles.lineInsert}>
        + {line.text || " "}
        {"\n"}
      </span>
    );
  }
  return <span className={styles.linePlaceholder}>{" \n"}</span>;
}

const prettify = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
};
