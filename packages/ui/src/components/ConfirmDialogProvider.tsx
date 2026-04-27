import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
}

export interface UseConfirmDialog {
  readonly confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

interface PendingConfirm {
  readonly opts: ConfirmOptions;
  readonly resolve: (value: boolean) => void;
}

const ConfirmDialogContext = createContext<UseConfirmDialog | null>(null);

export function ConfirmDialogProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const resolveAndClose = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    current.resolve(value);
    setPending(null);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve });
      }),
    [],
  );

  const api = useMemo<UseConfirmDialog>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={api}>
      {children}
      <ConfirmDialog
        isOpen={pending !== null}
        title={pending?.opts.title ?? ""}
        message={pending?.opts.message ?? ""}
        confirmLabel={pending?.opts.confirmLabel}
        cancelLabel={pending?.opts.cancelLabel}
        destructive={pending?.opts.destructive ?? false}
        onConfirm={() => resolveAndClose(true)}
        onCancel={() => resolveAndClose(false)}
      />
    </ConfirmDialogContext.Provider>
  );
}

export const useConfirmDialog = (): UseConfirmDialog => {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx)
    throw new Error(
      "useConfirmDialog must be used within <ConfirmDialogProvider>",
    );
  return ctx;
};
