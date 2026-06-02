import { useEffect, useRef } from "react";
import {
  COVERAGE_PATTERNS,
  PATTERN_IDS,
  type PatternId,
} from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./PatternMenu.module.css";

interface PatternMenuProps {
  recommendedId: PatternId | null;
  onSelect: (id: PatternId) => void;
  onClose: () => void;
}

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

export function PatternMenu({ recommendedId, onSelect, onClose }: PatternMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={styles.menu} role="menu">
      <div className={styles.label}>{t("shootingPlan.pattern.label")}</div>
      {PATTERN_IDS.map((id) => {
        const p = COVERAGE_PATTERNS[id];
        const isRecommended = id === recommendedId;
        return (
          <button
            key={id}
            type="button"
            className={styles.item}
            data-recommended={isRecommended || undefined}
            title={`${p.label} — ${p.description}`}
            onClick={() => {
              onSelect(id);
              onClose();
            }}
          >
            <span className={styles.itemMain}>
              <span className={styles.itemLabel}>{p.label}</span>
              <span className={styles.itemDesc}>
                {p.shots.length} shot · {formatMin(p.estimatedMinutesHint)}
              </span>
            </span>
            {isRecommended && (
              <span className={styles.recommendedBadge}>
                {t("shootingPlan.pattern.recommended")}
              </span>
            )}
          </button>
        );
      })}
      <div className={styles.divider} />
      <button
        type="button"
        className={styles.item}
        disabled
        title={t("shootingPlan.pattern.futureTitle")}
      >
        {t("shootingPlan.pattern.saveAsPattern")}
      </button>
    </div>
  );
}
