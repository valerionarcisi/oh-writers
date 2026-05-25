import { useRef } from "react";
import { useDialog, FocusScope } from "react-aria";
import {
  X,
  Calendar,
  Euro,
  ExternalLink,
  Bookmark,
  CheckCircle,
} from "lucide-react";
import type { OpportunityWithSave } from "../server/fundraising.server";
import type { FundraisingSaveState } from "@oh-writers/db/schema";
import styles from "./OpportunityDrawer.module.css";

interface OpportunityDrawerProps {
  opportunity: OpportunityWithSave | null;
  onClose: () => void;
  onSave: (state: FundraisingSaveState) => void;
  onNotesBlur: (notes: string) => void;
}

function formatDeadlineFull(deadlineAt: Date | null): {
  label: string;
  urgent: boolean;
  expired: boolean;
} {
  if (!deadlineAt)
    return { label: "Scadenza non indicata", urgent: false, expired: false };
  const now = Date.now();
  const diff = deadlineAt.getTime() - now;
  const days = Math.round(diff / 86_400_000);
  const dateStr = deadlineAt.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (days < 0) {
    return { label: `Scaduto il ${dateStr}`, urgent: false, expired: true };
  }
  return { label: `Scade il ${dateStr}`, urgent: days <= 14, expired: false };
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

function DrawerContent({
  opportunity,
  onClose,
  onSave,
  onNotesBlur,
}: {
  opportunity: OpportunityWithSave;
  onClose: () => void;
  onSave: (state: FundraisingSaveState) => void;
  onNotesBlur: (notes: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogProps, titleProps } = useDialog(
    { "aria-label": opportunity.title },
    ref,
  );

  const deadline = formatDeadlineFull(opportunity.deadlineAt);
  const amount = formatAmount(
    opportunity.amountMin,
    opportunity.amountMax,
    opportunity.amountText,
  );
  const eligibility = opportunity.eligibility ?? {};
  const allTags = [
    ...(eligibility.formats ?? []),
    ...(eligibility.genres ?? []),
    ...(eligibility.regions ?? []),
    ...(eligibility.careerStage ?? []),
  ];

  return (
    <div
      ref={ref}
      {...dialogProps}
      className={styles.drawer}
      data-testid="opportunity-drawer"
    >
      <div className={styles.drawerHeader}>
        <h2 {...titleProps} className={styles.drawerTitle}>
          {opportunity.title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Chiudi dettaglio"
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.drawerBody}>
        {/* Save actions */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Stato</div>
          <div className={styles.saveActions}>
            <button
              type="button"
              className={styles.saveActionBtn}
              data-active={opportunity.saveState === "saved"}
              data-testid="save-btn"
              onClick={() => onSave("saved")}
            >
              <Bookmark size={14} />
              Salva
            </button>
            <button
              type="button"
              className={styles.saveActionBtn}
              data-active={opportunity.saveState === "dismissed"}
              data-testid="dismiss-btn"
              onClick={() => onSave("dismissed")}
            >
              <X size={14} />
              Ignora
            </button>
            <button
              type="button"
              className={styles.saveActionBtn}
              data-active={opportunity.saveState === "applied"}
              data-testid="applied-btn"
              onClick={() => onSave("applied")}
            >
              <CheckCircle size={14} />
              Applicato
            </button>
          </div>
        </div>

        {/* Deadline */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Scadenza</div>
          <div className={styles.metaRow}>
            <Calendar size={14} className={styles.metaIcon} />
            <span
              className={
                deadline.expired
                  ? styles.deadlineValueExpired
                  : deadline.urgent
                    ? styles.deadlineValueUrgent
                    : styles.deadlineValue
              }
            >
              {deadline.label}
            </span>
          </div>
        </div>

        {/* Amount */}
        {amount && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Importo</div>
            <div className={styles.metaRow}>
              <Euro size={14} className={styles.metaIcon} />
              <span className={styles.deadlineValue}>{amount}</span>
            </div>
          </div>
        )}

        {/* Summary */}
        {opportunity.summary && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Descrizione</div>
            <p className={styles.sectionText}>{opportunity.summary}</p>
          </div>
        )}

        {/* Requirements */}
        {opportunity.requirements && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Requisiti</div>
            <p className={styles.sectionText}>{opportunity.requirements}</p>
          </div>
        )}

        {/* Eligibility tags */}
        {allTags.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Eleggibilità</div>
            <div className={styles.tags}>
              {allTags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External link */}
        <div className={styles.section}>
          <a
            href={opportunity.link}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.externalLink}
          >
            <ExternalLink size={14} />
            Apri sul sito
          </a>
        </div>

        {/* Notes */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Note</div>
          <textarea
            className={styles.notesTextarea}
            defaultValue={opportunity.saveNotes ?? ""}
            placeholder="Aggiungi note personali…"
            onBlur={(e) => onNotesBlur(e.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function OpportunityDrawer({
  opportunity,
  onClose,
  onSave,
  onNotesBlur,
}: OpportunityDrawerProps) {
  const isOpen = opportunity !== null;

  return (
    <FocusScope restoreFocus contain={isOpen}>
      {isOpen ? (
        <DrawerContent
          opportunity={opportunity}
          onClose={onClose}
          onSave={onSave}
          onNotesBlur={onNotesBlur}
        />
      ) : (
        <div
          className={`${styles.drawer} ${styles.drawerHidden}`}
          aria-hidden="true"
        />
      )}
    </FocusScope>
  );
}
