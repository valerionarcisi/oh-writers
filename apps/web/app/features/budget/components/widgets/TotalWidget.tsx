import type { BudgetLine, TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { BudgetDonut } from "./BudgetDonut";
import styles from "./TotalWidget.module.css";

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  locations: "budget.total.cat.locations",
  vehicles: "budget.total.cat.vehicles",
  equipment: "budget.total.cat.equipment",
  sound: "budget.total.cat.sound",
  props: "budget.total.cat.props",
  wardrobe: "budget.total.cat.wardrobe",
  extras: "budget.total.cat.extras",
  vfx: "budget.total.cat.vfx",
  stunts: "budget.total.cat.stunts",
  animals: "budget.total.cat.animals",
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
  const { t } = useTranslation();
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
    {
      label: t("budget.total.cast"),
      value: castTotal,
      color: "var(--color-cast, #6366f1)",
    },
    {
      label: t("budget.total.crew"),
      value: crewTotal,
      color: "var(--color-crew, #10b981)",
    },
    {
      label: t("budget.total.production"),
      value: productionTotal,
      color: "var(--color-equipment, #f59e0b)",
    },
    {
      label: t("budget.total.misc"),
      value: miscTotal,
      color: "var(--color-misc, #ef4444)",
    },
  ];

  return (
    <div className={styles.widget}>
      <h3 className={styles.title}>{t("budget.total.title")}</h3>
      <BudgetDonut segments={segments} total={subtotal} />
      <div className={styles.totals}>
        <SummaryRow label={t("budget.total.cast")} value={castTotal} />
        <SummaryRow label={t("budget.total.crew")} value={crewTotal} />
        {Array.from(prodByCategory.entries())
          .filter(([, v]) => v > 0)
          .map(([cat, v]) => (
            <SummaryRow
              key={cat}
              label={CATEGORY_LABEL_KEYS[cat] ? t(CATEGORY_LABEL_KEYS[cat]!) : cat}
              value={v}
            />
          ))}
        {miscTotal > 0 && (
          <SummaryRow label={t("budget.total.misc")} value={miscTotal} />
        )}
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>
            {t("budget.total.subtotal")}
          </span>
          <span className={styles.totalValue}>{fmt(subtotal)}</span>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>
            {t("budget.total.contingency").replace(
              "{percent}",
              String(contingencyPercent),
            )}
          </span>
          <span className={styles.totalValue}>{fmt(contingency)}</span>
        </div>
        <div className={`${styles.totalRow} ${styles.grandRow}`}>
          <span className={styles.grandLabel}>{t("budget.total.total")}</span>
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
