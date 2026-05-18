import { useEffect, useRef } from "react";
import { useButton } from "react-aria";
import {
  useCesareNotifications,
  type CesareNotification,
} from "../cesare-notification-context";
import type { WebPushPermission } from "../hooks/useWebPush";
import styles from "./CesareNotificationPill.module.css";

const AUTO_DISMISS_MS = 30_000;

interface CesareNotificationPillProps {
  notification: CesareNotification;
  onActivate: (notification: CesareNotification) => void;
  pushPermission: WebPushPermission;
  onRequestPush: () => void;
}

function DismissButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": label },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.dismissBtn}
    >
      ✕
    </button>
  );
}

function BodyButton({
  onPress,
  ariaLabel,
  children,
}: {
  onPress: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": ariaLabel },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.bodyButton}
    >
      {children}
    </button>
  );
}

function EnablePushLink({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress }, ref);
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.enablePushBtn}
    >
      Abilita notifiche desktop
    </button>
  );
}

function CesareNotificationPill({
  notification,
  onActivate,
  pushPermission,
  onRequestPush,
}: CesareNotificationPillProps) {
  const { dismissNotification } = useCesareNotifications();

  // Auto-dismiss completed/failed pills after 30s.
  useEffect(() => {
    if (notification.status === "in-progress") return;
    if (!notification.completedAt) return;

    const elapsed = Date.now() - notification.completedAt;
    const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
    const timer = window.setTimeout(() => {
      dismissNotification(notification.id);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [
    notification.status,
    notification.completedAt,
    notification.id,
    dismissNotification,
  ]);

  const isInProgress = notification.status === "in-progress";
  const isCompleted = notification.status === "completed";
  const isFailed = notification.status === "failed";

  const pillClass = [
    styles.pill,
    isCompleted ? styles.pillCompleted : "",
    isFailed ? styles.pillFailed : "",
  ]
    .filter(Boolean)
    .join(" ");

  const title = isInProgress
    ? notification.actionLabel
    : isFailed
      ? (notification.errorLabel ?? "Cesare ha avuto un problema")
      : (notification.resultLabel ?? "Cesare ha completato l'azione");

  const subtitle = isInProgress
    ? null
    : isFailed
      ? "Riprova quando vuoi"
      : "Vai a vedere";

  const showEnablePush =
    isCompleted && pushPermission === "default";

  return (
    <div
      className={pillClass}
      role="status"
      aria-live={isInProgress ? "off" : "polite"}
    >
      <BodyButton
        onPress={() => onActivate(notification)}
        ariaLabel={`${title}${subtitle ? ` — ${subtitle}` : ""}`}
      >
        <span className={styles.icon} aria-hidden>
          ✦
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {subtitle && (
            <span className={styles.subtitle}>
              {subtitle}
              {showEnablePush && (
                <>
                  {" · "}
                  <EnablePushLink onPress={onRequestPush} />
                </>
              )}
            </span>
          )}
        </span>
        {!isInProgress && (
          <span className={styles.chevron} aria-hidden>
            →
          </span>
        )}
      </BodyButton>

      {!isInProgress && (
        <DismissButton
          onPress={() => dismissNotification(notification.id)}
          label="Chiudi notifica"
        />
      )}

      {isInProgress && (
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressBar} />
        </div>
      )}
    </div>
  );
}

interface CesareNotificationStackProps {
  onActivate: (notification: CesareNotification) => void;
  pushPermission: WebPushPermission;
  onRequestPush: () => void;
}

export function CesareNotificationStack({
  onActivate,
  pushPermission,
  onRequestPush,
}: CesareNotificationStackProps) {
  const { notifications } = useCesareNotifications();
  if (notifications.length === 0) return null;

  return (
    <div className={styles.stack} aria-label="Notifiche di Cesare">
      {notifications.map((n) => (
        <CesareNotificationPill
          key={n.id}
          notification={n}
          onActivate={onActivate}
          pushPermission={pushPermission}
          onRequestPush={onRequestPush}
        />
      ))}
    </div>
  );
}
