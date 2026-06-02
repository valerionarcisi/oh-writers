// packages/ui/src/primitives/Tooltip/Tooltip.tsx
import {
  cloneElement,
  isValidElement,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useTooltipTriggerState } from "react-stately";
import { useTooltip, useTooltipTrigger, mergeProps } from "react-aria";
import styles from "./Tooltip.module.css";

export type TooltipKind = "dark" | "info";
export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: ReactNode;
  kind?: TooltipKind;
  placement?: TooltipPlacement;
  children: ReactNode;
};

type TriggerElement = ReactElement<{ ref?: Ref<HTMLElement> }>;

export function Tooltip({
  content,
  kind = "dark",
  placement = "top",
  children,
}: TooltipProps) {
  const state = useTooltipTriggerState();
  const triggerRef = useRef<HTMLElement>(null);
  const { triggerProps, tooltipProps } = useTooltipTrigger(
    {},
    state,
    triggerRef,
  );
  const { tooltipProps: ariaTooltipProps } = useTooltip(tooltipProps, state);

  // The child becomes the trigger: react-aria's hover + keyboard-focus handlers
  // and the trigger ref are merged onto it so they land on the real focusable
  // DOM node (icon, button, link). mergeProps chains the child's own handlers so
  // nothing is lost. The trigger ref is owned by the Tooltip (a caller ref on the
  // child would be overridden — wrap a ref-needing element instead). The wrapper
  // span is only the positioning anchor.
  const trigger = isValidElement(children) ? (
    cloneElement(children as TriggerElement, {
      ...mergeProps((children as TriggerElement).props, triggerProps),
      ref: triggerRef,
    })
  ) : (
    <span ref={triggerRef} {...triggerProps}>
      {children}
    </span>
  );

  return (
    <span className={styles.wrapper}>
      {trigger}
      {state.isOpen ? (
        <span
          {...ariaTooltipProps}
          className={[
            styles.tip,
            styles.open,
            kind === "info" ? styles.info : "",
            styles[placement],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
