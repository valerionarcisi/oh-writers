import type {
  DayEstimate,
  WeatherFactor,
  TranslationKey,
} from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./DayDifficultyBadge.module.css";

interface DayDifficultyBadgeProps {
  readonly estimate: DayEstimate;
  readonly weather: WeatherFactor | null;
  readonly isWeatherLoading: boolean;
  readonly dayNumber?: number;
}

const TONE_LABEL_KEY: Record<1 | 2 | 3 | 4 | 5, TranslationKey> = {
  1: "schedule.difficulty.low",
  2: "schedule.difficulty.midLow",
  3: "schedule.difficulty.mid",
  4: "schedule.difficulty.midHigh",
  5: "schedule.difficulty.critical",
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
  const { t } = useTranslation();
  const tone = DIFFICULTY_TONE[estimate.difficulty];
  const hasWeatherImpact = estimate.weatherImpactPct !== 0;
  const tooltipLines = [
    ...estimate.riskFactors.map((r) => `⚠ ${r}`),
    ...estimate.recommendations.map((r) => `→ ${r}`),
  ];
  const tooltip = tooltipLines.length > 0 ? tooltipLines.join("\n") : "";
  const dayLabel = dayNumber
    ? t("schedule.difficulty.dayLabel").replace("{number}", String(dayNumber))
    : t("schedule.difficulty.thisDay");
  const probabilityLabel = hasWeatherImpact
    ? t("schedule.difficulty.successWithWeather")
        .replace("{clear}", String(estimate.successProbabilityClear))
        .replace("{actual}", String(estimate.successProbabilityActual))
    : t("schedule.difficulty.successOnly").replace(
        "{actual}",
        String(estimate.successProbabilityActual),
      );
  const ariaLabel = t("schedule.difficulty.ariaLabel")
    .replace("{day}", dayLabel)
    .replace("{tone}", t(TONE_LABEL_KEY[estimate.difficulty]))
    .replace("{score}", String(estimate.difficulty))
    .replace("{probability}", probabilityLabel);

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
        <span className={styles.label}>
          {t("schedule.difficulty.label")}
        </span>
        <span
          className={styles.dots}
          data-tone={tone}
          aria-label={t("schedule.difficulty.dotsAria").replace(
            "{score}",
            String(estimate.difficulty),
          )}
        >
          {renderDots(estimate.difficulty)}
        </span>
        <span className={styles.score}>({estimate.difficulty}/5)</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>
          {t("schedule.difficulty.successLabel")}
        </span>
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
          <span
            className={styles.loading}
            aria-label={t("schedule.difficulty.weatherLoading")}
          >
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
