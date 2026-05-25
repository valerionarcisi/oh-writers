import { Bookmark, X, CheckCircle } from "lucide-react";
import type { OpportunityWithSave } from "../server/fundraising.server";
import type { FundraisingSaveState } from "@oh-writers/db/schema";
import styles from "./OpportunityCard.module.css";

const KIND_LABELS: Record<string, string> = {
  bando_pubblico: "Bando pubblico",
  call_festival: "Festival",
  residenza: "Residenza",
  grant_privato: "Grant",
  workshop: "Workshop",
  pitch_forum: "Pitch forum",
  other: "Altro",
};

interface OpportunityCardProps {
  opportunity: OpportunityWithSave;
  isSelected: boolean;
  onSelect: () => void;
  onSave: (state: FundraisingSaveState) => void;
}

function formatDeadline(deadlineAt: Date | null): {
  label: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!deadlineAt)
    return { label: "Scadenza non indicata", urgent: false, expired: false };
  const now = Date.now();
  const diff = deadlineAt.getTime() - now;
  const days = Math.round(diff / 86_400_000);
  if (days < 0) {
    return {
      label: `Scaduto ${Math.abs(days)} giorni fa`,
      urgent: false,
      expired: true,
    };
  }
  return {
    label: `tra ${days} giorni`,
    urgent: days <= 14,
    expired: false,
  };
}

function formatAmount(
  amountMin: string | null,
  amountMax: string | null,
  amountText: string | null,
): string | null {
  if (amountMin && amountMax) {
    const fmt = (v: string) =>
      Number(v).toLocaleString("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      });
    return `${fmt(amountMin)} – ${fmt(amountMax)}`;
  }
  if (amountMax) {
    const fmt = Number(amountMax).toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
    return `Fino a ${fmt}`;
  }
  return amountText ?? null;
}

export function OpportunityCard({
  opportunity,
  isSelected,
  onSelect,
  onSave,
}: OpportunityCardProps) {
  const deadline = formatDeadline(opportunity.deadlineAt);
  const amount = formatAmount(
    opportunity.amountMin,
    opportunity.amountMax,
    opportunity.amountText,
  );

  const handleSaveClick = (
    state: FundraisingSaveState,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    // Toggle off if already active
    if (opportunity.saveState === state) return;
    onSave(state);
  };

  return (
    <li
      className={styles.card}
      data-selected={isSelected}
      data-testid={`opportunity-card-${opportunity.id}`}
      onClick={onSelect}
    >
      <div className={styles.cardTop}>
        <div>
          <div className={styles.title}>{opportunity.title}</div>
          {opportunity.organization && (
            <div className={styles.org}>{opportunity.organization}</div>
          )}
        </div>
        <span className={styles.kindBadge} data-kind={opportunity.kind}>
          {KIND_LABELS[opportunity.kind] ?? opportunity.kind}
        </span>
      </div>

      <div className={styles.cardMeta}>
        <span
          className={styles.deadline}
          data-urgent={deadline.urgent}
          data-expired={deadline.expired}
        >
          {deadline.label}
        </span>
        {amount && <span className={styles.amount}>{amount}</span>}
      </div>

      <div className={styles.saveRow}>
        <button
          type="button"
          className={styles.saveBtn}
          data-active={opportunity.saveState === "saved"}
          data-testid="save-btn-card"
          title="Salva"
          onClick={(e) => handleSaveClick("saved", e)}
          aria-label="Salva opportunità"
        >
          <Bookmark size={14} />
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          data-active={opportunity.saveState === "dismissed"}
          data-testid="dismiss-btn-card"
          title="Ignora"
          onClick={(e) => handleSaveClick("dismissed", e)}
          aria-label="Ignora opportunità"
        >
          <X size={14} />
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          data-active={opportunity.saveState === "applied"}
          data-testid="applied-btn-card"
          title="Applicato"
          onClick={(e) => handleSaveClick("applied", e)}
          aria-label="Applicato"
        >
          <CheckCircle size={14} />
        </button>
      </div>
    </li>
  );
}
