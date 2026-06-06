// apps/web/app/features/documents/components/CesareUpdatedBanner.tsx
//
// Spec 63 — the entity-page "✦ Cesare ha aggiornato il <Entity>" card stack. When
// the open document's editor is in front of the writer, awareness of a Cesare edit
// comes from THIS card — never the SplitDrawer. On the entity page the split is
// NEVER opened by any banner action: the split is reserved for the chat surface.
//
// One card per Cesare turn. Multiple turns stack collapsed: a single header shows
// "N modifiche"; clicking it EXPANDS the stack into a vertical inline list (one
// card per turn, newest first). There is no ‹ › carousel.
//
// Per-card actions (all in-page, no split):
//   - "Mostra cosa è cambiato" → flashes the changed text INLINE on the open
//     document (the green-additions peek), via `flashLiveDiff`. Toggles off on a
//     second click. Never the split.
//   - "↩ Annulla" → restores the open document to the pre-turn version (the editor
//     re-syncs in place). Never the split.
//   - "× / Ho visto" → dismisses the card.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DocumentType } from "@oh-writers/domain";
import {
  getLiveEditState,
  subscribeLiveEdit,
  dismissLiveEdit,
  clearLiveEdits,
  type LiveEdit,
} from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import { setHighlight, clearHighlight } from "../lib/cesare-highlight-store";
import styles from "./CesareUpdatedBanner.module.css";

/** The added-text fragments of an edit — what "Mostra cosa è cambiato"
 *  underlines in the document. */
function addedFragments(edit: LiveEdit): ReadonlyArray<string> {
  return edit.segments.filter((s) => s.op === "add").map((s) => s.text);
}

interface CesareUpdatedBannerProps {
  readonly documentType: DocumentType;
  /** Restore the given (pre-edit) version — the page wires its versions/restore
   *  path here. Called by "↩ Indietro". The restore happens IN THE DOCUMENT (the
   *  editor re-syncs), never in the split. Returns a promise so the card can show
   *  a loader and only dismiss once the revert is confirmed. */
  readonly onUndo: (previousVersionId: string) => Promise<void>;
}

function useLiveEditsFor(documentType: string): ReadonlyArray<LiveEdit> {
  const state = useSyncExternalStore(
    subscribeLiveEdit,
    getLiveEditState,
    getLiveEditState,
  );
  return state.stacks[documentType] ?? [];
}

