// apps/web/app/features/app-shell/components/CesareLiveDiff.tsx
//
// Spec 47e — the TRANSIENT FLASH "Mostra / Nascondi modifiche" highlight,
// painted INSIDE the real document prose (no floating overlay panel).
//
// The edit is ALWAYS already applied to the document. This layer is a one-shot
// visual flash, not a persistent overlay:
//
//   - "Mostra modifiche"   → flash the NEW text with GREEN additions, then it
//                            fades out. The document stays on the new version.
//   - "Nascondi modifiche" → flash the PREVIOUS text with RED removals (a peek
//                            at "how it was"), then it fades out. Nascondi never
//                            reverts — the document still holds the new version.
//
// One instance is mounted per document body (`documentType` prop). The chat arms
// the store with one flash per touched document keyed by type (`flashLiveDiff`);
// each instance reads its own flash and self-clears on a timer keyed by the
// flash `nonce`. The fade effect runs ONLY when the nonce changes (i.e. on a
// click) — never every render — so there is no persistent reconciled state
// feeding an effect, and the 47d "Maximum update depth exceeded" loop is gone.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DocumentType } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import {
  getLiveDiffState,
  subscribeLiveDiff,
  type LiveDiffFlash,
  type LiveDiffSegment,
} from "../cesare-live-diff-store";
import styles from "./CesareLiveDiff.module.css";

/** How long the flash stays painted before it is cleared (ms). Authoritative —
 *  must match the `flash-fade` animation duration in CesareLiveDiff.module.css. */
const FLASH_DURATION_MS = 2200;

interface CesareLiveDiffProps {
  /** The document this flash layer belongs to. Only the matching flash from
   *  the store is painted, so the highlight is keyed per document. */
  readonly documentType: DocumentType;
}

function useFlashFor(documentType: DocumentType): LiveDiffFlash | null {
  const state = useSyncExternalStore(
    subscribeLiveDiff,
    getLiveDiffState,
    getLiveDiffState,
  );
  return state.flashes[documentType] ?? null;
}

/**
 * Which segments to paint for a flash. "Mostra" shows the new text (equal +
 * additions, additions marked green). "Nascondi" peeks at the previous text
 * (equal + removals, removals marked red). The applied document content never
 * changes — both are purely visual.
 */
function visibleSegments(flash: LiveDiffFlash): ReadonlyArray<LiveDiffSegment> {
  if (flash.mode === "mostra") {
    return flash.segments.filter((s) => s.op === "eq" || s.op === "add");
  }
  return flash.segments.filter((s) => s.op === "eq" || s.op === "del");
}

export function CesareLiveDiff({ documentType }: CesareLiveDiffProps) {
  const { t } = useTranslation();
  const flash = useFlashFor(documentType);
  // The flash currently being painted. Set imperatively when a NEW nonce
  // arrives, cleared by a timer — fire-and-forget, no derived loop.
  const [active, setActive] = useState<LiveDiffFlash | null>(null);
  const shownNonceRef = useRef<number | null>(null);

  // Keyed ONLY on the flash nonce (a primitive that changes solely on click).
  // A null/repeat nonce is a no-op, so this effect never re-runs per render and
  // cannot drive an update-depth loop.
  const nonce = flash?.nonce ?? null;
  useEffect(() => {
    if (flash == null || nonce == null) return;
    if (shownNonceRef.current === nonce) return;
    shownNonceRef.current = nonce;
    setActive(flash);
    const timer = window.setTimeout(() => {
      setActive(null);
    }, FLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!active) return null;

  return (
    <div
      className={styles.layer}
      data-testid="cesare-live-diff-inline"
      data-document-type={documentType}
      data-flash-mode={active.mode}
      role="region"
      aria-label={t("shell.liveDiff.aria")}
    >
      <p className={styles.body}>
        {visibleSegments(active).map((seg, i) => {
          if (seg.op === "add") {
            return (
              <mark key={i} className={styles.added} data-diff-op="add">
                {seg.text}
              </mark>
            );
          }
          if (seg.op === "del") {
            return (
              <del key={i} className={styles.removed} data-diff-op="del">
                {seg.text}
              </del>
            );
          }
          return (
            <span key={i} className={styles.equal} data-diff-op="eq">
              {seg.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
