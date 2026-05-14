import {
  COVERAGE_PATTERNS,
  PATTERN_IDS,
  type PatternId,
} from "@oh-writers/domain";
import styles from "./PatternMenu.module.css";

interface PatternMenuProps {
  recommendedId: PatternId | null;
  onSelect: (id: PatternId) => void;
  onClose: () => void;
}

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

export function PatternMenu({ recommendedId, onSelect, onClose }: PatternMenuProps) {
  return (
    <div className={styles.menu} role="menu">
      <div className={styles.label}>Pattern copertura</div>
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
              <span className={styles.recommendedBadge}>consigliato</span>
            )}
          </button>
        );
      })}
      <div className={styles.divider} />
      <button
        type="button"
        className={styles.item}
        disabled
        title="Disponibile in una versione futura"
      >
        + Salva piano attuale come pattern…
      </button>
    </div>
  );
}
