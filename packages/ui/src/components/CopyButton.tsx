import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "../icons/Icon";
import styles from "./CopyButton.module.css";

export interface CopyButtonProps {
  /** Returns the text to copy, computed lazily on press (not on every render). */
  readonly getText: () => string;
  readonly label?: string;
  readonly copiedLabel?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

const CONFIRM_DURATION_MS = 1500;

/**
 * Icon-only copy-to-clipboard button. Swaps to a checkmark for
 * CONFIRM_DURATION_MS after a successful copy, then reverts.
 */
export function CopyButton({
  getText,
  label = "Copia",
  copiedLabel = "Copiato",
  className,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handlePress = () => {
    void navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(
        () => setCopied(false),
        CONFIRM_DURATION_MS,
      );
    });
  };

  return (
    <Button
      variant="ghost"
      className={[styles.button, className].filter(Boolean).join(" ")}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      onPress={handlePress}
      data-testid={rest["data-testid"]}
    >
      <Icon
        name={copied ? "check" : "clipboard"}
        size={16}
        aria-hidden={true}
      />
    </Button>
  );
}
