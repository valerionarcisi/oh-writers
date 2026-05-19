import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import {
  useCesareNotifications,
  type CesareNotification,
  type AffectedEntity,
} from "../cesare-notification-context";
import { ACTION_LABEL_BY_PAGE } from "../cesare-notification-labels";
import type { CesarePage } from "~/features/predictions";
import styles from "./NotificationCenterDrawer.module.css";

interface NotificationCenterDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onActivate: (notification: CesareNotification) => void;
}

type GroupKey = "today" | "yesterday" | "older";

interface Group {
  readonly key: GroupKey;
  readonly label: string;
  readonly items: CesareNotification[];
}

/**
 * Side drawer that lists every Cesare notification of the current session
 * (sessionStorage-backed). Grouped by Oggi / Ieri / Più vecchie. Click on an
 * item dispatches `onActivate` which opens the Cesare sheet scoped to the
 * relevant page and marks the notification as seen.
 *
 * Slots for team invites / system messages live below the Cesare list — for
 * now they show empty states so the layout reflects the intended shape.
 */
export function NotificationCenterDrawer({
  isOpen,
  onClose,
  onActivate,
}: NotificationCenterDrawerProps) {
  const { notifications, dismissNotification, clearCompleted, markAllSeen } =
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

  const unseenCount = notifications.filter(
    (n) => !n.seen && n.status === "completed",
  ).length;

  const handleClickItem = useCallback(
    (n: CesareNotification) => {
      onActivate(n);
      onClose();
    },
    [onActivate, onClose],
  );

  return (
    <>
      <div
        className={styles.scrim}
        data-open={isOpen}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={styles.drawer}
        data-open={isOpen}
        role="complementary"
        aria-label="Centro notifiche"
      >
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Notifiche</h2>
            <p className={styles.subtitle}>
              {unseenCount > 0
                ? `${unseenCount} ${unseenCount === 1 ? "non letta" : "non lette"}`
                : "Tutto letto"}
            </p>
          </div>
          <div className={styles.headerActions}>
            {unseenCount > 0 && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={markAllSeen}
              >
                Segna tutte lette
              </button>
            )}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        </header>

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
              Nessuna notifica. Cesare ti avviserà quando completa un'azione su
              una pagina.
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
              Team & collaborazione
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
            Release notes e annunci dell'app appariranno qui.
          </p>
        </section>
      </aside>
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
      <button type="button" className={styles.rowMain} onClick={onClick}>
        <span
          className={styles.dot}
          data-status={notification.status}
          data-seen={notification.seen ? "true" : "false"}
          aria-label={dot}
        />
        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>
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
        ✕
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
    .with("location-candidate", () =>
      n === 1 ? "candidato location" : "candidati location",
    )
    .with("scene", () => (n === 1 ? "scena" : "scene"))
    .with("budget-line", () => (n === 1 ? "voce budget" : "voci budget"))
    .with("schedule-day", () => (n === 1 ? "giornata" : "giornate"))
    .with("document", () => (n === 1 ? "documento" : "documenti"))
    .otherwise(() => kind);
