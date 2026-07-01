import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "~/features/i18n";
import styles from "./HoverToolbar.module.css";

export interface HoverToolbarProps {
  onAccept: () => void;
  onReject: () => void;
  /**
   * Controls toolbar visibility:
   * - `false`: hidden entirely (no pending edit)
   * - `"done"`: a scene rewrite is applied and awaiting accept/reject.
   */
  status: false | "done";
}

/**
 * Inline accept/reject bar anchored to the just-rewritten scene (the green
 * `.cesare-scene-new` node). Portal-mounted so it sits above the ProseMirror
 * layer without disturbing the editor's DOM tree.
 */
export function HoverToolbar({
  onAccept,
  onReject,
  status,
}: HoverToolbarProps) {
  const { t } = useTranslation();
  const [toolbarPos, setToolbarPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Position the toolbar at the top-right of the decoration block whenever
  // the status transitions to "done" or the block moves.
  useLayoutEffect(() => {
    if (status !== "done") {
      setToolbarPos(null);
      return;
    }

    const updatePosition = () => {
      const block = document.querySelector<HTMLElement>(".cesare-scene-new");
      if (!block) {
        setToolbarPos(null);
        return;
      }
      const rect = block.getBoundingClientRect();
      setToolbarPos({
        top: rect.top + window.scrollY,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();

    // Keep position in sync when the user scrolls or the editor reflows.
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    // Reposition when the decoration text grows (e.g. future streaming phase 2)
    const observer = new MutationObserver(updatePosition);
    const editor = document.querySelector(".ProseMirror");
    if (editor) {
      observer.observe(editor, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
      observer.disconnect();
    };
  }, [status]);

  if (status !== "done" || !toolbarPos) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      style={{
        top: toolbarPos.top,
        insetInlineEnd: toolbarPos.right,
      }}
      data-testid="cesare-hover-toolbar"
    >
      <button
        type="button"
        className={styles.acceptBtn}
        onClick={onAccept}
        data-testid="cesare-pending-accept"
        aria-label={t("screenplay.hover.acceptAria")}
      >
        ✓ {t("screenplay.hover.accept")}
      </button>
      <button
        type="button"
        className={styles.rejectBtn}
        onClick={onReject}
        data-testid="cesare-pending-reject"
        aria-label={t("screenplay.hover.rejectAria")}
      >
        ✗ {t("screenplay.hover.reject")}
      </button>
    </div>,
    document.body,
  );
}
