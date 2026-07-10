import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banner, Button, Skeleton } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import {
  aiProviderCreditsQueryOptions,
  setAiProviderModels,
} from "../ai-providers.server";
import { recommendedModelsQueryOptions } from "../model-catalogue.server";
import { AiModelPicker, type ModelPickerValue } from "./AiModelPicker";
import styles from "./AiPostConnectWizard.module.css";

export interface AiPostConnectWizardProps {
  readonly userId: string;
  readonly provider: "openrouter" | "anthropic";
  readonly keyLast4: string;
  readonly justConnected: boolean;
  readonly onModelsSaved: () => void;
}

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/credits";

// Spec 84 §2.3 Steps 3-4 — after the callback stores the key (models still
// null), this wizard runs the credit check and then the model picker before
// handing the user back to their work. The credit check only applies to
// openrouter (the only provider with a balance endpoint); an anthropic
// connection skips straight to the model picker.
export function AiPostConnectWizard({
  provider,
  keyLast4,
  justConnected,
  onModelsSaved,
}: AiPostConnectWizardProps) {
  const { t } = useTranslation();
  const creditsQuery = useQuery({
    ...aiProviderCreditsQueryOptions(),
    enabled: provider === "openrouter",
  });
  const recommendedQuery = useQuery(recommendedModelsQueryOptions());

  const [selection, setSelection] = useState<ModelPickerValue | null>(null);

  const recommended =
    recommendedQuery.data?.isOk && recommendedQuery.data.value
      ? recommendedQuery.data.value
      : null;

  useEffect(() => {
    if (recommended && selection === null) {
      setSelection({
        fast: recommended.fast.id,
        quality: recommended.quality.id,
      });
    }
  }, [recommended, selection]);

  const saveMut = useMutation({
    mutationFn: async (models: ModelPickerValue) =>
      unwrapResult(await setAiProviderModels({ data: { models } })),
    onSuccess: onModelsSaved,
  });

  const providerLabel =
    provider === "openrouter"
      ? t("settings.ai.connected.providerOpenRouter")
      : t("settings.ai.connected.providerAnthropic");

  const remaining = creditsQuery.data?.isOk
    ? creditsQuery.data.value.remaining
    : undefined;

  return (
    <div className={styles.wizard} data-testid="ai-post-connect-wizard">
      {justConnected && (
        <div className={styles.header} data-testid="ai-connected-header">
          <span className={styles.headerGlyph} aria-hidden="true">
            ✓
          </span>
          <div>
            <p className={styles.headerTitle}>
              {t("settings.ai.connected.title")}
            </p>
            <p className={styles.headerSubtitle}>
              {providerLabel} · •••• {keyLast4}
            </p>
          </div>
        </div>
      )}

      {provider === "openrouter" && (
        <div data-testid="ai-credit-check">
          {creditsQuery.isLoading ? (
            <Skeleton
              lines={1}
              widths={["40%"]}
              ariaLabel={t("settings.ai.credit.checking")}
            />
          ) : !creditsQuery.data?.isOk ? (
            <Banner
              variant="warning"
              message={t("settings.ai.credit.notApplicable")}
              data-testid="ai-credit-error"
            />
          ) : remaining === 0 ? (
            <Banner
              variant="warning"
              message={t("settings.ai.credit.zeroMessage")}
              data-testid="ai-credit-zero-banner"
              actions={[
                {
                  label: t("settings.ai.credit.topUp"),
                  variant: "primary",
                  onClick: () => {
                    window.open(OPENROUTER_CREDITS_URL, "_blank", "noopener");
                  },
                },
                {
                  label: t("settings.ai.credit.recheck"),
                  onClick: () => void creditsQuery.refetch(),
                },
              ]}
            />
          ) : (
            <p
              className={styles.creditPositive}
              data-testid="ai-credit-positive"
            >
              {t("settings.ai.credit.positiveLabel")}{" "}
              {remaining != null ? remaining.toFixed(2).replace(".", ",") : ""}{" "}
              €
            </p>
          )}
        </div>
      )}

      <h2 className={styles.modelsTitle}>{t("settings.ai.models.title")}</h2>

      {recommendedQuery.isLoading ? (
        <Skeleton
          lines={3}
          tone="agent"
          ariaLabel="Caricamento modelli consigliati"
        />
      ) : !recommended ? (
        <Banner
          variant="warning"
          message={t("settings.ai.models.loadError")}
          data-testid="ai-models-load-error"
        />
      ) : (
        selection && (
          <>
            <AiModelPicker
              recommendedFast={recommended.fast}
              recommendedQuality={recommended.quality}
              value={selection}
              onChange={setSelection}
            />
            <div className={styles.saveRow}>
              <Button
                variant="primary"
                size="md"
                onPress={() => selection && saveMut.mutate(selection)}
                disabled={saveMut.isPending}
                data-testid="ai-models-save-btn"
              >
                {saveMut.isPending
                  ? t("settings.ai.models.saving")
                  : t("settings.ai.models.save")}
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
