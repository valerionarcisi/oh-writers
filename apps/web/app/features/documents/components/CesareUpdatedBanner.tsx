// apps/web/app/features/documents/components/CesareUpdatedBanner.tsx
//
// Spec 78 §A2 — the entity-page "✦ Cesare ha aggiornato il <Entity>" confirmation.
// The agentic-edit pattern (CLAUDE.md) is: the edit applies LIVE behind the chat,
// the chat result card is the record, and true revert lives in the Versions
// SplitDrawer (Spec 47e). So this surface is intentionally minimal — ONE discreet,
// auto-dismissing line per document. It never stacks (the store keeps at most one
// entry per documentType), it has no "Mostra cosa è cambiato" inline highlight, and
// it has no inline undo. Its only job is to confirm "Cesare touched this" and fade.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useButton } from "react-aria";
import type { DocumentType } from "@oh-writers/domain";
import {
  getLiveEditState,
  subscribeLiveEdit,
  dismissLiveEdit,
  type LiveEdit,
} from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./CesareUpdatedBanner.module.css";

/** How long the confirmation line lingers before it fades on its own (ms). */
const AUTO_DISMISS_MS = 6000;

interface CesareUpdatedBannerProps {
  readonly documentType: DocumentType;
}

function useLatestLiveEditFor(documentType: string): LiveEdit | null {
  const state = useSyncExternalStore(
    subscribeLiveEdit,
    getLiveEditState,
    getLiveEditState,
  );
  const edits = state.stacks[documentType] ?? [];
  return edits[edits.length - 1] ?? null;
}

function DismissButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": label, type: "button" },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={styles.dismiss}
      title={label}
      data-testid="cesare-updated-dismiss"
    >
      ×
    </button>
  );
}

export function CesareUpdatedBanner({
  documentType,
}: CesareUpdatedBannerProps) {
  const { t } = useTranslation();
  const edit = useLatestLiveEditFor(documentType);
  const editId = edit?.id ?? null;

  // Auto-dismiss the line after a short linger. Keyed on the edit id so a newer
  // edit (which replaced the previous in the store) restarts its own timer and a
  // stale timer never clears the current line.
  useEffect(() => {
    if (!editId) return;
    const timer = window.setTimeout(() => {
      dismissLiveEdit(documentType, editId);
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [editId, documentType]);

  if (!edit) return null;

  return (
    <section
      className={styles.banner}
      role="status"
      data-testid="cesare-updated-banner"
      data-document-type={documentType}
      data-stack-count={1}
    >
      <div
        className={styles.line}
        data-testid={`cesare-updated-card-${edit.id}`}
      >
        <span className={styles.glyph} aria-hidden="true">
          ✦
        </span>
        <span className={styles.message}>
          {t("documents.cesareUpdated.message").replace("{entity}", edit.label)}
        </span>
        <DismissButton
          onPress={() => dismissLiveEdit(documentType, edit.id)}
          label={t("documents.cesareUpdated.dismiss")}
        />
      </div>
    </section>
  );
}
