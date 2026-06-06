// apps/web/app/features/app-shell/components/VersionsSplitLane.tsx
//
// The routed Versions SplitDrawer lane (Spec 49 routing + Spec 66 master→detail).
// Mounted at the shell level as the third grid column when `?versions=<documentId>`
// is set on the host route. The host page stays mounted and COMPRESSES (the main
// lane reflows narrower) — the Notion side-peek model, NOT a floating overlay.
//
// The routed Versions surface is opened only for NARRATIVE documents today (the
// screenplay keeps its own inline VersionsPanel). So this lane binds the
// narrative version hooks + a narrative (HTML) read-only renderer and feeds the
// editor-agnostic master→detail `VersionsSplitDrawer`. When the screenplay starts
// opening the routed surface (Spec 66 phase 5/6) a kind branch is added here.
//
// State is driven entirely by the URL (the routed-surface single source of truth,
// Spec 49): `?versions=<id>` → open (split); `?vstate=full` → full; param dropped
// → closed. `↗` is a REAL navigation so the URL stays shareable.

import { useMemo, useRef } from "react";
import { useDialog, useOverlay, FocusScope } from "react-aria";
import { match } from "ts-pattern";
import { SplitDrawer } from "@oh-writers/ui";
import type { SplitDrawerState } from "@oh-writers/ui";
import type { DraftRevisionColor } from "@oh-writers/domain";
import {
  VersionsSplitDrawer,
  narrativeToVersionView,
} from "~/features/versions";
import type { VersionView } from "~/features/versions";
import {
  useDocumentVersions,
  useSwitchToVersion,
  useDuplicateDocumentVersion,
  useRenameDocumentVersion,
  useUpdateDocumentVersionMeta,
  useCreateDocumentVersionFromScratch,
} from "~/features/documents";
import { useTranslation } from "~/features/i18n";
import type { VersionsPeek } from "../versions-peek";
import styles from "./VersionsSplitLane.module.css";

export interface VersionsSplitLaneProps {
  /** The validated routed Versions target (document + state + baseline). */
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
}

export function VersionsSplitLane({
  peek,
  width,
  onWidthChange,
  onExpand,
  onStepBack,
  onClose,
}: VersionsSplitLaneProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const documentId = peek.documentId;

  const { data: result, isLoading } = useDocumentVersions(documentId);
  const activate = useSwitchToVersion(documentId);
  const duplicate = useDuplicateDocumentVersion(documentId);
  const rename = useRenameDocumentVersion(documentId);
  const updateMeta = useUpdateDocumentVersionMeta(documentId);
  const createNew = useCreateDocumentVersionFromScratch(documentId);

  const versions: VersionView[] = useMemo(
    () =>
      result?.isOk
        ? result.value.map((row) => narrativeToVersionView(row))
        : [],
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

  // The read-only detail body: the version's canonical narrative HTML rendered
  // like the editor. (Screenplay would branch to ReadOnlyScreenplayView here.)
  const renderContent = (version: VersionView) => (
    <div
      className={styles.narrativeBody}
      // The content is the editor's own canonical, sanitised narrative HTML
      // (server-owned, never user-pasted raw), rendered read-only.
      dangerouslySetInnerHTML={{ __html: version.content }}
    />
  );

  const { overlayProps } = useOverlay(
    {
      onClose,
      isOpen: true,
      isDismissable: true,
      shouldCloseOnInteractOutside: () => false,
    },
    ref,
  );
  const { dialogProps } = useDialog(
    { "aria-label": t("shell.versionsLane.aria") },
    ref,
  );

  const state: SplitDrawerState = peek.state === "full" ? "full" : "open";

  return (
    <FocusScope>
      <div
        {...overlayProps}
        {...dialogProps}
        ref={ref}
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
          onCycle={state === "full" ? onStepBack : onExpand}
          onStepBack={onStepBack}
          onClose={onClose}
          header={
            <h2 className={styles.title}>{t("shell.versionsLane.title")}</h2>
          }
          size={{ width }}
          onSizeChange={({ width: next }) => onWidthChange(next)}
          ariaLabel={t("shell.versionsLane.frameAria")}
          expandLabel={t("shell.splitDrawer.expand")}
          closeLabel={t("shell.splitDrawer.close")}
          reduceLabel={t("shell.splitDrawer.reduce")}
          testId="versions-split-drawer-frame"
        >
          <VersionsSplitDrawer
            versions={versions}
            currentVersionId={peek.currentVersionId}
            isLoading={isLoading}
            loadError={loadError}
            renderContent={renderContent}
            canEdit
            onActivate={(id) => activate.mutate(id)}
            onDuplicate={(id) => duplicate.mutate(id)}
            onRename={(id, label) => rename.mutate({ versionId: id, label })}
            onSetColor={(id, color: DraftRevisionColor | null) =>
              updateMeta.mutate({ versionId: id, draftColor: color })
            }
            onCreateNew={() => createNew.mutate()}
          />
        </SplitDrawer>
      </div>
    </FocusScope>
  );
}
