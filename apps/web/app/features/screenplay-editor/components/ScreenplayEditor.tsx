import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from "react";
import { match } from "ts-pattern";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import { DocStats, DropdownMenu } from "@oh-writers/ui";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave } from "../hooks/useScreenplay";
import {
  useVersion,
  useVersions,
  useCreateManualVersion,
  useRestoreVersion,
} from "../hooks/useVersions";
import { estimatePageCount } from "../lib/page-counter";
import type { ElementType } from "../lib/fountain-element-detector";
import { setElement } from "../lib/schema-commands";
import { ProseMirrorView } from "./ProseMirrorView";
import {
  cesareAppliedHighlightKey,
  highlightAppliedRange,
} from "../lib/plugins/cesare-applied-highlight";
import {
  buildProposedEditPlugin,
  proposedEditPluginKey,
  setProposedEdits,
  type ProposedEdit as PmProposedEdit,
} from "../lib/plugins/proposed-edit-decoration";
import {
  buildCesarePendingEditPlugin,
  cesarePendingEditKey,
  startPendingEdit,
  appendStreamChunk,
  finishStreaming,
  dispatchAcceptPendingEdit,
  dispatchRejectPendingEdit,
  findSceneRange,
  hasPendingEdit,
} from "../lib/plugins/cesare-pending-edit";
import { HoverToolbar } from "./HoverToolbar";
import {
  useScreenplayProposals,
  useRemoveScreenplayProposal,
  usePromoteDraftToActive,
  useDiscardDraftVersion,
} from "../hooks/useProposals";
import { ToolbarMenu } from "./ToolbarMenu";
import { ExportScreenplayPdfModal } from "./ExportScreenplayPdfModal";
import { useExportScreenplayPdf } from "../hooks/useExportScreenplayPdf";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_META,
  type ExportFormat,
} from "@oh-writers/domain";
import { buildFountainFilename } from "../lib/export-pipeline";
import { downloadTextFile } from "~/features/documents";
import { VersionViewingBanner } from "./VersionViewingBanner";
import { SceneStaleBadge } from "./SceneStaleBadge";
import { useVersionsDrawer } from "~/features/versions";
import { useCesareOpen, useSetActiveScene } from "~/features/app-shell";
import { useSaveScreenplay } from "../hooks/useScreenplay";
import {
  useTitlePageState,
  useUpdateTitlePageState,
} from "~/features/projects";
import type { TitlePageDocJSON } from "../lib/title-page-from-pdf";
import { ImportedTitlePageConfirm } from "./ImportedTitlePageConfirm";
import { SceneNumberConflictModal } from "./SceneNumberConflictModal";
import type { ConflictChoice } from "./SceneNumberConflictModal";
import {
  SCENE_NUMBER_CONFLICT_EVENT,
  SCENE_NUMBER_TOAST_EVENT,
  dispatchSceneNumberToast,
  resequenceWholeDoc,
  type SceneNumberConflictDetail,
  type SceneNumberToastDetail,
} from "../lib/plugins/scene-number-commands";
import styles from "./ScreenplayEditor.module.css";

interface ScreenplayEditorProps {
  screenplay: ScreenplayView;
  /** Cesare overlay state — lifted to the route so both the shell margin
   *  column and the floating dock pill share a single source of truth. */
  isCesareOn?: boolean;
  onToggleCesare?: (next: boolean) => void;
  /** Reports the current cursor's block element type up to the route so the
   *  viewbar chips reflect the same state. */
  onCurrentElementChange?: (element: ElementType) => void;
  /** Reports live page/scene metrics up to the route so the right-side
   *  Cesare panel can display real numbers (current page, total pages,
   *  current scene, total scenes). */
  onMetricsChange?: (metrics: {
    pageCurrent: number;
    pageTotal: number;
    sceneCurrent: number | null;
    sceneTotal: number;
  }) => void;
  /** Emits the list of scene headings extracted from the PM doc whenever the
   *  doc changes. Used by the shell to populate the Indice popover TOC. */
  onScenesChange?: (scenes: Array<{ number: string; title: string }>) => void;
}

