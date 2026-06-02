import { Bookmark, X, CheckCircle } from "lucide-react";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type { OpportunityWithSave } from "../server/fundraising.server";
import type { FundraisingSaveState } from "@oh-writers/db/schema";
import styles from "./OpportunityCard.module.css";

type Translate = (key: TranslationKey) => string;

const KIND_LABEL_KEYS: Record<string, TranslationKey> = {
  bando_pubblico: "fundraising.kind.bando_pubblico",
  call_festival: "fundraising.kind.call_festival",
  residenza: "fundraising.kind.residenza",
  grant_privato: "fundraising.kind.grant_privato",
  workshop: "fundraising.kind.workshop",
  pitch_forum: "fundraising.kind.pitch_forum",
  other: "fundraising.kind.other",
};

interface OpportunityCardProps {
  opportunity: OpportunityWithSave;
  isSelected: boolean;
  onSelect: () => void;
  onSave: (state: FundraisingSaveState) => void;
}

function formatDeadline(
  deadlineAt: Date | null,
  t: Translate,
): {
  label: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!deadlineAt)
    return {
      label: t("fundraising.deadlineLabel.none"),
      urgent: false,
      expired: false,
    };
  const now = Date.now();
  const diff = deadlineAt.getTime() - now;
  const days = Math.round(diff / 86_400_000);
  if (days < 0) {
    return {
      label: t("fundraising.deadlineLabel.expiredDaysAgo").replace(
        "{value}",
        String(Math.abs(days)),
      ),
      urgent: false,
      expired: true,
    };
  }
  return {
    label: t("fundraising.deadlineLabel.inDays").replace(
      "{value}",
      String(days),
    ),
    urgent: days <= 14,
    expired: false,
  };
}

function formatAmount(
  amountMin: string | null,
  amountMax: string | null,
  amountText: string | null,
  t: Translate,
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
    return t("fundraising.amount.upTo").replace("{value}", fmt);
  }
  return amountText ?? null;
}

export function OpportunityCard({
  opportunity,
  isSelected,
  onSelect,
  onSave,
}: OpportunityCardProps) {
  const { t } = useTranslation();
  const deadline = formatDeadline(opportunity.deadlineAt, t);
  const amount = formatAmount(
    opportunity.amountMin,
    opportunity.amountMax,
    opportunity.amountText,
    t,
  );
  const kindLabelKey = KIND_LABEL_KEYS[opportunity.kind];

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
          {kindLabelKey ? t(kindLabelKey) : opportunity.kind}
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
          title={t("fundraising.action.save")}
          onClick={(e) => handleSaveClick("saved", e)}
          aria-label={t("fundraising.action.saveAria")}
        >
          <Bookmark size={14} />
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          data-active={opportunity.saveState === "dismissed"}
          data-testid="dismiss-btn-card"
          title={t("fundraising.action.dismiss")}
          onClick={(e) => handleSaveClick("dismissed", e)}
          aria-label={t("fundraising.action.dismissAria")}
        >
          <X size={14} />
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          data-active={opportunity.saveState === "applied"}
          data-testid="applied-btn-card"
          title={t("fundraising.action.applied")}
          onClick={(e) => handleSaveClick("applied", e)}
          aria-label={t("fundraising.action.appliedAria")}
        >
          <CheckCircle size={14} />
        </button>
      </div>
    </li>
  );
}
