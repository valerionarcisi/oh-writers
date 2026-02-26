import type { DocumentType } from "@oh-writers/shared";
import { DocumentTypes } from "@oh-writers/shared";
import styles from "./AIAssistantPanel.module.css";

interface AIAssistantPanelProps {
  type: DocumentType;
}

// Type-specific quick actions — wired to real AI calls in Spec 07
const AI_ACTIONS: Record<DocumentType, string[]> = {
  [DocumentTypes.LOGLINE]: [
    "Generate 3 alternatives",
    "Make it more concise",
    "Strengthen the conflict",
  ],
  [DocumentTypes.SYNOPSIS]: [
    "Expand a paragraph",
    "Suggest a scene to add",
    "Check three-act structure",
  ],
  [DocumentTypes.OUTLINE]: [
    "Suggest a scene",
    "Identify pacing issues",
    "Suggest an alternative",
  ],
  [DocumentTypes.TREATMENT]: [
    "Expand a section",
    "Suggest dialogue",
    "Identify rhythm issues",
  ],
};

export function AIAssistantPanel({ type }: AIAssistantPanelProps) {
  const actions = AI_ACTIONS[type];

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        <span className={styles.badge}>Spec 07</span>
      </div>

      <p className={styles.notice}>
        AI assistance is coming in Spec 07. Actions below will be active once
        integrated.
      </p>

      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action}
            className={styles.actionBtn}
            disabled
            title="Coming in Spec 07"
            type="button"
          >
            {action}
          </button>
        ))}
      </div>

      <div className={styles.suggestionArea}>
        <p className={styles.suggestionPlaceholder}>
          Suggestions will appear here after you run an action.
        </p>
      </div>
    </aside>
  );
}
