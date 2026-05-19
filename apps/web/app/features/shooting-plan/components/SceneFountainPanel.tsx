import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { ReadOnlyScreenplayView } from "~/features/screenplay-editor";
import { sceneFountainQueryOptions } from "../server/shooting-plan.server";
import styles from "./SceneFountainPanel.module.css";

interface SceneFountainPanelProps {
  sceneId: string;
  projectId: string;
}

export function SceneFountainPanel({
  sceneId,
  projectId,
}: SceneFountainPanelProps) {
  const { data, isLoading } = useQuery({
    ...sceneFountainQueryOptions(sceneId, projectId),
    select: (raw) => {
      try {
        return unwrapResult(raw);
      } catch {
        return "";
      }
    },
  });

  return (
    <div className={styles.panel}>
      <div className={styles.label}>TESTO SCENA</div>
      <div className={styles.scrollArea}>
        {isLoading && (
          <div className={styles.loading}>
            <Skeleton
              lines={3}
              widths={["80%", "100%", "60%"]}
              ariaLabel="Caricamento testo scena"
            />
          </div>
        )}
        {!isLoading && data && (
          <ReadOnlyScreenplayView content={data} className={styles.editor} />
        )}
        {!isLoading && !data && (
          <div className={styles.empty}>
            Nessun testo disponibile per questa scena.
          </div>
        )}
      </div>
    </div>
  );
}
