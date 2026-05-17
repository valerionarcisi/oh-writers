import { Link } from "@tanstack/react-router";
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

type PipelineRoute =
  | "/projects/$id/soggetto"
  | "/projects/$id/synopsis"
  | "/projects/$id/outline"
  | "/projects/$id/treatment"
  | "/projects/$id/screenplay"
  | "/projects/$id/breakdown"
  | "/projects/$id/budget"
  | "/projects/$id/schedule";

interface PipelineNode {
  readonly key: string;
  readonly label: string;
  readonly status: NodeStatus;
  readonly route: PipelineRoute;
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

const DOC_ROUTES: Record<Exclude<DocumentType, "logline">, PipelineRoute> = {
  soggetto: "/projects/$id/soggetto",
  synopsis: "/projects/$id/synopsis",
  outline: "/projects/$id/outline",
  treatment: "/projects/$id/treatment",
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
      route: DOC_ROUTES[t as Exclude<DocumentType, "logline">],
    })),
    {
      key: "screenplay",
      label: "Screenplay",
      status: screenplayStatus,
      route: "/projects/$id/screenplay" as const,
    },
    {
      key: "breakdown",
      label: "Breakdown",
      status: breakdownStatus,
      route: "/projects/$id/breakdown" as const,
    },
    {
      key: "budget",
      label: "Budget",
      status: budgetStatus,
      route: "/projects/$id/budget" as const,
    },
    {
      key: "schedule",
      label: "Piano",
      status: scheduleStatus,
      route: "/projects/$id/schedule" as const,
    },
  ];

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
            <Link
              to={n.route}
              params={{ id: projectId }}
              className={`${styles.node} ${styles[n.status]}`}
            >
              <span className={styles.mark} aria-hidden>
                {markFor(n.status)}
              </span>
              {n.label}
            </Link>
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
