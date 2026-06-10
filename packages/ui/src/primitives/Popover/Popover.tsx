// packages/ui/src/primitives/Popover/Popover.tsx
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { DismissButton, FocusScope, useOverlay } from "react-aria";
import {
  computeAnchoredPosition,
  type AnchoredPlacement,
} from "./anchoredPosition";
import styles from "./Popover.module.css";

export type PopoverPlacement = AnchoredPlacement;

export type PopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The element the popover anchors to. Required so the popover can position
   *  itself in a body portal and stay on screen regardless of where the
   *  trigger lives (e.g. a compressed TopBar slot). */
  triggerRef: RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  width?: number | string;
  children: ReactNode;
  className?: string;
};

export function Popover({
  isOpen,
  onClose,
  triggerRef,
  placement = "bottom-start",
  width,
  children,
  className,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  // useOverlay provides Esc and outside-click dismissal. shouldCloseOnBlur is
  // intentionally false: popovers with editable content (e.g. the logline
  // textarea) would close the moment the user clicks into an input, because the
  // focus move triggers a blur on the overlay div before landing on the input.
  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, shouldCloseOnBlur: false },
    ref,
  );

  // Position against the trigger, clamping to the viewport so the popover can
  // never render off-screen. The overlay first paints off-screen (coords null)
  // so it can be measured, then this effect places it. Re-runs on resize and
  // on any scroll (capture phase catches scrolling ancestors).
  useLayoutEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    const reposition = () => {
      const trigger = triggerRef.current;
      const overlay = ref.current;
      if (!trigger || !overlay) return;
      const t = trigger.getBoundingClientRect();
      // Layout size, not getBoundingClientRect: the popIn animation scales the
      // overlay from 0.96, so a rect measured mid-animation understates the
      // size by 4% and the viewport clamp then lands the dialog off-screen at
      // narrow widths (BUG-N38). offsetWidth/Height ignore transforms.
      setCoords(
        computeAnchoredPosition({
          trigger: t,
          overlay: { width: overlay.offsetWidth, height: overlay.offsetHeight },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          placement,
        }),
      );
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, placement, triggerRef]);

  if (!isOpen || typeof document === "undefined") return null;

  // restoreFocus returns focus to the trigger on close. autoFocus is
  // intentionally omitted: it would steal focus from editable children (e.g.
  // the logline textarea) on every re-render triggered by controlled input.
  // Esc still works because overlayProps.onKeyDown is on the overlay div and
  // bubbles up from any focused child inside it.
  return createPortal(
    <FocusScope restoreFocus>
      <div
        {...overlayProps}
        ref={ref}
        role="dialog"
        aria-modal="false"
        className={[styles.popover, className].filter(Boolean).join(" ")}
        style={
          coords
            ? { top: coords.top, left: coords.left, width }
            : { top: -9999, left: -9999, width, visibility: "hidden" }
        }
      >
        <DismissButton onDismiss={onClose} />
        {children}
        <DismissButton onDismiss={onClose} />
      </div>
    </FocusScope>,
    document.body,
  );
}
