// apps/web/app/features/versions/components/VersionsSplitDrawer.tsx
//
// Versions in the routed SplitDrawer (Spec 49 W2 + W3). A THIN consumer of the
// `SplitDrawer` primitive with TWO compare modes, switched by a segmented
// control:
//   - "vs current" (default, W2): the left lane lists the document's versions,
//     the right lane shows the selected version vs the current one.
//   - "Confronta" (W3): pick any TWO versions → render them side-by-side
//     (old | new) with word-level diff between them. The picked pair is
//     reflected in the URL as `?compare=<a>,<b>` so the compare is deep-linkable.
//
// This component is pure presentation + the read-only version query. It owns NO
// open/close routing — the host (AppShell) wires the SplitDrawer state controls
// (`↗` expand → real navigation, `↙` step-back, `×` close) to the routed
// surface so the URL stays the single source of truth (Spec 49). The compare
// pair likewise flows up via `onCompareChange` so the host patches `?compare=`.
// All version data arrives via `useDocumentVersions` (a `createServerFn` read) —
// no client DB access.

import { useMemo, useState, useEffect } from "react";
import { match } from "ts-pattern";
import { buildSideBySideDiff } from "@oh-writers/utils";
import type { DiffRow, DiffSegment } from "@oh-writers/utils";
import { Skeleton, SegmentedControl } from "@oh-writers/ui";
import type { TranslationKey, Locale } from "@oh-writers/domain";
import { formatDateTime } from "@oh-writers/domain";
import type { VersionsCompare } from "~/features/app-shell";
import { useDocumentVersions } from "~/features/documents";
import { useTranslation } from "~/features/i18n";
import { resolveCurrentVersionId } from "../vs-current-baseline";
import styles from "./VersionsSplitDrawer.module.css";

type Translate = (key: TranslationKey) => string;

export interface VersionsSplitDrawerProps {
  /** The document whose versions are listed. */
  readonly documentId: string;
  /** The document's current (active) version id — the "vs current" baseline. */
  readonly currentVersionId: string | null;
  /**
   * The validated `?compare=` pair (Spec 49 W3) or `null` for the default
   * "vs current" mode. When set AND both ids resolve to versions of this
   * document, the drawer renders the 2-version side-by-side compare.
   */
  readonly compare?: VersionsCompare | null;
  /**
   * Patch the `?compare=` companion param. `null` drops it (back to "vs
   * current"). The host wires this to the routed surface (replace, no history
   * pollution).
   */
  readonly onCompareChange?: (next: VersionsCompare | null) => void;
}

interface VersionRow {
  readonly id: string;
  readonly number: number;
  readonly label: string | null;
  readonly createdAt: string;
  readonly content: string;
}

type CompareMode = "current" | "compare";

const formatCreatedAt = (iso: string, locale: Locale): string =>
  formatDateTime(new Date(iso), locale);

const versionTitle = (v: VersionRow, t: Translate): string =>
  v.label && v.label.length > 0
    ? `${v.label} (v${v.number})`
    : `${t("versions.split.versionPrefix")} ${v.number}`;

/**
 * Order a picked pair chronologically (older `a` → newer `b`) using the version
 * numbers, so the side-by-side reads old | new in the document's timeline
 * direction regardless of the click order.
 */
const orderPair = (first: VersionRow, second: VersionRow): VersionsCompare => {
  const [older, newer] =
    first.number <= second.number ? [first, second] : [second, first];
  return { a: older.id, b: newer.id };
};

