import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "~/features/i18n";
import { aiProviderCreditsQueryOptions } from "../ai-providers.server";
import styles from "./TopBarCredits.module.css";

// The always-visible OpenRouter balance in the TopBar account zone (live
// request 2026-07-13). Refreshed lazily: 5-minute staleTime + window-focus
// refetch keep the OpenRouter /credits endpoint out of the hot path while
// the number stays honest after a work session. Anthropic BYOK has no
// balance endpoint (`remaining: null`) → the pill hides itself.
const TOPBAR_CREDITS_STALE_MS = 5 * 60_000;

export function TopBarCredits() {
  const { t } = useTranslation();
  const creditsQuery = useQuery({
    ...aiProviderCreditsQueryOptions(),
    queryKey: ["ai-provider", "credits", "topbar"],
    staleTime: TOPBAR_CREDITS_STALE_MS,
  });

  const shape = creditsQuery.data;
  if (!shape?.isOk || shape.value.remaining === null) return null;

  const remaining = shape.value.remaining;
  return (
    <Link
      to="/settings/ai"
      className={styles.pill}
      data-low={remaining < 1 || undefined}
      title={t("shell.topbar.aiCredits")}
      data-testid="topbar-ai-credits"
    >
      <span aria-hidden="true" className={styles.spark}>
        ✦
      </span>
      ${remaining.toFixed(2)}
    </Link>
  );
}
