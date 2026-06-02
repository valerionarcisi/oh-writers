// packages/ui/src/primitives/Popover/Popover.tsx
import { useRef, type ReactNode } from "react";
import { DismissButton, FocusScope, useOverlay } from "react-aria";
import styles from "./Popover.module.css";

export type PopoverPlacement = "bottom-start" | "bottom-end" | "bottom-center";

export type PopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  placement?: PopoverPlacement;
  width?: number | string;
  children: ReactNode;
  className?: string;
};

const placementClass: Record<PopoverPlacement, string> = {
  "bottom-start": styles.bottomStart ?? "",
  "bottom-end": styles.bottomEnd ?? "",
  "bottom-center": styles.bottomCenter ?? "",
};

export function Popover({
  isOpen,
  onClose,
  placement = "bottom-start",
  width,
  children,
  className,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // useOverlay provides Esc, outside-click, and blur dismissal for this
  // non-modal popover. shouldCloseOnBlur closes it when focus leaves the
  // overlay (e.g. tabbing past the last item).
  const { overlayProps } = useOverlay(
    { isOpen, onClose, isDismissable: true, shouldCloseOnBlur: true },
    ref,
  );

  if (!isOpen) return null;

  // autoFocus moves focus into the popover on open so react-aria's keyboard
  // dismiss (Esc, bound to the overlay element via overlayProps.onKeyDown)
  // fires even when the trigger lives outside the overlay; restoreFocus then
  // returns focus to the trigger on close.
  return (
    <FocusScope restoreFocus autoFocus>
      <div
        {...overlayProps}
        ref={ref}
        role="dialog"
        aria-modal="false"
        className={[styles.popover, placementClass[placement], className]
          .filter(Boolean)
          .join(" ")}
        style={width != null ? { width } : undefined}
      >
        <DismissButton onDismiss={onClose} />
        {children}
        <DismissButton onDismiss={onClose} />
      </div>
    </FocusScope>
  );
}
