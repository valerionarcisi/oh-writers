import styles from "./ScheduleStubView.module.css";

interface ScheduleStubViewProps {
  title: string;
  description: string;
}

/**
 * Placeholder for views that ship after the strip board (mockups B & C):
 * keeps the tab navigable and primed for the next implementation pass.
 */
export function ScheduleStubView({ title, description }: ScheduleStubViewProps) {
  return (
    <div className={styles.stub} role="status" data-testid="schedule-stub-view">
      <span className={styles.eyebrow}>In arrivo</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
