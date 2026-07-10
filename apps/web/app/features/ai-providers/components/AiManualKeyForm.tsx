import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, FormField, SegmentedControl } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import { validateProviderKeyFn } from "../model-catalogue.server";
import { saveAiProvider } from "../ai-providers.server";
import styles from "./AiManualKeyForm.module.css";

type Provider = "openrouter" | "anthropic";

export interface AiManualKeyFormProps {
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}

// Spec 84 §2.4 — power-user path: paste an existing key, validate it with one
// cheap live call, then save. The raw key never round-trips back from the
// server — `saveAiProvider` returns only provider + last4 (see
// ai-providers.server.ts), so this form never has anything to echo.
export function AiManualKeyForm({ onCancel, onSaved }: AiManualKeyFormProps) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const trimmed = apiKey.trim();
      if (trimmed.length === 0) {
        setFieldError(t("settings.ai.manualKey.keyRequired"));
        throw new Error("validation");
      }
      setFieldError(null);

      const validation = await validateProviderKeyFn({
        data: { provider, apiKey: trimmed },
      });
      if (!validation.isOk) {
        throw new Error("invalid-key");
      }

      return unwrapResult(
        await saveAiProvider({ data: { provider, apiKey: trimmed } }),
      );
    },
    onSuccess: onSaved,
  });

  const apiErrorMessage =
    mut.error instanceof Error && mut.error.message === "invalid-key"
      ? t("settings.ai.manualKey.invalidKey")
      : mut.error instanceof Error && mut.error.message !== "validation"
        ? mut.error.message
        : null;

  const providerOptions: ReadonlyArray<{ id: Provider; label: string }> = [
    { id: "openrouter", label: t("settings.ai.manualKey.providerOpenRouter") },
    { id: "anthropic", label: t("settings.ai.manualKey.providerAnthropic") },
  ];

  return (
    <div className={styles.form} data-testid="ai-manual-key-form">
      <h3 className={styles.title}>{t("settings.ai.manualKey.title")}</h3>

      <FormField
        label={t("settings.ai.manualKey.providerLabel")}
        htmlFor="manual-key-provider"
      >
        <SegmentedControl<Provider>
          options={providerOptions}
          activeId={provider}
          onSelect={setProvider}
          ariaLabel={t("settings.ai.manualKey.providerLabel")}
        />
      </FormField>

      <FormField
        label={t("settings.ai.manualKey.keyLabel")}
        htmlFor="manual-key-input"
        error={fieldError}
      >
        <Input
          id="manual-key-input"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("settings.ai.manualKey.keyPlaceholder")}
          disabled={mut.isPending}
          hasError={!!fieldError || !!apiErrorMessage}
          data-testid="ai-manual-key-input"
        />
      </FormField>

      {apiErrorMessage && (
        <p className={styles.apiError} data-testid="ai-manual-key-error">
          {apiErrorMessage}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onPress={onCancel}
          disabled={mut.isPending}
          data-testid="ai-manual-key-cancel-btn"
        >
          {t("settings.ai.manualKey.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onPress={() => mut.mutate()}
          disabled={mut.isPending}
          data-testid="ai-manual-key-submit-btn"
        >
          {mut.isPending
            ? t("settings.ai.manualKey.validating")
            : t("settings.ai.manualKey.validate")}
        </Button>
      </div>
    </div>
  );
}
