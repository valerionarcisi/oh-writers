import { Link, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { projectQueryOptions } from "~/features/projects";
import styles from "./TopBar.module.css";

export function TopBar() {
  const matches = useMatches();
  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));
  const projectId = (projectMatch?.params as { id?: string } | undefined)?.id;
  const { data: projectResult } = useQuery({
    ...projectQueryOptions(projectId ?? ""),
    enabled: !!projectId,
  });
  const projectTitle =
    projectResult?.isOk && projectResult.value?.title
      ? projectResult.value.title
      : null;
  const breadcrumbs = buildBreadcrumbs(matches, projectTitle);
  const isInsideProject = !!projectMatch;

  return (
    <header className={styles.topBar}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className={styles.crumbItem}>
            {i > 0 && <span className={styles.separator}>›</span>}
            {i === breadcrumbs.length - 1 ? (
              <span className={styles.crumbCurrent}>{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className={styles.crumbLink}>
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className={styles.spacer} />

      {isInsideProject && (
        <Link
          to="/dashboard"
          className={styles.backBtn}
          title="Back to projects"
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          Projects
        </Link>
      )}
    </header>
  );
}

interface Breadcrumb {
  label: string;
  path: string;
}

function buildBreadcrumbs(
  matches: ReturnType<typeof useMatches>,
  projectTitle: string | null,
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: "Projects", path: "/dashboard" }];

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));

  if (projectMatch) {
    const id = (projectMatch.params as { id?: string } | undefined)?.id ?? "";
    const title = projectTitle ?? "Project";

    crumbs.push({ label: title, path: `/projects/${id}` });

    const lastMatch = matches[matches.length - 1];
    const lastRoute = lastMatch?.routeId ?? "";

    if (lastRoute.includes("screenplay")) {
      crumbs.push({
        label: "Screenplay",
        path: `/projects/${id}/screenplay`,
      });

      if (lastRoute.includes("versions")) {
        crumbs.push({
          label: "Versions",
          path: `/projects/${id}/screenplay/versions`,
        });
      }
      if (lastRoute.includes("diff")) {
        crumbs.push({
          label: "Diff",
          path: lastMatch?.pathname ?? "",
        });
      }
    } else if (lastRoute.includes("settings")) {
      crumbs.push({
        label: "Settings",
        path: `/projects/${id}/settings`,
      });
    } else if (lastRoute.includes("logline")) {
      crumbs.push({ label: "Logline", path: `/projects/${id}/logline` });
    } else if (lastRoute.includes("synopsis")) {
      crumbs.push({ label: "Synopsis", path: `/projects/${id}/synopsis` });
    } else if (lastRoute.includes("outline")) {
      crumbs.push({ label: "Outline", path: `/projects/${id}/outline` });
    } else if (lastRoute.includes("treatment")) {
      crumbs.push({
        label: "Treatment",
        path: `/projects/${id}/treatment`,
      });
    }
  }

  return crumbs;
}
