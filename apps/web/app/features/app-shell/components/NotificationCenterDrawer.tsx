import { useCallback, useMemo, useRef } from "react";
import { useButton } from "react-aria";
import { match } from "ts-pattern";
import type { TranslationKey, Locale } from "@oh-writers/domain";
import { formatTime, formatDate } from "@oh-writers/domain";
import {
  useCesareNotifications,
  type CesareNotification,
  type AffectedEntity,
} from "../cesare-notification-context";
import { ACTION_LABEL_KEY_BY_PAGE } from "../cesare-notification-labels";
import type { CesarePage } from "~/features/predictions";
import { useTranslation } from "~/features/i18n";
import styles from "./NotificationCenterDrawer.module.css";

type Translate = (key: TranslationKey) => string;

interface NotificationCenterDrawerContentProps {
  readonly onActivate: (notification: CesareNotification) => void;
}

interface NotificationCenterDrawerHeaderProps {
  readonly children?: React.ReactNode;
}

type GroupKey = "today" | "yesterday" | "older";

interface Group {
  readonly key: GroupKey;
  readonly label: string;
  readonly items: CesareNotification[];
}

/**
 * Header content for the bell SplitDrawer — title row + the
 * `Segna tutte come lette` action. The window controls (↗ ↙ ×) come from
 * the SplitDrawer chrome.
 */
export function NotificationCenterDrawerHeader(
  _: NotificationCenterDrawerHeaderProps = {},
) {
  const { t } = useTranslation();
  const { notifications, markAllSeen } = useCesareNotifications();
  const unseenCount = notifications.filter(
    (n) => !n.seen && (n.status === "completed" || n.status === "failed"),
  ).length;

  return (
    <div className={styles.header}>
      <div>
        <h2 className={styles.title}>{t("shell.notif.title")}</h2>
        <p className={styles.subtitle}>
          {unseenCount > 0
            ? `${unseenCount} ${
                unseenCount === 1
                  ? t("shell.notif.unreadSingular")
                  : t("shell.notif.unreadPlural")
              }`
            : t("shell.notif.allRead")}
        </p>
      </div>
      <div className={styles.headerActions}>
        {unseenCount > 0 && <MarkAllSeenButton onPress={markAllSeen} />}
      </div>
    </div>
  );
}

function MarkAllSeenButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": t("shell.notif.markAllRead"),
    },
    buttonRef,
  );
  return (
    <button
      ref={buttonRef}
      {...buttonProps}
      type="button"
      className={styles.linkBtn}
    >
      {t("shell.notif.markAllRead")}
    </button>
  );
}

/**
 * Body content for the bell SplitDrawer — the chronological list of
 * Cesare runs grouped by `Oggi / Ieri / Più vecchie`. Click on a row
 * dispatches `onActivate`, marks the notification as seen, and the parent
 * shell closes the drawer + handles navigation + pulse.
 *
 * This component intentionally has NO outer aside / scrim — those come
 * from the SplitDrawer primitive that hosts it.
 */
