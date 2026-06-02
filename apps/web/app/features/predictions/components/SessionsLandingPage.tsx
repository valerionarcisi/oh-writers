// Spec 47-A5 — the full Cesare sessions landing.
//
// Reached from the LeftRail "Cesare" entry (`/projects/:id/sessions`). Lists the
// project's Cesare sessions with a "+ Nuova" affordance; clicking a row opens
// its full conversation at the deep-linkable central route
// `/projects/:id/sessions/:sessionId`. This is a real central page, not a peek.
import { useRef } from "react";
import { useButton } from "react-aria";
import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@oh-writers/ui";
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

function SessionRow({
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
      className={styles.row}
      data-session-id={session.id}
    >
      <span className={styles.rowGlyph} aria-hidden="true">
        ✦
      </span>
      <span className={styles.rowTitle}>{session.title}</span>
      <span className={styles.rowMeta}>
        {formatRelative(session.lastMessageAt, t)}
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
        <div className={styles.heading}>
          <span className={styles.brandGlyph} aria-hidden="true">
            ✦
          </span>
          <div>
            <h1 className={styles.title}>{t("cesare.landing.title")}</h1>
            <p className={styles.subtitle}>
              {t("cesare.landing.listSubtitle")}
            </p>
          </div>
        </div>
        <button
          ref={newRef}
          {...newButtonProps}
          className={styles.newButton}
          data-testid="cesare-session-new"
        >
          {t("cesare.landing.new")}
        </button>
      </header>

      {sessionsQuery.isPending ? (
        <Skeleton
          lines={4}
          widths={["70%", "55%", "62%", "48%"]}
          tone="agent"
          ariaLabel={t("cesare.landing.loadingAria")}
        />
      ) : sessions.length === 0 ? (
        <p className={styles.empty}>{t("cesare.landing.empty")}</p>
      ) : (
        <ul className={styles.list} aria-label={t("cesare.landing.listAria")}>
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionRow session={session} onOpen={openSession} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
