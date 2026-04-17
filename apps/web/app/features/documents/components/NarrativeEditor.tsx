import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DocumentTypes } from "@oh-writers/domain";
import type { DocumentType } from "@oh-writers/domain";
import type { DocumentViewWithPermission } from "../server/documents.server";
import { useAutoSave, useSaveDocument } from "../hooks/useDocument";
import {
  parseOutline,
  serializeOutline,
  LOGLINE_MAX,
} from "../documents.schema";
import { TextEditor } from "./TextEditor";
import { OutlineEditor } from "./OutlineEditor";
import { AIAssistantPanel } from "./AIAssistantPanel";
import { SaveStatus } from "./SaveStatus";
import styles from "./NarrativeEditor.module.css";

interface NarrativeEditorProps {
  document: DocumentViewWithPermission;
  type: DocumentType;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "Logline",
  [DocumentTypes.SYNOPSIS]: "Synopsis",
  [DocumentTypes.OUTLINE]: "Outline",
  [DocumentTypes.TREATMENT]: "Treatment",
};

const DOCUMENT_PLACEHOLDERS: Record<DocumentType, string> = {
  [DocumentTypes.LOGLINE]: "A [protagonist] must [goal] before [stakes]…",
  [DocumentTypes.SYNOPSIS]: "Begin your synopsis here…",
  [DocumentTypes.OUTLINE]: "",
  [DocumentTypes.TREATMENT]: "Begin your treatment here…",
};

type EditorMode = "free" | "assisted";

export function NarrativeEditor({ document, type }: NarrativeEditorProps) {
  const [content, setContent] = useState(document.content);
  const [mode, setMode] = useState<EditorMode>("free");
  const save = useSaveDocument();
  const { isDirty, isSaving, isError } = useAutoSave(
    save,
    document.id,
    content,
    document.content,
  );

  const handleManualSave = () => {
    if (isDirty) save.mutate({ documentId: document.id, content });
  };

  // E2E test hook: trigger a save with raw content bypassing the textarea
  // (textarea has HTML maxLength enforcement — tests use this to verify
  // server-side validation on bypassed input).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    w["__ohWritersSaveDocumentRaw"] = (raw: string) =>
      save.mutate({ documentId: document.id, content: raw });
    return () => {
      delete w["__ohWritersSaveDocumentRaw"];
    };
  }, [document.id, save]);

  const isOutline = type === DocumentTypes.OUTLINE;
  const isLogline = type === DocumentTypes.LOGLINE;
  const isReadOnly = !document.canEdit;

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link
            to="/projects/$id"
            params={{ id: document.projectId }}
            className={styles.backLink}
          >
            ← Back
          </Link>
          <h1 className={styles.docTitle}>{DOCUMENT_LABELS[type]}</h1>
          {isReadOnly && (
            <span
              className={styles.readOnlyBadge}
              data-testid="narrative-readonly-badge"
            >
              Read only
            </span>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {!isReadOnly && (
            <>
              <SaveStatus
                isDirty={isDirty}
                isSaving={isSaving}
                isError={isError}
              />
              <button
                className={styles.saveBtn}
                onClick={handleManualSave}
                disabled={!isDirty || isSaving}
                type="button"
              >
                Save
              </button>
            </>
          )}
          <div
            className={styles.modeToggle}
            role="group"
            aria-label="Editor mode"
          >
            <button
              className={`${styles.modeBtn} ${mode === "free" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("free")}
              type="button"
            >
              Free
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "assisted" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("assisted")}
              type="button"
              aria-label="Assisted mode"
            >
              Assisted
            </button>
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div
        className={`${styles.editorArea} ${mode === "assisted" ? styles.assisted : ""}`}
      >
        <div className={styles.editorMain}>
          {isOutline ? (
            <OutlineEditor
              value={parseOutline(content)}
              onChange={(outline) => setContent(serializeOutline(outline))}
              readOnly={isReadOnly}
            />
          ) : (
            <TextEditor
              value={content}
              onChange={setContent}
              placeholder={DOCUMENT_PLACEHOLDERS[type]}
              maxLength={isLogline ? LOGLINE_MAX : undefined}
              singleLine={false}
              readOnly={isReadOnly}
            />
          )}
        </div>
        {mode === "assisted" && <AIAssistantPanel type={type} />}
      </div>
    </div>
  );
}
