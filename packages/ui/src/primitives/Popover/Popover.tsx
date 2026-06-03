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

  // useOverlay provides Esc, outside-click, and blur dismissal for this
  // non-modal popover. shouldCloseOnBlur closes it when focus leaves the
  // overlay (e.g. tabbing past the last item).
  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, shouldCloseOnBlur: true },
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
      const o = overlay.getBoundingClientRect();
      setCoords(
        computeAnchoredPosition({
          trigger: t,
          overlay: { width: o.width, height: o.height },
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

  // autoFocus moves focus into the popover on open so react-aria's keyboard
  // dismiss (Esc, bound to the overlay element via overlayProps.onKeyDown)
  // fires even when the trigger lives outside the overlay; restoreFocus then
  // returns focus to the trigger on close.
  return createPortal(
    <FocusScope restoreFocus autoFocus>
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
