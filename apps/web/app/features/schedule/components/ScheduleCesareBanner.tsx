import { useState } from "react";
import { Banner } from "@oh-writers/ui";
import styles from "./ScheduleCesareBanner.module.css";

/**
 * Static mock suggestions surfaced as non-blocking banner above the strip
 * board, matching the "controllore garbato" pattern (apply/ignore inline,
 * no chat sidebar).
 *
 * TODO Spec 12c: replace mocks with `analyzeSchedule(projectId)` server fn
 * once the conflict-resolver pipeline is wired (cast availability +
 * location consolidation + magic-hour planner).
 */
export interface CesareSuggestion {
  readonly id: string;
  readonly message: string;
  readonly applyLabel: string;
}

const MOCK_SUGGESTIONS: ReadonlyArray<CesareSuggestion> = [
  {
    id: "consolidate-bar",
    message:
      "Sposta SC 14 al giorno 3 per consolidare la location Bar: risparmi 1 company move.",
    applyLabel: "Applica spostamento",
  },
  {
    id: "actor-marta",
    message:
      "Marta Bellucci non è disponibile il 4 giugno. Posso spostare SC 8 al giorno 04 dove il cast è già convocato.",
    applyLabel: "Sposta SC 8 a giorno 04",
  },
  {
    id: "magic-hour",
    message:
      "SC 19 è annotata 'magic hour'. La finestra ottimale è 20:30 → 21:10: programma la giornata a partire dalle 18:30.",
    applyLabel: "Pianifica magic hour",
  },
];

interface ScheduleCesareBannerProps {
  suggestions?: ReadonlyArray<CesareSuggestion>;
  onApply?: (id: string) => void;
}

export function ScheduleCesareBanner({
  suggestions = MOCK_SUGGESTIONS,
  onApply,
}: ScheduleCesareBannerProps) {
  const [dismissed, setDismissed] = useState<ReadonlyArray<string>>([]);
  const visible = suggestions.filter((s) => !dismissed.includes(s.id));

  if (visible.length === 0) return null;

  const dismiss = (id: string) =>
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));

  return (
    <div
      className={styles.wrap}
      role="region"
      aria-label="Suggerimenti Cesare"
      data-testid="schedule-cesare-banner"
    >
      <span className={styles.tag}>
        Cesare · {visible.length}{" "}
        {visible.length === 1 ? "suggerimento" : "suggerimenti"}
      </span>
      <div className={styles.list}>
        {visible.map((s) => (
          <Banner
            key={s.id}
            variant="cesare"
            message={s.message}
            data-testid={`cesare-suggestion-${s.id}`}
            actions={[
              {
                label: s.applyLabel,
                variant: "primary",
                onClick: () => {
                  onApply?.(s.id);
                  dismiss(s.id);
                },
              },
              { label: "Ignora", onClick: () => dismiss(s.id) },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
