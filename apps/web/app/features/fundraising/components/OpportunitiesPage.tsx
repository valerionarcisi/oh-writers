import { useState, useCallback, Suspense } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Skeleton } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type {
  FundraisingSaveState,
  FundraisingOpportunityKind,
} from "@oh-writers/db/schema";
import {
  opportunitiesQueryOptions,
  type OpportunitiesFilters,
} from "../fundraising.queries";
import { saveOpportunity } from "../server/fundraising.server";
import type { OpportunityWithSave } from "../server/fundraising.server";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityDrawer } from "./OpportunityDrawer";
import styles from "./OpportunitiesPage.module.css";

const STATUS_OPTIONS: Array<{
  value: OpportunitiesFilters["status"];
  labelKey: TranslationKey;
}> = [
  { value: "active", labelKey: "fundraising.status.active" },
  { value: "expired", labelKey: "fundraising.status.expired" },
  { value: undefined, labelKey: "fundraising.status.all" },
];

const DEADLINE_OPTIONS: Array<{
  value: OpportunitiesFilters["deadlineWithin"];
  labelKey: TranslationKey;
}> = [
  { value: "30d", labelKey: "fundraising.deadline.30d" },
  { value: "90d", labelKey: "fundraising.deadline.90d" },
  { value: "any", labelKey: "fundraising.deadline.any" },
];

const KIND_OPTIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "", labelKey: "fundraising.kind.all" },
  { value: "bando_pubblico", labelKey: "fundraising.kind.bando_pubblico" },
  { value: "call_festival", labelKey: "fundraising.kind.call_festival" },
  { value: "residenza", labelKey: "fundraising.kind.residenza" },
  { value: "grant_privato", labelKey: "fundraising.kind.grant_privato" },
  { value: "workshop", labelKey: "fundraising.kind.workshop" },
  { value: "pitch_forum", labelKey: "fundraising.kind.pitch_forum" },
];

function activeFilterCount(filters: OpportunitiesFilters): number {
  let count = 0;
  if (filters.kind && filters.kind.length > 0) count++;
  if (filters.status) count++;
  if (filters.deadlineWithin && filters.deadlineWithin !== "any") count++;
  return count;
}

interface OpportunitiesListProps {
  projectId: string;
  filters: OpportunitiesFilters;
  selectedId: string | null;
  onSelect: (opp: OpportunityWithSave) => void;
  onSave: (opportunityId: string, state: FundraisingSaveState) => void;
}

function OpportunitiesList({
  projectId,
  filters,
  selectedId,
  onSelect,
  onSave,
}: OpportunitiesListProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(
    opportunitiesQueryOptions(projectId, filters),
  );
  const opportunities = data?.isOk ? data.value : [];

  if (opportunities.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>
          {t("fundraising.list.empty.title")}
        </div>
        <div className={styles.emptySubtext}>
          {t("fundraising.list.empty.subtitle")}
        </div>
      </div>
    );
  }

  return (
    <ul className={styles.list} data-testid="opportunities-list">
      {opportunities.map((opp) => (
        <OpportunityCard
          key={opp.id}
          opportunity={opp}
          isSelected={selectedId === opp.id}
          onSelect={() => onSelect(opp)}
          onSave={(state) => onSave(opp.id, state)}
        />
      ))}
    </ul>
  );
}

function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <ul className={styles.skeletonList}>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className={styles.skeletonCard}>
          <Skeleton
            lines={4}
            widths={["60%", "80%", "100%", "45%"]}
            ariaLabel={t("fundraising.list.loading")}
          />
        </li>
      ))}
    </ul>
  );
}

interface OpportunitiesPageProps {
  projectId: string;
}

export function OpportunitiesPage({ projectId }: OpportunitiesPageProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<OpportunitiesFilters>({
    status: "active",
  });
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<OpportunityWithSave | null>(null);
  const [selectedKind, setSelectedKind] = useState<string>("");

  const saveMutation = useMutation({
    mutationFn: (vars: {
      opportunityId: string;
      projectId: string;
      state: FundraisingSaveState;
      notes?: string;
    }) => saveOpportunity({ data: vars }).then(unwrapResult),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fundraising", projectId] });
    },
  });

  const handleSave = useCallback(
    (opportunityId: string, state: FundraisingSaveState) => {
      // Toggle: if already saved with same state, no re-save (UI keeps it active)
      saveMutation.mutate({ opportunityId, projectId, state });
    },
    [projectId, saveMutation],
  );

  const handleNotesBlur = useCallback(
    (notes: string) => {
      if (!selectedOpportunity) return;
      const state = selectedOpportunity.saveState ?? "saved";
      saveMutation.mutate({
        opportunityId: selectedOpportunity.id,
        projectId,
        state,
        notes,
      });
    },
    [selectedOpportunity, projectId, saveMutation],
  );

  const handleKindChip = (kindValue: string) => {
    setSelectedKind(kindValue);
    if (!kindValue) {
      setFilters((f) => ({ ...f, kind: undefined }));
    } else {
      setFilters((f) => ({
        ...f,
        kind: [kindValue as FundraisingOpportunityKind],
      }));
    }
  };

  const filterCount = activeFilterCount(filters);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        {/* Filter rail */}
        <aside className={styles.filterRail}>
          <div className={styles.filterHeading}>
            {t("fundraising.filter.heading")}
            {filterCount > 0 && (
              <span className={styles.filterBadge}>{filterCount}</span>
            )}
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>
              {t("fundraising.filter.kind")}
            </div>
            <div className={styles.filterChips}>
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={styles.chip}
                  data-active={selectedKind === opt.value}
                  onClick={() => handleKindChip(opt.value)}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>
              {t("fundraising.filter.status")}
            </div>
            <div className={styles.filterChips}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={styles.chip}
                  data-active={filters.status === opt.value}
                  data-testid={`filter-status-${opt.value ?? "all"}`}
                  onClick={() =>
                    setFilters((f) => ({ ...f, status: opt.value }))
                  }
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>
              {t("fundraising.filter.deadline")}
            </div>
            <div className={styles.filterChips}>
              {DEADLINE_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={styles.chip}
                  data-active={
                    (filters.deadlineWithin ?? "any") === (opt.value ?? "any")
                  }
                  onClick={() =>
                    setFilters((f) => ({ ...f, deadlineWithin: opt.value }))
                  }
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* List column */}
        <div className={styles.listColumn}>
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>
              {t("fundraising.list.title")}
            </div>
          </div>
          <Suspense fallback={<ListSkeleton />}>
            <OpportunitiesList
              projectId={projectId}
              filters={filters}
              selectedId={selectedOpportunity?.id ?? null}
              onSelect={setSelectedOpportunity}
              onSave={handleSave}
            />
          </Suspense>
        </div>

        {/* Detail drawer */}
        <OpportunityDrawer
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          onSave={(state) => {
            if (selectedOpportunity) handleSave(selectedOpportunity.id, state);
          }}
          onNotesBlur={handleNotesBlur}
        />
      </div>
    </div>
  );
}
