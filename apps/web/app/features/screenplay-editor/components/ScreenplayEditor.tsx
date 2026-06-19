import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { match } from "ts-pattern";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import {
  ActionsMenu,
  Button,
  Dialog,
  DocStats,
  VersionTrigger,
} from "@oh-writers/ui";
import type { DropdownMenuItem } from "@oh-writers/ui";
import type { ScreenplayView } from "../server/screenplay.server";
import { useAutoSave } from "../hooks/useScreenplay";
import {
  useVersion,
  useVersions,
  useCreateManualVersion,
  useImportAsActiveVersion,
  useRestoreVersion,
} from "../hooks/useVersions";
import { estimatePageCount } from "../lib/page-counter";
import { docToFountain } from "../lib/doc-to-fountain";
import { fountainToDoc } from "../lib/fountain-to-doc";
import type { ElementType } from "../lib/fountain-element-detector";
import { setElement } from "../lib/schema-commands";
import { ProseMirrorView } from "./ProseMirrorView";
import {
  useYjsRoom,
  useLatchedRealtime,
  PresenceIndicator,
} from "~/features/realtime";
import { useSession } from "~/lib/auth-client";
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
import { useImportPdf } from "../hooks/useImportPdf";
import { useImportFountain } from "../hooks/useImportFountain";
import { ExportScreenplayPdfModal } from "./ExportScreenplayPdfModal";
import { useExportScreenplayPdf } from "../hooks/useExportScreenplayPdf";
import { ContextActionIds, type ExportFormat } from "@oh-writers/domain";
import { buildFountainFilename } from "../lib/export-pipeline";
import { downloadTextFile } from "~/features/documents";
import { VersionViewingBanner } from "./VersionViewingBanner";
import {
  useCesareOpen,
  useContextActions,
  useSetActiveScene,
  useTopBarSlotPublisher,
  SaveStatusIndicator,
} from "~/features/app-shell";
import type { ContextActionHandlers } from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
  const [content, setContent] = useState(screenplay.content);
  const [pmDoc, setPmDoc] = useState<Record<string, unknown> | null>(
    screenplay.pmDoc ?? null,
  );
  const [isFocusMode, setFocusMode] = useState(false);
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

  // ─── Realtime collaboration ────────────────────────────────────────────
  // A version snapshot is read-only and must never connect. Viewers connect
  // read-only (writes are blocked server-side); editors get full sync.
  const { data: sessionData } = useSession();
  const realtimeUser = sessionData?.user
    ? { id: sessionData.user.id, name: sessionData.user.name }
    : null;
  // The screenplay content is version-backed: each active version is its own
  // CRDT room (`screenplay:<id>:<versionId>`), persisted in the version's
  // yjs_snapshot. Switching the active version (Attiva / + Nuova versione)
  // changes currentVersionId → roomId → useYjsRoom reopens onto that version's
  // CRDT, so the editor actually reloads. Falls back to the legacy
  // screenplay-level room when there is no current version yet (seed/legacy).
  const roomId = screenplay.currentVersionId
    ? `screenplay:${screenplay.id}:${screenplay.currentVersionId}`
    : `screenplay:${screenplay.id}`;
  const realtimeRoom = useYjsRoom(roomId, realtimeUser, !isViewing);
  const { status: realtimeStatus, peers: realtimePeers } = realtimeRoom;
  // Realtime sync is active for ANY connected user (viewers included — they
  // receive live content + cursors but the editor stays readOnly and the
  // ws-server drops their writes). It is NOT tied to write permission.
  // Latched on the first `synced`, not derived from the live status: the
  // editor remounts into realtime mode and must only do so once the server
  // state has landed — on bare `connected` the fragment still looks empty for
  // a room that has content, and the first-client seeding would race the
  // arriving snapshot (BUG-N54; the ws-server also replies to sync only after
  // loading the room, so a post-sync empty fragment genuinely means an empty
  // room). And once IN realtime mode it stays there: deriving from the status
  // would rebuild the EditorView on every connection flap, eating keystrokes
  // (BUG-N57) — Yjs buffers edits across the disconnected stretch instead.
  const latchedRealtime = useLatchedRealtime(realtimeRoom);
  const realtimeActive = latchedRealtime !== null;

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
  const nextVersionLabel =
    versionsCount > 0
      ? `${t("screenplay.editor.versionFallbackPrefix")} ${versionsCount + 1}`
      : null;
  const versionsLoadError: string | null =
    versionsResult && !versionsResult.isOk
      ? match(versionsResult.error)
          .with({ _tag: "VersionNotFoundError" }, () =>
            t("screenplay.editor.error.versionNotFound"),
          )
          .with({ _tag: "ScreenplayNotFoundError" }, () =>
            t("screenplay.editor.error.screenplayNotFound"),
          )
          .with({ _tag: "ProjectNotFoundError" }, () =>
            t("screenplay.editor.error.projectNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () =>
            t("screenplay.editor.error.forbidden"),
          )
          .with({ _tag: "DbError" }, () => t("screenplay.editor.error.db"))
          .exhaustive()
      : null;

  const createVersion = useCreateManualVersion();
  const importAsVersion = useImportAsActiveVersion();
  // Spec 71: importing "as a new version" inserts a NEW version carrying the
  // imported Fountain and makes it ACTIVE server-side; the editor remounts on
  // the changed `currentVersionId` (key) and reseeds from the imported content.
  // No `setContent` here — that would double-apply against the remount + race
  // the CRDT seed. (The "overwrite current" path still uses setContent: it
  // edits the live active version in place.)
  const handleCreateVersionThenImport = useCallback(
    (fountain: string) => {
      if (!nextVersionLabel) {
        setContent(fountain);
        return;
      }
      importAsVersion.mutate({
        screenplayId: screenplay.id,
        label: nextVersionLabel,
        content: fountain,
      });
    },
    [importAsVersion, screenplay.id, nextVersionLabel],
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
        // A foreign PDF's title page must not rename the project.
        syncProjectTitle: false,
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
  // Spec 63 S2 — compare dirtiness on the CANONICAL fountain so a stored
  // screenplay whose only difference from the editor's serialisation is
  // indentation / blank-line normalisation is NOT seen as a local edit. Without
  // this an externally-written screenplay (PDF import, Cesare) is dirty on first
  // render and a phantom autosave clobbers the stored content.
  const normalizeFountain = useCallback(
    (s: string): string => docToFountain(fountainToDoc(s)),
    [],
  );
  const { isDirty, isSaving, isError, isOffline, lastSavedAt, flush } =
    useAutoSave(
      screenplay.id,
      content,
      screenplay.content,
      pmDoc,
      isViewing,
      normalizeFountain,
    );
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
  // The export modal (Spec 55a) now owns the production-format choice; the
  // editor only tracks whether it is open. Opened from the TopBar action.
  const [isExportOpen, setIsExportOpen] = useState(false);

  const handleExportFountain = useCallback(() => {
    const filename = buildFountainFilename(screenplay.title, screenplay.title);
    downloadTextFile(content, filename);
  }, [content, screenplay.title]);
  const handleGenerateExport = ({
    format,
    includeCoverPage,
    sceneNumbers,
  }: {
    format: ExportFormat;
    includeCoverPage: boolean;
    sceneNumbers?: string[];
  }) => {
    exportPdf.mutate(
      {
        screenplayId: screenplay.id,
        includeCoverPage,
        format,
        sceneNumbers,
      },
      { onSuccess: () => setIsExportOpen(false) },
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

  const navigate = useNavigate();
  // Spec 66: the screenplay opens the unified routed master→detail Versions
  // surface (`?versions=<id>&vkind=screenplay`) instead of the old inline drawer,
  // so narrative and screenplay share one versions UI. `Attiva` restores.
  const toggleVersionsDrawer = useCallback(() => {
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        versions: screenplay.id,
        vkind: "screenplay" as const,
      }),
    });
  }, [navigate, screenplay.id]);

  const hasContent = content.trim().length > 0;
  const canEdit = screenplay.canEdit ?? false;
  const isOwner = screenplay.isOwner ?? false;

  // ─── Import machinery (Spec 55a) ──────────────────────────────────────
  // Lifted out of the retired in-editor ToolbarMenu into the editor itself,
  // so the TopBar action items can drive the file pickers while the confirm
  // dialogs + error banners render here. The PM `content`/version label live
  // in this component, so this is the right home (deep module).
  const openTitlePage = useCallback(
    () =>
      void navigate({
        to: "/projects/$id/title-page",
        params: { id: screenplay.projectId },
      }),
    [navigate, screenplay.projectId],
  );
  const pdfImport = useImportPdf({
    hasExistingContent: hasContent,
    onImport: setContent,
    onCreateVersionThenImport: nextVersionLabel
      ? handleCreateVersionThenImport
      : undefined,
    onTitlePageDetected: handleTitlePageDetected,
  });
  const fountainImport = useImportFountain({
    hasExistingContent: hasContent,
    onImport: setContent,
    onCreateVersionThenImport: nextVersionLabel
      ? handleCreateVersionThenImport
      : undefined,
  });

  // The import hooks rebuild their `openPicker` closures every render, which
  // would make `contextActionHandlers` (and the published TopBar node) a new
  // reference each render → the slot publisher re-fires → "Maximum update depth
  // exceeded". Route the picker calls through a ref so the handler identities
  // stay stable, mirroring the existing stable-handler pattern in this file.
  const importPickersRef = useRef({
    openPdf: pdfImport.openPicker,
    openFountain: fountainImport.openPicker,
  });
  importPickersRef.current = {
    openPdf: pdfImport.openPicker,
    openFountain: fountainImport.openPicker,
  };
  const openPdfPicker = useCallback(
    () => importPickersRef.current.openPdf(),
    [],
  );
  const openFountainPicker = useCallback(
    () => importPickersRef.current.openFountain(),
    [],
  );

  // TopBar context actions (Spec 55a). Export/import/Versioni flow through the
  // shared registry so the screenplay reuses the same single home as every
  // narrative page; renumber + title-page are page-specific extras appended to
  // the same menu. The registry drops any id the page does not wire.
  const contextActionHandlers = useMemo<ContextActionHandlers>(
    () => ({
      [ContextActionIds.EXPORT_PDF]: {
        onSelect: () => setIsExportOpen(true),
        disabled: !hasContent || exportPdf.isPending,
        labelOverride: exportPdf.isPending
          ? t("screenplay.editor.exporting")
          : undefined,
        testId: "screenplay-export-pdf",
      },
      ...(hasContent
        ? {
            [ContextActionIds.EXPORT_FOUNTAIN]: {
              onSelect: handleExportFountain,
              testId: "menu-item-export-fountain",
            },
          }
        : {}),
      // Import OVERWRITES the screenplay content, so it is an edit op — only
      // surface it to editors. A read-only viewer would otherwise pick a file
      // and confirm an overwrite only to be rejected server-side.
      ...(canEdit
        ? {
            [ContextActionIds.IMPORT_PDF]: {
              onSelect: openPdfPicker,
              disabled: pdfImport.isLoading,
              testId: "menu-item-import-pdf",
            },
            [ContextActionIds.IMPORT_FOUNTAIN]: {
              onSelect: openFountainPicker,
              testId: "menu-item-import-fountain",
            },
          }
        : {}),
    }),
    [
      canEdit,
      hasContent,
      exportPdf.isPending,
      handleExportFountain,
      openPdfPicker,
      pdfImport.isLoading,
      openFountainPicker,
      t,
    ],
  );
  const registryItems = useContextActions("screenplay", contextActionHandlers);
  const actionItems = useMemo<DropdownMenuItem[]>(() => {
    const extras: DropdownMenuItem[] = [];
    if (canEdit) {
      extras.push({
        label: t("screenplay.menu.recalcSceneNumbers"),
        onClick: onResequenceAll,
        testId: "menu-item-renumber",
      });
    }
    if (isOwner) {
      extras.push({
        label: t("screenplay.menu.titlePage"),
        onClick: openTitlePage,
        testId: "menu-item-title-page",
      });
    }
    return [...registryItems, ...extras];
  }, [registryItems, canEdit, isOwner, onResequenceAll, openTitlePage, t]);

  // Publish the single screenplay actions menu into the TopBar `actions` slot
  // (the one home). Memoised so the slot publisher does not re-fire each render.
  const topBarActionsNode = useMemo(
    () =>
      isFocusMode ? null : (
        <ActionsMenu
          data-testid="screenplay-actions-menu"
          items={actionItems}
        />
      ),
    [actionItems, isFocusMode],
  );
  useTopBarSlotPublisher("actions", topBarActionsNode);

  // Unified TopBar version chip (same "VERSIONI ⌄" pill as the narrative docs),
  // so versions are reachable the same way everywhere — not only from the ⋯
  // menu. Hidden in focus mode.
  // The chip shows the CURRENT version's name (its label) as a stable Notion-style
  // identifier, not the generic word "Versioni" — falling back to "Versioni" only
  // until the versions list has loaded. The draft colour renders as the leading dot.
  const currentVersion = versionsResult?.isOk
    ? (versionsResult.value.find((v) => v.id === screenplay.currentVersionId) ??
      null)
    : null;
  // Pair the save-status pill with the version chip in the TopBar versionSelector
  // slot, mirroring the narrative docs (NarrativeDocsShell). The save pill sits
  // next to the version chip near the ⋯ menu — owner preference, consistent
  // across pages. The editor's Viewbar no longer renders the save indicator.
  const versionChipNode = useMemo(
    () =>
      isFocusMode ? null : (
        <div className={styles.topBarVersionGroup}>
          <SaveStatusIndicator />
          <VersionTrigger
            variant="pill"
            label={t("screenplay.action.versions")}
            versionLabel={
              currentVersion?.label ?? t("documents.shell.versions")
            }
            dotColor={currentVersion?.draftColor ?? undefined}
            onClick={toggleVersionsDrawer}
            data-testid="topbar-version-chip"
          />
        </div>
      ),
    [
      isFocusMode,
      toggleVersionsDrawer,
      t,
      currentVersion?.label,
      currentVersion?.draftColor,
    ],
  );
  useTopBarSlotPublisher("versionSelector", versionChipNode);

  return (
    <div className={`${styles.page} ${isFocusMode ? styles.focusMode : ""}`}>
      {isFocusMode && (
        <div className={styles.focusToolbar}>
          <button
            className={styles.focusExitBtn}
            onClick={() => setFocusMode(false)}
            type="button"
            title={t("screenplay.shell.exitFocus")}
          >
            {t("screenplay.shell.exitFocus")}
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
                {`${t("screenplay.editor.draftBannerPrefix")}${d.label}${t("screenplay.editor.draftBannerSuffix")}`}
              </span>
              <button
                type="button"
                className={styles.draftBannerLink}
                data-testid="cesare-draft-banner-open"
                onClick={toggleVersionsDrawer}
              >
                {t("screenplay.editor.openDiff")}
              </button>
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
                {t("screenplay.editor.promoteToActive")}
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
                {t("screenplay.editor.discardDraft")}
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

      {/* Import file pickers + dialogs (Spec 55a) — the triggers live in the
          TopBar actions menu; these stay mounted (invisible) to host the
          native inputs and the confirm/error UI. */}
      <input
        {...pdfImport.fileInputProps}
        className={styles.hiddenInput}
        data-testid="pdf-file-input"
      />
      <input
        {...fountainImport.fileInputProps}
        className={styles.hiddenInput}
        data-testid="fountain-file-input"
      />

      {!isFocusMode && realtimePeers.length > 0 && (
        <div className={styles.presenceStrip}>
          <PresenceIndicator status={realtimeStatus} peers={realtimePeers} />
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
            ydoc={latchedRealtime?.ydoc ?? null}
            provider={latchedRealtime?.provider ?? null}
            realtime={realtimeActive}
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
      {isExportOpen && (
        <ExportScreenplayPdfModal
          isPending={exportPdf.isPending}
          screenplayId={screenplay.id}
          onClose={() => setIsExportOpen(false)}
          onGenerate={handleGenerateExport}
        />
      )}

      {pdfImport.status.type === "error" && (
        <div
          className={styles.importError}
          role="alert"
          data-testid="import-error"
        >
          {pdfImport.status.message}
          <button
            type="button"
            className={styles.importErrorDismiss}
            onClick={pdfImport.cancel}
            aria-label={t("screenplay.menu.cancel")}
          >
            ✕
          </button>
        </div>
      )}
      {pdfImport.status.type === "confirm" && (
        <Dialog
          isOpen
          onClose={pdfImport.cancel}
          title={t("screenplay.menu.importPdfTitle")}
          size="lg"
          isDismissable={false}
          data-testid="import-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={pdfImport.cancel}
                data-testid="import-confirm-cancel"
              >
                {t("screenplay.menu.cancel")}
              </Button>
              {nextVersionLabel ? (
                <>
                  <Button
                    variant="danger"
                    onClick={pdfImport.confirm}
                    data-testid="import-confirm-overwrite"
                  >
                    {t("screenplay.menu.overwrite")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={pdfImport.confirmWithVersion}
                    data-testid="import-confirm-new-version"
                    autoFocus
                  >
                    {t("screenplay.menu.saveAsPrefix")}
                    {nextVersionLabel}
                    {t("screenplay.menu.saveAsSuffix")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={pdfImport.confirm}
                  data-testid="import-confirm-ok"
                  autoFocus
                >
                  {t("screenplay.menu.replace")}
                </Button>
              )}
            </>
          }
        >
          <p>
            {nextVersionLabel
              ? t("screenplay.menu.confirmWithVersionBody")
              : t("screenplay.menu.confirmReplaceBody")}
          </p>
        </Dialog>
      )}

      {fountainImport.status.type === "error" && (
        <div
          className={styles.importError}
          role="alert"
          data-testid="import-fountain-error"
        >
          {fountainImport.status.message}
          <button
            type="button"
            className={styles.importErrorDismiss}
            onClick={fountainImport.cancel}
            aria-label={t("screenplay.menu.cancel")}
          >
            ✕
          </button>
        </div>
      )}
      {fountainImport.status.type === "confirm" && (
        <Dialog
          isOpen
          onClose={fountainImport.cancel}
          title={t("screenplay.menu.importFountainTitle")}
          size="lg"
          isDismissable={false}
          data-testid="import-fountain-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={fountainImport.cancel}
                data-testid="import-fountain-confirm-cancel"
              >
                {t("screenplay.menu.cancel")}
              </Button>
              {nextVersionLabel ? (
                <>
                  <Button
                    variant="danger"
                    onClick={fountainImport.confirm}
                    data-testid="import-fountain-confirm-overwrite"
                  >
                    {t("screenplay.menu.overwrite")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={fountainImport.confirmWithVersion}
                    data-testid="import-fountain-confirm-new-version"
                    autoFocus
                  >
                    {t("screenplay.menu.saveAsPrefix")}
                    {nextVersionLabel}
                    {t("screenplay.menu.saveAsSuffix")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={fountainImport.confirm}
                  data-testid="import-fountain-confirm-ok"
                  autoFocus
                >
                  {t("screenplay.menu.replace")}
                </Button>
              )}
            </>
          }
        >
          <p>
            {nextVersionLabel
              ? t("screenplay.menu.confirmWithVersionBody")
              : t("screenplay.menu.confirmReplaceBody")}
          </p>
        </Dialog>
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
