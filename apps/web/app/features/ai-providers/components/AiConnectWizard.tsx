import { useState } from "react";
import { Button, Banner } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { AiManualKeyForm } from "./AiManualKeyForm";
import styles from "./AiConnectWizard.module.css";

export interface AiConnectWizardProps {
  readonly errorCode: string | null;
  readonly onConnected: () => void;
}

// Spec 84 §2.3 Step 1 — the disconnected wizard entry point. The primary CTA
// is a plain link (not a client-side route): it hits
// `GET /api/ai-providers/openrouter/start`, which 302s to openrouter.ai — a
// real navigation, not a fetch, because the browser must carry the PKCE
// cookie AND follow OpenRouter's own auth page.
const OPENROUTER_START_URL = "/api/ai-providers/openrouter/start";

const ERROR_KEY_BY_CODE: Record<string, TranslationKey> = {
  connection_failed: "settings.ai.error.connection_failed",
  provider_denied: "settings.ai.error.provider_denied",
  missing_code: "settings.ai.error.missing_code",
  missing_state: "settings.ai.error.missing_state",
  state_invalid: "settings.ai.error.state_invalid",
  exchange_failed: "settings.ai.error.exchange_failed",
  save_failed: "settings.ai.error.save_failed",
};

export function AiConnectWizard({
  errorCode,
  onConnected,
}: AiConnectWizardProps) {
  const { t } = useTranslation();
  const [showManualKey, setShowManualKey] = useState(false);

  const errorMessageKey = errorCode ? ERROR_KEY_BY_CODE[errorCode] : undefined;

  return (
    <div className={styles.wizard} data-testid="ai-connect-wizard">
      {errorMessageKey && (
        <Banner
          variant="warning"
          message={t(errorMessageKey)}
          data-testid="ai-connect-error-banner"
        />
      )}

      <div className={styles.hero}>
        <span className={styles.eyebrow}>
          {t("settings.ai.disconnected.eyebrow")}
        </span>
        <h2 className={styles.title}>{t("settings.ai.disconnected.title")}</h2>
        <p className={styles.intro}>{t("settings.ai.disconnected.intro")}</p>

        <ul className={styles.factList}>
          <li className={styles.fact}>
            <span className={styles.factGlyph} aria-hidden="true">
              ✦
            </span>
            {t("settings.ai.disconnected.fact1")}
          </li>
          <li className={styles.fact}>
            <span className={styles.factGlyph} aria-hidden="true">
              ✦
            </span>
            {t("settings.ai.disconnected.fact2")}
          </li>
          <li className={styles.fact}>
            <span className={styles.factGlyph} aria-hidden="true">
              ✦
            </span>
            {t("settings.ai.disconnected.fact3")}
          </li>
        </ul>

        <div className={styles.ctaRow}>
          <Button
            variant="primary"
            size="lg"
            onPress={() => {
              window.location.href = OPENROUTER_START_URL;
            }}
            data-testid="ai-connect-openrouter-btn"
          >
            {t("settings.ai.disconnected.ctaPrimary")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onPress={() => setShowManualKey((v) => !v)}
            data-testid="ai-connect-manual-key-toggle"
          >
            {t("settings.ai.disconnected.ctaSecondary")}
          </Button>
        </div>
      </div>

      {showManualKey && (
        <AiManualKeyForm
          onCancel={() => setShowManualKey(false)}
          onSaved={onConnected}
        />
      )}
    </div>
  );
}
