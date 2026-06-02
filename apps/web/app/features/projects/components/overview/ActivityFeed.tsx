import { match } from "ts-pattern";
import type {
  ActivityItem,
  ActivityKind,
} from "../../server/project-overview.server";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./ActivityFeed.module.css";

type Translate = (key: TranslationKey) => string;

interface ActivityFeedProps {
  readonly items: ActivityItem[];
}

const KIND_LABEL = (kind: ActivityKind, t: Translate): string =>
  match(kind)
    .with("document_edit", () => t("projects.activity.kindDocument"))
    .with("screenplay_save", () => t("nav.screenplay"))
    .with("breakdown_change", () => t("nav.breakdown"))
    .with("ai_suggestion", () => "Cesare")
    .with("project_created", () => t("projects.activity.kindProject"))
    .with("member_added", () => t("projects.hero.scopeTeam"))
    .exhaustive();

const formatTime = (iso: string, t: Translate, now = new Date()): string => {
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
  if (date.toDateString() === yesterday.toDateString())
    return t("projects.activity.yesterday");
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(date);
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="overview-activity-h">
        <div className={styles.head}>
          <h2 id="overview-activity-h" className={styles.title}>
            {t("projects.activity.heading")}
          </h2>
        </div>
        <p className={styles.empty}>{t("projects.activity.empty")}</p>
      </section>
    );
  }
  return (
    <section className={styles.section} aria-labelledby="overview-activity-h">
      <div className={styles.head}>
        <h2 id="overview-activity-h" className={styles.title}>
          {t("projects.activity.heading")}
        </h2>
      </div>
      <ul className={styles.list}>
        {items.map((it) => (
          <li key={it.id} className={styles.item}>
            <div className={styles.time}>{formatTime(it.at, t)}</div>
            <div className={styles.body}>
              <b>{KIND_LABEL(it.kind, t)}</b> {it.summary}
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
