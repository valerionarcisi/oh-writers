import { useCallback, useMemo, useRef } from "react";
import { useButton } from "react-aria";
import { match } from "ts-pattern";
import {
  useCesareNotifications,
  type CesareNotification,
  type AffectedEntity,
} from "../cesare-notification-context";
import { ACTION_LABEL_BY_PAGE } from "../cesare-notification-labels";
import type { CesarePage } from "~/features/predictions";
import styles from "./NotificationCenterDrawer.module.css";

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
  const { notifications, markAllSeen } = useCesareNotifications();
  const unseenCount = notifications.filter(
    (n) => !n.seen && (n.status === "completed" || n.status === "failed"),
  ).length;

  return (
    <div className={styles.header}>
      <div>
        <h2 className={styles.title}>Notifiche Cesare</h2>
        <p className={styles.subtitle}>
          {unseenCount > 0
            ? `${unseenCount} ${unseenCount === 1 ? "non letta" : "non lette"}`
            : "Tutto letto"}
        </p>
      </div>
      <div className={styles.headerActions}>
        {unseenCount > 0 && <MarkAllSeenButton onPress={markAllSeen} />}
      </div>
    </div>
  );
}

function MarkAllSeenButton({ onPress }: { onPress: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": "Segna tutte come lette",
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
      Segna tutte come lette
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
      { key: "today", label: "Oggi", items: today },
      { key: "yesterday", label: "Ieri", items: yesterday },
      { key: "older", label: "Più vecchie", items: older },
    ];
    return all.filter((g) => g.items.length > 0);
  }, [notifications]);

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
            Cesare
          </h3>
          {notifications.length > 0 && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={clearCompleted}
            >
              Cancella completate
            </button>
          )}
        </header>

        {groups.length === 0 ? (
          <p className={styles.empty}>
            Nessuna notifica. Cesare ti avviserà quando completa un&apos;azione
            su una pagina.
          </p>
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
            Team &amp; collaborazione
          </h3>
          <span className={styles.soon}>Presto</span>
        </header>
        <p className={styles.empty}>
          Quando un collaboratore ti invita o commenta riceverai qui un
          riepilogo.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="system-section">
        <header className={styles.sectionHeader}>
          <h3 id="system-section" className={styles.sectionTitle}>
            Sistema
          </h3>
          <span className={styles.soon}>Presto</span>
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
}

function NotificationRow({ notification, onClick, onDismiss }: RowProps) {
  const ts = notification.completedAt ?? notification.startedAt;
  const time = formatTime(ts);
  const dot = match(notification.status)
    .with("in-progress", () => "in corso")
    .with("completed", () => (notification.seen ? "letta" : "non letta"))
    .with("failed", () => "errore")
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
            {labelForPage(notification.page)}{" "}
            <span className={styles.rowAction}>·</span>{" "}
            <span className={styles.rowAction}>{notification.actionLabel}</span>
          </span>
          <span className={styles.rowText}>
            {notification.status === "completed"
              ? (notification.resultLabel ?? "Completata")
              : notification.status === "failed"
                ? (notification.errorLabel ?? "Errore")
                : "In corso…"}
          </span>
          {notification.affectedEntities &&
            notification.affectedEntities.length > 0 && (
              <span className={styles.rowEntities}>
                {summariseEntities(notification.affectedEntities)}
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
        aria-label="Rimuovi notifica"
        title="Rimuovi"
      >
        ×
      </button>
    </li>
  );
}

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() >= today.getTime()) {
    return d.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

const labelForPage = (page: CesarePage): string => {
  const map = ACTION_LABEL_BY_PAGE as Partial<Record<CesarePage, string>>;
  return map[page] ?? page;
};

const summariseEntities = (entities: AffectedEntity[]): string => {
  const counts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([kind, n]) => `${n} ${entityLabel(kind, n)}`)
    .join(" · ");
};

const entityLabel = (kind: string, n: number): string =>
  match(kind)
    .with("candidate", () =>
      n === 1 ? "candidato location" : "candidati location",
    )
    .with("breakdown", () => (n === 1 ? "scena" : "scene"))
    .with("budget-line", () => (n === 1 ? "voce budget" : "voci budget"))
    .with("schedule-day", () => (n === 1 ? "giornata" : "giornate"))
    .with("document", () => (n === 1 ? "documento" : "documenti"))
    .otherwise(() => kind);
