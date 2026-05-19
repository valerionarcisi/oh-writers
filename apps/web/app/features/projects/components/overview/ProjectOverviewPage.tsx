import { useNavigate } from "@tanstack/react-router";
import { match } from "ts-pattern";
import { useConfirmDialog, Skeleton } from "@oh-writers/ui";
import {
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
} from "../../hooks/useProjects";
import { useProjectOverview } from "../../hooks/useProjectOverview";
import { ResultErrorView } from "~/components/ResultErrorView";
import { ProjectHero } from "./ProjectHero";
import { ProjectKpiStrip } from "./ProjectKpiStrip";
import { ProjectPipeline } from "./ProjectPipeline";
import { NextStepBanner } from "./NextStepBanner";
import { NarrativeCardGrid } from "./NarrativeCardGrid";
import { ScreenplaySection } from "./ScreenplaySection";
import { ProductionCardGrid } from "./ProductionCardGrid";
import { ActivityFeed } from "./ActivityFeed";
import { TeamPresence } from "./TeamPresence";
import styles from "./ProjectOverviewPage.module.css";

interface ProjectOverviewPageProps {
  readonly projectId: string;
}

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const { data: result, isLoading } = useProjectOverview(projectId);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={3}
          widths={["60%", "40%", "30%"]}
          ariaLabel="Caricamento panoramica progetto"
        />
      </div>
    );
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <ProjectOverviewContent projectId={projectId} overview={value} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}

type Overview = Extract<
  NonNullable<ReturnType<typeof useProjectOverview>["data"]>,
  { isOk: true }
>["value"];

interface ProjectOverviewContentProps {
  readonly projectId: string;
  readonly overview: Overview;
}

function ProjectOverviewContent({
  projectId,
  overview,
}: ProjectOverviewContentProps) {
  const navigate = useNavigate();
  const archive = useArchiveProject();
  const restore = useRestoreProject();
  const remove = useDeleteProject();
  const { confirm } = useConfirmDialog();

  const onContinueScreenplay = () =>
    void navigate({
      to: "/projects/$id/screenplay",
      params: { id: projectId },
    });

  const onArchive = () => archive.mutate({ projectId });
  const onRestore = () => restore.mutate({ projectId });
  const onDelete = () => {
    void confirm({
      title: "Eliminare il progetto?",
      message:
        "Eliminare questo progetto? L'operazione non può essere annullata.",
      confirmLabel: "Elimina",
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      remove.mutate(
        { projectId },
        { onSuccess: () => navigate({ to: "/dashboard" }) },
      );
    });
  };

  return (
    <div className={styles.page}>
      <ProjectHero
        project={overview.project}
        onContinueScreenplay={onContinueScreenplay}
        onOpenTitlePage={() =>
          void navigate({
            to: "/projects/$id/title-page",
            params: { id: projectId },
          })
        }
        onOpenSettings={() =>
          void navigate({
            to: "/projects/$id/settings",
            params: { id: projectId },
          })
        }
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
        isMutating={archive.isPending || restore.isPending || remove.isPending}
      />

      <ProjectKpiStrip kpi={overview.kpi} />

      <ProjectPipeline
        projectId={projectId}
        documents={overview.documents}
        screenplay={overview.screenplay}
        breakdown={overview.breakdown}
        budget={overview.budget}
        schedule={overview.schedule}
      />

      {overview.nextStep && (
        <NextStepBanner
          nextStep={overview.nextStep}
          onApply={() =>
            void navigate({
              to: overview.nextStep!.actionHref,
            } as never)
          }
        />
      )}

      <div className={styles.twoCol}>
        <main className={styles.main}>
          <NarrativeCardGrid
            projectId={projectId}
            documents={overview.documents}
          />
          <ScreenplaySection
            projectId={projectId}
            screenplay={overview.screenplay}
          />
          <ProductionCardGrid
            projectId={projectId}
            breakdown={overview.breakdown}
            budget={overview.budget}
            schedule={overview.schedule}
            locations={overview.locations}
          />
        </main>
        <aside className={styles.side}>
          <ActivityFeed items={overview.activity} />
          <TeamPresence collaborators={overview.collaborators} />
        </aside>
      </div>
    </div>
  );
}
