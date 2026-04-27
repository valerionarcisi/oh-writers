import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toast } from "./Toast";
import styles from "./ToastProvider.module.css";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  readonly title?: string;
  readonly message: string;
  readonly variant?: ToastVariant;
  readonly durationMs?: number;
}

export interface UseToast {
  readonly showToast: (opts: ToastOptions) => string;
  readonly dismiss: (id?: string) => void;
}

interface QueuedToast {
  readonly id: string;
  readonly message: string;
  readonly variant: ToastVariant;
  readonly durationMs: number;
}

const ToastContext = createContext<UseToast | null>(null);

const variantToInternal = (
  v: ToastVariant,
): "info" | "success" | "warning" | "danger" => (v === "error" ? "danger" : v);

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<ReadonlyArray<QueuedToast>>([]);

  const dismiss = useCallback((id?: string) => {
    setToasts((prev) =>
      id === undefined ? [] : prev.filter((t) => t.id !== id),
    );
  }, []);

  const showToast = useCallback(
    ({ message, title, variant = "info", durationMs = 4000 }: ToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const composed = title ? `${title}: ${message}` : message;
      setToasts((prev) => [
        ...prev,
        { id, message: composed, variant, durationMs },
      ]);
      return id;
    },
    [],
  );

  const api = useMemo<UseToast>(
    () => ({ showToast, dismiss }),
    [showToast, dismiss],
  );

  const portal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div
            className={styles.viewport}
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((t) => (
              <Toast
                key={t.id}
                message={t.message}
                variant={variantToInternal(t.variant)}
                duration={t.durationMs}
                onDismiss={() => dismiss(t.id)}
              />
            ))}
          </div>,
          document.body,
        );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

export const useToast = (): UseToast => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};
