import { useState, useCallback, useEffect } from "react";
import type { DocumentType, DraftRevisionColor } from "@oh-writers/domain";
import { Drawer } from "./Drawer";
import { VersionsList } from "./VersionsList";
import type { VersionListItem } from "./VersionsList";
import { useVersionsDrawer } from "../context/VersionsDrawerContext";
import {
  useVersions,
  useCreateManualVersion,
  useRenameVersion,
  useDeleteVersion,
  useDuplicateVersion,
  useUpdateVersionMeta,
} from "~/features/screenplay-editor/hooks/useVersions";
import {
  useVersions as useDocVersions,
  useCreateVersionFromScratch,
  useDuplicateVersion as useDuplicateDocVersion,
  useRenameVersion as useRenameDocVersion,
  useSwitchToVersion,
  useDeleteDocumentVersion,
} from "~/features/documents/hooks/useVersions";
import { VersionCompareModal } from "~/features/documents/components/VersionCompareModal";
import type { VersionCompareItem } from "~/features/documents/components/VersionCompareModal";

// ─── Screenplay scope ─────────────────────────────────────────────────────────

function ScreenplayVersionsList({
  screenplayId,
  onSelect,
}: {
  screenplayId: string;
  onSelect?: (id: string) => void;
}) {
  const { data: result, isLoading } = useVersions(screenplayId);
  const create = useCreateManualVersion();
  const rename = useRenameVersion(screenplayId);
  const del = useDeleteVersion(screenplayId);
  const duplicate = useDuplicateVersion(screenplayId);
  const updateMeta = useUpdateVersionMeta(screenplayId);
  const [error, setError] = useState<string | null>(null);

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
        ? `${v.pageCount} ${v.pageCount === 1 ? "pagina" : "pagine"}`
        : undefined,
    draftColor: (v.draftColor ?? null) as DraftRevisionColor | null,
    draftDate: v.draftDate ?? null,
  }));

  const handleCreate = useCallback(
    (label: string) => {
      setError(null);
      create.mutate(
        { screenplayId, label },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [create, screenplayId],
  );

  const handleRename = useCallback(
    (id: string, label: string) => {
      setError(null);
      rename.mutate(
        { versionId: id, label },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [rename],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setError(null);
      del.mutate(
        { versionId: id },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [del],
  );

  const handleDuplicate = useCallback(
    (id: string, baseLabel: string) => {
      setError(null);
      const nextLabel = `${baseLabel} (copia)`;
      duplicate.mutate(
        { versionId: id, label: nextLabel },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [duplicate],
  );

  const handleUpdateColor = useCallback(
    (id: string, color: DraftRevisionColor | null) => {
      setError(null);
      updateMeta.mutate(
        { versionId: id, draftColor: color },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [updateMeta],
  );

  const handleUpdateDate = useCallback(
    (id: string, date: string | null) => {
      setError(null);
      updateMeta.mutate(
        { versionId: id, draftDate: date },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
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
}: {
  documentId: string;
  canEdit: boolean;
  initialActiveId: string | null;
}) {
  const { data: result, isLoading } = useDocVersions(documentId);
  const createScratch = useCreateVersionFromScratch(documentId);
  const duplicate = useDuplicateDocVersion(documentId);
  const rename = useRenameDocVersion(documentId);
  const switchTo = useSwitchToVersion(documentId);
  const del = useDeleteDocumentVersion(documentId);
  const [error, setError] = useState<string | null>(null);
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
      onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
    });
  }, [createScratch]);

  const handleDuplicate = useCallback(
    (id: string) => {
      setError(null);
      duplicate.mutate(id, {
        onSuccess: (v) => setActiveId(v.id),
        onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
      });
    },
    [duplicate],
  );

  const handleRename = useCallback(
    (id: string, label: string) => {
      setError(null);
      rename.mutate(
        { versionId: id, label },
        { onError: (e) => setError(e instanceof Error ? e.message : "Errore") },
      );
    },
    [rename],
  );

  const handleSelect = useCallback(
    (item: VersionListItem) => {
      if (item.id === activeId) return;
      setError(null);
      switchTo.mutate(item.id, {
        onSuccess: () => setActiveId(item.id),
        onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
      });
    },
    [switchTo, activeId],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setError(null);
      del.mutate(id, {
        onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
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
        onSelect={handleSelect}
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

const SCOPE_TITLES = {
  screenplay: "Versioni screenplay",
  logline: "Versioni logline",
  synopsis: "Versioni sinossi",
  outline: "Versioni scaletta",
  treatment: "Versioni trattamento",
} satisfies Record<"screenplay" | DocumentType, string>;

const getScopeTitle = (
  scope: NonNullable<ReturnType<typeof useVersionsDrawer>["state"]["scope"]>,
): string => {
  if (scope.kind === "screenplay") return SCOPE_TITLES.screenplay;
  return SCOPE_TITLES[scope.docType];
};

export function VersionsDrawer() {
  const { state, onSelectVersion, close, setWidth } = useVersionsDrawer();
  const { isOpen, scope, width } = state;

  const title = scope ? getScopeTitle(scope) : "Versioni";

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
        />
      )}
    </Drawer>
  );
}
