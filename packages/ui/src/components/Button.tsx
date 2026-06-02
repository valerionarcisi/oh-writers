import { BaseButton } from "./BaseButton";
import type { BaseButtonProps, ButtonVariant, ButtonSize } from "./BaseButton";
import styles from "./Button.module.css";

export type { ButtonVariant, ButtonSize };
export type ButtonProps = BaseButtonProps;

/** Default-`primary` button (components look family). Preferred for new code. */
export function Button({ variant = "primary", ...props }: ButtonProps) {
  return <BaseButton styles={styles} variant={variant} {...props} />;
}
