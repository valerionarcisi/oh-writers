// Spec 47-A5 — central, deep-linkable session conversation route
// (`/projects/:id/sessions/:sessionId`). This REPLACES the main content (it is
// not a `?peek=` side-drawer).
//
// Reconciliation with the floating CesareDrawer (authoritative): the drawer
// owns the live conversation + agentic edits. This page does NOT fork a second
// chat container. Instead it focuses the requested session via the shell-level
// session-focus context (which `CesareSheet` adopts as its active session) and
// expands Cesare, so the authoritative chat shows exactly this thread. The
// central lane is a Notion-AI-style session page (title + metadata + entry CTA).
//
// Access control lives entirely server-side: `useSession` calls a `getSession`
// server fn that fails closed (foreign / unknown id → not-found error). This
// component renders a not-found body in that case — no session title or content
// is shown for a session the user doesn't own.
import { useEffect } from "react";
import { z } from "zod";
import { Skeleton, Button } from "@oh-writers/ui";
import { useCesareOpen, useCesareSessionFocus } from "~/features/app-shell";
import { useSession } from "../sessions";
import styles from "./SessionConversationPage.module.css";

const SessionIdParam = z.string().uuid();

export function SessionConversationPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  // A malformed param can't belong to anyone — short-circuit to not-found
  // before hitting the server (defence in depth; the server fn also rejects).
  const isValidParam = SessionIdParam.safeParse(sessionId).success;

  const sessionQuery = useSession(
    isValidParam ? projectId : null,
    isValidParam ? sessionId : null,
  );
  const openCesare = useCesareOpen();
  const { setFocusedSessionId } = useCesareSessionFocus();

  const session = sessionQuery.data;
  // Depend on the stable id, not the query object — TanStack returns a fresh
  // object on every refetch, and re-running `openCesare()` would forcibly
  // re-expand Cesare even after the user collapsed it.
  const confirmedSessionId = session?.id ?? null;

  // Once the session is confirmed owned, focus it in the authoritative drawer
  // and expand Cesare so its conversation fills the floating surface.
  useEffect(() => {
    if (!confirmedSessionId) return;
    setFocusedSessionId(confirmedSessionId);
    openCesare();
  }, [confirmedSessionId, setFocusedSessionId, openCesare]);

  // Release the focus when leaving the route so a later page doesn't keep
  // forcing this session active.
  useEffect(() => {
    return () => setFocusedSessionId(null);
  }, [setFocusedSessionId]);

  if (!isValidParam || sessionQuery.isError) {
    return (
      <div className={styles.page} data-testid="cesare-session-not-found">
        <h1 className={styles.title}>Sessione non trovata</h1>
        <p className={styles.subtitle}>
          Questa conversazione non esiste o non è accessibile.
        </p>
      </div>
    );
  }

  if (sessionQuery.isPending || !session) {
    return (
      <div className={styles.page} data-testid="cesare-session-loading">
        <Skeleton
          lines={3}
          widths={["60%", "80%", "45%"]}
          tone="agent"
          ariaLabel="Caricamento sessione Cesare"
        />
      </div>
    );
  }

  return (
    <div
      className={styles.page}
      data-testid="session-conversation"
      data-session-id={session.id}
    >
      <header className={styles.header}>
        <span className={styles.brandGlyph} aria-hidden="true">
          ✦
        </span>
        <div>
          <h1 className={styles.title} data-testid="session-title">
            {session.title}
          </h1>
          <p className={styles.subtitle}>Conversazione con Cesare</p>
        </div>
      </header>

      <p className={styles.lede}>
        La conversazione è aperta in Cesare, in basso a destra. Scrivi lì per
        continuare questa sessione.
      </p>

      <Button
        variant="secondary"
        size="md"
        onPress={() => openCesare()}
        data-testid="session-open-chat"
      >
        ✦ Apri la conversazione
      </Button>
    </div>
  );
}
