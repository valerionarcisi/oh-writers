import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banner, Button, Skeleton, useConfirmDialog } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import {
  aiProviderCreditsQueryOptions,
  deleteAiProvider,
  setAiProviderModels,
  type AiProviderModels,
} from "../ai-providers.server";
import { recommendedModelsQueryOptions } from "../model-catalogue.server";
import { AiModelPicker, type ModelPickerValue } from "./AiModelPicker";
import styles from "./AiConnectedCard.module.css";

export interface AiConnectedCardProps {
  readonly provider: "openrouter" | "anthropic";
  readonly keyLast4: string;
  readonly models: AiProviderModels;
  readonly onDisconnected: () => void;
  readonly onModelsChanged: () => void;
}

// Spec 84 — steady state: masked key, live balance, current models,
// "Scollega" (our own react-aria confirm dialog, never window.confirm), and
// a change-models affordance that reuses the same AiModelPicker as the
// post-connect wizard.
export function AiConnectedCard({
  provider,
  keyLast4,
  models,
  onDisconnected,
  onModelsChanged,
}: AiConnectedCardProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirmDialog();
  const [changingModels, setChangingModels] = useState(false);

  const creditsQuery = useQuery({
    ...aiProviderCreditsQueryOptions(),
    enabled: provider === "openrouter",
  });

  const disconnectMut = useMutation({
    mutationFn: async () => unwrapResult(await deleteAiProvider()),
    onSuccess: onDisconnected,
  });

  const handleDisconnect = () => {
    void confirm({
      title: t("settings.ai.steady.disconnectConfirmTitle"),
      message: t("settings.ai.steady.disconnectConfirmMessage"),
      confirmLabel: t("settings.ai.steady.disconnectConfirmAction"),
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      disconnectMut.mutate();
    });
  };

  const providerLabel =
    provider === "openrouter"
      ? t("settings.ai.connected.providerOpenRouter")
      : t("settings.ai.connected.providerAnthropic");

  const remaining = creditsQuery.data?.isOk
    ? creditsQuery.data.value.remaining
    : undefined;

  return (
    <div className={styles.card} data-testid="ai-connected-card">
      <div className={styles.headerRow}>
        <h2 className={styles.title}>{t("settings.ai.steady.title")}</h2>
        <span className={styles.providerBadge}>
          {providerLabel} · •••• {keyLast4}
        </span>
      </div>

      {provider === "openrouter" && (
        <div data-testid="ai-connected-credit">
          {creditsQuery.isLoading ? (
            <Skeleton
              lines={1}
              widths={["30%"]}
              ariaLabel="Caricamento saldo"
            />
          ) : creditsQuery.data?.isOk && remaining != null ? (
            remaining === 0 ? (
              <Banner
                variant="warning"
                message={t("settings.ai.credit.zeroMessage")}
                data-testid="ai-connected-credit-zero"
              />
            ) : (
              <p
                className={styles.creditPositive}
                data-testid="ai-connected-credit-positive"
              >
                {t("settings.ai.credit.positiveLabel")}{" "}
                {remaining.toFixed(2).replace(".", ",")} €
              </p>
            )
          ) : null}
        </div>
      )}

      {!changingModels ? (
        <div className={styles.modelsBlock}>
          <span className={styles.modelsTitle}>
            {t("settings.ai.steady.currentModels")}
          </span>
          <div className={styles.modelRow}>
            <span className={styles.modelRoleLabel}>
              {t("settings.ai.steady.fastModel")}
            </span>
            <span
              className={styles.modelId}
              data-testid="ai-connected-fast-model"
            >
              {models.fast}
            </span>
          </div>
          <div className={styles.modelRow}>
            <span className={styles.modelRoleLabel}>
              {t("settings.ai.steady.qualityModel")}
            </span>
            <span
              className={styles.modelId}
              data-testid="ai-connected-quality-model"
            >
              {models.quality}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setChangingModels(true)}
            data-testid="ai-connected-change-models-btn"
          >
            {t("settings.ai.models.changeAffordance")}
          </Button>
        </div>
      ) : (
        <ChangeModelsPanel
          currentModels={models}
          onDone={() => {
            setChangingModels(false);
            onModelsChanged();
          }}
          onCancel={() => setChangingModels(false)}
        />
      )}

      <div className={styles.dangerRow}>
        <Button
          variant="danger"
          size="sm"
          onPress={handleDisconnect}
          disabled={disconnectMut.isPending}
          data-testid="ai-connected-disconnect-btn"
        >
          {disconnectMut.isPending
            ? t("settings.ai.steady.disconnecting")
            : t("settings.ai.steady.disconnect")}
        </Button>
      </div>
    </div>
  );
}

function ChangeModelsPanel({
  currentModels,
  onDone,
  onCancel,
}: {
  currentModels: AiProviderModels;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const recommendedQuery = useQuery(recommendedModelsQueryOptions());
  const [selection, setSelection] = useState<ModelPickerValue>(currentModels);

  const saveMut = useMutation({
    mutationFn: async (value: ModelPickerValue) =>
      unwrapResult(await setAiProviderModels({ data: { models: value } })),
    onSuccess: onDone,
  });

  const recommended =
    recommendedQuery.data?.isOk && recommendedQuery.data.value
      ? recommendedQuery.data.value
      : null;

  if (recommendedQuery.isLoading) {
    return <Skeleton lines={2} tone="agent" ariaLabel="Caricamento modelli" />;
  }
  if (!recommended) {
    return (
      <Banner
        variant="warning"
        message={t("settings.ai.models.loadError")}
        data-testid="ai-connected-models-load-error"
      />
    );
  }

  return (
    <div className={styles.changePanel} data-testid="ai-change-models-panel">
      <AiModelPicker
        recommendedFast={recommended.fast}
        recommendedQuality={recommended.quality}
        value={selection}
        onChange={setSelection}
      />
      <div className={styles.changeActions}>
        <Button variant="secondary" size="sm" onPress={onCancel}>
          {t("settings.ai.manualKey.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onPress={() => saveMut.mutate(selection)}
          disabled={saveMut.isPending}
          data-testid="ai-change-models-save-btn"
        >
          {saveMut.isPending
            ? t("settings.ai.models.saving")
            : t("settings.ai.models.save")}
        </Button>
      </div>
    </div>
  );
}
