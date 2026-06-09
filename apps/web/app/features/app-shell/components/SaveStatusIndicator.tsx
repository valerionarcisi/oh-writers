import { useRef } from "react";
import { useButton } from "react-aria";
import { match } from "ts-pattern";
import { useSaveStateValue } from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./SaveStatusIndicator.module.css";

/**
 * Save-status pill in the Viewbar. Reads its value from the app-shell
 * SaveStateProvider — the active editor publishes the state + a "save now"
 * handler via `useSaveStatePublisher`; this component renders.
 *
 * It is a button (react-aria `useButton`): pressing it flushes a pending save
 * when the document is dirty or a previous save errored. When the document is
 * already saved or a save is in flight there is nothing to flush, so the button
 * is disabled and reads as a status label. Hides entirely when no editor has
 * published a state (Spec 63 F3).
 */
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { state, secondsAgo, onFlush } = useSaveStateValue();
  const ref = useRef<HTMLButtonElement>(null);

  // `dirty` and `error` are the only actionable states — there is something to
  // save. `saving` is in flight, `saved`/`offline` have nothing pending.
  const canFlush =
    (state === "dirty" || state === "error") && typeof onFlush === "function";

  const { buttonProps } = useButton(
    {
      onPress: () => onFlush?.(),
      isDisabled: !canFlush,
      "aria-label": canFlush ? t("shell.save.saveNow") : undefined,
    },
    ref,
  );

  if (!state) return null;

  const label = match(state)
    .with("saving", () => t("shell.save.savingShort"))
    .with("dirty", () => t("shell.save.dirty"))
    .with("error", () => t("shell.save.error"))
    .with("saved", () =>
      typeof secondsAgo === "number" && secondsAgo > 5
        ? `${t("shell.save.savedAgoPrefix")} ${secondsAgo}s ${t("shell.save.savedAgoSuffix")}`
        : t("shell.save.saved"),
    )
    .with("offline", () => t("shell.save.offline"))
    .exhaustive();

  if (!label) return null;
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={styles.pill}
      data-state={state}
      data-testid="save-status-indicator"
      title={canFlush ? `${label} · ${t("shell.save.saveNow")}` : label}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </button>
  );
}
