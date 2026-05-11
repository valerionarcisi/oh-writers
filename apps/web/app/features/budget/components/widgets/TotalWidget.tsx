import { BudgetDonut } from "./BudgetDonut";
import styles from "./TotalWidget.module.css";

interface TotalWidgetProps {
  castTotal: number;
  crewTotal: number;
  equipmentTotal: number;
  miscTotal: number;
  contingencyPercent: number;
}

export function TotalWidget({
  castTotal,
  crewTotal,
  equipmentTotal,
  miscTotal,
  contingencyPercent,
}: TotalWidgetProps) {
  const subtotal = castTotal + crewTotal + equipmentTotal + miscTotal;
  const contingency = subtotal * (contingencyPercent / 100);
  const grandTotal = subtotal + contingency;

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const segments = [
    { label: "Cast", value: castTotal, color: "var(--color-cast, #6366f1)" },
    { label: "Troupe", value: crewTotal, color: "var(--color-crew, #10b981)" },
    {
      label: "Attrezzatura",
      value: equipmentTotal,
      color: "var(--color-equipment, #f59e0b)",
    },
    { label: "Varie", value: miscTotal, color: "var(--color-misc, #ef4444)" },
  ];

  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>Totale progetto</h3>
      <BudgetDonut segments={segments} total={subtotal} />
      <div className={styles.totals}>
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
