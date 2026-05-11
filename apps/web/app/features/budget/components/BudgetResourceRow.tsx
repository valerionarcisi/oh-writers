import { useState } from "react";
import { fiscalMultiplier, resourceTotal } from "@oh-writers/domain";
import type { FiscalRegime } from "@oh-writers/domain";
import styles from "./BudgetResourceRow.module.css";

interface BudgetResourceRowProps {
  id: string;
  name: string;
  days: number;
  dayRate: number;
  fiscalRegime: FiscalRegime;
  mealAllowance: number;
  accommodation: number;
  enabled?: boolean;
  showEnabled?: boolean;
  /** When < 1, the displayed total is scaled (scene filter proportional cost). */
  sceneRatio?: number;
  onPatch: (patch: {
    days?: number;
    dayRate?: number;
    fiscalRegime?: FiscalRegime;
    mealAllowance?: number;
    accommodation?: number;
    enabled?: boolean;
  }) => void;
  onRemove?: () => void;
}

const REGIME_LABELS: Record<FiscalRegime, string> = {
  piva: "P.IVA",
  privato: "Privato",
  none: "Netto",
};

function EditableCell({
  value,
  onCommit,
  type = "number",
  className,
  testId,
}: {
  value: string | number;
  onCommit: (v: string) => void;
  type?: "number" | "text";
  className?: string;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    setEditing(false);
    onCommit(draft);
  };

  if (editing) {
    return (
      <input
        className={`${styles.cellInput} ${className ?? ""}`}
        type={type}
        value={draft}
        autoFocus
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`${styles.cellButton} ${className ?? ""}`}
      data-testid={testId}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

function RegimeSelect({
  value,
  onChange,
  testId,
}: {
  value: FiscalRegime;
  onChange: (v: FiscalRegime) => void;
  testId?: string;
}) {
  return (
    <select
      className={styles.regimeSelect}
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value as FiscalRegime)}
    >
      {(["piva", "privato", "none"] as FiscalRegime[]).map((r) => (
        <option key={r} value={r}>
          {REGIME_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function BudgetResourceRow({
  id,
  name,
  days,
  dayRate,
  fiscalRegime,
  mealAllowance,
  accommodation,
  enabled = true,
  showEnabled = false,
  sceneRatio = 1,
  onPatch,
  onRemove,
}: BudgetResourceRowProps) {
  const fullTotal = resourceTotal({
    days,
    dayRate,
    fiscalRegime,
    mealAllowance,
    accommodation,
  });
  const total = fullTotal * sceneRatio;

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  return (
    <tr
      className={`${styles.row} ${!enabled ? styles.disabled : ""}`}
      data-testid={`resource-row-${id}`}
    >
      {showEnabled && (
        <td className={styles.cell}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
            aria-label="Attiva/disattiva"
          />
        </td>
      )}
      <td className={`${styles.cell} ${styles.nameCell}`}>{name}</td>
      <td className={styles.cell}>
        <EditableCell
          value={days}
          onCommit={(v) => {
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0) onPatch({ days: n });
          }}
          className={styles.numCell}
        />
      </td>
      <td className={styles.cell}>
        <EditableCell
          value={dayRate}
          onCommit={(v) => {
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0) onPatch({ dayRate: n });
          }}
          className={styles.numCell}
          testId={`resource-day-rate-${id}`}
        />
      </td>
      <td className={styles.cell}>
        <RegimeSelect
          value={fiscalRegime}
          onChange={(v) => onPatch({ fiscalRegime: v })}
          testId={`resource-regime-${id}`}
        />
      </td>
      <td className={styles.cell}>
        <EditableCell
          value={mealAllowance}
          onCommit={(v) => {
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0) onPatch({ mealAllowance: n });
          }}
          className={styles.numCell}
        />
      </td>
      <td className={styles.cell}>
        <EditableCell
          value={accommodation}
          onCommit={(v) => {
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0) onPatch({ accommodation: n });
          }}
          className={styles.numCell}
        />
      </td>
      <td
        className={`${styles.cell} ${styles.totalCell}`}
        data-testid={`resource-row-total-${id}`}
      >
        <span
          title={`${days}g × €${dayRate}${fiscalRegime === "privato" ? " ×1.20" : ""} + vitto/pernotto${sceneRatio < 1 ? ` × ${Math.round(sceneRatio * 100)}% (scena)` : ""}`}
        >
          {fmt(total)}
        </span>
      </td>
      {onRemove && (
        <td className={styles.cell}>
          <button
            type="button"
            className={styles.removeBtn}
            onClick={onRemove}
            aria-label="Rimuovi"
          >
            ×
          </button>
        </td>
      )}
    </tr>
  );
}