export function CesareUpdatedBanner({
  documentType,
  onUndo,
}: CesareUpdatedBannerProps) {
  const { t } = useTranslation();
  const edits = useLiveEditsFor(documentType);

  // Collapsed by default; clicking the "N modifiche" header expands the inline
  // list. A single edit renders the one card directly (no expand affordance).
  const [expanded, setExpanded] = useState(false);
  // Which card's in-document underline is currently shown (toggle).
  const [shownId, setShownId] = useState<string | null>(null);
  // Which card's "Indietro" revert is in flight (drives the inline loader). The
  // card dismisses only once the revert resolves, never optimistically.
  const [undoingId, setUndoingId] = useState<string | null>(null);

  // Clear any armed underline when the banner unmounts (route change, etc.).
  useEffect(() => {
    return () => clearHighlight(documentType);
  }, [documentType]);

  if (edits.length === 0) return null;

  const count = edits.length;
  // Newest LAST in the store; show newest first.
  const ordered = [...edits].reverse();
  const front = ordered[0];
  if (!front) return null;

  const showFor = (edit: LiveEdit) => {
    if (shownId === edit.id) {
      // Toggle off — remove the in-document underline.
      setShownId(null);
      clearHighlight(documentType);
      return;
    }
    setShownId(edit.id);
    // Underline the added fragments ON the real document prose (Spec 63).
    setHighlight(documentType, addedFragments(edit));
  };

  // "Indietro" — restore the document to the pre-turn version (a real revert).
  // The revert is async (server round-trip): show a loader and dismiss the card
  // ONLY once it resolves, never optimistically. On failure the card stays.
  const undoFor = async (edit: LiveEdit) => {
    if (undoingId) return;
    if (shownId === edit.id) {
      setShownId(null);
      clearHighlight(documentType);
    }
    if (!edit.previousVersionId) {
      dismissLiveEdit(documentType, edit.id);
      return;
    }
    setUndoingId(edit.id);
    try {
      await onUndo(edit.previousVersionId);
      dismissLiveEdit(documentType, edit.id);
    } finally {
      setUndoingId(null);
    }
  };

  const dismiss = (edit: LiveEdit) => {
    dismissLiveEdit(documentType, edit.id);
    if (shownId === edit.id) {
      setShownId(null);
      clearHighlight(documentType);
    }
  };

  const renderCard = (edit: LiveEdit, entityLabel: string) => (
    <div className={styles.card} data-testid={`cesare-updated-card-${edit.id}`}>
      <span className={styles.glyph} aria-hidden="true">
        ✦
      </span>
      <span className={styles.message}>
        {t("documents.cesareUpdated.message").replace("{entity}", entityLabel)}
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.see}
          onClick={() => showFor(edit)}
          data-testid="cesare-updated-see"
          aria-pressed={shownId === edit.id}
        >
          {t("documents.cesareUpdated.see")}
        </button>
        {edit.previousVersionId && (
          <button
            type="button"
            className={styles.undo}
            onClick={() => void undoFor(edit)}
            disabled={undoingId === edit.id}
            data-testid="cesare-updated-undo"
            data-loading={undoingId === edit.id || undefined}
          >
            {undoingId === edit.id && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            {t("documents.cesareUpdated.undo")}
          </button>
        )}
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => dismiss(edit)}
          aria-label={t("documents.cesareUpdated.dismiss")}
          title={t("documents.cesareUpdated.dismiss")}
          data-testid="cesare-updated-dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );

  // Single edit: just the one card, no pile/fan.
  if (count === 1) {
    return (
      <section
        className={styles.banner}
        role="status"
        data-testid="cesare-updated-banner"
        data-document-type={documentType}
        data-stack-count={count}
      >
        {renderCard(front, front.label)}
      </section>
    );
  }

  // Multiple edits — an iOS-style pile (newest on top). Collapsed: the top card
  // with the rest hinted behind + a "+N" badge; clicking the top card fans the
  // stack out into an offset cascade (newest first).
  const behindCount = count - 1;

  return (
    <section
      className={styles.banner}
      role="status"
      data-testid="cesare-updated-banner"
      data-document-type={documentType}
      data-stack-count={count}
      data-expanded={expanded || undefined}
    >
      {!expanded ? (
        <button
          type="button"
          className={styles.pile}
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={t("documents.cesareUpdated.count").replace(
            "{n}",
            String(count),
          )}
          data-testid="cesare-updated-stack-toggle"
        >
          {/* Hinted cards behind the top one (max 2 edges). */}
          <span className={styles.pileEdge} data-depth="2" aria-hidden="true" />
          <span className={styles.pileEdge} data-depth="1" aria-hidden="true" />
          <span className={styles.pileTop}>
            <span className={styles.glyph} aria-hidden="true">
              ✦
            </span>
            <span className={styles.message}>
              {t("documents.cesareUpdated.message").replace(
                "{entity}",
                front.label,
              )}
            </span>
            <span className={styles.badge} data-testid="cesare-updated-count">
              +{behindCount}
            </span>
          </span>
        </button>
      ) : (
        <div className={styles.fan} data-testid="cesare-updated-list">
          {ordered.map((edit, i) => (
            <div
              key={edit.id}
              className={styles.fanItem}
              style={{ zIndex: count - i }}
            >
              {renderCard(edit, edit.label)}
            </div>
          ))}
          <div className={styles.fanFooter}>
            <button
              type="button"
              className={styles.collapse}
              onClick={() => setExpanded(false)}
              data-testid="cesare-updated-collapse"
            >
              {t("documents.cesareUpdated.collapse")}
            </button>
            <button
              type="button"
              className={styles.dismissAll}
              onClick={() => {
                clearLiveEdits(documentType);
                setShownId(null);
                setExpanded(false);
              }}
              data-testid="cesare-updated-dismiss-all"
            >
              {t("documents.cesareUpdated.dismiss")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
