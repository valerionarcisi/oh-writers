import type { BudgetLine } from "@oh-writers/domain";
import { BudgetDonut } from "./BudgetDonut";
import styles from "./TotalWidget.module.css";

const CATEGORY_LABELS: Record<string, string> = {
  locations: "Locations",
  vehicles: "Veicoli",
  equipment: "Fotografia",
  sound: "Suono",
  props: "Scenografia",
  wardrobe: "Costumi",
  extras: "Comparse",
  vfx: "VFX / SFX",
  stunts: "Stunt",
  animals: "Animali",
};

interface TotalWidgetProps {
  castTotal: number;
  crewTotal: number;
  productionLines: BudgetLine[];
  miscTotal: number;
  contingencyPercent: number;
}

export function TotalWidget({
  castTotal,
  crewTotal,
  productionLines,
  miscTotal,
  contingencyPercent,
}: TotalWidgetProps) {
  // Aggregate effective total per canonical category
  const prodByCategory = new Map<string, number>();
  for (const l of productionLines) {
    const cat = l.linkedCategory ?? "other";
    const effective = l.actual ?? (l.rate ?? 0) * (l.quantity ?? 1);
    prodByCategory.set(cat, (prodByCategory.get(cat) ?? 0) + effective);
  }
  const productionTotal = Array.from(prodByCategory.values()).reduce(
    (s, v) => s + v,
    0,
  );

  const subtotal = castTotal + crewTotal + productionTotal + miscTotal;
  const contingency = subtotal * (contingencyPercent / 100);
  const grandTotal = subtotal + contingency;

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const segments = [
    { label: "Cast", value: castTotal, color: "var(--color-cast, #6366f1)" },
    { label: "Troupe", value: crewTotal, color: "var(--color-crew, #10b981)" },
    {
      label: "Produzione",
      value: productionTotal,
      color: "var(--color-equipment, #f59e0b)",
    },
    { label: "Varie", value: miscTotal, color: "var(--color-misc, #ef4444)" },
  ];

  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>Totale progetto</h3>
      <BudgetDonut segments={segments} total={subtotal} />
      <div className={styles.totals}>
        <SummaryRow label="Cast" value={castTotal} />
        <SummaryRow label="Troupe" value={crewTotal} />
        {Array.from(prodByCategory.entries())
          .filter(([, v]) => v > 0)
          .map(([cat, v]) => (
            <SummaryRow
              key={cat}
              label={CATEGORY_LABELS[cat] ?? cat}
              value={v}
            />
          ))}
        {miscTotal > 0 && <SummaryRow label="Varie" value={miscTotal} />}
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Subtotale</span>
          <span className={styles.totalValue}>{fmt(subtotal)}</span>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>
            Contingenza {contingencyPercent}%
          </span>
          <span className={styles.totalValue}>{fmt(contingency)}</span>
        </div>
        <div className={`${styles.totalRow} ${styles.grandRow}`}>
          <span className={styles.grandLabel}>Totale</span>
          <span className={styles.grandValue}>{fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  const fmt = (n: number) =>
    n.toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  return (
    <div className={styles.totalRow}>
      <span className={styles.totalLabel}>{label}</span>
      <span className={styles.totalValue}>{fmt(value)}</span>
    </div>
  );
}
