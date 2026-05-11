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
}: {
  value: string | number;
  onCommit: (v: string) => void;
  type?: "number" | "text";
  className?: string;
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
}: {
  value: FiscalRegime;
  onChange: (v: FiscalRegime) => void;
}) {
  return (
    <select
      className={styles.regimeSelect}
      value={value}
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
  onPatch,
  onRemove,
}: BudgetResourceRowProps) {
  const total = resourceTotal({
    days,
    dayRate,
    fiscalRegime,
    mealAllowance,
    accommodation,
  });

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  return (
    <tr className={`${styles.row} ${!enabled ? styles.disabled : ""}`}>
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
        />
      </td>
      <td className={styles.cell}>
        <RegimeSelect
          value={fiscalRegime}
          onChange={(v) => onPatch({ fiscalRegime: v })}
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
      <td className={`${styles.cell} ${styles.totalCell}`}>
        <span
          title={`${days}g × €${dayRate}${fiscalRegime === "privato" ? " ×1.20" : ""} + vitto/pernotto`}
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
