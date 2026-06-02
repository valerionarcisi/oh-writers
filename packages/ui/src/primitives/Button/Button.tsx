// packages/ui/src/primitives/Button/Button.tsx
import { BaseButton } from "../../components/BaseButton";
import type {
  BaseButtonProps,
  ButtonVariant as BaseButtonVariant,
  ButtonSize as BaseButtonSize,
} from "../../components/BaseButton";
import styles from "./Button.module.css";

// Backward-compatible type names. The merged button uses the superset of both
// historical APIs; these aliases keep existing `DsButtonProps`/`ButtonVariant`/
// `ButtonSize` imports working.
export type ButtonVariant = BaseButtonVariant;
export type ButtonSize = BaseButtonSize;
export type ButtonProps = BaseButtonProps;

/**
 * Deprecated alias. `DsButton` is the default-`ghost` button (DS-v2 look
 * family); it now delegates to the unified `BaseButton`. New code should import
 * `Button` from the package root instead.
 */
export function Button({ variant = "ghost", ...props }: ButtonProps) {
  return <BaseButton styles={styles} variant={variant} {...props} />;
}
