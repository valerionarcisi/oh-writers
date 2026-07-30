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

export interface PromptOptions extends ConfirmOptions {
  readonly label: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
}

export interface UseConfirmDialog {
  readonly confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Asks for a value. Resolves to null when dismissed — never an empty
   *  string, so "cancelled" and "typed nothing" stay distinguishable. */
  readonly promptText: (opts: PromptOptions) => Promise<string | null>;
}

interface PendingConfirm {
  readonly opts: ConfirmOptions;
  readonly input?: ConfirmDialogInput;
  readonly resolve: (value: string | boolean | null) => void;
}

interface ConfirmDialogInput {
  readonly label: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
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

  const resolveAndClose = useCallback((value: string | boolean | null) => {
    const current = pendingRef.current;
    if (!current) return;
    current.resolve(value);
    setPending(null);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setPending({
          opts,
          resolve: resolve as (value: string | boolean | null) => void,
        });
      }),
    [],
  );

  const promptText = useCallback(
    ({ label, initialValue, placeholder, ...opts }: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPending({
          opts,
          input: { label, initialValue, placeholder },
          resolve: resolve as (value: string | boolean | null) => void,
        });
      }),
    [],
  );

  const api = useMemo<UseConfirmDialog>(
    () => ({ confirm, promptText }),
    [confirm, promptText],
  );

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
        input={pending?.input}
        onConfirm={(value) => resolveAndClose(pending?.input ? value : true)}
        onCancel={() => resolveAndClose(pending?.input ? null : false)}
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
