// apps/web/app/features/app-shell/components/VersionsSplitLane.tsx
//
// The routed Versions SplitDrawer lane (Spec 49 W1 + W2). Mounted at the shell
// level as the third grid column when `?versions=<documentId>` is set on the
// host route. The host page stays mounted and COMPRESSES (the main lane reflows
// narrower) — the Notion side-peek model, NOT a floating overlay. This is the
// SplitDrawer twin of `CesarePeekLane`, but for the version list + vs-current
// diff instead of the Cesare chat.
//
// State is driven entirely by the URL (the routed-surface single source of
// truth, Spec 49):
//   - `?versions=<id>`              → SplitDrawer `open` (split, host compresses)
//   - `?versions=<id>&vstate=full`  → SplitDrawer `full` (`↗` expanded to a real
//                                     full-screen route; browser-back / `↙`
//                                     returns to the split)
//   - param dropped (`×` / ESC / browser-back) → closed, host returns to full
//
// `↗` is implemented as a REAL navigation (`navigateState`, a new history
// entry), so the URL becomes shareable and browser-back returns to the host +
// split. The SplitDrawer primitive owns the chrome + react-aria dismiss
// (`useDialog`/`useOverlay` inside the lane wrapper).

import { useRef } from "react";
import { useDialog, useOverlay, FocusScope } from "react-aria";
import { SplitDrawer } from "@oh-writers/ui";
import type { SplitDrawerState } from "@oh-writers/ui";
import { VersionsSplitDrawer } from "~/features/versions";
import type { VersionsPeek, VersionsCompare } from "../versions-peek";
import styles from "./VersionsSplitLane.module.css";

export interface VersionsSplitLaneProps {
  /** The validated routed Versions target (document + state + baseline). */
  readonly peek: VersionsPeek;
  /** The validated `?compare=` pair (Spec 49 W3) or `null` for "vs current". */
  readonly compare: VersionsCompare | null;
  /** Patch the `?compare=` companion (null drops it). */
  readonly onCompareChange: (next: VersionsCompare | null) => void;
  /** Width (px) of the split lane; persisted by AppShell. */
  readonly width: number;
  readonly onWidthChange: (next: number) => void;
  /** `↗` expand → real navigation to the full-screen versions route. */
  readonly onExpand: () => void;
  /** `↙` step-back → real navigation from full back to the split. */
  readonly onStepBack: () => void;
  /** `×` / ESC / outside-dismiss → clear the `?versions` param. */
  readonly onClose: () => void;
}

export function VersionsSplitLane({
  peek,
  compare,
  onCompareChange,
  width,
  onWidthChange,
  onExpand,
  onStepBack,
  onClose,
}: VersionsSplitLaneProps) {
  const ref = useRef<HTMLDivElement>(null);

  // react-aria owns dismiss + focus (mandatory). ESC clears `?versions`.
  // Outside-interaction dismiss is disabled so the compressed host page beside
  // the lane stays clickable — same contract as the Cesare peek lane.
  const { overlayProps } = useOverlay(
    {
      onClose,
      isOpen: true,
      isDismissable: true,
      shouldCloseOnInteractOutside: () => false,
    },
    ref,
  );
  const { dialogProps } = useDialog({ "aria-label": "Versioni" }, ref);

  // The SplitDrawer's visible state mirrors the routed surface: `full` when the
  // user expanded (`?vstate=full`), `open` (split) otherwise. The primitive's
  // controls dispatch back into URL navigations.
  const state: SplitDrawerState = peek.state === "full" ? "full" : "open";

  return (
    <FocusScope>
      <div
        {...overlayProps}
        {...dialogProps}
        ref={ref}
        className={styles.lane}
        data-testid="versions-split-lane"
        data-split-lane="versions"
      >
        <SplitDrawer
          state={state}
          placement="lane"
          onStateChange={(next) => {
            // Reflect a primitive-driven state change as a URL navigation so the
            // URL stays authoritative.
            if (next === "closed") onClose();
            else if (next === "full") onExpand();
            else onStepBack();
          }}
          onCycle={state === "full" ? onStepBack : onExpand}
          onStepBack={onStepBack}
          onClose={onClose}
          header={<h2 className={styles.title}>Versioni</h2>}
          size={{ width }}
          onSizeChange={({ width: next }) => onWidthChange(next)}
          ariaLabel="Versioni del documento"
          testId="versions-split-drawer-frame"
        >
          <VersionsSplitDrawer
            documentId={peek.documentId}
            currentVersionId={peek.currentVersionId}
            compare={compare}
            onCompareChange={onCompareChange}
          />
        </SplitDrawer>
      </div>
    </FocusScope>
  );
}