export function VersionsSplitDrawer({
  documentId,
  currentVersionId,
  compare = null,
  onCompareChange,
}: VersionsSplitDrawerProps) {
  const { t, locale } = useTranslation();
  const { data: result, isLoading } = useDocumentVersions(documentId);
  const modeOptions: ReadonlyArray<{ id: CompareMode; label: string }> = [
    { id: "current", label: t("versions.split.modeCurrent") },
    { id: "compare", label: t("versions.split.modeCompare") },
  ];

  const loadError: string | null =
    result && !result.isOk
      ? match(result.error)
          .with({ _tag: "DocumentNotFoundError" }, () =>
            t("versions.split.docNotFound"),
          )
          .with({ _tag: "ForbiddenError" }, () => t("versions.split.forbidden"))
          .with({ _tag: "DbError" }, () => t("versions.split.loadFailed"))
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

  const byId = useMemo(
    () => new Map(versions.map((v) => [v.id, v] as const)),
    [versions],
  );

  // The "vs current" baseline. `currentVersionId` arrives from the optional
  // `?vcur=` companion and is `null` on a bare `?versions=` deep-link. In that
  // case resolve the baseline to the document's CURRENT active version (the most
  // recent one) so the vs-current diff renders immediately on a bare deep-link
  // instead of stalling on "Seleziona una versione" (audit F-A1). A `?vcur=`
  // override that resolves to a real version always wins (Spec 49).
  const effectiveCurrentVersionId = useMemo<string | null>(
    () => resolveCurrentVersionId(versions, currentVersionId),
    [versions, currentVersionId],
  );

  // The `?compare=` pair is honoured only when BOTH ids resolve to versions of
  // THIS document (the same-document guard the param itself cannot enforce). An
  // unresolved pair is dropped → fall back to "vs current". We wait for the
  // versions to load before judging so a deep-link doesn't flicker out.
  const resolvedCompare = useMemo<VersionsCompare | null>(() => {
    if (!compare) return null;
    if (versions.length === 0) return null;
    return byId.has(compare.a) && byId.has(compare.b) ? compare : null;
  }, [compare, byId, versions.length]);

  // ── "vs current" selection ──────────────────────────────────────────────────
  // Default the selection to the most recent NON-current version so the diff is
  // immediately meaningful; fall back to the current version (empty diff) when
  // it is the only one.
  const defaultSelectedId = useMemo(() => {
    if (versions.length === 0) return null;
    const firstNonCurrent = versions.find(
      (v) => v.id !== effectiveCurrentVersionId,
    );
    return (firstNonCurrent ?? versions[0])?.id ?? null;
  }, [versions, effectiveCurrentVersionId]);

  const [selectedId, setSelectedId] = useState<string | null>(
    defaultSelectedId,
  );
  useEffect(() => {
    setSelectedId(defaultSelectedId);
  }, [defaultSelectedId]);

  // ── Mode + "Confronta" pick-2 selection ──────────────────────────────────────
  // `mode` is local UI state so the toggle switches the visible pane IMMEDIATELY,
  // before two versions are picked. The URL `?compare=` is the deep-link mirror:
  // it is written only once a full pair exists, and a deep-linked pair forces the
  // mode to "compare" + hydrates the picks on load. The picks (not the URL) drive
  // the rendered diff, so the side-by-side appears the moment two rows are chosen.
  const [mode, setMode] = useState<CompareMode>(
    resolvedCompare ? "compare" : "current",
  );
  const [picks, setPicks] = useState<readonly string[]>(
    resolvedCompare ? [resolvedCompare.a, resolvedCompare.b] : [],
  );
  useEffect(() => {
    if (resolvedCompare) {
      setMode("compare");
      setPicks([resolvedCompare.a, resolvedCompare.b]);
    }
  }, [resolvedCompare]);

  const handleModeChange = (next: CompareMode) => {
    if (next === mode) return;
    setMode(next);
    // Always start the compare from an empty pick set so the two A/B choices are
    // explicit; leaving compare clears any pending pair from the URL.
    setPicks([]);
    if (next === "current") onCompareChange?.(null);
  };

  const togglePick = (id: string) => {
    // Toggle membership, capped at two. Picking a third drops the oldest pick so
    // the most recent two clicks always win (Notion-like rolling selection).
    const has = picks.includes(id);
    const nextPicks = has
      ? picks.filter((p) => p !== id)
      : picks.length < 2
        ? [...picks, id]
        : [picks[1]!, id];
    setPicks(nextPicks);
    if (nextPicks.length === 2) {
      const first = byId.get(nextPicks[0]!);
      const second = byId.get(nextPicks[1]!);
      if (first && second) onCompareChange?.(orderPair(first, second));
    } else {
      // Dropping below two clears the URL compare so the surface doesn't keep a
      // stale pair while the user re-picks.
      onCompareChange?.(null);
    }
  };

  // ── Diff sources ─────────────────────────────────────────────────────────────
  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const current =
    versions.find((v) => v.id === effectiveCurrentVersionId) ?? null;
  // In compare mode the rendered pair comes from the LOCAL picks (ordered
  // old → new), so the diff appears as soon as two rows are chosen — independent
  // of the URL write. The URL only mirrors a completed pair for deep-linking.
  const orderedPicks = useMemo<VersionsCompare | null>(() => {
    if (picks.length !== 2) return null;
    const first = byId.get(picks[0]!);
    const second = byId.get(picks[1]!);
    return first && second ? orderPair(first, second) : null;
  }, [picks, byId]);
  const compareLeft = orderedPicks ? (byId.get(orderedPicks.a) ?? null) : null;
  const compareRight = orderedPicks ? (byId.get(orderedPicks.b) ?? null) : null;

  // "vs current": left = the selected (older) version, right = the current one.
  // "compare": left = the older picked version, right = the newer one. Both read
  // additions/removals in the document timeline direction.
  const rows: DiffRow[] = useMemo(() => {
    if (mode === "compare") {
      return compareLeft && compareRight
        ? buildSideBySideDiff(compareLeft.content, compareRight.content)
        : [];
    }
    return selected && current
      ? buildSideBySideDiff(selected.content, current.content)
      : [];
  }, [mode, compareLeft, compareRight, selected, current]);

  const isRowActive = (id: string): boolean =>
    mode === "compare" ? picks.includes(id) : id === selectedId;

  const pickIndex = (id: string): number => picks.indexOf(id);

  return (
    <div className={styles.root} data-testid="versions-split-drawer">
      <div className={styles.list} data-testid="versions-split-list">
        {!isLoading && !loadError && versions.length > 0 && (
          <div className={styles.modeBar}>
            <SegmentedControl<CompareMode>
              options={modeOptions}
              activeId={mode}
              onSelect={handleModeChange}
              ariaLabel={t("versions.split.modeAria")}
            />
          </div>
        )}
        {isLoading && (
          <div className={styles.status}>
            <Skeleton
              lines={4}
              widths={["70%", "100%", "60%", "100%"]}
              ariaLabel={t("versions.split.loading")}
            />
          </div>
        )}
        {loadError && (
          <div className={styles.error} role="alert">
            {loadError}
          </div>
        )}
        {!isLoading && !loadError && versions.length === 0 && (
          <div className={styles.empty}>{t("versions.split.empty")}</div>
        )}
        {!isLoading && versions.length > 0 && (
          <ul className={styles.versionList}>
            {versions.map((v) => {
              const isCurrent = v.id === effectiveCurrentVersionId;
              const isActive = isRowActive(v.id);
              const idx = mode === "compare" ? pickIndex(v.id) : -1;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`${styles.versionRow} ${
                      isActive ? styles.versionRowActive : ""
                    }`}
                    onClick={() =>
                      mode === "compare"
                        ? togglePick(v.id)
                        : setSelectedId(v.id)
                    }
                    data-testid={`versions-split-row-${v.id}`}
                    data-selected={isActive || undefined}
                    aria-pressed={isActive}
                  >
                    {idx >= 0 && (
                      <span
                        className={styles.pickBadge}
                        data-testid={`versions-split-pick-${v.id}`}
                      >
                        {idx === 0 ? "A" : "B"}
                      </span>
                    )}
                    <span className={styles.versionLabel}>
                      {versionTitle(v, t)}
                    </span>
                    {isCurrent && (
                      <span
                        className={styles.badgeCurrent}
                        data-testid={`versions-split-current-${v.id}`}
                      >
                        {t("versions.split.badgeCurrent")}
                      </span>
                    )}
                    <span className={styles.versionMeta}>
                      {formatCreatedAt(v.createdAt, locale)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.detail} data-testid="versions-split-detail">
        {mode === "compare" ? (
          <CompareDetail
            left={compareLeft}
            right={compareRight}
            picks={picks}
            rows={rows}
            t={t}
          />
        ) : selected && current ? (
          <>
            <div className={styles.detailHeader}>
              <span className={styles.detailTitle}>
                {versionTitle(selected, t)}
              </span>
              <span className={styles.detailMode}>
                {t("versions.split.vsCurrent")}
              </span>
            </div>
            <div className={styles.diff} data-testid="versions-split-diff">
              {rows.length === 0 ? (
                <p className={styles.empty}>
                  {selected.id === current.id
                    ? t("versions.split.isCurrent")
                    : t("versions.split.noDifference")}
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
              {t("versions.split.selectToCompare")}
            </p>
          )
        )}
      </div>
    </div>
  );
}

interface CompareDetailProps {
  readonly left: VersionRow | null;
  readonly right: VersionRow | null;
  readonly picks: readonly string[];
  readonly rows: DiffRow[];
  readonly t: Translate;
}

function CompareDetail({ left, right, picks, rows, t }: CompareDetailProps) {
  if (!left || !right) {
    return (
      <p className={styles.empty} data-testid="versions-split-compare-prompt">
        {picks.length === 0
          ? t("versions.split.selectTwo")
          : t("versions.split.selectSecond")}
      </p>
    );
  }
  return (
    <>
      <div className={styles.detailHeader}>
        <span className={styles.detailTitle}>{versionTitle(left, t)}</span>
        <span className={styles.detailMode}>
          {t("versions.split.comparedWith")}
        </span>
        <span className={styles.detailTitle}>{versionTitle(right, t)}</span>
      </div>
      <div className={styles.diff} data-testid="versions-split-diff">
        {rows.length === 0 ? (
          <p className={styles.empty}>{t("versions.split.noDifference")}</p>
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
      {seg.text || " "}
    </span>
  ));
}
