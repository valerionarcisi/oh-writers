import { useRef } from "react";
import { useButton } from "react-aria";
import type { PressEvent } from "react-aria";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * CSS-module class map a wrapper hands to BaseButton. CSS Modules emit distinct
 * hashed class names per file, so the look family is selected by which module a
 * wrapper passes here — not by a runtime flag. This keeps the two historical
 * visual families (components/Button vs primitives/Button) byte-identical while
 * sharing one behaviour implementation. Typed as a string map because CSS-module
 * imports resolve to `{ readonly [key: string]: string }`.
 */
export type BaseButtonStyles = Readonly<Record<string, string>>;

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional shortcut badge rendered inside the button (aria-hidden). */
  hotkey?: string;
  children: ReactNode;
  /** React Aria press handler (cross-browser, mobile-friendly). onClick is still supported. */
  onPress?: (e: PressEvent) => void;
  onPressStart?: (e: PressEvent) => void;
  onPressEnd?: (e: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

interface BaseButtonInternalProps extends BaseButtonProps {
  styles: BaseButtonStyles;
}

/**
 * Single react-aria button behind every Button surface. Variants and sizes are
 * the superset of both historical buttons; a wrapper narrows the defaults and
 * supplies the look family via `styles`.
 */
export function BaseButton({
  styles,
  variant = "primary",
  size = "md",
  hotkey,
  className,
  children,
  disabled,
  onPress,
  onPressStart,
  onPressEnd,
  onPressChange,
  // onClick must be extracted here and forwarded to useButton so react-aria
  // chains it through usePress rather than having buttonProps.onClick overwrite it.
  onClick,
  type = "button",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHaspopup,
  "aria-controls": ariaControls,
  "aria-pressed": ariaPressed,
  ...rest
}: BaseButtonInternalProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const { buttonProps } = useButton(
    {
      isDisabled: disabled,
      onPress,
      onPressStart,
      onPressEnd,
      onPressChange,
      // Passing onClick to useButton lets react-aria chain it through usePress,
      // so the handler fires reliably when buttonProps.onClick is spread last.
      onClick: onClick as MouseEventHandler<Element> | undefined,
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
    styles[variant] ?? "",
    size !== "md" ? (styles[size] ?? "") : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // rest contains only data-*, event handlers, and non-aria HTML attributes.
  // buttonProps wins for all behavior-critical attributes.
  return (
    <button ref={ref} className={classes} {...rest} {...buttonProps}>
      {children}
      {hotkey && (
        <span className={styles.hotkey} aria-hidden="true">
          {hotkey}
        </span>
      )}
    </button>
  );
}
