import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { aiProviderStatusQueryOptions } from "../ai-providers.server";
import { AiConnectWizard } from "./AiConnectWizard";
import { AiPostConnectWizard } from "./AiPostConnectWizard";
import { AiConnectedCard } from "./AiConnectedCard";
import { AiUsageStats } from "./AiUsageStats";
import styles from "./AiSettingsPage.module.css";

export interface AiSettingsPageProps {
  readonly userId: string;
  /** True right after the OAuth callback redirected here with `?connected=1`. */
  readonly connected: boolean;
  /** `?error=<code>` from the PKCE start/callback routes, or null. */
  readonly errorCode: string | null;
}

// Spec 84 §2 (Wave 3) — the settings/ai route renders one of three states,
// driven by the stored provider row (never by the transient `?connected=1`
// flag alone — a user can land here with `connected=1` on a provider that
// ALSO already has models chosen, e.g. a page refresh, and steady state is
// still correct then):
//   1. No provider row at all → the disconnected wizard (step 1 + manual key).
//   2. Provider row, no models chosen yet → the post-connect wizard (credit
//      check + model picker, wizard steps 3-4).
//   3. Provider row with models chosen → the connected steady-state card.
export function AiSettingsPage({
  userId,
  connected,
  errorCode,
}: AiSettingsPageProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const statusQuery = useQuery(aiProviderStatusQueryOptions());

  const invalidateStatus = () =>
    qc.invalidateQueries({ queryKey: ["ai-provider"] });

  return (
    <div className={styles.page} data-testid="ai-settings-page">
      <h1 className={styles.title}>{t("settings.ai.pageTitle")}</h1>

      {statusQuery.isLoading ? (
        <Skeleton
          lines={4}
          widths={["60%", "100%", "90%", "40%"]}
          tone="agent"
          ariaLabel="Caricamento impostazioni AI"
        />
      ) : !statusQuery.data?.isOk ? (
        <AiConnectWizard errorCode={errorCode} onConnected={invalidateStatus} />
      ) : statusQuery.data.value === null ? (
        <AiConnectWizard errorCode={errorCode} onConnected={invalidateStatus} />
      ) : statusQuery.data.value.models === null ? (
        <AiPostConnectWizard
          userId={userId}
          provider={statusQuery.data.value.provider}
          keyLast4={statusQuery.data.value.keyLast4}
          justConnected={connected}
          onModelsSaved={invalidateStatus}
        />
      ) : (
        <>
          <AiConnectedCard
            provider={statusQuery.data.value.provider}
            keyLast4={statusQuery.data.value.keyLast4}
            models={statusQuery.data.value.models}
            onDisconnected={invalidateStatus}
            onModelsChanged={invalidateStatus}
          />
          <AiUsageStats />
        </>
      )}
    </div>
  );
}
