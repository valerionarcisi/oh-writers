// packages/ui/src/primitives/Button/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  hotkey?: string;
  children: ReactNode;
};

export function Button({
  variant = "ghost",
  size = "md",
  hotkey,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        styles.button,
        styles[variant],
        size === "sm" ? styles.sm : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
      {hotkey && (
        <span className={styles.hotkey} aria-hidden="true">
          {hotkey}
        </span>
      )}
    </button>
  );
}
