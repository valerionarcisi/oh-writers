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
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHaspopup,
  "aria-controls": ariaControls,
  "aria-pressed": ariaPressed,
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
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledby,
      "aria-describedby": ariaDescribedby,
      "aria-expanded": ariaExpanded,
      "aria-haspopup": ariaHaspopup,
      "aria-controls": ariaControls,
      "aria-pressed": ariaPressed,
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

  // rest contains only data-*, event handlers, and non-aria HTML attributes.
  // buttonProps wins for all behavior-critical attributes.
  return (
    <button ref={ref} className={classes} {...rest} {...buttonProps}>
      {children}
    </button>
  );
}
