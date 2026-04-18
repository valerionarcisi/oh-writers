import { useState, useCallback } from "react";
import type { DocumentType } from "@oh-writers/domain";
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
} from "~/features/screenplay-editor/hooks/useVersions";
import {
  useDocumentVersions,
  useCreateDocumentVersion,
  useRenameDocumentVersion,
  useDeleteDocumentVersion,
} from "../hooks/useDocumentVersions";

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
    />
  );
}

// ─── Document scope ───────────────────────────────────────────────────────────

function DocumentVersionsList({ documentId }: { documentId: string }) {
  const { data: result, isLoading } = useDocumentVersions(documentId);
  const create = useCreateDocumentVersion(documentId);
  const rename = useRenameDocumentVersion(documentId);
  const del = useDeleteDocumentVersion(documentId);
  const [error, setError] = useState<string | null>(null);

  const versions = result?.isOk ? result.value : [];
  const items: VersionListItem[] = versions.map((v) => ({
    id: v.id,
    label: v.label,
    createdAt: v.createdAt,
  }));

  const handleCreate = useCallback(
    (label: string) => {
      setError(null);
      create.mutate(label, {
        onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
      });
    },
    [create],
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
      del.mutate(id, {
        onError: (e) => setError(e instanceof Error ? e.message : "Errore"),
      });
    },
    [del],
  );

  // Document versions are ordered desc by createdAt — the first row is
  // the most recent snapshot of the live document and we treat it as active.
  const activeId = items[0]?.id ?? null;

  return (
    <VersionsList
      items={items}
      isLoading={isLoading}
      error={error}
      activeId={activeId}
      onCreate={handleCreate}
      isCreating={create.isPending}
      onRename={handleRename}
      isRenaming={rename.isPending}
      onDelete={handleDelete}
      isDeleting={del.isPending}
    />
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
        <DocumentVersionsList documentId={scope.documentId} />
      )}
    </Drawer>
  );
}
