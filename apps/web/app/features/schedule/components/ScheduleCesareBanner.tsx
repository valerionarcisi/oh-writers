import { useState } from "react";
import { Banner } from "@oh-writers/ui";
import type { Suggestion } from "@oh-writers/domain";
import styles from "./ScheduleCesareBanner.module.css";

/**
 * Non-blocking banner that surfaces algorithmic Cesare hints above the
 * strip board (and other schedule views). Follows the "controllore
 * garbato" pattern: apply or ignore inline, never open a chat sidebar.
 */
export type CesareSuggestion = Suggestion;

interface ScheduleCesareBannerProps {
  suggestions: ReadonlyArray<CesareSuggestion>;
  onApply?: (suggestion: CesareSuggestion) => void;
}

export function ScheduleCesareBanner({
  suggestions,
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
                  onApply?.(s);
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
