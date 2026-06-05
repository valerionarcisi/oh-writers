// Spec 47-A5 — the full Cesare sessions landing (N-12 redesign).
//
// Reached from the LeftRail "Cesare" entry (`/projects/:id/sessions`). Lists the
// project's Cesare sessions as Notion-style cards with a "+ Nuova" affordance;
// clicking a card opens its full conversation at the deep-linkable central route
// `/projects/:id/sessions/:sessionId`. This is a real central page, not a peek.
import { useRef } from "react";
import { useButton } from "react-aria";
import { useNavigate } from "@tanstack/react-router";
import { SkeletonCard } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useSessions } from "../sessions";
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

function SessionCard({
  session,
  onOpen,
}: {
  session: CesareSession;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: () => onOpen(session.id),
      "aria-label": `${t("cesare.landing.openPrefix")} ${session.title}`,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.card}
      data-session-id={session.id}
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
      <span className={styles.cardChevron} aria-hidden="true">
        →
      </span>
    </button>
  );
}

export function SessionsLandingPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sessionsQuery = useSessions(projectId);

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
          <ul className={styles.list} aria-label={t("cesare.landing.listAria")}>
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} onOpen={openSession} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
