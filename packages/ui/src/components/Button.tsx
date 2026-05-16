import { useRef } from "react";
import { useButton } from "react-aria";
import type { PressEvent } from "react-aria";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  /** React Aria press handler (cross-browser, mobile-friendly). onClick is still supported. */
  onPress?: (e: PressEvent) => void;
  onPressStart?: (e: PressEvent) => void;
  onPressEnd?: (e: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  onPress,
  onPressStart,
  onPressEnd,
  onPressChange,
  type = "button",
  ...rest
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const { buttonProps } = useButton(
    {
      isDisabled: disabled,
      onPress,
      onPressStart,
      onPressEnd,
      onPressChange,
      type,
      // Preserve aria attributes forwarded by callers
      "aria-label": rest["aria-label"],
      "aria-labelledby": rest["aria-labelledby"],
      "aria-describedby": rest["aria-describedby"],
      "aria-expanded": rest["aria-expanded"],
      "aria-haspopup": rest["aria-haspopup"],
      "aria-controls": rest["aria-controls"],
      "aria-pressed": rest["aria-pressed"],
    },
    ref,
  );

  const classes = [
    styles.button,
    styles[variant],
    size !== "md" ? styles[size] : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Spread rest after buttonProps so callers can still override with data-* attributes,
  // but buttonProps wins for behavior-critical attributes (onClick, aria-*, disabled, type).
  return (
    <button ref={ref} className={classes} {...rest} {...buttonProps}>
      {children}
    </button>
  );
}
