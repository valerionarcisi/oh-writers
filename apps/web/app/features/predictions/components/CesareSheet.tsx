// apps/web/app/features/predictions/components/CesareSheet.tsx
//
// Spec 44 WP-B — chat owner for the Cesare assistant.
//
// CesareSheet renders the conversation surface (messages + Step Blocks + the
// composer) inside the Notion-class `<CesareDrawer/>` chrome shipped by
// WP-DESIGN. The component owns:
//   - the message list (in-memory; persistence ships incrementally)
//   - the send/receive lifecycle (askCesare → assistant reply → side-channels)
//   - the drawer state machine (closed | peek | expanded | full)
//   - the sessions selector (header dropdown) backed by `useSessions`
//   - the "[Mostra modifiche]" trace flow that opens the SplitDrawer
//
// AppShell hands us `isOpen` / `onClose` / `onOpenFullPage` for back-compat
// with the existing toggle UX (dock pill, CesareProvider). Internally we
// expand that to the 4-state machine via `useDrawerState`.
//
// Anything Cesare-related the parent already does (notifications, push, query
// invalidations) continues to flow through `askCesare` + `onAssistantResponse`.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type React from "react";
import type { ResultShape } from "@oh-writers/utils";
import {
  CesareDrawer,
  CollapsibleNote,
  useDrawerState,
  type CesareDrawerScope,
  type CesareDrawerSession,
  type CesareDrawerContextTag,
  type CesareDrawerState,
  type TargetPageRef,
  type TraceMarker,
} from "@oh-writers/ui";
import { useSplitDrawer } from "~/features/app-shell";
import {
  useSessions,
  useCreateSession,
  type CesareSession,
} from "~/features/predictions/sessions";
import styles from "./CesareSheet.module.css";

/**
 * Cross-component flow (Spec 44): consumers — currently the inline
 * `[Mostra modifiche]` affordance inside a Step Block — invoke the returned
 * function to surface the affected page inside the SplitDrawer with a trace
 * overlay. SplitDrawer + TargetPagePreview wiring lives in AppShell.
 */
