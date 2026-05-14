// packages/ui/src/primitives/Popover/Popover.tsx
import { useEffect, useRef, type ReactNode } from "react";
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
  "bottom-start": styles.bottomStart,
  "bottom-end": styles.bottomEnd,
  "bottom-center": styles.bottomCenter,
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

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      className={[styles.popover, placementClass[placement], className]
        .filter(Boolean)
        .join(" ")}
      style={width != null ? { width } : undefined}
    >
      {children}
    </div>
  );
}
