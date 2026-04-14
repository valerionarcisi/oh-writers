import { useEffect } from "react";
import styles from "./Toast.module.css";

type Variant = "info" | "success" | "danger" | "warning";

interface ToastProps {
  message: string;
  variant?: Variant;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({
  message,
  variant = "info",
  onDismiss,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, duration);
    return () => clearTimeout(handle);
  }, [onDismiss, duration]);

  return (
    <div className={[styles.toast, styles[variant]].join(" ")} role="alert">
      <span className={styles.message}>{message}</span>
      <button className={styles.close} onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
