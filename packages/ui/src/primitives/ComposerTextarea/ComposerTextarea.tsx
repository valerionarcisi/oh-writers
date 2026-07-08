// packages/ui/src/primitives/ComposerTextarea/ComposerTextarea.tsx
/**
 * ComposerTextarea — the auto-growing chat composer input (BUG-N65).
 *
 * One primitive for every "Chiedi a Cesare…" surface (floating drawer +
 * session page) so the grow/cap/keyboard contract can never drift between
 * them:
 *
 *   - starts ONE line tall and grows with its content;
 *   - caps at ~8 lines (em-based, derived from the surface's own font size),
 *     then scrolls internally;
 *   - Enter sends, Shift+Enter inserts a newline, Cmd/Ctrl+Enter also sends
 *     (muscle memory).
 *
 * The primitive owns sizing + keyboard semantics only. Chrome (border,
 * padding, background, send button) belongs to the consumer's composer row —
 * pass `className` for surface-specific typography/layout.
 *
 * `react-aria`'s `useTextField` provides the input semantics (value/change
 * wiring, aria) — never re-implemented by hand.
 */

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useTextField } from "react-aria";
import styles from "./ComposerTextarea.module.css";

export interface ComposerTextareaProps {
  value: string;
  onChange: (next: string) => void;
  /** Invoked on Enter (without Shift) and on Cmd/Ctrl+Enter. */
  onSubmit: () => void;
  placeholder?: string;
  /** Accessible label — mandatory, the composer renders no visible label. */
  ariaLabel: string;
  /** Invoked on ArrowUp when the composer is empty — the standard chat-app
   *  "recall last message" gesture. Never fires with content already typed,
   *  so it never steals cursor navigation inside a multi-line draft. */
  onArrowUp?: () => void;
  /** Surface-specific typography/layout (font-size, flex) — composed with the
   *  primitive's own sizing class. */
  className?: string;
  testId?: string;
}

export function ComposerTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  onArrowUp,
  className,
  testId,
}: ComposerTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowUp" && value.length === 0 && onArrowUp) {
      e.preventDefault();
      onArrowUp();
      return;
    }
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    onSubmit();
  };

  const { inputProps } = useTextField(
    {
      value,
      onChange,
      placeholder,
      "aria-label": ariaLabel,
      inputElementType: "textarea",
      onKeyDown: handleKeyDown,
    },
    ref,
  );

  // Auto-grow: track the content height on every value change. The element is
  // measured at `auto` then sized to its scrollHeight; the CSS `max-block-size`
  // clamps the result (the cap), at which point `overflow-y: auto` scrolls
  // inside instead of growing further.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.blockSize = "auto";
    el.style.blockSize = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...inputProps}
      ref={ref}
      rows={1}
      className={[styles.composerTextarea, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
    />
  );
}
