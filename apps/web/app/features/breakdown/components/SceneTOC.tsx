import { useQuery } from "@tanstack/react-query";
import { Badge } from "@oh-writers/ui";
import { staleScenesOptions } from "../hooks/useBreakdown";
import type { BreakdownSceneSummary } from "../server/breakdown.server";
import styles from "./SceneTOC.module.css";

interface Props {
  scenes: BreakdownSceneSummary[];
  versionId: string;
  activeSceneId: string | null;
  onSceneSelect: (id: string) => void;
}

export function SceneTOC({
  scenes,
  versionId,
  activeSceneId,
  onSceneSelect,
}: Props) {
  const { data: staleIds = [] } = useQuery(staleScenesOptions(versionId));

  if (scenes.length === 0) {
    return <p className={styles.empty}>Nessuna scena nella sceneggiatura.</p>;
  }

  return (
    <ul className={styles.list} role="list">
      {scenes.map((s) => {
        const isActive = s.id === activeSceneId;
        const isStale = staleIds.includes(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              className={[styles.item, isActive ? styles.active : ""]
                .filter(Boolean)
                .join(" ")}
              data-testid={`scene-toc-item-${s.number}`}
              onClick={() => onSceneSelect(s.id)}
            >
              <span className={styles.number}>{s.number}.</span>
              <span className={styles.heading}>{s.heading}</span>
              {isStale && (
                <Badge variant="stale" className={styles.staleBadge}>
                  stale
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