export interface TraceForToolRunArgs {
  pageRef: TargetPageRef;
  traceMarkers: ReadonlyArray<TraceMarker>;
  onAccept: (markerId: string) => void;
  onReject: (markerId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  title?: string;
}

export function useShowChangesInSplitDrawer(): (
  args: TraceForToolRunArgs,
) => void {
  const splitDrawer = useSplitDrawer();
  return useCallback(
    (args: TraceForToolRunArgs) => {
      splitDrawer.open({ kind: "trace", ...args });
    },
    [splitDrawer],
  );
}

// ─── Public types preserved for AppShell + Cesare server callers ───────────

export type CesarePage =
  | "soggetto"
  | "synopsis"
  | "outline"
  | "treatment"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "locations";

// ─── Server-side surface ───────────────────────────────────────────────────

export type AskCesareFn = (params: {
  data: {
    projectId: string;
    message: string;
    pageContext: {
      page: CesarePage;
      sceneId: string | null;
      sceneNumber: number | null;
      requirementId?: string | null;
      documentId?: string | null;
      shootingDayId?: string | null;
      shootingDayNumber?: number | null;
    };
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  };
}) => Promise<ResultShape<string, { _tag: string; message: string }>>;

// ─── Marker parsers (kept here so server consumers keep working) ───────────

/**
 * Server appends "<!--ohw:tools=N-->" to the reply so the client can tell
 * whether tools were executed. Returns the integer N (default 0).
 */
export function parseToolsExecuted(content: string): number {
  const m = content.match(/<!--ohw:tools=(\d+)-->/);
  if (!m) return 0;
  return parseInt(m[1]!, 10);
}

/**
 * Side-channel for blocking proposals — the canvas listens to the same DOM
 * event the legacy sheet emitted, so we keep emitting it here.
 */
function parseBlockingProposalMarker(content: string): unknown | null {
  const m = content.match(/<!--ohw:blocking-proposal:([\s\S]*?)-->/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/**
 * Parses the rewrite_scene side-channel marker embedded in the assistant
 * reply. Returns `{ scene_number, new_content }` when present, null otherwise.
 */
export function parseRewriteSceneMarker(
  content: string,
): { scene_number: number; new_content: string } | null {
  const m = content.match(/<!--ohw:rewrite-scene-b64:([A-Za-z0-9+/=]+)-->/);
  if (!m || !m[1]) return null;
  try {
    const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)["scene_number"] === "number" &&
      typeof (parsed as Record<string, unknown>)["new_content"] === "string"
    ) {
      return {
        scene_number: (parsed as Record<string, unknown>)[
          "scene_number"
        ] as number,
        new_content: (parsed as Record<string, unknown>)[
          "new_content"
        ] as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Quick prompts (unchanged from legacy sheet) ───────────────────────────

const PAGE_LABELS: Record<CesarePage, string> = {
  soggetto: "SOGGETTO",
  synopsis: "SINOSSI",
  outline: "SCALETTA",
  treatment: "TRATTAMENTO",
  screenplay: "SCENEGGIATURA",
  breakdown: "BREAKDOWN",
  budget: "BUDGET",
  schedule: "CALENDARIO",
  "shooting-plan": "INQUADRATURE",
  locations: "LOCATION",
};

const QUICK_PROMPTS_INITIAL: Record<CesarePage, string[]> = {
  soggetto: [
    "Il conflitto centrale è chiaro?",
    "Suggerisci un arco del personaggio",
    "Come rendere il finale più forte?",
  ],
  synopsis: [
    "La sinossi è efficace per un produttore?",
    "Riassumi in tre righe",
    "Rendi il tono più commerciale",
  ],
  outline: [
    "C'è squilibrio tra gli atti?",
    "Suggerisci un twist al secondo atto",
    "Compatta le scene ridondanti",
  ],
  treatment: [
    "Il ritmo narrativo funziona?",
    "Suggerisci come migliorare la transizione",
    "Identifica i punti deboli",
  ],
  screenplay: [
    "Questa scena è fattibile domani?",
    "Aiutami a scrivere il dialogo",
    "Come riduco i costi di questa scena?",
  ],
  breakdown: [
    "Cosa costa di più in questa scena?",
    "Suggerisci dove tagliare",
    "Compara con scene simili",
  ],
  budget: [
    "Dove stiamo sforando?",
    "Ottimizza questa categoria",
    "Stima il costo della prossima giornata",
  ],
  schedule: [
    "Ottimizza i giorni di ripresa",
    "Raggruppa per location",
    "Quanti giorni rimangono?",
  ],
  "shooting-plan": [
    "Quanto tempo ci vuole per questa scena?",
    "Raggruppa le inquadrature per setup",
    "Ordine ottimale delle riprese",
  ],
  locations: [
    "Trova candidati per questa location",
    "Quale zona geografica esplorare?",
    "Cosa controllare durante il sopralluogo?",
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

function stripToolCalls(content: string): string {
  return content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<tool_call>[\s\S]*$/g, "")
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
    .replace(/<tool_response>[\s\S]*$/g, "")
    .replace(/<\/tool_response>/g, "")
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "")
    .replace(/<function_calls>[\s\S]*$/g, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/g, "")
    .replace(/<invoke[\s\S]*$/g, "")
    .replace(/<parameter[\s\S]*?<\/parameter>/g, "")
    .replace(
      /<\/?(function_calls|antml:function_calls|invoke|parameter)[^>]*>/g,
      "",
    )
    .replace(/<!--ohw:tools=\d+-->/g, "")
    .replace(/<!--ohw:blocking-proposal:[\s\S]*?-->/g, "")
    .replace(/<!--ohw:rewrite-scene-b64:[A-Za-z0-9+/=]+-->/g, "")
    .trim();
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].startsWith("**"))
      parts.push(<strong key={m.index}>{m[2]}</strong>);
    else parts.push(<em key={m.index}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(content: string): React.ReactNode {
  const clean = stripToolCalls(content);
  if (clean.length === 0) return null;
  const lines = clean.split("\n");
  const nodes: React.ReactNode[] = [];
  let bullets: string[] | null = null;
  let key = 0;
  const flushBullets = () => {
    if (!bullets || bullets.length === 0) {
      bullets = null;
      return;
    }
    nodes.push(
      <ul key={key++} className={styles.mdList}>
        {bullets.map((b, i) => (
          <li key={i} className={styles.mdListItem}>
            {renderInline(b)}
          </li>
        ))}
      </ul>,
    );
    bullets = null;
  };
  for (const raw of lines) {
    const line = raw;
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      if (!bullets) bullets = [];
      bullets.push(bullet[1]!);
      continue;
    }
    flushBullets();
    if (line.trim() === "") {
      nodes.push(<div key={key++} className={styles.mdSpacer} />);
    } else if (/^#+\s+/.test(line)) {
      const text = line.replace(/^#+\s+/, "");
      nodes.push(
        <h4 key={key++} className={styles.mdH3}>
          {renderInline(text)}
        </h4>,
      );
    } else {
      nodes.push(
        <p key={key++} className={styles.mdPara}>
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return nodes;
}

// ─── Step Block parsing ────────────────────────────────────────────────────
//
// Cesare's assistant turn carries an `<!--ohw:tools=N-->` marker when N > 0.
// We render a Step Block via `<CollapsibleNote kind="cesare"/>` with a generic
// timeline + the `[Mostra modifiche] [Annulla]` affordances when a rewrite
// or proposal payload is present.

interface StepBlockMetadata {
  toolCount: number;
  rewrite: { scene_number: number; new_content: string } | null;
  hasProposal: boolean;
}

function extractStepBlockMetadata(content: string): StepBlockMetadata {
  return {
    toolCount: parseToolsExecuted(content),
    rewrite: parseRewriteSceneMarker(content),
    hasProposal: parseBlockingProposalMarker(content) !== null,
  };
}

function StepBlockTimeline({ toolCount }: { toolCount: number }) {
  const steps = Math.max(toolCount, 1);
  return (
    <ol className={styles.stepTimeline} aria-label="Passaggi Cesare">
      {Array.from({ length: steps }, (_, i) => (
        <li key={i} className={styles.stepTimelineItem}>
          <span aria-hidden className={styles.stepCheck}>
            ✓
          </span>
          <span>Passaggio {i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

function StepBlockActions({
  onShowChanges,
  onCancel,
  hasChanges,
}: {
  onShowChanges?: () => void;
  onCancel?: () => void;
  hasChanges: boolean;
}) {
  if (!hasChanges) return null;
  return (
    <div className={styles.stepActions}>
      {onShowChanges && (
        <button
          type="button"
          className={styles.stepActionPrimary}
          onClick={onShowChanges}
        >
          Mostra modifiche
        </button>
      )}
      {onCancel && (
        <button
          type="button"
          className={styles.stepActionSecondary}
          onClick={onCancel}
        >
          Annulla
        </button>
      )}
    </div>
  );
}

// ─── Sessions UI ───────────────────────────────────────────────────────────

const formatRelativeLastAt = (iso: string): string => {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  return `${days}g`;
};

const toDrawerSessions = (
  sessions: ReadonlyArray<CesareSession>,
  activeId: string | null,
): ReadonlyArray<CesareDrawerSession> =>
  sessions.map((s) => ({
    id: s.id,
    title: s.title,
    lastAt: formatRelativeLastAt(s.lastMessageAt),
    isActive: s.id === activeId,
  }));

// ─── Component ─────────────────────────────────────────────────────────────

export interface CesareSheetProps {
  projectId: string;
  page: CesarePage;
  sceneId?: string | null;
  sceneNumber?: number | null;
  requirementId?: string | null;
  documentId?: string | null;
  shootingDayId?: string | null;
  shootingDayNumber?: number | null;
  isOpen: boolean;
  onClose: () => void;
  /** Invoked when the user clicks the drawer's "↗ full" affordance. */
  onOpenFullPage: () => void;
  /** Optional hook so AppShell can sync `body[data-cesare]` with the drawer's
   *  internal 4-state machine. Falls back to direct DOM writes when omitted. */
  onCesareStateChange?: (next: CesareDrawerState) => void;
  /** Server function for chat. Pass null until the server fn is implemented. */
  askCesare?: AskCesareFn | null;
  /** Called after each assistant response — used to invalidate queries. */
  onAssistantResponse?: (reply: string) => void;
}

export function CesareSheet({
  projectId,
  page,
  sceneId,
  sceneNumber,
  requirementId,
  documentId,
  shootingDayId,
  shootingDayNumber,
  isOpen,
  onClose,
  onOpenFullPage,
  onCesareStateChange,
  askCesare = null,
  onAssistantResponse,
}: CesareSheetProps) {
  // ── Drawer state machine ────────────────────────────────────────────────
  const initialDrawerState: CesareDrawerState = isOpen ? "expanded" : "closed";
  const drawer = useDrawerState({
    initialState: initialDrawerState,
    onChange: (next) => {
      onCesareStateChange?.(next);
      if (typeof document !== "undefined") {
        // Collapse `expanded-split` to `expanded` for the body attribute so
        // CSS + tests can keep the 4-state contract `closed | expanded |
        // peek | full` (Spec 44 glossary). The `expanded-split` Notion-`»`
        // mode is internal to the drawer's resize machine.
        const normalised = next === "expanded-split" ? "expanded" : next;
        document.body.setAttribute("data-cesare", normalised);
      }
      if (next === "closed") onClose();
      if (next === "full") onOpenFullPage();
    },
  });

  // Sync external `isOpen` prop into the state machine. AppShell flips the
  // prop when the user clicks the dock pill (Cesare closed → opened) or when
  // a CesareProvider consumer requests opening the assistant for a specific
  // requirement.
  useEffect(() => {
    if (isOpen && drawer.state === "closed") {
      drawer.open("expanded");
    } else if (!isOpen && drawer.state !== "closed") {
      drawer.close();
    }
    // We intentionally depend on `isOpen` only — drawer.* identities change
    // each render and would cause feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ── Sessions ────────────────────────────────────────────────────────────
  const sessionsQuery = useSessions(projectId);
  const createSession = useCreateSession(projectId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Once sessions load and we don't have an active one, default to the first.
  useEffect(() => {
    if (!sessionsQuery.data || activeSessionId) return;
    const first = sessionsQuery.data[0];
    if (first) setActiveSessionId(first.id);
  }, [sessionsQuery.data, activeSessionId]);

  // Switching the active session resets the in-memory chat so the user sees
  // a clean slate. Persisted-history hydration is a follow-up.
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      setActiveSessionId(sessionId);
      setMessages([]);
      setInput("");
    },
    [activeSessionId],
  );

  const handleSessionNew = useCallback(async () => {
    const result = await createSession.mutateAsync(undefined);
    setActiveSessionId(result.id);
    setMessages([]);
    setInput("");
  }, [createSession]);

  const drawerSessions = useMemo(
    () => toDrawerSessions(sessionsQuery.data ?? [], activeSessionId),
    [sessionsQuery.data, activeSessionId],
  );

  // ── Sessions popover (simple absolutely-positioned dropdown) ────────────
  const [isSessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const handleSessionSelectorClick = useCallback(() => {
    setSessionPopoverOpen((v) => !v);
  }, []);
  const handleSessionPick = useCallback(
    (id: string) => {
      handleSessionSelect(id);
      setSessionPopoverOpen(false);
    },
    [handleSessionSelect],
  );
  const handleNewSessionClick = useCallback(async () => {
    await handleSessionNew();
    setSessionPopoverOpen(false);
  }, [handleSessionNew]);

  // ── Context tag derived from the active page ────────────────────────────
  const contextTags = useMemo<ReadonlyArray<CesareDrawerContextTag>>(
    () => [
      {
        id: "page-scope",
        label:
          sceneNumber != null
            ? `${PAGE_LABELS[page]} · SC.${sceneNumber}`
            : PAGE_LABELS[page],
      },
    ],
    [page, sceneNumber],
  );

  // ── Send pipeline ───────────────────────────────────────────────────────
  const showChangesInSplit = useShowChangesInSplitDrawer();

  const handleShowChangesForRewrite = useCallback(
    (rewrite: { scene_number: number; new_content: string }) => {
      // The actual trace markers come from the editor's proposal store; for
      // now we ship a minimal payload that opens the SplitDrawer with the
      // screenplay page. WP-D / future iterations can enrich `traceMarkers`.
      showChangesInSplit({
        pageRef: {
          kind: "screenplay",
          scope: `Sc. ${rewrite.scene_number}`,
        } as TargetPageRef,
        traceMarkers: [],
        onAccept: () => undefined,
        onReject: () => undefined,
        onAcceptAll: () => undefined,
        onRejectAll: () => undefined,
        title: `Sceneggiatura · Sc.${rewrite.scene_number}`,
      });
    },
    [showChangesInSplit],
  );

  const handleCancelRewrite = useCallback(
    (rewrite: { scene_number: number; new_content: string }) => {
      // Emit a DOM event the editor's proposal store listens for. This keeps
      // the cancel path symmetrical with the existing "accept" affordance.
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("ohw:cesare:cancel-rewrite", {
          detail: { sceneNumber: rewrite.scene_number },
        }),
      );
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;
      const userMessage: Message = { role: "user", content: trimmed };

      setMessages((prev) => {
        const next = [...prev, userMessage];
        const historyForCall = prev;
        const dispatchAndRender = async () => {
          if (!askCesare) {
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content:
                  "Cesare non è ancora disponibile su questa sezione. Tornerà presto.",
              },
            ]);
            return;
          }
          const shape = await askCesare({
            data: {
              projectId,
              message: trimmed,
              pageContext: {
                page,
                sceneId: sceneId ?? null,
                sceneNumber: sceneNumber ?? null,
                requirementId: requirementId ?? null,
                documentId: documentId ?? null,
                shootingDayId: shootingDayId ?? null,
                shootingDayNumber: shootingDayNumber ?? null,
              },
              conversationHistory: historyForCall,
            },
          });
          const content = shape.isOk
            ? shape.value
            : "Mi dispiace, si è verificato un errore. Riprova.";
          setMessages((m) => [...m, { role: "assistant", content }]);
          onAssistantResponse?.(content);

          if (typeof window !== "undefined") {
            const proposal = parseBlockingProposalMarker(content);
            if (proposal) {
              window.dispatchEvent(
                new CustomEvent("ohw:cesare:blocking-proposal", {
                  detail: proposal,
                }),
              );
            }
            const rewrite = parseRewriteSceneMarker(content);
            if (rewrite) {
              try {
                window.sessionStorage.setItem(
                  "ohw:cesare:pending-rewrite",
                  JSON.stringify({
                    ...rewrite,
                    projectId,
                    ts: Date.now(),
                  }),
                );
              } catch {
                // sessionStorage may be unavailable (private mode, iframe).
              }
              window.dispatchEvent(
                new CustomEvent("ohw:cesare:rewrite-scene", {
                  detail: rewrite,
                }),
              );
              if (page === "screenplay") {
                drawer.peek();
              }
            }
          }
        };
        void dispatchAndRender().finally(() => setIsLoading(false));
        return next;
      });

      setInput("");
      setIsLoading(true);
    },
    [
      askCesare,
      drawer,
      isLoading,
      onAssistantResponse,
      projectId,
      page,
      sceneId,
      sceneNumber,
      requirementId,
      documentId,
      shootingDayId,
      shootingDayNumber,
    ],
  );

  const handleSubmit = useCallback(() => {
    void sendMessage(input);
  }, [input, sendMessage]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      void sendMessage(prompt);
    },
    [sendMessage],
  );

  // ── Scopes shown above the composer ─────────────────────────────────────
  const scopes = useMemo<ReadonlyArray<CesareDrawerScope>>(
    () => [
      {
        id: "page",
        icon: "📎",
        label: PAGE_LABELS[page],
      },
      ...(sceneNumber != null
        ? [
            {
              id: "scene",
              icon: "🎬",
              label: `Scena ${sceneNumber}`,
            } satisfies CesareDrawerScope,
          ]
        : []),
    ],
    [page, sceneNumber],
  );

  // ── Body composition ────────────────────────────────────────────────────
  const conversationBody: ReactNode = (
    <div className={styles.conversation} data-testid="cesare-conversation">
      {messages.length === 0 && !isLoading && <EmptyState page={page} />}
      {messages.map((m, i) => (
        <MessageView
          key={`msg-${i}-${m.role}`}
          message={m}
          onShowChangesForRewrite={handleShowChangesForRewrite}
          onCancelRewrite={handleCancelRewrite}
        />
      ))}
      {isLoading && <LoadingIndicator />}
      {!isLoading && messages.length === 0 && (
        <QuickPrompts page={page} onSelect={handleQuickPrompt} />
      )}
    </div>
  );

  // Spec 44 defines 4 visible states (closed/peek/expanded/full). The
  // underlying CesareDrawer machine adds `expanded-split` for the Notion-`»`
  // SplitDrawer interplay; we hide it from the user-facing cycle so the
  // visible "Espandi" affordance walks closed→expanded→full→expanded in one
  // click each. Step-back handles the symmetric path.
  const handleCycle = useCallback(() => {
    if (drawer.state === "expanded") {
      drawer.setState("full");
      return;
    }
    if (drawer.state === "expanded-split") {
      drawer.setState("full");
      return;
    }
    drawer.cycle();
  }, [drawer]);

  const handleStepBack = useCallback(() => {
    if (drawer.state === "full") {
      drawer.setState("expanded");
      return;
    }
    drawer.stepBack();
  }, [drawer]);

  return (
    <CesareDrawer
      state={drawer.state}
      onStateChange={drawer.setState}
      onCycle={handleCycle}
      onStepBack={handleStepBack}
      onPeek={drawer.peek}
      onClose={drawer.close}
      sessions={drawerSessions}
      activeSessionId={activeSessionId ?? undefined}
      onSessionSelectorClick={handleSessionSelectorClick}
      contextTags={contextTags}
      scopes={scopes}
      composer={{
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
        isThinking: isLoading,
      }}
      peekSubtitle={isLoading ? "sta pensando…" : "in attesa"}
    >
      {conversationBody}
      {isSessionPopoverOpen && (
        <SessionsPopover
          sessions={sessionsQuery.data ?? []}
          activeSessionId={activeSessionId}
          onPick={handleSessionPick}
          onNew={handleNewSessionClick}
          onClose={() => setSessionPopoverOpen(false)}
        />
      )}
    </CesareDrawer>
  );
}

// ─── Internal building blocks ──────────────────────────────────────────────

function MessageView({
  message,
  onShowChangesForRewrite,
  onCancelRewrite,
}: {
  message: Message;
  onShowChangesForRewrite: (rewrite: {
    scene_number: number;
    new_content: string;
  }) => void;
  onCancelRewrite: (rewrite: {
    scene_number: number;
    new_content: string;
  }) => void;
}) {
  if (message.role === "user") {
    return (
      <div className={styles.bubbleUser}>
        <p className={styles.bubbleText}>{message.content}</p>
      </div>
    );
  }
  const metadata = extractStepBlockMetadata(message.content);
  const rendered = renderMarkdown(message.content);
  const hasStepBlock = metadata.toolCount > 0;

  if (!hasStepBlock) {
    return (
      <div className={styles.bubbleAssistant}>
        <div className={styles.bubbleMarkdown}>{rendered}</div>
      </div>
    );
  }

  const rewrite = metadata.rewrite;
  const hasChanges = rewrite != null || metadata.hasProposal;
  const stepCount = metadata.toolCount;
  const stepLabel = stepCount === 1 ? "1 passaggio" : `${stepCount} passaggi`;

  return (
    <div className={styles.assistantWithSteps}>
      {rendered && <div className={styles.bubbleMarkdown}>{rendered}</div>}
      <CollapsibleNote
        kind="cesare"
        eyebrow="Cesare"
        title={stepLabel}
        body={<StepBlockTimeline toolCount={stepCount} />}
        actions={
          <StepBlockActions
            hasChanges={hasChanges}
            onShowChanges={
              rewrite ? () => onShowChangesForRewrite(rewrite) : undefined
            }
            onCancel={rewrite ? () => onCancelRewrite(rewrite) : undefined}
          />
        }
        defaultOpen={hasChanges}
      />
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div
      className={styles.bubbleAssistant}
      aria-busy="true"
      aria-label="Cesare sta rispondendo"
    >
      <div className={styles.skeletonBody}>
        <span
          className={[styles.skeletonLine, styles.skeletonLong].join(" ")}
        />
        <span
          className={[styles.skeletonLine, styles.skeletonMedium].join(" ")}
        />
        <span
          className={[styles.skeletonLine, styles.skeletonShort].join(" ")}
        />
      </div>
    </div>
  );
}

function EmptyState({ page }: { page: CesarePage }) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>
        Chiedimi qualunque cosa su {PAGE_LABELS[page]}.
      </p>
    </div>
  );
}

function QuickPrompts({
  page,
  onSelect,
}: {
  page: CesarePage;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className={styles.quickPrompts} aria-label="Suggerimenti rapidi">
      {QUICK_PROMPTS_INITIAL[page].map((prompt) => (
        <button
          key={prompt}
          type="button"
          className={styles.quickPromptBtn}
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function SessionsPopover({
  sessions,
  activeSessionId,
  onPick,
  onNew,
  onClose,
}: {
  sessions: ReadonlyArray<CesareSession>;
  activeSessionId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={styles.sessionsPopover}
      role="dialog"
      aria-label="Sessioni Cesare"
      data-testid="cesare-sessions-popover"
    >
      <ul className={styles.sessionsList} role="listbox">
        {sessions.length === 0 && (
          <li className={styles.sessionsEmpty}>Nessuna sessione</li>
        )}
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={s.id === activeSessionId}
              className={[
                styles.sessionRow,
                s.id === activeSessionId ? styles.sessionRowActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPick(s.id)}
            >
              <span className={styles.sessionRowTitle}>{s.title}</span>
              <span className={styles.sessionRowMeta}>
                {formatRelativeLastAt(s.lastMessageAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.sessionNewBtn} onClick={onNew}>
        + Nuova sessione
      </button>
    </div>
  );
}
