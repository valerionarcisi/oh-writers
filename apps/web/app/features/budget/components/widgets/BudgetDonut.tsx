import styles from "./BudgetDonut.module.css";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface BudgetDonutProps {
  segments: DonutSegment[];
  total: number;
}

const r = 36;
const cx = 44;
const cy = 44;
const circumference = 2 * Math.PI * r;

function polarToXY(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export function BudgetDonut({ segments, total }: BudgetDonutProps) {
  const filtered = segments.filter((s) => s.value > 0);

  let cumulativeAngle = 0;
  const arcs = filtered.map((seg) => {
    const ratio = total > 0 ? seg.value / total : 0;
    const sweep = ratio * 360;
    const [x1, y1] = polarToXY(cx, cy, r, cumulativeAngle);
    const [x2, y2] = polarToXY(cx, cy, r, cumulativeAngle + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    const path =
      sweep >= 359.9
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
        : `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    const result = { ...seg, path, startAngle: cumulativeAngle, sweep };
    cumulativeAngle += sweep;
    return result;
  });

  return (
    <div className={styles.donut}>
      <div className={styles.chartWrap}>
        <svg viewBox="0 0 88 88" aria-hidden="true" className={styles.svg}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--color-surface-raised)"
            strokeWidth="12"
          />
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d={arc.path}
              fill="none"
              stroke={arc.color}
              strokeWidth="12"
              strokeLinecap="butt"
              className={styles.arc}
            />
          ))}
        </svg>
      </div>
      <ul className={styles.legend}>
        {filtered.map((seg) => (
          <li key={seg.label} className={styles.legendItem}>
            <span
              className={styles.dot}
              style={{ background: seg.color }}
              aria-hidden="true"
            />
            <span className={styles.legendLabel}>{seg.label}</span>
            <span className={styles.legendPct}>
              {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
