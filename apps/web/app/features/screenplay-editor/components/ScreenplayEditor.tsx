import { useState, useEffect, useRef, useCallback } from "react";
import type { EditorView } from "prosemirror-view";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave } from "../hooks/useScreenplay";
import {
  useVersion,
  useVersions,
  useCreateManualVersion,
  useRestoreVersion,
} from "../hooks/useVersions";
import { estimatePageCount, currentPageFromLine } from "../lib/page-counter";
import type { ElementType } from "../lib/fountain-element-detector";
import { setElement } from "../lib/schema-commands";
import { ProseMirrorView } from "./ProseMirrorView";
import { ScreenplayToolbar } from "./ScreenplayToolbar";
import { VersionViewingBanner } from "./VersionViewingBanner";
import { useVersionsDrawer } from "~/features/versions";
import styles from "./ScreenplayEditor.module.css";

interface ScreenplayEditorProps {
  screenplay: ScreenplayView;
}

type ViewingState =
  | { kind: "live" }
  | {
      kind: "viewing";
      versionId: string;
      label: string;
      createdAt: string;
      savedContent: string;
      savedPmDoc: Record<string, unknown> | null;
    };

export function ScreenplayEditor({ screenplay }: ScreenplayEditorProps) {
  const [content, setContent] = useState(screenplay.content);
  const [pmDoc, setPmDoc] = useState<Record<string, unknown> | null>(
    (screenplay.pmDoc as Record<string, unknown> | null) ?? null,
  );
  const [isFocusMode, setFocusMode] = useState(false);
  const {
    state: drawerState,
    open: openDrawer,
    close: closeDrawer,
  } = useVersionsDrawer();
  const isVersionsPanelOpen =
    drawerState.isOpen &&
    drawerState.scope?.kind === "screenplay" &&
    drawerState.scope.screenplayId === screenplay.id;
  const [viewing, setViewing] = useState<ViewingState>({ kind: "live" });
  const [pendingView, setPendingView] = useState<{ id: string } | null>(null);
  const [awaitingRestoreConfirm, setAwaitingRestoreConfirm] = useState(false);
  const [cursorLine] = useState(1);
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const viewRef = useRef<EditorView | null>(null);

  const isViewing = viewing.kind === "viewing";

  const { data: versionsResult } = useVersions(screenplay.id);
  const versionsCount = versionsResult?.isOk ? versionsResult.value.length : 0;
  const latestVersion =
    versionsResult?.isOk && versionsResult.value.length > 0
      ? versionsResult.value[0]
      : null;
  const nextVersionLabel =
    versionsCount > 0 ? `Versione ${versionsCount + 1}` : null;

  const createVersion = useCreateManualVersion();
  const handleCreateVersionThenImport = useCallback(
    (fountain: string) => {
      if (!nextVersionLabel) {
        setContent(fountain);
        return;
      }
      createVersion.mutate(
        { screenplayId: screenplay.id, label: nextVersionLabel },
        { onSettled: () => setContent(fountain) },
      );
    },
    [createVersion, screenplay.id, nextVersionLabel],
  );

  const handleSetElement = useCallback((el: ElementType) => {
    const view = viewRef.current;
    if (!view) return;
    setElement(el)(view.state, view.dispatch, view);
    view.focus();
  }, []);
  const totalPages = estimatePageCount(content);
  const currentPage = currentPageFromLine(cursorLine);
  const { isDirty, isSaving, isError, isOffline, lastSavedAt, flush } =
    useAutoSave(screenplay.id, content, screenplay.content, pmDoc, isViewing);

  const restore = useRestoreVersion();

  // Prefetch the version content when the user requests it
  const versionQuery = useVersion(pendingView?.id ?? "", pendingView !== null);

  // When the pending version resolves, swap content and enter view mode
  useEffect(() => {
    if (!pendingView) return;
    const result = versionQuery.data;
    if (!result) return;
    if (!result.isOk) {
      setPendingView(null);
      return;
    }
    const snapshot = result.value;
    // Remember live draft only on first entry into view mode
    const savedContent =
      viewing.kind === "viewing" ? viewing.savedContent : content;
    const savedPmDoc = viewing.kind === "viewing" ? viewing.savedPmDoc : pmDoc;
    setViewing({
      kind: "viewing",
      versionId: snapshot.id,
      label: snapshot.label ?? "Auto-save",
      createdAt:
        typeof snapshot.createdAt === "string"
          ? snapshot.createdAt
          : new Date(snapshot.createdAt).toISOString(),
      savedContent,
      savedPmDoc,
    });
    setContent(snapshot.content);
    setPmDoc(null);
    setPendingView(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingView, versionQuery.data]);

  const requestView = useCallback((versionId: string) => {
    // The live draft (including unsaved changes) is captured into
    // `viewing.savedContent` when entering view mode, and restored by
    // `handleReturn`. No dialog needed — nothing is lost.
    setPendingView({ id: versionId });
  }, []);

  const handleReturn = useCallback(() => {
    if (viewing.kind !== "viewing") return;
    setContent(viewing.savedContent);
    setPmDoc(viewing.savedPmDoc);
    setViewing({ kind: "live" });
  }, [viewing]);

  const doRestore = useCallback(() => {
    if (viewing.kind !== "viewing") return;
    const versionId = viewing.versionId;
    restore.mutate(
      { versionId },
      {
        onSuccess: (sp) => {
          setContent(sp.content);
          setPmDoc((sp.pmDoc as Record<string, unknown> | null) ?? null);
          setViewing({ kind: "live" });
          setAwaitingRestoreConfirm(false);
        },
      },
    );
  }, [viewing, restore]);

  const handleRestore = useCallback(() => {
    if (viewing.kind !== "viewing") return;
    if (isDirty) {
      setAwaitingRestoreConfirm(true);
    } else {
      doRestore();
    }
  }, [viewing, isDirty, doRestore]);

  const handleSaveAndRestore = useCallback(() => {
    if (!nextVersionLabel) {
      doRestore();
      return;
    }
    createVersion.mutate(
      { screenplayId: screenplay.id, label: nextVersionLabel },
      { onSettled: () => doRestore() },
    );
  }, [createVersion, screenplay.id, nextVersionLabel, doRestore]);

  const handleRestoreOnly = useCallback(() => {
    doRestore();
  }, [doRestore]);

  const handleRestoreCancel = useCallback(() => {
    setAwaitingRestoreConfirm(false);
  }, []);

  // E2E test hook: bypass the autosave debounce and trigger an immediate save.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    w["__ohWritersForceSave"] = () => flush();
    return () => {
      delete w["__ohWritersForceSave"];
    };
  }, [flush]);

  // Ctrl/Cmd+Shift+F keybinding dispatches this event from within the editor
  useEffect(() => {
    const handleToggle = () => setFocusMode((prev) => !prev);
    window.addEventListener("screenplay:toggleFocusMode", handleToggle);
    return () =>
      window.removeEventListener("screenplay:toggleFocusMode", handleToggle);
  }, []);

  return (
    <div className={`${styles.page} ${isFocusMode ? styles.focusMode : ""}`}>
      {isFocusMode ? (
        <div className={styles.focusToolbar}>
          <button
            className={styles.focusExitBtn}
            onClick={() => setFocusMode(false)}
            type="button"
            title="Exit focus mode"
          >
            Exit Focus
          </button>
        </div>
      ) : (
        <ScreenplayToolbar
          projectId={screenplay.projectId}
          currentPage={currentPage}
          totalPages={totalPages}
          isDirty={isDirty}
          isSaving={isSaving}
          isError={isError}
          isOffline={isOffline}
          lastSavedAt={lastSavedAt}
          onFlushSave={flush}
          isFocusMode={isFocusMode}
          hasContent={content.trim().length > 0}
          currentElement={currentElement}
          onSetElement={handleSetElement}
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onImport={setContent}
          nextVersionLabel={nextVersionLabel}
          onCreateVersionThenImport={
            nextVersionLabel ? handleCreateVersionThenImport : undefined
          }
          onToggleVersions={() => {
            if (isVersionsPanelOpen) {
              closeDrawer();
            } else {
              openDrawer(
                { kind: "screenplay", screenplayId: screenplay.id },
                (versionId) => requestView(versionId),
              );
            }
          }}
          isVersionsPanelOpen={isVersionsPanelOpen}
          currentVersionLabel={latestVersion?.label ?? null}
          hideSaveIndicator={isViewing}
        />
      )}
      {!isFocusMode && isViewing && (
        <VersionViewingBanner
          label={viewing.label}
          createdAt={viewing.createdAt}
          onReturn={handleReturn}
          onRestore={handleRestore}
          isRestoring={restore.isPending}
          restoreConfirm={
            awaitingRestoreConfirm
              ? {
                  onSaveAndRestore: handleSaveAndRestore,
                  onRestoreOnly: handleRestoreOnly,
                  onCancel: handleRestoreCancel,
                }
              : undefined
          }
        />
      )}

      <div className={styles.editorArea}>
        <div className={styles.pageShell}>
          <ProseMirrorView
            value={content}
            initialDoc={pmDoc}
            onChange={setContent}
            onDocChange={setPmDoc}
            onElementChange={setCurrentElement}
            readOnly={isViewing}
            onReady={(view) => {
              viewRef.current = view;
            }}
          />
        </div>
      </div>
    </div>
  );
}
