import { useNavigate } from "@tanstack/react-router";
import type {
  DocumentSummary,
  ScreenplaySummary,
  BreakdownSummary,
  BudgetSummary,
  ScheduleSummary,
} from "../../server/project-overview.server";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import styles from "./ProjectPipeline.module.css";

type NodeStatus = "done" | "current" | "todo";

interface PipelineNode {
  readonly key: string;
  readonly label: string;
  readonly status: NodeStatus;
  readonly href: string;
}

interface ProjectPipelineProps {
  readonly projectId: string;
  readonly documents: DocumentSummary[];
  readonly screenplay: ScreenplaySummary | null;
  readonly breakdown: BreakdownSummary;
  readonly budget: BudgetSummary;
  readonly schedule: ScheduleSummary;
}

const DOC_LABELS: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
};

const docStatus = (
  documents: DocumentSummary[],
  type: DocumentType,
  firstIncomplete: DocumentType | null,
): NodeStatus => {
  const doc = documents.find((d) => d.type === type);
  if (doc?.hasContent) return "done";
  if (firstIncomplete === type) return "current";
  return "todo";
};

export function ProjectPipeline({
  projectId,
  documents,
  screenplay,
  breakdown,
  budget,
  schedule,
}: ProjectPipelineProps) {
  const narrativeOrder: DocumentType[] = [
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ];
  const firstIncomplete =
    narrativeOrder.find(
      (t) => !documents.find((d) => d.type === t)?.hasContent,
    ) ?? null;

  const allNarrativeDone = firstIncomplete === null;

  const screenplayStatus: NodeStatus = (() => {
    if (!screenplay || screenplay.pageCount === 0) {
      return allNarrativeDone ? "current" : "todo";
    }
    // A screenplay with 0 scenes is still in progress.
    if (screenplay.sceneCount === 0) return "current";
    // Once the breakdown has started, screenplay is "done" for pipeline purposes.
    return breakdown.hasAny ? "done" : "current";
  })();

  const breakdownStatus: NodeStatus = breakdown.hasAny
    ? breakdown.scenesBrokenDown >= breakdown.totalScenes && breakdown.totalScenes > 0
      ? "done"
      : "current"
    : screenplayStatus === "done"
      ? "current"
      : "todo";

  const budgetStatus: NodeStatus = budget.hasAny
    ? budget.status === "locked"
      ? "done"
      : "current"
    : breakdownStatus === "done"
      ? "current"
      : "todo";

  const scheduleStatus: NodeStatus = schedule.hasAny
    ? schedule.scheduledScenes >= schedule.totalScenes &&
      schedule.totalScenes > 0
      ? "done"
      : "current"
    : budgetStatus === "done"
      ? "current"
      : "todo";

  const nodes: PipelineNode[] = [
    ...narrativeOrder.map((t) => ({
      key: t,
      label: DOC_LABELS[t],
      status: docStatus(documents, t, firstIncomplete),
      href: `/projects/${projectId}/${t}`,
    })),
    {
      key: "screenplay",
      label: "Screenplay",
      status: screenplayStatus,
      href: `/projects/${projectId}/screenplay`,
    },
    {
      key: "breakdown",
      label: "Breakdown",
      status: breakdownStatus,
      href: `/projects/${projectId}/breakdown`,
    },
    {
      key: "budget",
      label: "Budget",
      status: budgetStatus,
      href: `/projects/${projectId}/budget`,
    },
    {
      key: "schedule",
      label: "Piano",
      status: scheduleStatus,
      href: `/projects/${projectId}/schedule`,
    },
  ];

  const navigate = useNavigate();

  const markFor = (s: NodeStatus): string =>
    s === "done" ? "●" : s === "current" ? "◐" : "○";

  return (
    <section
      className={styles.wrapper}
      aria-label="Pipeline di sviluppo"
      data-testid="overview-pipeline"
    >
      <div className={styles.label}>Pipeline di sviluppo</div>
      <div className={styles.track}>
        {nodes.map((n, idx) => (
          <div key={n.key} className={styles.cell}>
            <button
              type="button"
              className={`${styles.node} ${styles[n.status]}`}
              onClick={() => void navigate({ to: n.href } as never)}
            >
              <span className={styles.mark} aria-hidden>
                {markFor(n.status)}
              </span>
              {n.label}
            </button>
            {idx < nodes.length - 1 && (
              <span
                className={`${styles.line} ${
                  n.status === "done" ? styles.lineDone : ""
                }`}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
