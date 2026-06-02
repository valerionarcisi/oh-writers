import { useState, useCallback, useEffect } from "react";
import { match } from "ts-pattern";
import type { DocumentType, DraftRevisionColor } from "@oh-writers/domain";
import { Drawer } from "./Drawer";
import { VersionsList } from "./VersionsList";
import type { VersionListItem } from "./VersionsList";
import {
  useVersionsDrawer,
  type VersionsDrawerDirtyHook,
} from "../context/VersionsDrawerContext";
import {
  useVersions,
  useCreateManualVersion,
  useRenameVersion,
  useDeleteVersion,
  useDuplicateVersion,
  useUpdateVersionMeta,
} from "~/features/screenplay-editor";
import {
  useDocumentVersions as useDocVersions,
  useCreateDocumentVersionFromScratch as useCreateVersionFromScratch,
  useDuplicateDocumentVersion as useDuplicateDocVersion,
  useRenameDocumentVersion as useRenameDocVersion,
  useSwitchToVersion,
  useDeleteDocumentVersion,
  VersionCompareModal,
  type VersionCompareItem,
} from "~/features/documents";
import { useConfirmDialog } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";

// ─── Screenplay scope ─────────────────────────────────────────────────────────

function ScreenplayVersionsList({
  screenplayId,
  onSelect,
}: {
  screenplayId: string;
  onSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: result, isLoading } = useVersions(screenplayId);
  const create = useCreateManualVersion();
  const rename = useRenameVersion(screenplayId);
  const del = useDeleteVersion(screenplayId);
  const duplicate = useDuplicateVersion(screenplayId);
  const updateMeta = useUpdateVersionMeta(screenplayId);
  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "VersionNotFoundError" }, () =>
            t("versions.error.versionNotFound"),
          )
          .with({ _tag: "ScreenplayNotFoundError" }, () =>
            t("versions.error.screenplayNotFound"),
          )
          .with({ _tag: "ProjectNotFoundError" }, () =>
            t("versions.error.projectNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () =>
            t("versions.error.forbidden"),
          )
          .with({ _tag: "DbError" }, () => t("versions.error.loadFailed"))
          .exhaustive()
      : null;
  const [error, setError] = useState<string | null>(loadError);
  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  const versions = result?.isOk ? result.value : [];
  const items: VersionListItem[] = versions.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt:
      typeof v.createdAt === "string"
        ? v.createdAt
        : new Date(v.createdAt).toISOString(),
    sub:
      v.pageCount != null
        ? `${v.pageCount} ${
            v.pageCount === 1
              ? t("versions.pageCountSingular")
              : t("versions.pageCountPlural")
          }`
        : undefined,
    draftColor: (v.draftColor ?? null) as DraftRevisionColor | null,
    draftDate: v.draftDate ?? null,
  }));

  const handleCreate = useCallback(
    (label: string) => {
      setError(null);
      create.mutate(
        { screenplayId, label },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [create, screenplayId],
  );

  const handleRename = useCallback(
    (id: string, label: string) => {
      setError(null);
      rename.mutate(
        { versionId: id, label },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [rename],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setError(null);
      del.mutate(
        { versionId: id },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [del],
  );

  const handleDuplicate = useCallback(
    (id: string, baseLabel: string) => {
      setError(null);
      const nextLabel = `${baseLabel} ${t("versions.copySuffix")}`;
      duplicate.mutate(
        { versionId: id, label: nextLabel },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [duplicate],
  );

  const handleUpdateColor = useCallback(
    (id: string, color: DraftRevisionColor | null) => {
      setError(null);
      updateMeta.mutate(
        { versionId: id, draftColor: color },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [updateMeta],
  );

  const handleUpdateDate = useCallback(
    (id: string, date: string | null) => {
      setError(null);
      updateMeta.mutate(
        { versionId: id, draftDate: date },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [updateMeta],
  );

  return (
    <VersionsList
      items={items}
      isLoading={isLoading}
      error={error}
      onSelect={(item) => onSelect?.(item.id)}
      onCreate={handleCreate}
      isCreating={create.isPending}
      onRename={handleRename}
      isRenaming={rename.isPending}
      onDelete={handleDelete}
      isDeleting={del.isPending}
      onDuplicate={handleDuplicate}
      isDuplicating={duplicate.isPending}
      onUpdateColor={handleUpdateColor}
      onUpdateDate={handleUpdateDate}
    />
  );
}

// ─── Document scope ───────────────────────────────────────────────────────────

function DocumentVersionsList({
  documentId,
  canEdit,
  initialActiveId,
  dirtyHook,
}: {
  documentId: string;
  canEdit: boolean;
  initialActiveId: string | null;
  dirtyHook: VersionsDrawerDirtyHook | null;
}) {
  const { t } = useTranslation();
  const { data: result, isLoading } = useDocVersions(documentId);
  const createScratch = useCreateVersionFromScratch(documentId);
  const duplicate = useDuplicateDocVersion(documentId);
  const rename = useRenameDocVersion(documentId);
  const switchTo = useSwitchToVersion(documentId);
  const del = useDeleteDocumentVersion(documentId);
  const { confirm } = useConfirmDialog();
  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "DocumentNotFoundError" }, () =>
            t("versions.error.documentNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () =>
            t("versions.error.docForbidden"),
          )
          .with({ _tag: "DbError" }, () => t("versions.error.docLoadFailed"))
          .exhaustive()
      : null;
  const [error, setError] = useState<string | null>(loadError);
  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Track active version locally so it updates immediately after a mutation.
  // Also re-sync when the prop changes (e.g. drawer re-opened after a refetch
  // brings an updated currentVersionId from the server).
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  useEffect(() => {
    setActiveId(initialActiveId);
  }, [initialActiveId]);

  const versions = result?.isOk ? result.value : [];
  const items: VersionListItem[] = versions.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt:
      typeof v.createdAt === "string"
        ? v.createdAt
        : new Date(v.createdAt).toISOString(),
  }));

  const compareItems: VersionCompareItem[] = versions.map((v) => ({
    id: v.id,
    number: v.number,
    label: v.label,
    content: v.content,
  }));

  const handleCreateFromScratch = useCallback(() => {
    setError(null);
    createScratch.mutate(undefined, {
      onSuccess: (v) => setActiveId(v.id),
      onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")),
    });
  }, [createScratch]);

  const handleDuplicate = useCallback(
    (id: string) => {
      setError(null);
      duplicate.mutate(id, {
        onSuccess: (v) => setActiveId(v.id),
        onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")),
      });
    },
    [duplicate],
  );

  const handleRename = useCallback(
    (id: string, label: string) => {
      setError(null);
      rename.mutate(
        { versionId: id, label },
        { onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")) },
      );
    },
    [rename],
  );

  const handleSelect = useCallback(
    async (item: VersionListItem) => {
      if (item.id === activeId) return;
      // If the editor has unsaved edits, switching version would silently
      // throw them away (the active doc reloads from the server). Ask first,
      // and on confirm flush so the in-progress edits are preserved as the
      // current version's last state before the pointer moves.
      if (dirtyHook?.isDirty()) {
        const save = await confirm({
          title: t("versions.unsaved.title"),
          message: t("versions.unsaved.message"),
          confirmLabel: t("versions.unsaved.save"),
          cancelLabel: t("versions.unsaved.discard"),
        });
        if (save) dirtyHook.flush();
      }
      setError(null);
      switchTo.mutate(item.id, {
        onSuccess: () => setActiveId(item.id),
        onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")),
      });
    },
    [switchTo, activeId, dirtyHook, confirm],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setError(null);
      del.mutate(id, {
        onError: (e) => setError(e instanceof Error ? e.message : t("versions.error.generic")),
      });
    },
    [del],
  );

  return (
    <>
      <VersionsList
        items={items}
        isLoading={isLoading}
        error={error}
        activeId={activeId}
        canEdit={canEdit}
        onSelect={(item) => void handleSelect(item)}
        onCreateFromScratch={canEdit ? handleCreateFromScratch : undefined}
        isCreatingFromScratch={createScratch.isPending}
        onRename={handleRename}
        isRenaming={rename.isPending}
        onDelete={handleDelete}
        isDeleting={del.isPending}
        onDuplicate={canEdit ? handleDuplicate : undefined}
        isDuplicating={duplicate.isPending}
        onCompare={items.length >= 2 ? () => setCompareOpen(true) : undefined}
      />
      {compareOpen && compareItems.length >= 2 && (
        <VersionCompareModal
          versions={compareItems}
          initialLeftId={
            compareItems.find((v) => v.id !== activeId)?.id ?? null
          }
          initialRightId={activeId}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </>
  );
}

// ─── Drawer shell ─────────────────────────────────────────────────────────────

const SCOPE_TITLE_KEYS = {
  screenplay: "versions.scope.screenplay",
  logline: "versions.scope.logline",
  soggetto: "versions.scope.soggetto",
  synopsis: "versions.scope.synopsis",
  outline: "versions.scope.outline",
  treatment: "versions.scope.treatment",
} satisfies Record<"screenplay" | DocumentType, TranslationKey>;

const getScopeTitle = (
  scope: NonNullable<ReturnType<typeof useVersionsDrawer>["state"]["scope"]>,
  t: (key: TranslationKey) => string,
): string => {
  if (scope.kind === "screenplay") return t(SCOPE_TITLE_KEYS.screenplay);
  return t(SCOPE_TITLE_KEYS[scope.docType]);
};

export function VersionsDrawer() {
  const { t } = useTranslation();
  const { state, onSelectVersion, dirtyHook, close, setWidth } =
    useVersionsDrawer();
  const { isOpen, scope, width } = state;

  const title = scope ? getScopeTitle(scope, t) : t("versions.scope.fallback");

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      title={title}
      width={width}
      onWidthChange={setWidth}
      data-testid="versions-drawer"
    >
      {scope?.kind === "screenplay" && (
        <ScreenplayVersionsList
          screenplayId={scope.screenplayId}
          onSelect={onSelectVersion ?? undefined}
        />
      )}
      {scope?.kind === "document" && (
        <DocumentVersionsList
          documentId={scope.documentId}
          canEdit={scope.canEdit}
          initialActiveId={scope.currentVersionId}
          dirtyHook={dirtyHook}
        />
      )}
    </Drawer>
  );
}
