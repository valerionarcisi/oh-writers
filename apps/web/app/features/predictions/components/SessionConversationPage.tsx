// Spec 47-A5 + 47b FIX 2 — central, deep-linkable session conversation route
// (`/projects/:id/sessions/:sessionId`). This REPLACES the main content (it is
// not a `?peek=` side-drawer).
//
// The page renders the REAL conversation for the focused session: every user +
// assistant bubble, the agentic trace (Step Block / ChangeTrace), and the
// Mostra/Nascondi modifiche + Annulla controls. It reuses the SAME renderer
// (`<CesareConversation/>`) and the SAME shared chat store as the floating
// drawer — so there is a single chat container, never a fork. The composer here
// sends through the shared store, targeting this session's thread.
//
// Access control lives entirely server-side: `useSession` calls a `getSession`
// server fn that fails closed (foreign / unknown id → not-found error).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useRouter } from "@tanstack/react-router";
import { Skeleton, ComposerTextarea } from "@oh-writers/ui";
import { useButton } from "react-aria";
import {
  useCesareSessionFocus,
  useRegisterCesareSurface,
  useRegisterSplitOpener,
} from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import { useSession } from "../sessions";
import { useCesareChatStore } from "../cesare-chat-store";
import {
  CesareConversation,
  extractStepBlockMetadata,
  extractChangeSummary,
} from "./CesareConversation";
import { useShowChangesInSplitDrawer } from "./CesareSheet";
import {
  buildTargetPageRefForDocument,
  documentRouteFor,
} from "../cesare-show-changes";
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
  const { t } = useTranslation();

  const sessionQuery = useSession(
    isValidParam ? projectId : null,
    isValidParam ? sessionId : null,
  );
  const { setFocusedSessionId } = useCesareSessionFocus();
  const store = useCesareChatStore();
  // This page IS the chat — suppress the shell's floating Cesare drawer + pill.
  useRegisterCesareSurface();

  const session = sessionQuery.data;
  const confirmedSessionId = session?.id ?? null;

  // `store` is a `useMemo` keyed on the chat state, so its reference changes on
  // every message/selection. Reading it through a ref keeps the focus/select
  // effect depending ONLY on the stable `confirmedSessionId` — listing `store`
  // as a dep made the effect re-fire on every state change, call `selectSession`
  // again, mutate the state, and loop ("Maximum update depth exceeded").
  const storeRef = useRef(store);
  storeRef.current = store;

  // Once the session is confirmed owned, focus it so the floating drawer and
  // this page agree on the active session (shared store, single source).
  useEffect(() => {
    if (!confirmedSessionId) return;
    setFocusedSessionId(confirmedSessionId);
    storeRef.current?.selectSession(confirmedSessionId);
  }, [confirmedSessionId, setFocusedSessionId]);

  useEffect(() => {
    return () => setFocusedSessionId(null);
  }, [setFocusedSessionId]);

  // ── Scroll-to-bottom affordance ────────────────────────────────────────────
  // Shown when the thread is scrolled away from the bottom; clicking it jumps to
  // the latest message. Same pattern as the floating drawer's scroll nudge so
  // every chat surface has it.
  const threadRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < 80);
  }, []);
  const scrollToBottom = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // ── Composer ──────────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const isLoading = store?.isLoadingFor(confirmedSessionId) ?? false;

  // Opening a session jumps straight to the latest message (instant, no smooth
  // animation): a writer wants the newest content, not the top of a long thread.
  // Runs once the session is confirmed AND its messages have hydrated.
  const messageCount = store?.messagesFor(confirmedSessionId).length ?? 0;
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !confirmedSessionId || messageCount === 0) return;
    if (jumpedRef.current === confirmedSessionId) return;
    jumpedRef.current = confirmedSessionId;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [confirmedSessionId, messageCount]);

  // Auto-scroll to the latest message whenever a new bubble is added (the user
  // sends, or the assistant turn lands) — so the conversation always shows the
  // newest content. Keyed on the message count so it fires once per new message,
  // not on every stream tick.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    // Defer to after the new bubble has laid out, else scrollHeight is the OLD
    // height and we stop short of the bottom.
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [messageCount]);

  // Cmd/Ctrl+C stops the agent mid-turn (like every agent CLI), but ONLY while a
  // turn is in flight AND nothing is selected — otherwise Cmd+C must keep copying
  // selected text.
  useEffect(() => {
    if (!isLoading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) {
        const hasSelection =
          (window.getSelection()?.toString() ?? "").length > 0;
        if (hasSelection) return;
        e.preventDefault();
        store?.stop(confirmedSessionId ?? undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading, store, confirmedSessionId]);

  const handleSubmit = useCallback(() => {
    if (!store || !confirmedSessionId) return;
    const text = input.trim();
    if (text.length === 0 || isLoading) return;
    setInput("");
    void store.send(text, confirmedSessionId);
  }, [store, confirmedSessionId, input, isLoading]);

  // Per-result-card "Apri <Entity>" navigation: a session can edit several
  // entities (logline, then soggetto…), so each card jumps to ITS entity's real
  // page via the router (the SplitDrawer has no router; this is the way out to a
  // full page).
  const router = useRouter();
  const handleOpenEntity = useCallback(
    (documentType: string) => {
      const route = documentRouteFor(documentType);
      if (!route) return;
      void router.navigate({
        to: `/projects/$id/${route}`,
        params: { id: projectId },
      });
    },
    [router, projectId],
  );
  const openEntityLabelFor = useCallback(
    (documentType: string) => {
      const ref = buildTargetPageRefForDocument(documentType);
      if (!ref) return null;
      return `${t("cesare.openEntity")} ${ref.title}`;
    },
    [t],
  );

  // ── Result cards show only "Apri <Entity>" here (no "Mostra/Nascondi" — no
  //    editor in front of the user; CONTEXT.md). The TopBar ⊟ toggle, instead,
  //    OPENS the read-only split-preview for the MOST RECENT edit in this
  //    session — so the user can peek at what Cesare last changed without leaving
  //    the chat. We publish that opener to the shell; it is null when the session
  //    has no edit yet (→ the ⊟ stays disabled). ────────────────────────────────
  const page = store?.activePage ?? "soggetto";
  const showChangesInSplit = useShowChangesInSplitDrawer();

  const latestEdit = useMemo(() => {
    const thread = store?.messagesFor(confirmedSessionId) ?? [];
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      const m = thread[i];
      if (!m || m.role !== "assistant") continue;
      const meta = extractStepBlockMetadata(m.content);
      const diffs = meta.liveDiffs.filter((d) => d.documentType);
      if (diffs.length > 0) return { content: m.content, diffs };
    }
    return null;
  }, [store, confirmedSessionId]);

  const openLatestSplit = useCallback(() => {
    if (!latestEdit) return;
    const firstDocType = latestEdit.diffs[0]?.documentType;
    const pageRef = firstDocType
      ? buildTargetPageRefForDocument(firstDocType)
      : null;
    if (!pageRef) return;
    showChangesInSplit({
      pageRef,
      liveDiffs: latestEdit.diffs.map((d) => ({
        documentType: d.documentType,
        label: d.label,
        segments: d.segments,
      })),
      title: pageRef.title,
      summary: extractChangeSummary(latestEdit.content),
    });
  }, [latestEdit, showChangesInSplit]);

  useRegisterSplitOpener(latestEdit ? openLatestSplit : null);

  // Per-card "Vedi modifica" — open the read-only split-preview for THAT card's
  // edit (the final document text + bullet summary, no highlight).
  const handleOpenSplit = useCallback(
    (args: {
      liveDiffs: ReadonlyArray<{
        documentType: string;
        label: string;
        segments: ReadonlyArray<{ op: "eq" | "add" | "del"; text: string }>;
      }>;
      summary: string;
    }) => {
      const diffs = args.liveDiffs.filter((d) => d.documentType);
      const firstDocType = diffs[0]?.documentType;
      const pageRef = firstDocType
        ? buildTargetPageRefForDocument(firstDocType)
        : null;
      if (!pageRef) return;
      showChangesInSplit({
        pageRef,
        liveDiffs: diffs.map((d) => ({
          documentType: d.documentType,
          label: d.label,
          segments: d.segments,
        })),
        title: pageRef.title,
        summary: args.summary,
      });
    },
    [showChangesInSplit],
  );

  // The split does NOT auto-open at the end of an elaboration — the user opens it
  // deliberately via "Vedi modifica" on the card or the ⊟ toggle. (Auto-opening
  // was intrusive: it stole focus from the reply the user is reading.)

  if (!isValidParam || sessionQuery.isError) {
    return (
      <div
        className={styles.pageCentered}
        data-testid="cesare-session-not-found"
      >
        <h1 className={styles.title}>{t("cesare.session.notFoundTitle")}</h1>
        <p className={styles.subtitle}>{t("cesare.session.notFoundBody")}</p>
      </div>
    );
  }

  if (sessionQuery.isPending || !session) {
    return (
      <div className={styles.pageCentered} data-testid="cesare-session-loading">
        <Skeleton
          lines={3}
          widths={["60%", "80%", "45%"]}
          tone="agent"
          ariaLabel={t("cesare.session.loadingAria")}
        />
      </div>
    );
  }

  const messages = store?.messagesFor(session.id) ?? [];

  return (
    <div
      className={styles.page}
      data-testid="session-conversation"
      data-session-id={session.id}
    >
      <div
        className={styles.thread}
        ref={threadRef}
        onScroll={handleThreadScroll}
      >
        <div className={styles.threadInner}>
          {/* The header scrolls WITH the thread (not pinned) — it's a one-off
              title at the top of the conversation, not chrome. */}
          <header className={styles.header}>
            <span className={styles.brandGlyph} aria-hidden="true">
              ✦
            </span>
            <div>
              <h1 className={styles.title} data-testid="session-title">
                {session.title}
              </h1>
              <p className={styles.subtitle}>{t("cesare.session.subtitle")}</p>
            </div>
          </header>
          <CesareConversation
            messages={messages}
            page={page}
            testId="session-conversation-thread"
            onOpenEntity={handleOpenEntity}
            openEntityLabelFor={openEntityLabelFor}
            onOpenSplit={handleOpenSplit}
            openSplitLabel={t("cesare.openSplit")}
            emptyState={
              <p className={styles.lede} data-testid="session-empty">
                {t("cesare.session.empty")}
              </p>
            }
          />
        </div>
      </div>

      <div className={styles.composerDock}>
        {!isAtBottom && (
          <button
            type="button"
            className={styles.scrollToBottom}
            onClick={scrollToBottom}
            aria-label={t("cesare.session.scrollToBottom")}
            title={t("cesare.session.scrollToBottom")}
            data-testid="session-scroll-to-bottom"
          >
            ↓
          </button>
        )}
        <SessionComposer
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isThinking={isLoading}
        />
      </div>
    </div>
  );
}

// ─── Composer (full-page) ──────────────────────────────────────────────────

function SessionComposer({
  value,
  onChange,
  onSubmit,
  isThinking,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  isThinking: boolean;
}) {
  const { t } = useTranslation();
  const sendRef = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: onSubmit,
      isDisabled: value.trim().length === 0 || isThinking,
      "aria-label": t("cesare.session.sendMessage"),
    },
    sendRef,
  );

  return (
    <div className={styles.composer} data-testid="session-composer">
      <ComposerTextarea
        className={styles.composerInput}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={t("cesare.session.composerPlaceholder")}
        isDisabled={isThinking}
        ariaLabel={t("cesare.session.composerAria")}
        testId="cesare-composer-input"
      />
      <div className={styles.composerToolbar}>
        <button
          ref={sendRef}
          {...buttonProps}
          type="button"
          className={styles.composerSend}
          data-testid="cesare-send-btn"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
