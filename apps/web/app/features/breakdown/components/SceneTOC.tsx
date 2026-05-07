import { useEffect, useRef } from "react";
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
  const itemsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!activeSceneId) return;
    const el = itemsRef.current.get(activeSceneId);
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [activeSceneId]);

  if (scenes.length === 0) {
    return <p className={styles.empty}>Nessuna scena nella sceneggiatura.</p>;
  }

  return (
    <ul className={styles.list} data-testid="breakdown-toc" role="list">
      {scenes.map((s) => {
        const isActive = s.id === activeSceneId;
        const isStale = staleIds.includes(s.id);
        return (
          <li key={s.id}>
            <button
              ref={(el) => {
                if (el) itemsRef.current.set(s.id, el);
                else itemsRef.current.delete(s.id);
              }}
              type="button"
              className={[styles.item, isActive ? styles.active : ""]
                .filter(Boolean)
                .join(" ")}
              data-testid={`scene-toc-item-${s.number}`}
              onClick={() => onSceneSelect(s.id)}
            >
              <span className={styles.number}>{s.fountainNumber}.</span>
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
