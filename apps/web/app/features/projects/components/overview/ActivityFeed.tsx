import { match } from "ts-pattern";
import type {
  ActivityItem,
  ActivityKind,
} from "../../server/project-overview.server";
import styles from "./ActivityFeed.module.css";

interface ActivityFeedProps {
  readonly items: ActivityItem[];
}

const KIND_LABEL = (kind: ActivityKind): string =>
  match(kind)
    .with("document_edit", () => "Documento")
    .with("screenplay_save", () => "Sceneggiatura")
    .with("breakdown_change", () => "Breakdown")
    .with("ai_suggestion", () => "Cesare")
    .with("project_created", () => "Progetto")
    .with("member_added", () => "Team")
    .exhaustive();

const formatTime = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) {
    return new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  if (date.toDateString() === yesterday.toDateString()) return "Ieri";
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(date);
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="overview-activity-h">
        <div className={styles.head}>
          <h2 id="overview-activity-h" className={styles.title}>
            Attività
          </h2>
        </div>
        <p className={styles.empty}>Nessuna attività recente.</p>
      </section>
    );
  }
  return (
    <section className={styles.section} aria-labelledby="overview-activity-h">
      <div className={styles.head}>
        <h2 id="overview-activity-h" className={styles.title}>
          Attività
        </h2>
      </div>
      <ul className={styles.list}>
        {items.map((it) => (
          <li key={it.id} className={styles.item}>
            <div className={styles.time}>{formatTime(it.at)}</div>
            <div className={styles.body}>
              <b>{KIND_LABEL(it.kind)}</b> {it.summary}
              {it.actorName && (
                <span className={styles.who}>
                  {it.actorKind === "ai" ? "AI" : it.actorName}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
