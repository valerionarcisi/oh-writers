import type { DocumentType, TranslationKey } from "@oh-writers/domain";
import { DocumentTypes } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./AIAssistantPanel.module.css";

interface AIAssistantPanelProps {
  type: DocumentType;
}

// Type-specific quick actions — wired to real AI calls in Spec 07
const AI_ACTION_KEYS: Record<DocumentType, ReadonlyArray<TranslationKey>> = {
  [DocumentTypes.LOGLINE]: [
    "documents.aiPanel.action.generateAlternatives",
    "documents.aiPanel.action.makeConcise",
    "documents.aiPanel.action.strengthenConflict",
  ],
  [DocumentTypes.SOGGETTO]: [
    "documents.aiPanel.action.expandParagraph",
    "documents.aiPanel.action.tightenPremise",
    "documents.aiPanel.action.clarifyTheme",
  ],
  [DocumentTypes.SYNOPSIS]: [
    "documents.aiPanel.action.expandParagraph",
    "documents.aiPanel.action.suggestSceneToAdd",
    "documents.aiPanel.action.checkThreeAct",
  ],
  [DocumentTypes.OUTLINE]: [
    "documents.aiPanel.action.suggestScene",
    "documents.aiPanel.action.findPacingIssues",
    "documents.aiPanel.action.suggestAlternative",
  ],
  [DocumentTypes.TREATMENT]: [
    "documents.aiPanel.action.expandSection",
    "documents.aiPanel.action.suggestDialogue",
    "documents.aiPanel.action.findPacingIssues",
  ],
};

export function AIAssistantPanel({ type }: AIAssistantPanelProps) {
  const { t } = useTranslation();
  const actionKeys = AI_ACTION_KEYS[type];

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t("documents.aiPanel.title")}</span>
        <span className={styles.badge}>{t("documents.aiPanel.badge")}</span>
      </div>

      <p className={styles.notice}>{t("documents.aiPanel.notice")}</p>

      <div className={styles.actions}>
        {actionKeys.map((actionKey) => (
          <button
            key={actionKey}
            className={styles.actionBtn}
            disabled
            title={t("documents.aiPanel.actionTooltip")}
            type="button"
          >
            {t(actionKey)}
          </button>
        ))}
      </div>

      <div className={styles.suggestionArea}>
        <p className={styles.suggestionPlaceholder}>
          {t("documents.aiPanel.suggestionPlaceholder")}
        </p>
      </div>
    </aside>
  );
}
