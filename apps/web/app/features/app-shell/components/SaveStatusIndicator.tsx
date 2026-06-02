import { match } from "ts-pattern";
import { useSaveStateValue } from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./SaveStatusIndicator.module.css";

/**
 * Lightweight save-status pill rendered inline in the Viewbar. Reads its
 * value from the app-shell SaveStateProvider — the editor publishes "saving"
 * / "saved" via `useSaveStatePublisher`, this component just renders.
 *
 * Hides entirely when no editor on the page has published a state.
 */
export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const { state, secondsAgo } = useSaveStateValue();
  if (!state) return null;

  const label = match(state)
    .with("saving", () => t("shell.save.savingShort"))
    .with("saved", () =>
      typeof secondsAgo === "number" && secondsAgo > 5
        ? `${t("shell.save.savedAgoPrefix")} ${secondsAgo}s ${t("shell.save.savedAgoSuffix")}`
        : t("shell.save.saved"),
    )
    .with("offline", () => t("shell.save.offline"))
    .exhaustive();

  if (!label) return null;
  return (
    <span
      className={styles.pill}
      data-state={state}
      aria-live="polite"
      data-testid="save-status-indicator"
      title={label}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
