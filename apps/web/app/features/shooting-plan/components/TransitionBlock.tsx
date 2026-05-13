import type { TransitionSlotView } from "../server/shooting-plan.server";
import styles from "./TransitionBlock.module.css";

const TRANSITION_ICONS: Record<string, string> = {
  SETUP_CHANGE: "⟳",
  MAKEUP_COSTUME: "💄",
  BREAK: "☕",
  TRAVEL: "🚐",
};

interface TransitionBlockProps {
  transition: TransitionSlotView;
  onEdit: () => void;
}

export function TransitionBlock({ transition, onEdit }: TransitionBlockProps) {
  const icon = TRANSITION_ICONS[transition.type] ?? "⟳";
  return (
    <button
      type="button"
      className={styles.block}
      data-type={transition.type.toLowerCase()}
      onClick={onEdit}
      title={transition.label ?? transition.type}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.minutes}>
        {transition.estimatedMinutes ?? "—"}m
      </span>
    </button>
  );
}
