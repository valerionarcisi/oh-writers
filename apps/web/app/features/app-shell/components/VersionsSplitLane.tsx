// apps/web/app/features/app-shell/components/VersionsSplitLane.tsx
//
// The routed Versions SplitDrawer lane (Spec 49 routing + Spec 66 master→detail).
// Mounted at the shell level as the third grid column when `?versions=<id>` is set
// on the host route. The host page stays mounted and COMPRESSES (the main lane
// reflows narrower) — the Notion side-peek model, NOT a floating overlay.
//
// The surface is unified across document kinds (Spec 66): the SplitDrawer frame +
// the master→detail `VersionsSplitDrawer` are shared, while a per-kind inner
// component (`NarrativeVersionsContent` / `ScreenplayVersionsContent`) binds the
// right hooks + read-only renderer. The kind comes from `peek.kind` (`?vkind=`).
// `Attiva` is the single verb: switch the active version (narrative) or restore it
// (screenplay).
//
// State is driven entirely by the URL (the routed-surface single source of truth,
// Spec 49): `?versions=<id>` → open (split); `?vstate=full` → full; param dropped
// → closed. `↗` is a REAL navigation so the URL stays shareable.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { match } from "ts-pattern";
import { SplitDrawer, useToast } from "@oh-writers/ui";
import type { SplitDrawerState } from "@oh-writers/ui";
import type { DraftRevisionColor } from "@oh-writers/domain";
import {
  VersionsSplitDrawer,
  narrativeToVersionView,
  screenplayToVersionView,
} from "~/features/versions";
import type { VersionView } from "~/features/versions";
import {
  useDocumentVersions,
  useDocumentCurrentVersionId,
  useSwitchToVersion,
  useDuplicateDocumentVersion,
  useRenameDocumentVersion,
  useDeleteDocumentVersion,
  useUpdateDocumentVersionMeta,
  useCreateDocumentVersionFromScratch,
} from "~/features/documents";
import {
  useVersions as useScreenplayVersions,
  useRestoreVersion,
  useDuplicateVersion as useDuplicateScreenplayVersion,
  useRenameVersion as useRenameScreenplayVersion,
  useDeleteVersion as useDeleteScreenplayVersion,
  useUpdateVersionMeta as useUpdateScreenplayVersionMeta,
  useCreateBlankVersion,
  useScreenplayCurrentVersionId,
  ReadOnlyScreenplayView,
} from "~/features/screenplay-editor";
import { useTranslation } from "~/features/i18n";
import { usePublishVersionsDetail } from "../versions-detail-context";
import type { VersionsPeek } from "../versions-peek";
import styles from "./VersionsSplitLane.module.css";

export interface VersionsSplitLaneProps {
  /** The validated routed Versions target (entity + state + baseline + kind). */
  readonly peek: VersionsPeek;
  /** Width (px) of the split lane; persisted by AppShell. */
  readonly width: number;
  readonly onWidthChange: (next: number) => void;
  /** `↗` expand → real navigation to the full-screen versions route. */
  readonly onExpand: () => void;
  /** `↙` step-back → real navigation from full back to the split. */
  readonly onStepBack: () => void;
  /** `×` / ESC / outside-dismiss → clear the `?versions` param. */
  readonly onClose: () => void;
  /** Shared auxiliary-lane history controls (←/→) for the one navigable split
   *  track (Spec 78 A6). The shell threads its `SplitDrawerHistoryNav` here so
   *  the Versions lane carries the same back/forward control as the Cesare /
   *  Notifiche lanes; `null` collapses to no control. */
  readonly headerNav?: ReactNode;
}

// ─── Narrative ────────────────────────────────────────────────────────────────

