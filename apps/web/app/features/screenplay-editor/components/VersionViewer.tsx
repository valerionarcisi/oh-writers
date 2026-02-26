import { useState, useEffect, Suspense, lazy } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Monaco } from "@monaco-editor/react";
import { registerFountainLanguage } from "../lib/fountain-language";
import { useRestoreVersion } from "../hooks/useVersions";
import type { VersionView } from "../screenplay-versions.schema";
import styles from "./VersionViewer.module.css";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.Editor })),
);

interface VersionViewerProps {
  projectId: string;
  version: VersionView;
}

export function VersionViewer({ projectId, version }: VersionViewerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const restoreVersion = useRestoreVersion();
  const navigate = useNavigate();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleRestore = () => {
    restoreVersion.mutate(
      { versionId: version.id },
      {
        onSuccess: () => {
          void navigate({
            to: "/projects/$id/screenplay",
            params: { id: projectId },
          });
        },
      },
    );
  };

  const handleMount = (
    _editor: Monaco["editor"]["IStandaloneCodeEditor"],
    monaco: Monaco,
  ) => {
    registerFountainLanguage(monaco);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link
          to="/projects/$id/screenplay/versions"
          params={{ id: projectId }}
          className={styles.backLink}
        >
          ← Versions
        </Link>
        <div className={styles.versionInfo}>
          <span className={styles.label}>{version.label ?? "Auto-save"}</span>
          <span className={styles.date}>
            {version.createdAt.toLocaleDateString()}{" "}
            {version.createdAt.toLocaleTimeString()}
          </span>
          <span className={styles.pages}>
            {version.pageCount} {version.pageCount === 1 ? "page" : "pages"}
          </span>
        </div>
        <div className={styles.actions}>
          <Link
            to="/projects/$id/screenplay/diff/$v1/$v2"
            params={{ id: projectId, v1: version.id, v2: "current" }}
            className={styles.diffLink}
          >
            Diff vs current
          </Link>
          <button
            className={styles.restoreBtn}
            type="button"
            onClick={handleRestore}
            disabled={restoreVersion.isPending}
          >
            {restoreVersion.isPending ? "Restoring…" : "Restore this version"}
          </button>
        </div>
      </div>

      <div className={styles.readOnlyBanner}>
        Read-only — this is a snapshot from the past
      </div>

      <div className={styles.editorArea}>
        {isMounted ? (
          <Suspense
            fallback={<div className={styles.loading}>Loading editor…</div>}
          >
            <MonacoEditor
              language="fountain-screenplay"
              theme="fountain-dark"
              value={version.content}
              onMount={handleMount}
              options={{
                readOnly: true,
                fontFamily:
                  "'Courier Prime', 'Courier New', Courier, monospace",
                fontSize: 12,
                lineHeight: 20,
                wordWrap: "on",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: "none",
                padding: { top: 48, bottom: 48 },
                lineNumbers: "off",
                glyphMargin: false,
                folding: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                guides: { indentation: false },
                scrollbar: {
                  vertical: "auto",
                  horizontal: "hidden",
                  verticalScrollbarSize: 6,
                },
                domReadOnly: true,
                cursorStyle: "line",
              }}
              className={styles.editor}
            />
          </Suspense>
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
