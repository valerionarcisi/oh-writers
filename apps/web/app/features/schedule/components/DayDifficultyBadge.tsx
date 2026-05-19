import type { DayEstimate, WeatherFactor } from "@oh-writers/domain";
import styles from "./DayDifficultyBadge.module.css";

interface DayDifficultyBadgeProps {
  readonly estimate: DayEstimate;
  readonly weather: WeatherFactor | null;
  readonly isWeatherLoading: boolean;
  readonly dayNumber?: number;
}

const TONE_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bassa",
  2: "medio-bassa",
  3: "media",
  4: "medio-alta",
  5: "critica",
};

const DIFFICULTY_TONE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "low",
  2: "low",
  3: "mid",
  4: "high",
  5: "critical",
};

const renderDots = (level: 1 | 2 | 3 | 4 | 5): string => {
  const filled = "●".repeat(level);
  const empty = "○".repeat(5 - level);
  return filled + empty;
};

const weatherEmoji = (w: WeatherFactor | null): string => {
  if (!w) return "☀️";
  switch (w.conditions) {
    case "clear":
      return "☀️";
    case "cloudy":
      return "⛅";
    case "rain":
      return "🌧️";
    case "storm":
      return "⛈️";
    case "snow":
      return "❄️";
    case "unknown":
    default:
      return "·";
  }
};

export function DayDifficultyBadge({
  estimate,
  weather,
  isWeatherLoading,
  dayNumber,
}: DayDifficultyBadgeProps) {
  const tone = DIFFICULTY_TONE[estimate.difficulty];
  const hasWeatherImpact = estimate.weatherImpactPct !== 0;
  const tooltipLines = [
    ...estimate.riskFactors.map((r) => `⚠ ${r}`),
    ...estimate.recommendations.map((r) => `→ ${r}`),
  ];
  const tooltip = tooltipLines.length > 0 ? tooltipLines.join("\n") : "";
  const dayLabel = dayNumber ? `giorno ${dayNumber}` : "questa giornata";
  const probabilityLabel = hasWeatherImpact
    ? `Riuscita stimata ${estimate.successProbabilityClear}% con tempo sereno, ${estimate.successProbabilityActual}% con il meteo previsto.`
    : `Riuscita stimata ${estimate.successProbabilityActual}%.`;
  const ariaLabel = `Difficoltà ${dayLabel}: ${TONE_LABEL[estimate.difficulty]}, ${estimate.difficulty} punti su 5. ${probabilityLabel}`;

  return (
    <div
      className={styles.badge}
      data-tone={tone}
      data-testid="day-difficulty-badge"
      aria-label={ariaLabel}
    >
      {tooltip && (
        <div className={styles.tooltip} role="tooltip">
          {tooltipLines.map((line, i) => (
            <div key={i} className={styles.tooltipLine}>
              {line}
            </div>
          ))}
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Difficoltà</span>
        <span
          className={styles.dots}
          data-tone={tone}
          aria-label={`Difficoltà ${estimate.difficulty} su 5`}
        >
          {renderDots(estimate.difficulty)}
        </span>
        <span className={styles.score}>({estimate.difficulty}/5)</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Riuscita</span>
        {hasWeatherImpact ? (
          <span className={styles.probabilityShift}>
            <span className={styles.probClear}>
              {estimate.successProbabilityClear}% ☀️
            </span>
            <span className={styles.arrow}>→</span>
            <span
              className={styles.probActual}
              data-tone={
                estimate.successProbabilityActual < 50 ? "critical" : "warn"
              }
            >
              {estimate.successProbabilityActual}% {weatherEmoji(weather)}
            </span>
          </span>
        ) : (
          <span className={styles.probSingle}>
            {estimate.successProbabilityActual}% {weatherEmoji(weather)}
          </span>
        )}
        {isWeatherLoading && (
          <span className={styles.loading} aria-label="meteo in caricamento">
            …
          </span>
        )}
      </div>
      {estimate.riskFactors.length > 0 && (
        <div className={styles.risks}>
          <span className={styles.warnIcon} aria-hidden="true">
            ⚠
          </span>
          <span className={styles.risksText}>
            {estimate.riskFactors[0]}
            {estimate.riskFactors.length > 1
              ? ` · +${estimate.riskFactors.length - 1}`
              : ""}
          </span>
        </div>
      )}
    </div>
  );
}