function NarrativeVersionsContent({
  documentId,
  currentVersionId,
  onDetailChange,
}: {
  documentId: string;
  currentVersionId: string | null;
  onDetailChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { data: result, isLoading } = useDocumentVersions(documentId);
  // Read the LIVE current version (not the static URL hint) so the badge tracks
  // Attiva. Falls back to the URL hint while the query is loading.
  const { data: currentResult } = useDocumentCurrentVersionId(documentId);
  const liveCurrentId =
    currentResult?.isOk && currentResult.value
      ? currentResult.value
      : currentVersionId;
  const activate = useSwitchToVersion(documentId);
  const duplicate = useDuplicateDocumentVersion(documentId);
  const rename = useRenameDocumentVersion(documentId);
  const remove = useDeleteDocumentVersion(documentId);
  const updateMeta = useUpdateDocumentVersionMeta(documentId);
  const createNew = useCreateDocumentVersionFromScratch(documentId);

  const versions: VersionView[] = useMemo(
    () => (result?.isOk ? result.value.map(narrativeToVersionView) : []),
    [result],
  );

  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "DocumentNotFoundError" }, () =>
            t("versions.split.docNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () => t("versions.split.forbidden"))
          .otherwise(() => t("versions.split.loadFailed"))
      : null;

  // The version's canonical narrative HTML (server-owned, sanitised), read-only.
  const renderContent = (version: VersionView) => (
    <div
      className={styles.narrativeBody}
      dangerouslySetInnerHTML={{ __html: version.content }}
    />
  );

  return (
    <VersionsSplitDrawer
      versions={versions}
      currentVersionId={liveCurrentId}
      isLoading={isLoading}
      loadError={loadError}
      renderContent={renderContent}
      canEdit
      onActivate={(id) =>
        activate.mutate(id, {
          // Keep the lane open so the writer SEES the "Attuale" badge move to
          // the activated version (the visible confirmation), and surface a
          // success toast. The editor body refetches via the mutation's own
          // invalidation (useSwitchToVersion → invalidateVersions).
          onSuccess: () =>
            showToast({
              message: t("versions.split.activated"),
              variant: "success",
            }),
        })
      }
      onDuplicate={(id) => duplicate.mutate(id)}
      onRename={(id, label) => rename.mutate({ versionId: id, label })}
      onDelete={(id) => remove.mutate(id)}
      onSetColor={(id, color: DraftRevisionColor | null) =>
        updateMeta.mutate({ versionId: id, draftColor: color })
      }
      onCreateNew={() => createNew.mutate()}
      onDetailChange={onDetailChange}
    />
  );
}

// ─── Screenplay ───────────────────────────────────────────────────────────────

function ScreenplayVersionsContent({
  screenplayId,
  currentVersionId,
  onDetailChange,
}: {
  screenplayId: string;
  currentVersionId: string | null;
  onDetailChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { data: result, isLoading } = useScreenplayVersions(screenplayId);
  // Read the LIVE current-version pointer (not the static `?vcur` URL hint) so
  // the "Attuale" badge + the delete guard track the real active version — and
  // so "Attiva" (which now sets current_version_id) visibly moves the badge.
  const { data: currentResult } = useScreenplayCurrentVersionId(screenplayId);
  const liveCurrentId =
    currentResult?.isOk && currentResult.value
      ? currentResult.value
      : currentVersionId;
  // Attiva = restore for the screenplay: copy the version's content back onto the
  // live screenplay (the old dedicated restore route is superseded, Spec 66).
  const restore = useRestoreVersion();
  const duplicate = useDuplicateScreenplayVersion(screenplayId);
  const rename = useRenameScreenplayVersion(screenplayId);
  const remove = useDeleteScreenplayVersion(screenplayId);
  const updateMeta = useUpdateScreenplayVersionMeta(screenplayId);
  const createNew = useCreateBlankVersion();

  const versions: VersionView[] = useMemo(
    () => (result?.isOk ? result.value.map(screenplayToVersionView) : []),
    [result],
  );

  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "ScreenplayNotFoundError" }, () =>
            t("versions.split.docNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () => t("versions.split.forbidden"))
          .otherwise(() => t("versions.split.loadFailed"))
      : null;

  // The version's content is a Fountain/PM string — render it read-only with the
  // screenplay editor's own view so the detail reads like the script.
  const renderContent = (version: VersionView) => (
    <div className={styles.screenplayBody}>
      <ReadOnlyScreenplayView content={version.content} />
    </div>
  );

  return (
    <VersionsSplitDrawer
      versions={versions}
      currentVersionId={liveCurrentId}
      isLoading={isLoading}
      loadError={loadError}
      renderContent={renderContent}
      canEdit
      onActivate={(id) =>
        restore.mutate(
          { versionId: id },
          {
            // Keep the lane open so the "Attuale" badge visibly moves to the
            // restored version; confirm with a success toast. The editor
            // refetches via useRestoreVersion's own invalidation.
            onSuccess: () =>
              showToast({
                message: t("versions.split.activated"),
                variant: "success",
              }),
          },
        )
      }
      onDuplicate={(id) => {
        const v = versions.find((x) => x.id === id);
        duplicate.mutate({
          versionId: id,
          label: `${v?.label ?? t("versions.split.versionPrefix")} ${t("versions.copySuffix")}`,
        });
      }}
      onRename={(id, label) => rename.mutate({ versionId: id, label })}
      onDelete={(id) => remove.mutate({ versionId: id })}
      onSetColor={(id, color: DraftRevisionColor | null) =>
        updateMeta.mutate({ versionId: id, draftColor: color })
      }
      onCreateNew={() =>
        createNew.mutate({
          screenplayId,
          label: `${t("versions.split.versionPrefix")} ${versions.length + 1}`,
        })
      }
      // NB: createNew here is useCreateBlankVersion — a fresh empty active
      // version (foglio bianco), distinct from the import-flow checkpoint.
      onDetailChange={onDetailChange}
    />
  );
}

// ─── Lane frame ───────────────────────────────────────────────────────────────

export function VersionsSplitLane({
  peek,
  width,
  onWidthChange,
  onExpand,
  onStepBack,
  onClose,
  headerNav,
}: VersionsSplitLaneProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // The detail-open flag drives the lane width + rail collapse (Spec 66): the
  // list stays narrow, the detail widens to ~half the page. Published to the
  // shell via the context; reset on `full` (the expanded route is its own thing).
  const [detailOpen, setDetailOpen] = useState(false);
  usePublishVersionsDetail(detailOpen && peek.state !== "full");

  // #94 — this lane is a persistent in-flow column that COEXISTS with the
  // editor, not a modal the editor is behind. It used to be built as an overlay
  // dialog, and `useDialog` autofocuses its container and pulls focus back
  // whenever it lands elsewhere: the editor stayed `contenteditable`, but every
  // keystroke went to the lane, so browsing versions read exactly like a
  // read-only document. `useOverlay` also installs a global interact-outside
  // listener that swallows mousedown on portaled overlays. The Cesare peek lane
  // dropped both for the same reasons; this one now matches it.
  //
  // ESC keeps closing the lane from anywhere on the page — including while the
  // writer is typing in the editor beside it, which is exactly where focus now
  // stays — so the listener is on the document, as `useOverlay`'s was.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const state: SplitDrawerState = peek.state === "full" ? "full" : "open";

  return (
    <div
      ref={ref}
      role="region"
      aria-label={t("shell.versionsLane.aria")}
      className={styles.lane}
      data-testid="versions-split-lane"
      data-split-lane="versions"
    >
      <SplitDrawer
        state={state}
        placement="lane"
        onStateChange={(next) => {
          if (next === "closed") onClose();
          else if (next === "full") onExpand();
          else onStepBack();
        }}
        // The Versions panel has no "expand to full-screen" affordance — the
        // master→detail panes already give it room. Only offer the reduce
        // (↙) control when already in the full state; never the ↗ expand.
        onCycle={state === "full" ? onStepBack : undefined}
        onStepBack={onStepBack}
        onClose={onClose}
        header={
          <div className={styles.headerRow}>
            {headerNav}
            <h2 className={styles.title}>{t("shell.versionsLane.title")}</h2>
          </div>
        }
        size={{ width }}
        onSizeChange={({ width: next }) => onWidthChange(next)}
        ariaLabel={t("shell.versionsLane.frameAria")}
        expandLabel={t("shell.splitDrawer.expand")}
        closeLabel={t("shell.splitDrawer.close")}
        reduceLabel={t("shell.splitDrawer.reduce")}
        testId="versions-split-drawer-frame"
      >
        {peek.kind === "screenplay" ? (
          <ScreenplayVersionsContent
            screenplayId={peek.documentId}
            currentVersionId={peek.currentVersionId}
            onDetailChange={setDetailOpen}
          />
        ) : (
          <NarrativeVersionsContent
            documentId={peek.documentId}
            currentVersionId={peek.currentVersionId}
            onDetailChange={setDetailOpen}
          />
        )}
      </SplitDrawer>
    </div>
  );
}