/** Imperative handle exposed by the editor so the parent route can drive
 *  toolbar actions from outside the editor's own subtree. */
export interface ScreenplayEditorHandle {
  setElement: (element: ElementType) => void;
  /** Find the exact substring `find` in the screenplay and replace with
   *  `replace`. Returns true when the substring was found and replaced.
   *  Uses a single PM transaction so the browser's Cmd+Z undoes the apply. */
  applyEdit: (find: string, replace: string) => boolean;
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

// Walk the PM doc JSON and count `heading` nodes — drives the "s.N/M"
// toolbar indicator. Cheap recursion; the doc rarely exceeds a few hundred
// nodes even for feature-length screenplays.
const countHeadings = (doc: Record<string, unknown> | null): number => {
  if (!doc) return 0;
  let count = 0;
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; content?: unknown[] };
    if (node.type === "heading") count += 1;
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return count;
};

type PmJsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PmJsonNode[];
};

// Collect all text leaves under a node recursively.
const collectText = (nodes: PmJsonNode[] | undefined): string =>
  (nodes ?? [])
    .map((n) => (n.type === "text" ? (n.text ?? "") : collectText(n.content)))
    .join("");

// Extract one entry per heading node from the PM doc JSON. Each entry holds
// the display number (scene_number attr, falling back to 1-based position) and
// the combined prefix + title text (e.g. "INT. RISTORANTE - NOTTE").
export const extractSceneTitles = (
  doc: Record<string, unknown> | null,
): Array<{ number: string; title: string }> => {
  if (!doc) return [];
  const results: Array<{ number: string; title: string }> = [];
  let autoIndex = 0;

  const walk = (n: PmJsonNode): void => {
    if (n.type === "heading") {
      autoIndex += 1;
      const sceneNumber =
        (n.attrs?.["scene_number"] as string | undefined) ?? "";
      const displayNumber =
        sceneNumber.length > 0 ? sceneNumber : String(autoIndex);
      const parts = (n.content ?? []).map((child) =>
        collectText(child.content),
      );
      const title = parts.filter(Boolean).join(" ").trim() || "—";
      results.push({ number: displayNumber, title });
      return;
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };

  walk(doc as PmJsonNode);
  return results;
};

export const ScreenplayEditor = forwardRef<
  ScreenplayEditorHandle,
  ScreenplayEditorProps
>(function ScreenplayEditor(
  {
    screenplay,
    isCesareOn: isCesareOnProp,
    onToggleCesare,
    onCurrentElementChange,
    onMetricsChange,
    onScenesChange,
  },
  ref,
) {
  const [content, setContent] = useState(screenplay.content);
  const [pmDoc, setPmDoc] = useState<Record<string, unknown> | null>(
    screenplay.pmDoc ?? null,
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
  const [currentElement, setCurrentElement] = useState<ElementType>("action");
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(
    null,
  );
  const [pageInfo, setPageInfo] = useState<{ current: number; total: number }>({
    current: 1,
    total: 1,
  });
  const [conflict, setConflict] = useState<SceneNumberConflictDetail | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [localCesareOn, setLocalCesareOn] = useState(true);
  const isCesareOn = isCesareOnProp ?? localCesareOn;
  const handleToggleCesare = (next: boolean) => {
    if (onToggleCesare) onToggleCesare(next);
    else setLocalCesareOn(next);
  };
  // Cesare is opened via the shell BottomDock (Spec 44 TKT-LEAD-01); the
  // hook stays mounted so inline triggers (proposals, scene jumps) can keep
  // surfacing it without re-importing.
  const _openCesare = useCesareOpen();
  void _openCesare;
  const setActiveScene = useSetActiveScene();
  const viewRef = useRef<EditorView | null>(null);

  const isViewing = viewing.kind === "viewing";

  // ─── Cesare propose/accept wiring ──────────────────────────────────────
  // Proposals live in a server-side in-memory store; the chat hook
  // invalidates the query whenever Cesare finishes a turn so the plugin
  // sees fresh edits as soon as they're emitted.
  const proposalsQuery = useScreenplayProposals(screenplay.id);
  const removeProposal = useRemoveScreenplayProposal(screenplay.id);
  const promoteDraft = usePromoteDraftToActive(screenplay.id);
  const discardDraft = useDiscardDraftVersion(screenplay.id);

  // Stable plugin reference — created once per editor mount. The callbacks
  // ride on a ref so we don't re-instantiate the plugin when handlers
  // identity shifts.
  const proposalCallbacksRef = useRef({
    onAccept: (id: string) => removeProposal.mutate(id),
    onReject: (id: string) => removeProposal.mutate(id),
  });
  proposalCallbacksRef.current = {
    onAccept: (id: string) => removeProposal.mutate(id),
    onReject: (id: string) => removeProposal.mutate(id),
  };

  // ─── Cesare inline pending-edit state ────────────────────────────────
  const [pendingStatus, setPendingStatus] = useState<
    false | "streaming" | "done"
  >(false);
  const pendingEditCallbacksRef = useRef<{
    onAccept: () => void;
    onReject: () => void;
  }>({
    onAccept: () => setPendingStatus(false),
    onReject: () => setPendingStatus(false),
  });
  pendingEditCallbacksRef.current = {
    onAccept: () => setPendingStatus(false),
    onReject: () => setPendingStatus(false),
  };

  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const pluginsExtraRef = useRef<Plugin[] | null>(null);
  if (pluginsExtraRef.current === null) {
    pluginsExtraRef.current = [
      buildProposedEditPlugin({
        onAccept: (id) => proposalCallbacksRef.current.onAccept(id),
        onReject: (id) => proposalCallbacksRef.current.onReject(id),
      }),
      buildCesarePendingEditPlugin({
        onAccept: () => pendingEditCallbacksRef.current.onAccept(),
        onReject: () => pendingEditCallbacksRef.current.onReject(),
      }),
    ];
  }

  // Sync proposal state into the PM plugin whenever the query data changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const edits = proposalsQuery.data?.edits ?? [];
    const pmProposals: PmProposedEdit[] = edits.map((e) => ({
      id: e.id,
      kind: e.kind,
      find: e.find,
      replace: e.replace,
      reason: e.reason,
    }));
    view.dispatch(
      view.state.tr.setMeta(
        proposedEditPluginKey,
        setProposedEdits(pmProposals),
      ),
    );
  }, [proposalsQuery.data]);

  const draftBanners = proposalsQuery.data?.drafts ?? [];

  const { data: versionsResult } = useVersions(screenplay.id);
  const versionsCount = versionsResult?.isOk ? versionsResult.value.length : 0;
  const latestVersion =
    versionsResult?.isOk && versionsResult.value.length > 0
      ? versionsResult.value[0]
      : null;
  const nextVersionLabel =
    versionsCount > 0 ? `Versione ${versionsCount + 1}` : null;
  const versionsLoadError: string | null =
    versionsResult && !versionsResult.isOk
      ? match(versionsResult.error)
          .with({ _tag: "VersionNotFoundError" }, () => "Versione non trovata.")
          .with(
            { _tag: "ScreenplayNotFoundError" },
            () => "Sceneggiatura non trovata.",
          )
          .with({ _tag: "ProjectNotFoundError" }, () => "Progetto non trovato.")
          .with(
            { _tag: "ForbiddenError" },
            () => "Non hai accesso a queste versioni.",
          )
          .with(
            { _tag: "DbError" },
            () => "Impossibile caricare le versioni. Riprova.",
          )
          .exhaustive()
      : null;

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

  // Pass 0 of PDF import (Spec 07c): when the imported PDF carries a title
  // page and the project's front page is empty we apply it transparently;
  // when the project already has one the user must confirm the overwrite.
  const titlePageQ = useTitlePageState(screenplay.projectId);
  const updateTitlePage = useUpdateTitlePageState();
  const [pendingTitlePage, setPendingTitlePage] =
    useState<TitlePageDocJSON | null>(null);

  const isExistingTitlePageEmpty = (() => {
    const v = titlePageQ.data;
    if (!v) return true;
    return match(v)
      .with({ isOk: true }, ({ value }) => value.state.doc === null)
      .with(
        { isOk: false, error: { _tag: "ProjectNotFoundError" } },
        () => true,
      )
      .with({ isOk: false, error: { _tag: "DbError" } }, () => false)
      .exhaustive();
  })();

  const applyImportedTitlePage = useCallback(
    (doc: TitlePageDocJSON) => {
      const current = titlePageQ.data?.isOk
        ? titlePageQ.data.value.state
        : null;
      updateTitlePage.mutate({
        projectId: screenplay.projectId,
        state: {
          doc: doc as unknown as Record<string, NonNullable<unknown>>,
          draftDate: current?.draftDate ?? null,
          draftColor: current?.draftColor ?? null,
        },
      });
    },
    [updateTitlePage, screenplay.projectId, titlePageQ.data],
  );

  const handleTitlePageDetected = useCallback(
    (doc: TitlePageDocJSON) => {
      if (isExistingTitlePageEmpty) {
        applyImportedTitlePage(doc);
      } else {
        setPendingTitlePage(doc);
      }
    },
    [applyImportedTitlePage, isExistingTitlePageEmpty],
  );

  const handleSetElement = useCallback(
    (el: ElementType) => {
      const view = viewRef.current;
      if (!view) return;
      setElement(el)(view.state, view.dispatch, view);
      view.focus();
      // Optimistic highlight — the dispatchTransaction listener in
      // ProseMirrorView will re-derive the pill from the cursor's parent on
      // the next selection change, which keeps it accurate when the user
      // clicks into a different block type.
      setCurrentElement(el);
      onCurrentElementChange?.(el);
    },
    [onCurrentElementChange],
  );

  const handleApplyEdit = useCallback(
    (find: string, replace: string): boolean => {
      const view = viewRef.current;
      if (!view || !find) return false;

      // Walk only leaf text nodes, collecting their exact PM positions.
      // This avoids the synthetic separators that textBetween inserts at block
      // boundaries, which made the flat-index → PM-position mapping unreliable.
      type TextSegment = { text: string; from: number; to: number };
      const segments: TextSegment[] = [];
      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          segments.push({
            text: node.text,
            from: pos,
            to: pos + node.text.length,
          });
        }
        return true;
      });

      const fullText = segments.map((s) => s.text).join("");
      const idx = fullText.indexOf(find);
      if (idx < 0) return false;

      const findEnd = idx + find.length;
      let posStart = -1;
      let posEnd = -1;
      let cursor = 0;

      for (const seg of segments) {
        const segEnd = cursor + seg.text.length;

        if (posStart < 0 && cursor <= idx && idx < segEnd) {
          posStart = seg.from + (idx - cursor);
        }
        if (posEnd < 0 && cursor < findEnd && findEnd <= segEnd) {
          posEnd = seg.from + (findEnd - cursor);
        }
        if (posStart >= 0 && posEnd >= 0) break;

        cursor = segEnd;
      }

      if (posStart < 0 || posEnd < 0) return false;

      const tr = view.state.tr.replaceWith(
        posStart,
        posEnd,
        view.state.schema.text(replace),
      );
      // Map the original anchor through the replacement so the highlight range
      // stays correct even if PM normalised the inserted text node.
      const mappedFrom = tr.mapping.map(posStart);
      const mappedTo = mappedFrom + replace.length;
      tr.setMeta(
        cesareAppliedHighlightKey,
        highlightAppliedRange(mappedFrom, mappedTo),
      );
      view.dispatch(tr);
      view.focus();
      return true;
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      setElement: handleSetElement,
      applyEdit: handleApplyEdit,
    }),
    [handleSetElement, handleApplyEdit],
  );

  // Bubble up cursor-driven element changes (clicking into a different block).
  useEffect(() => {
    onCurrentElementChange?.(currentElement);
  }, [currentElement, onCurrentElementChange]);

  // Sync current scene to app-level context so Cesare always has the right scene
  useEffect(() => {
    if (currentSceneIndex !== null) {
      setActiveScene({ sceneId: "", sceneNumber: currentSceneIndex });
    }
    return () => setActiveScene(null);
  }, [currentSceneIndex, setActiveScene]);

  // Bubble up live page/scene metrics so the right-side Cesare panel can
  // render real numbers instead of placeholders.
  useEffect(() => {
    onMetricsChange?.({
      pageCurrent: pageInfo.current,
      pageTotal: pageInfo.total,
      sceneCurrent: currentSceneIndex,
      sceneTotal: countHeadings(pmDoc),
    });
  }, [pageInfo, currentSceneIndex, pmDoc, onMetricsChange]);

  // Bubble up scene heading titles so the Indice popover in the shell can
  // display a live TOC. Re-runs only when the doc structure changes.
  useEffect(() => {
    onScenesChange?.(extractSceneTitles(pmDoc));
  }, [pmDoc, onScenesChange]);

  // Scroll-based scene tracking: the cursor-based tracker fires only on
  // selection changes, so a user who scrolls without clicking sees stale
  // scene/page numbers. We watch the window scroll and report the heading
  // closest to the top of the viewport as the current scene.
  useEffect(() => {
    const main = document.getElementById("main-content");
    const onScroll = () => {
      const headings = document.querySelectorAll<HTMLElement>(".pm-heading");
      if (headings.length === 0) return;
      const probe = 120; // y in viewport just below the TopBar + Viewbar
      let activeIdx = 0;
      for (let i = 0; i < headings.length; i += 1) {
        const h = headings[i];
        if (!h) break;
        const r = h.getBoundingClientRect();
        if (r.top <= probe) activeIdx = i;
        else break;
      }
      setCurrentSceneIndex(activeIdx + 1);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    main?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      main?.removeEventListener("scroll", onScroll);
    };
  }, [pmDoc]);
  // Fall back to the fountain-line estimate until the paginator emits its
  // first measurement (post-mount rAF). After that, pageInfo wins because
  // it matches the rendered page-break geometry.
  const fallbackTotalPages = estimatePageCount(content);
  const currentPage = pageInfo.current;
  const totalPages = Math.max(pageInfo.total, fallbackTotalPages);
  const totalScenes = countHeadings(pmDoc);
  const { isDirty, isSaving, isError, isOffline, lastSavedAt, flush } =
    useAutoSave(screenplay.id, content, screenplay.content, pmDoc, isViewing);
  const save = useSaveScreenplay();

  const restore = useRestoreVersion();

  // Prefetch the version content when the user requests it
  const versionQuery = useVersion(pendingView?.id ?? "", pendingView !== null);

  // When the pending version resolves, swap content and enter view mode
  useEffect(() => {
    if (!pendingView) return;
    const result = versionQuery.data;
    if (!result) return;
    const snapshot = match(result)
      .with({ isOk: true }, ({ value }) => value)
      .with({ isOk: false }, () => null)
      .exhaustive();
    if (!snapshot) {
      setPendingView(null);
      return;
    }
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
          setPmDoc(sp.pmDoc ?? null);
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

  // Cmd/Ctrl+S — force save, bypassing autosave debounce.
  useEffect(() => {
    if (!(screenplay.canEdit ?? false)) return;
    const onKey = (e: KeyboardEvent) => {
      const isSaveCombo =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
      if (!isSaveCombo) return;
      e.preventDefault();
      if (!isSaving)
        save.mutate({ screenplayId: screenplay.id, content, pmDoc });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, screenplay.id, screenplay.canEdit, content, pmDoc, isSaving]);

  // Scene-number conflict bus — heading NodeView dispatches on Enter/blur
  // when the proposed number collides with another scene. We open the modal
  // and forward the user's choice back through the event's resolve callback.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SceneNumberConflictDetail>).detail;
      setConflict(detail);
    };
    window.addEventListener(SCENE_NUMBER_CONFLICT_EVENT, handler);
    return () =>
      window.removeEventListener(SCENE_NUMBER_CONFLICT_EVENT, handler);
  }, []);

  const onConflictChoice = useCallback(
    (choice: ConflictChoice) => {
      conflict?.resolve(choice);
      setConflict(null);
    },
    [conflict],
  );

  // Toast bus — raised by popover "Resequence from here" and toolbar
  // "Resequence scenes" when the constraints can't be satisfied.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SceneNumberToastDetail>).detail;
      setToast(detail.message);
      const t = window.setTimeout(() => setToast(null), 4000);
      return () => window.clearTimeout(t);
    };
    window.addEventListener(SCENE_NUMBER_TOAST_EVENT, handler);
    return () => window.removeEventListener(SCENE_NUMBER_TOAST_EVENT, handler);
  }, []);

  const exportPdf = useExportScreenplayPdf();
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);

  const handleExportFountain = useCallback(() => {
    const filename = buildFountainFilename(screenplay.title, screenplay.title);
    downloadTextFile(content, filename);
  }, [content, screenplay.title]);
  const handleGenerateExport = ({
    includeCoverPage,
    sceneNumbers,
  }: {
    includeCoverPage: boolean;
    sceneNumbers?: string[];
  }) => {
    if (!exportFormat) return;
    exportPdf.mutate(
      {
        screenplayId: screenplay.id,
        includeCoverPage,
        format: exportFormat,
        sceneNumbers,
      },
      { onSuccess: () => setExportFormat(null) },
    );
  };

  const onResequenceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const r = resequenceWholeDoc(view);
    if (!r.ok) dispatchSceneNumberToast(r.reason);
  }, []);

  // Ctrl/Cmd+Shift+F keybinding dispatches this event from within the editor
  useEffect(() => {
    const handleToggle = () => setFocusMode((prev) => !prev);
    window.addEventListener("screenplay:toggleFocusMode", handleToggle);
    return () =>
      window.removeEventListener("screenplay:toggleFocusMode", handleToggle);
  }, []);

  // Listen for Cesare's rewrite_scene event. When the event fires, the sheet
  // is already closed. We find the target scene in the PM doc, start the
  // pending-edit plugin, and run a typewriter animation over the new content.
  useEffect(() => {
    const TYPEWRITER_CHAR_DELAY_MS = 8;

    const handleRewriteScene = (e: Event) => {
      const detail = (
        e as CustomEvent<{ scene_number: number; new_content: string }>
      ).detail;
      if (
        !detail ||
        typeof detail.scene_number !== "number" ||
        !detail.new_content
      )
        return;

      // Guard against concurrent events: stop any in-flight typewriter before
      // starting a new one to prevent two intervals pumping characters at once.
      if (typewriterIntervalRef.current !== null) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }

      const view = viewRef.current;
      if (!view) return;

      // Find the scene range in the current doc.
      const range = findSceneRange(view.state.doc, detail.scene_number);
      if (!range) return;

      // Start the pending edit.
      view.dispatch(
        view.state.tr.setMeta(
          cesarePendingEditKey,
          startPendingEdit(detail.scene_number, range.from, range.to),
        ),
      );
      setPendingStatus("streaming");

      // Scroll the scene into view.
      const sceneEl = document.querySelector<HTMLElement>(
        `[data-scene-number="${detail.scene_number}"]`,
      );
      sceneEl?.scrollIntoView({ behavior: "smooth", block: "start" });

      // Typewriter animation: feed one character at a time.
      const text = detail.new_content;
      let charIndex = 0;
      let stopped = false;

      typewriterIntervalRef.current = setInterval(() => {
        if (stopped) return;
        const currentView = viewRef.current;
        if (!currentView || !hasPendingEdit(currentView)) {
          clearInterval(typewriterIntervalRef.current!);
          typewriterIntervalRef.current = null;
          setPendingStatus(false);
          return;
        }
        if (charIndex < text.length) {
          currentView.dispatch(
            currentView.state.tr.setMeta(
              cesarePendingEditKey,
              appendStreamChunk(text[charIndex]!),
            ),
          );
          charIndex += 1;
        } else {
          clearInterval(typewriterIntervalRef.current!);
          typewriterIntervalRef.current = null;
          currentView.dispatch(
            currentView.state.tr.setMeta(
              cesarePendingEditKey,
              finishStreaming(),
            ),
          );
          setPendingStatus("done");
        }
      }, TYPEWRITER_CHAR_DELAY_MS);

      return () => {
        stopped = true;
        clearInterval(typewriterIntervalRef.current!);
        typewriterIntervalRef.current = null;
      };
    };

    window.addEventListener("ohw:cesare:rewrite-scene", handleRewriteScene);

    // Replay any pending rewrite buffered while the editor was unmounted
    // (e.g. Cesare fired rewrite_scene from the locations page). We consume
    // the entry so it doesn't replay again on next mount.
    const replayPending = () => {
      try {
        const raw = window.sessionStorage.getItem("ohw:cesare:pending-rewrite");
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          scene_number: number;
          new_content: string;
          ts?: number;
        };
        // Drop entries older than 5 minutes — stale by then.
        if (parsed.ts && Date.now() - parsed.ts > 5 * 60 * 1000) {
          window.sessionStorage.removeItem("ohw:cesare:pending-rewrite");
          return;
        }
        window.sessionStorage.removeItem("ohw:cesare:pending-rewrite");
        handleRewriteScene(
          new CustomEvent("ohw:cesare:rewrite-scene", { detail: parsed }),
        );
      } catch {
        // Ignore malformed entries.
      }
    };
    // Defer one tick so the editor view has finished initialising.
    const replayTimer = window.setTimeout(replayPending, 0);

    return () => {
      window.clearTimeout(replayTimer);
      window.removeEventListener(
        "ohw:cesare:rewrite-scene",
        handleRewriteScene,
      );
    };
  }, []);

  const toggleVersionsDrawer = useCallback(() => {
    if (isVersionsPanelOpen) {
      closeDrawer();
    } else {
      openDrawer(
        { kind: "screenplay", screenplayId: screenplay.id },
        { onSelectVersion: (versionId) => requestView(versionId) },
      );
    }
  }, [
    isVersionsPanelOpen,
    closeDrawer,
    openDrawer,
    screenplay.id,
    requestView,
  ]);

  const hasContent = content.trim().length > 0;
  const canEdit = screenplay.canEdit ?? false;
  const isOwner = screenplay.isOwner ?? false;

  // The export trigger surfaces every production format as a dropdown item;
  // picking one sets `exportFormat` which mounts the format-specific modal.
  const exportMenuItems = EXPORT_FORMATS.map((format) => {
    const meta = EXPORT_FORMAT_META[format];
    return {
      label: meta.labelIt,
      description: meta.descriptionIt,
      onClick: () => setExportFormat(format),
    };
  });

  return (
    <div className={`${styles.page} ${isFocusMode ? styles.focusMode : ""}`}>
      {isFocusMode && (
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
      )}
      {!isFocusMode && versionsLoadError && (
        <div
          role="alert"
          className={styles.toast}
          data-testid="versions-load-error"
        >
          {versionsLoadError}
        </div>
      )}
      {!isFocusMode && draftBanners.length > 0 && (
        <div
          role="status"
          className={styles.toast}
          data-testid="cesare-draft-banner"
        >
          {draftBanners.map((d) => (
            <div key={d.id} className={styles.draftBannerRow}>
              <span data-testid="cesare-draft-banner-label">
                {`✦ Cesare ha preparato la versione: "${d.label}".`}
              </span>
              <a
                className={styles.draftBannerLink}
                data-testid="cesare-draft-banner-open"
                href={`/projects/${screenplay.projectId}/screenplay/versions/${d.versionId}`}
              >
                Apri il diff →
              </a>
              <button
                type="button"
                className={styles.draftBannerAccept}
                data-testid="cesare-draft-banner-accept"
                onClick={() =>
                  promoteDraft.mutate(d.versionId, {
                    onSuccess: () => removeProposal.mutate(d.id),
                  })
                }
                disabled={promoteDraft.isPending}
              >
                Promuovi a attiva
              </button>
              <button
                type="button"
                className={styles.draftBannerDiscard}
                data-testid="cesare-draft-banner-discard"
                onClick={() =>
                  discardDraft.mutate(d.versionId, {
                    onSuccess: () => removeProposal.mutate(d.id),
                  })
                }
                disabled={discardDraft.isPending}
              >
                Scarta draft
              </button>
            </div>
          ))}
        </div>
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

      {!isFocusMode && (
        <div className={styles.actionsBar} data-testid="screenplay-actions-bar">
          {hasContent && !exportPdf.isPending ? (
            <DropdownMenu
              align="start"
              data-testid="screenplay-export-menu"
              triggerClassName={styles.exportTrigger}
              items={exportMenuItems}
              trigger={
                <span data-testid="screenplay-export-pdf">Esporta PDF ▾</span>
              }
            />
          ) : (
            <button
              type="button"
              className={styles.exportTrigger}
              data-testid="screenplay-export-pdf"
              disabled
            >
              {exportPdf.isPending ? "Esportazione…" : "Esporta PDF ▾"}
            </button>
          )}
          <ToolbarMenu
            projectId={screenplay.projectId}
            hasContent={hasContent}
            onImport={setContent}
            nextVersionLabel={nextVersionLabel}
            onCreateVersionThenImport={
              nextVersionLabel ? handleCreateVersionThenImport : undefined
            }
            onToggleVersions={toggleVersionsDrawer}
            isVersionsPanelOpen={isVersionsPanelOpen}
            currentVersionLabel={latestVersion?.label ?? null}
            onResequenceAll={canEdit ? onResequenceAll : undefined}
            isOwner={isOwner}
            onTitlePageDetected={handleTitlePageDetected}
            onExportFountain={hasContent ? handleExportFountain : undefined}
          />
        </div>
      )}

      <div className={styles.editorArea}>
        <div className={styles.pageShell}>
          <ProseMirrorView
            value={content}
            initialDoc={pmDoc}
            onChange={setContent}
            onDocChange={setPmDoc}
            onElementChange={setCurrentElement}
            onSceneIndexChange={setCurrentSceneIndex}
            onPageChange={(current, total) => setPageInfo({ current, total })}
            readOnly={isViewing || !(screenplay.canEdit ?? false)}
            pluginsExtra={pluginsExtraRef.current ?? undefined}
            onReady={(view) => {
              viewRef.current = view;
              // Seed any proposals that loaded before the editor mounted.
              const edits = proposalsQuery.data?.edits ?? [];
              if (edits.length > 0) {
                const pmProposals: PmProposedEdit[] = edits.map((e) => ({
                  id: e.id,
                  kind: e.kind,
                  find: e.find,
                  replace: e.replace,
                  reason: e.reason,
                }));
                view.dispatch(
                  view.state.tr.setMeta(
                    proposedEditPluginKey,
                    setProposedEdits(pmProposals),
                  ),
                );
              }
            }}
          />
        </div>
      </div>
      {!isFocusMode && (
        <div
          className={styles.stickyFooter}
          data-testid="screenplay-counters-footer"
        >
          <DocStats
            stats={[
              { kind: "scenes", value: totalScenes },
              { kind: "pages", value: totalPages },
            ]}
          />
        </div>
      )}
      {exportFormat && (
        <ExportScreenplayPdfModal
          isPending={exportPdf.isPending}
          format={exportFormat}
          screenplayId={screenplay.id}
          onClose={() => setExportFormat(null)}
          onGenerate={handleGenerateExport}
        />
      )}
      {conflict ? (
        <SceneNumberConflictModal
          current={conflict.current}
          proposed={conflict.proposed}
          onResolve={onConflictChoice}
        />
      ) : null}
      {pendingTitlePage ? (
        <ImportedTitlePageConfirm
          onConfirm={() => {
            applyImportedTitlePage(pendingTitlePage);
            setPendingTitlePage(null);
          }}
          onCancel={() => setPendingTitlePage(null)}
        />
      ) : null}
      <HoverToolbar
        status={pendingStatus}
        onAccept={() => {
          const view = viewRef.current;
          if (!view) return;
          dispatchAcceptPendingEdit(view);
          setPendingStatus(false);
        }}
        onReject={() => {
          const view = viewRef.current;
          if (!view) return;
          dispatchRejectPendingEdit(view);
          setPendingStatus(false);
        }}
      />
    </div>
  );
});
