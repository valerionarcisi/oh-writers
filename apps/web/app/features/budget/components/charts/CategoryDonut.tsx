import styles from "./CategoryDonut.module.css";

export interface DonutSegment {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly colorVar: string;
}

interface CategoryDonutProps {
  readonly segments: ReadonlyArray<DonutSegment>;
  readonly total: number;
  readonly centerLabel?: string;
  readonly centerSub?: string;
}

const RADIUS = 36;
const CENTER = 44;
const STROKE = 12;
const VIEWBOX = 88;

const polar = (angle: number): readonly [number, number] => {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CENTER + RADIUS * Math.cos(rad), CENTER + RADIUS * Math.sin(rad)];
};

interface Arc {
  readonly id: string;
  readonly label: string;
  readonly colorVar: string;
  readonly d: string;
  readonly percent: number;
}

const buildArcs = (
  segments: ReadonlyArray<DonutSegment>,
  total: number,
): ReadonlyArray<Arc> => {
  if (total <= 0) return [];
  const filtered = segments.filter((s) => s.value > 0);
  let cursor = 0;
  return filtered.map((seg) => {
    const ratio = seg.value / total;
    const sweep = ratio * 360;
    const [x1, y1] = polar(cursor);
    const [x2, y2] = polar(cursor + sweep);
    const large = sweep > 180 ? 1 : 0;
    const d =
      sweep >= 359.9
        ? `M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER + RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - RADIUS} ${CENTER}`
        : `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2}`;
    cursor += sweep;
    return {
      id: seg.id,
      label: seg.label,
      colorVar: seg.colorVar,
      d,
      percent: ratio * 100,
    };
  });
};

export function CategoryDonut({
  segments,
  total,
  centerLabel,
  centerSub,
}: CategoryDonutProps) {
  const arcs = buildArcs(segments, total);
  const isEmpty = arcs.length === 0;

  return (
    <div className={styles.root}>
      <div className={styles.chartWrap}>
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          aria-hidden="true"
          className={styles.svg}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--ds-surface-alt)"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <path
              key={arc.id}
              d={arc.d}
              fill="none"
              stroke={`var(${arc.colorVar})`}
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        {(centerLabel || centerSub) && (
          <div className={styles.center}>
            {centerLabel && (
              <span className={styles.centerLabel}>{centerLabel}</span>
            )}
            {centerSub && <span className={styles.centerSub}>{centerSub}</span>}
          </div>
        )}
      </div>
      {!isEmpty && (
        <ul className={styles.legend}>
          {arcs.map((arc) => (
            <li key={arc.id} className={styles.legendItem}>
              <span
                className={styles.dot}
                style={{ background: `var(${arc.colorVar})` }}
                aria-hidden="true"
              />
              <span className={styles.legendLabel}>{arc.label}</span>
              <span className={styles.legendPct}>
                {arc.percent.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
