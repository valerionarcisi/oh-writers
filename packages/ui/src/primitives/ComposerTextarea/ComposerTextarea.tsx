import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useTextField } from "react-aria";
import styles from "./ComposerTextarea.module.css";

export interface ComposerTextareaProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isDisabled?: boolean;
  ariaLabel: string;
  className?: string;
  testId?: string;
}

export function ComposerTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  isDisabled,
  ariaLabel,
  className,
  testId,
}: ComposerTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isDisabled) return;
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
      isDisabled,
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
