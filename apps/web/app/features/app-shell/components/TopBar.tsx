import { Link, useMatches } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import styles from "./TopBar.module.css";

export function TopBar() {
  const matches = useMatches();
  const breadcrumbs = buildBreadcrumbs(matches);
  const isInsideProject = matches.some((m) =>
    m.routeId.includes("/projects/$id"),
  );

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
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: "Projects", path: "/dashboard" }];

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));

  if (projectMatch) {
    const id = projectMatch.params?.id as string;
    const loaderData = projectMatch.loaderData as
      | { value?: { title?: string } }
      | undefined;
    const title = loaderData?.value?.title ?? "Project";

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
