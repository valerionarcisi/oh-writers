// apps/web/app/features/versions/components/VersionsSplitDrawer.tsx
//
// Versions in the routed SplitDrawer (Spec 49 W2). A THIN consumer of the
// `SplitDrawer` primitive: the left lane lists the document's versions, the
// right lane shows the selected version and its diff against the current
// version ("vs current" mode — the default and only mode in W2; side-by-side
// compare lands in W3).
//
// This component is pure presentation + the read-only version query. It owns NO
// open/close routing — the host (AppShell) wires the SplitDrawer state controls
// (`↗` expand → real navigation, `↙` step-back, `×` close) to the routed
// surface so the URL stays the single source of truth (Spec 49). All version
// data arrives via `useDocumentVersions` (a `createServerFn` read) — no client
// DB access.

import { useMemo, useState, useEffect } from "react";
import { match } from "ts-pattern";
import { buildSideBySideDiff } from "@oh-writers/utils";
import type { DiffRow, DiffSegment } from "@oh-writers/utils";
import { Skeleton } from "@oh-writers/ui";
import { useDocumentVersions } from "~/features/documents";
import styles from "./VersionsSplitDrawer.module.css";

export interface VersionsSplitDrawerProps {
  /** The document whose versions are listed. */
  readonly documentId: string;
  /** The document's current (active) version id — the "vs current" baseline. */
  readonly currentVersionId: string | null;
}

interface VersionRow {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  readonly createdAt: string;
  readonly content: string;
}

const formatCreatedAt = (iso: string): string =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const versionTitle = (v: VersionRow): string =>
  v.label && v.label.length > 0
    ? `${v.label} (v${v.number})`
    : `Versione ${v.number}`;

export function VersionsSplitDrawer({
  documentId,
  currentVersionId,
}: VersionsSplitDrawerProps) {
  const { data: result, isLoading } = useDocumentVersions(documentId);

  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with(
            { _tag: "DocumentNotFoundError" },
            () => "Documento non trovato.",
          )
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

  const versions: VersionRow[] = useMemo(
    () =>
      result?.isOk
        ? result.value.map((v) => ({
            id: v.id,
            number: v.number,
            label: v.label,
            createdAt:
              typeof v.createdAt === "string"
                ? v.createdAt
                : new Date(v.createdAt).toISOString(),
            content: v.content,
          }))
        : [],
    [result],
  );

  // Default the selection to the most recent NON-current version so the diff is
  // immediately meaningful; fall back to the current version (empty diff) when
  // it is the only one.
  const defaultSelectedId = useMemo(() => {
    if (versions.length === 0) return null;
    const firstNonCurrent = versions.find((v) => v.id !== currentVersionId);
    return (firstNonCurrent ?? versions[0])?.id ?? null;
  }, [versions, currentVersionId]);

  const [selectedId, setSelectedId] = useState<string | null>(
    defaultSelectedId,
  );
  useEffect(() => {
    setSelectedId(defaultSelectedId);
  }, [defaultSelectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const current = versions.find((v) => v.id === currentVersionId) ?? null;

  // "vs current": left = the selected (older) version, right = the current one,
  // so additions/removals read in the same direction as the document timeline.
  const rows: DiffRow[] = useMemo(
    () =>
      selected && current
        ? buildSideBySideDiff(selected.content, current.content)
        : [],
    [selected, current],
  );

  return (
    <div className={styles.root} data-testid="versions-split-drawer">
      <div className={styles.list} data-testid="versions-split-list">
        {isLoading && (
          <div className={styles.status}>
            <Skeleton
              lines={4}
              widths={["70%", "100%", "60%", "100%"]}
              ariaLabel="Caricamento versioni"
            />
          </div>
        )}
        {loadError && (
          <div className={styles.error} role="alert">
            {loadError}
          </div>
        )}
        {!isLoading && !loadError && versions.length === 0 && (
          <div className={styles.empty}>Nessuna versione salvata.</div>
        )}
        {!isLoading && versions.length > 0 && (
          <ul className={styles.versionList}>
            {versions.map((v) => {
              const isCurrent = v.id === currentVersionId;
              const isSelected = v.id === selectedId;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`${styles.versionRow} ${
                      isSelected ? styles.versionRowActive : ""
                    }`}
                    onClick={() => setSelectedId(v.id)}
                    data-testid={`versions-split-row-${v.id}`}
                    data-selected={isSelected || undefined}
                    aria-pressed={isSelected}
                  >
                    <span className={styles.versionLabel}>
                      {versionTitle(v)}
                    </span>
                    {isCurrent && (
                      <span
                        className={styles.badgeCurrent}
                        data-testid={`versions-split-current-${v.id}`}
                      >
                        Attuale
                      </span>
                    )}
                    <span className={styles.versionMeta}>
                      {formatCreatedAt(v.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.detail} data-testid="versions-split-detail">
        {selected && current ? (
          <>
            <div className={styles.detailHeader}>
              <span className={styles.detailTitle}>
                {versionTitle(selected)}
              </span>
              <span className={styles.detailMode}>
                rispetto alla versione attuale
              </span>
            </div>
            <div className={styles.diff} data-testid="versions-split-diff">
              {rows.length === 0 ? (
                <p className={styles.empty}>
                  {selected.id === current.id
                    ? "Questa è la versione attuale."
                    : "Nessuna differenza."}
                </p>
              ) : (
                <table className={styles.diffTable}>
                  <tbody>
                    {rows.map((row, i) => (
                      <DiffRowView key={i} row={row} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          !isLoading && (
            <p className={styles.empty}>
              Seleziona una versione per confrontarla.
            </p>
          )
        )}
      </div>
    </div>
  );
}

function DiffRowView({ row }: { row: DiffRow }) {
  const cellClass = `${styles.cell} ${styles[`cell-${row.kind}`] ?? ""}`;
  return (
    <tr>
      <td className={cellClass}>{renderSegments(row.left)}</td>
      <td className={cellClass}>{renderSegments(row.right)}</td>
    </tr>
  );
}

function renderSegments(segments: readonly DiffSegment[] | null) {
  if (!segments) return <span className={styles.cellEmpty}>&nbsp;</span>;
  if (segments.length === 0) return <span>&nbsp;</span>;
  return segments.map((seg, i) => (
    <span
      key={i}
      className={seg.changed ? styles.intra : undefined}
      data-diff-changed={seg.changed || undefined}
    >
      {seg.text || " "}
    </span>
  ));
}
