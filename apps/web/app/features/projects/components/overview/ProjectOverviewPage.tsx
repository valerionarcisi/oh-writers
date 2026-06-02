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
import { useYjsRoom } from "~/features/realtime";
import { useSession } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectOverviewPage.module.css";

interface ProjectOverviewPageProps {
  readonly projectId: string;
}

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const { t } = useTranslation();
  const { data: result, isLoading } = useProjectOverview(projectId);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={3}
          widths={["60%", "40%", "30%"]}
          ariaLabel={t("projects.overview.loading")}
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
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ─── Live presence (Spec 09b §A2) ──────────────────────────────────────────
  // Open the project's primary realtime room (the screenplay) awareness-only to
  // surface who is online now. No screenplay → no live room; the hook stays
  // disabled and TeamPresence renders the static list. Degrades silently when
  // VITE_WS_URL is unset (status "disabled").
  const { data: sessionData } = useSession();
  const presenceUser = sessionData?.user
    ? { id: sessionData.user.id, name: sessionData.user.name }
    : null;
  const screenplayId = overview.screenplay?.id ?? null;
  const presenceRoom = useYjsRoom(
    screenplayId ? `screenplay:${screenplayId}` : "presence:none",
    presenceUser,
    screenplayId !== null,
  );

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
      title: t("projects.overview.deleteTitle"),
      message: t("projects.overview.deleteMessage"),
      confirmLabel: t("action.delete"),
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
          <TeamPresence
            collaborators={overview.collaborators}
            peers={presenceRoom.peers}
            localUserId={presenceUser?.id ?? null}
            isOnline={presenceRoom.status === "connected"}
          />
        </aside>
      </div>
    </div>
  );
}