export function NotificationCenterDrawerContent({
  onActivate,
}: NotificationCenterDrawerContentProps) {
  const { t, locale } = useTranslation();
  const { notifications, dismissNotification, clearCompleted } =
    useCesareNotifications();

  const groups = useMemo<Group[]>(() => {
    const now = Date.now();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const sorted = [...notifications].sort(
      (a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt),
    );
    const today: CesareNotification[] = [];
    const yesterday: CesareNotification[] = [];
    const older: CesareNotification[] = [];
    for (const n of sorted) {
      const ts = n.completedAt ?? n.startedAt;
      if (ts >= startOfToday.getTime()) today.push(n);
      else if (ts >= startOfYesterday.getTime()) yesterday.push(n);
      else older.push(n);
    }
    const all: Group[] = [
      { key: "today", label: t("shell.notif.groupToday"), items: today },
      {
        key: "yesterday",
        label: t("shell.notif.groupYesterday"),
        items: yesterday,
      },
      { key: "older", label: t("shell.notif.groupOlder"), items: older },
    ];
    return all.filter((g) => g.items.length > 0);
  }, [notifications, t]);

  const handleClickItem = useCallback(
    (n: CesareNotification) => {
      onActivate(n);
    },
    [onActivate],
  );

  return (
    <>
      <section className={styles.section} aria-labelledby="cesare-section">
        <header className={styles.sectionHeader}>
          <h3 id="cesare-section" className={styles.sectionTitle}>
            {t("shell.notif.sectionCesare")}
          </h3>
          {notifications.length > 0 && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={clearCompleted}
            >
              {t("shell.notif.clearCompleted")}
            </button>
          )}
        </header>

        {groups.length === 0 ? (
          <p className={styles.empty}>{t("shell.notif.empty")}</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className={styles.group}>
              <span className={styles.groupLabel}>{g.label}</span>
              <ul className={styles.list}>
                {g.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onClick={() => handleClickItem(n)}
                    onDismiss={() => dismissNotification(n.id)}
                    t={t}
                    locale={locale}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className={styles.section} aria-labelledby="team-section">
        <header className={styles.sectionHeader}>
          <h3 id="team-section" className={styles.sectionTitle}>
            {t("shell.notif.sectionTeam")}
          </h3>
          <span className={styles.soon}>{t("shell.notif.soon")}</span>
        </header>
        <p className={styles.empty}>{t("shell.notif.teamEmpty")}</p>
      </section>

      <section className={styles.section} aria-labelledby="system-section">
        <header className={styles.sectionHeader}>
          <h3 id="system-section" className={styles.sectionTitle}>
            {t("shell.notif.sectionSystem")}
          </h3>
          <span className={styles.soon}>{t("shell.notif.soon")}</span>
        </header>
        <p className={styles.empty}>
          Release notes e annunci dell&apos;app appariranno qui.
        </p>
      </section>
    </>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  readonly notification: CesareNotification;
  readonly onClick: () => void;
  readonly onDismiss: () => void;
  readonly t: Translate;
  readonly locale: Locale;
}

function NotificationRow({
  notification,
  onClick,
  onDismiss,
  t,
  locale,
}: RowProps) {
  const ts = notification.completedAt ?? notification.startedAt;
  const time = formatRelativeTime(ts, locale);
  const dot = match(notification.status)
    .with("in-progress", () => t("shell.notif.statusInProgress"))
    .with("completed", () =>
      notification.seen
        ? t("shell.notif.statusRead")
        : t("shell.notif.statusUnread"),
    )
    .with("failed", () => t("shell.notif.statusError"))
    .exhaustive();
  return (
    <li className={styles.row} data-status={notification.status}>
      <button
        type="button"
        className={styles.rowMain}
        onClick={onClick}
        data-testid={`notification-row-${notification.id}`}
      >
        <span
          className={styles.dot}
          data-status={notification.status}
          data-seen={notification.seen ? "true" : "false"}
          aria-label={dot}
        />
        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>
            <span className={styles.rowSparkle} aria-hidden="true">
              ✦
            </span>{" "}
            {labelForPage(notification.page, t)}{" "}
            <span className={styles.rowAction}>·</span>{" "}
            <span className={styles.rowAction}>{notification.actionLabel}</span>
          </span>
          <span className={styles.rowText}>
            {notification.status === "completed"
              ? (notification.resultLabel ?? t("shell.notif.rowCompleted"))
              : notification.status === "failed"
                ? (notification.errorLabel ?? t("shell.notif.rowError"))
                : t("shell.notif.rowInProgress")}
          </span>
          {notification.affectedEntities &&
            notification.affectedEntities.length > 0 && (
              <span className={styles.rowEntities}>
                {summariseEntities(notification.affectedEntities, t)}
              </span>
            )}
        </span>
        <time className={styles.rowTime} dateTime={new Date(ts).toISOString()}>
          {time}
        </time>
      </button>
      <button
        type="button"
        className={styles.rowDismiss}
        onClick={onDismiss}
        aria-label={t("shell.notif.dismiss")}
        title={t("shell.notif.dismissTitle")}
      >
        ×
      </button>
    </li>
  );
}

const formatRelativeTime = (ts: number, locale: Locale): string => {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() >= today.getTime()) {
    return formatTime(d, locale);
  }
  return formatDate(d, locale);
};

const labelForPage = (page: CesarePage, t: Translate): string => {
  const key = ACTION_LABEL_KEY_BY_PAGE[page] as TranslationKey | undefined;
  return key ? t(key) : page;
};

const summariseEntities = (
  entities: AffectedEntity[],
  t: Translate,
): string => {
  const counts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([kind, n]) => `${n} ${entityLabel(kind, n, t)}`)
    .join(" · ");
};

const entityLabel = (kind: string, n: number, t: Translate): string =>
  match(kind)
    .with("candidate", () =>
      n === 1
        ? t("shell.notif.entityCandidateSingular")
        : t("shell.notif.entityCandidatePlural"),
    )
    .with("breakdown", () =>
      n === 1
        ? t("shell.notif.entityBreakdownSingular")
        : t("shell.notif.entityBreakdownPlural"),
    )
    .with("budget-line", () =>
      n === 1
        ? t("shell.notif.entityBudgetSingular")
        : t("shell.notif.entityBudgetPlural"),
    )
    .with("schedule-day", () =>
      n === 1
        ? t("shell.notif.entityScheduleSingular")
        : t("shell.notif.entitySchedulePlural"),
    )
    .with("document", () =>
      n === 1
        ? t("shell.notif.entityDocumentSingular")
        : t("shell.notif.entityDocumentPlural"),
    )
    .otherwise(() => kind);
