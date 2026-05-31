import type { DocumentType } from "@oh-writers/domain";
import { DocumentTypes } from "@oh-writers/domain";
import styles from "./AIAssistantPanel.module.css";

interface AIAssistantPanelProps {
  type: DocumentType;
}

// Type-specific quick actions — wired to real AI calls in Spec 07
const AI_ACTIONS: Record<DocumentType, string[]> = {
  [DocumentTypes.LOGLINE]: [
    "Genera 3 alternative",
    "Rendi più conciso",
    "Rafforza il conflitto",
  ],
  [DocumentTypes.SOGGETTO]: [
    "Espandi un paragrafo",
    "Stringi la premessa",
    "Chiarisci il tema",
  ],
  [DocumentTypes.SYNOPSIS]: [
    "Espandi un paragrafo",
    "Suggerisci una scena da aggiungere",
    "Verifica la struttura in tre atti",
  ],
  [DocumentTypes.OUTLINE]: [
    "Suggerisci una scena",
    "Individua problemi di ritmo",
    "Suggerisci un'alternativa",
  ],
  [DocumentTypes.TREATMENT]: [
    "Espandi una sezione",
    "Suggerisci dialoghi",
    "Individua problemi di ritmo",
  ],
};

export function AIAssistantPanel({ type }: AIAssistantPanelProps) {
  const actions = AI_ACTIONS[type];

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Assistente AI</span>
        <span className={styles.badge}>Spec 07</span>
      </div>

      <p className={styles.notice}>
        L'assistenza AI arriverà con la Spec 07. Le azioni qui sotto saranno
        attive una volta integrate.
      </p>

      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action}
            className={styles.actionBtn}
            disabled
            title="In arrivo con la Spec 07"
            type="button"
          >
            {action}
          </button>
        ))}
      </div>

      <div className={styles.suggestionArea}>
        <p className={styles.suggestionPlaceholder}>
          I suggerimenti compariranno qui dopo aver eseguito un'azione.
        </p>
      </div>
    </aside>
  );
}
