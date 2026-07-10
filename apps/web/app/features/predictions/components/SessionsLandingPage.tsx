// Spec 47-A5 — the full Cesare sessions landing (N-12 redesign).
//
// Reached from the LeftRail "Cesare" entry (`/projects/:id/sessions`). Lists the
// project's Cesare sessions as Notion-style cards with a "+ Nuova" affordance;
// clicking a card opens its full conversation at the deep-linkable central route
// `/projects/:id/sessions/:sessionId`. This is a real central page, not a peek.
import { useRef } from "react";
import { useButton } from "react-aria";
import { useNavigate } from "@tanstack/react-router";
import { SkeletonCard, Icon, useToast } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useSessions, usePinSession } from "../sessions";
import type { CesareSession } from "../sessions";
import { useTranslation } from "~/features/i18n";
import styles from "./SessionsLandingPage.module.css";

type Translate = (key: TranslationKey) => string;

function formatRelative(iso: string, t: Translate): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("cesare.time.now");
  if (minutes < 60) return `${minutes}${t("cesare.time.minutes")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("cesare.time.hours")}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return t("cesare.time.yesterday");
  return `${days}${t("cesare.time.days")}`;
}

function SessionPinButton({
  pinned,
  onToggle,
  pinLabel,
  unpinLabel,
}: {
  pinned: boolean;
  onToggle: () => void;
  pinLabel: string;
  unpinLabel: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const label = pinned ? unpinLabel : pinLabel;
  const { buttonProps } = useButton(
    {
      onPress: onToggle,
      "aria-label": label,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={[styles.cardPin, pinned ? styles.cardPinActive : ""]
        .filter(Boolean)
        .join(" ")}
      title={label}
      data-testid="session-card-pin"
    >
      <Icon name="pin" size={14} aria-hidden={true} />
    </button>
  );
}

function SessionCard({
  session,
  onOpen,
  onPin,
  pinLabel,
  unpinLabel,
}: {
  session: CesareSession;
  onOpen: (id: string) => void;
  onPin: (pinned: boolean) => void;
  pinLabel: string;
  unpinLabel: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const pinned = session.pinnedAt !== null;
  const { buttonProps } = useButton(
    {
      onPress: () => onOpen(session.id),
      "aria-label": `${t("cesare.landing.openPrefix")} ${session.title}`,
    },
    ref,
  );
  return (
    <div
      className={styles.card}
      data-session-id={session.id}
      data-session-pinned={pinned ? "true" : undefined}
    >
      <button
        ref={ref}
        {...buttonProps}
        type="button"
        className={styles.cardMain}
      >
        <span className={styles.cardGlyph} aria-hidden="true">
          ✦
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardTitle}>{session.title}</span>
          <span className={styles.cardMeta}>
            {t("cesare.landing.lastActivity")} ·{" "}
            {formatRelative(session.lastMessageAt, t)}
          </span>
        </span>
      </button>
      <SessionPinButton
        pinned={pinned}
        onToggle={() => onPin(!pinned)}
        pinLabel={pinLabel}
        unpinLabel={unpinLabel}
      />
      <span className={styles.cardChevron} aria-hidden="true">
        →
      </span>
    </div>
  );
}

export function SessionsLandingPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sessionsQuery = useSessions(projectId);
  const pinSession = usePinSession(projectId);
  const { showToast } = useToast();

  // Mirrors the LeftRail's pin handler: the server enforces max-3-pinned and
  // rejects a 4th pin with a typed `PinLimitReachedError` — surfaced as our
  // own toast (never `window.alert`).
  const handlePin = (sessionId: string, pinned: boolean) => {
    pinSession.mutate(
      { id: sessionId, pinned },
      {
        onError: (error) => {
          if ((error as { _tag?: string })._tag === "PinLimitReachedError") {
            showToast({
              message: t("shell.rail.pinLimitReached"),
              variant: "info",
            });
          }
        },
      },
    );
  };

  // Spec 52 — "+ Nuova" opens the full-screen glowy landing (`/sessions/new`).
  // The session row is created only when the user sends their first message
  // there, so the landing never spawns empty throwaway sessions.
  const openNewSessionLanding = () => {
    void navigate({
      to: "/projects/$id/sessions/new",
      params: { id: projectId },
    });
  };

  const newRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: newButtonProps } = useButton(
    {
      onPress: openNewSessionLanding,
      "aria-label": t("cesare.landing.newSessionAria"),
    },
    newRef,
  );

  const emptyRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: emptyButtonProps } = useButton(
    {
      onPress: openNewSessionLanding,
      "aria-label": t("cesare.landing.newSessionAria"),
    },
    emptyRef,
  );

  const openSession = (sessionId: string) => {
    void navigate({
      to: "/projects/$id/sessions/$sessionId",
      params: { id: projectId, sessionId },
    });
  };

  const sessions = sessionsQuery.data ?? [];
  // The server already orders pinned-first (pinned_at desc, then recency);
  // splitting into two lists here just adds the visible section label —
  // it does not re-sort.
  const pinnedSessions = sessions.filter((s) => s.pinnedAt !== null);
  const unpinnedSessions = sessions.filter((s) => s.pinnedAt === null);

  return (
    <div className={styles.page} data-testid="cesare-sessions-landing">
      <header className={styles.header}>
        <span className={styles.brandGlyph} aria-hidden="true">
          ✦
        </span>
        <div className={styles.headingText}>
          <h1 className={styles.title}>{t("cesare.landing.title")}</h1>
          <p className={styles.subtitle}>{t("cesare.landing.listSubtitle")}</p>
        </div>
        <button
          ref={newRef}
          {...newButtonProps}
          type="button"
          className={styles.newButton}
          data-testid="cesare-session-new"
        >
          {t("cesare.landing.new")}
        </button>
      </header>

      {sessionsQuery.isPending ? (
        <div className={styles.list} aria-busy="true">
          <SkeletonCard ariaLabel={t("cesare.landing.loadingAria")} />
          <SkeletonCard ariaLabel={t("cesare.landing.loadingAria")} />
          <SkeletonCard ariaLabel={t("cesare.landing.loadingAria")} />
        </div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty} data-testid="cesare-sessions-empty">
          <span className={styles.emptyGlyph} aria-hidden="true">
            ✦
          </span>
          <p className={styles.emptyTitle}>{t("cesare.landing.emptyTitle")}</p>
          <p className={styles.emptyBody}>{t("cesare.landing.empty")}</p>
          <button
            ref={emptyRef}
            {...emptyButtonProps}
            type="button"
            className={styles.emptyCta}
            data-testid="cesare-session-new-empty"
          >
            {t("cesare.landing.new")}
          </button>
        </div>
      ) : (
        <>
          <p className={styles.count}>
            {sessions.length === 1
              ? `1 ${t("cesare.landing.countOne")}`
              : `${sessions.length} ${t("cesare.landing.countMany")}`}
          </p>
          {pinnedSessions.length > 0 && (
            <>
              <p className={styles.sectionLabel}>
                {t("cesare.landing.pinnedSection")}
              </p>
              <ul
                className={styles.list}
                aria-label={t("cesare.landing.pinnedSection")}
              >
                {pinnedSessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard
                      session={session}
                      onOpen={openSession}
                      onPin={(pinned) => handlePin(session.id, pinned)}
                      pinLabel={t("shell.rail.pinSession")}
                      unpinLabel={t("shell.rail.unpinSession")}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {unpinnedSessions.length > 0 && (
            <>
              {pinnedSessions.length > 0 && (
                <p className={styles.sectionLabel}>
                  {t("cesare.landing.recentSection")}
                </p>
              )}
              <ul
                className={styles.list}
                aria-label={t("cesare.landing.listAria")}
              >
                {unpinnedSessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard
                      session={session}
                      onOpen={openSession}
                      onPin={(pinned) => handlePin(session.id, pinned)}
                      pinLabel={t("shell.rail.pinSession")}
                      unpinLabel={t("shell.rail.unpinSession")}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
