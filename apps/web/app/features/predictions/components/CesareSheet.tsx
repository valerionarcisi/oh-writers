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
  ChangeTrace,
  useDrawerState,
  type ChangeUpdate,
  type CesareDrawerScope,
  type CesareDrawerSession,
  type CesareDrawerContextTag,
  type CesareDrawerDockIcons,
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
import { useCesareChat } from "../use-cesare-chat";
import type { ChatMessage, TraceStep } from "../use-cesare-chat-reducer";
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
 * Side-channel for document-gen tools. The server applies the generated
 * content LIVE to the open document (Spec 44 canonical pattern) and embeds this
 * marker carrying the version that was active before the apply, so the client
 * can offer "↩ Annulla" (revert to the previous version). Returns null when the
 * marker is absent or malformed.
 */
export interface DocAppliedMarker {
  readonly documentType: string;
  readonly versionId: string;
  readonly previousVersionId: string | null;
}

export function parseDocAppliedMarker(
  content: string,
): DocAppliedMarker | null {
  const m = content.match(/<!--ohw:doc-applied:([\s\S]*?)-->/);
  if (!m || !m[1]) return null;
  try {
    const parsed = JSON.parse(m[1]) as Record<string, unknown>;
    if (typeof parsed["version_id"] !== "string") return null;
    const previous = parsed["previous_version_id"];
    return {
      documentType: String(parsed["document_type"] ?? ""),
      versionId: parsed["version_id"],
      previousVersionId: typeof previous === "string" ? previous : null,
    };
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
    .replace(/<!--ohw:doc-applied:[\s\S]*?-->/g, "")
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

// ─── Step Block / ChangeTrace parsing ─────────────────────────────────────
//
// Cesare's assistant turn carries an `<!--ohw:tools=N-->` marker when N > 0.
// When N > 0 we render a `<ChangeTrace/>` (Notion-style step block) that
// summarises the run in the assistant message. Tool-call details and write
// markers (rewrite-scene, blocking-proposal) drive the affected-entity list
// and the `[Mostra modifiche]` affordance.

interface StepBlockMetadata {
  toolCount: number;
  rewrite: { scene_number: number; new_content: string } | null;
  hasProposal: boolean;
  docApplied: DocAppliedMarker | null;
}

function extractStepBlockMetadata(content: string): StepBlockMetadata {
  return {
    toolCount: parseToolsExecuted(content),
    rewrite: parseRewriteSceneMarker(content),
    hasProposal: parseBlockingProposalMarker(content) !== null,
    docApplied: parseDocAppliedMarker(content),
  };
}

// Page → ChangeTrace update kind. The kind drives the icon glyph and the
// "Updated X" wording in the summary title.
const PAGE_TO_UPDATE_KIND: Record<CesarePage, ChangeUpdate["kind"]> = {
  soggetto: "doc",
  synopsis: "doc",
  outline: "doc",
  treatment: "doc",
  screenplay: "scene",
  breakdown: "breakdown",
  budget: "budget",
  schedule: "schedule",
  "shooting-plan": "scene",
  locations: "location",
};

// Page → "Updated X" label used in the ChangeTrace summary header.
const PAGE_TO_UPDATED_LABEL: Record<CesarePage, string> = {
  soggetto: "Aggiornato Soggetto",
  synopsis: "Aggiornata Sinossi",
  outline: "Aggiornata Scaletta",
  treatment: "Aggiornato Trattamento",
  screenplay: "Aggiornata Sceneggiatura",
  breakdown: "Aggiornato Breakdown",
  budget: "Aggiornato Budget",
  schedule: "Aggiornato Calendario",
  "shooting-plan": "Aggiornato Piano Inquadrature",
  locations: "Aggiornate Location",
};

export interface ParsedToolUpdates {
  /** Headline title for the ChangeTrace card. */
  readonly title: string;
  /** Affected entities surfaced in the step block. */
  readonly updates: ReadonlyArray<ChangeUpdate>;
  /** Per-step "Thought" / "Updated …" entries shown when the steps are expanded. */
  readonly thoughts: ReadonlyArray<string>;
}

/**
 * Derive a ChangeTrace summary from the assistant reply + the page the user
 * is on. The function is deliberately heuristic: the LLM reply uses Italian
 * action verbs (`riscritto`, `aggiunto`, `spostato`…); we map those onto
 * concrete `Updated X` labels per page. When a rewrite-scene marker is
 * embedded we surface the specific scene; otherwise we fall back to the page.
 */
export function parseToolUpdates(
  content: string,
  page: CesarePage,
): ParsedToolUpdates {
  const meta = extractStepBlockMetadata(content);
  const lc = content.toLowerCase();
  const kind = PAGE_TO_UPDATE_KIND[page];
  const baseLabel = PAGE_TO_UPDATED_LABEL[page];

  const updates: ChangeUpdate[] = [];

  // Single-scene rewrite: surface the affected scene number.
  if (meta.rewrite) {
    updates.push({
      id: `scene-${meta.rewrite.scene_number}`,
      kind: "scene",
      label: `Sc.${meta.rewrite.scene_number} riscritta`,
    });
  }

  // Otherwise extract a count hint from the reply itself ("3 scene rinominate",
  // "5 oggetti", "4 voci", "2 candidati"). These cover the wording the tool
  // loops generate after a write.
  const COUNT_PATTERNS: ReadonlyArray<{ re: RegExp; suffix: string }> = [
    { re: /(\d+)\s+scene\s+rinominat/i, suffix: "scene rinominate" },
    { re: /(\d+)\s+scene\s+aggiornat/i, suffix: "scene aggiornate" },
    { re: /(\d+)\s+oggett/i, suffix: "oggetti" },
    { re: /(\d+)\s+voc/i, suffix: "voci" },
    { re: /(\d+)\s+righ/i, suffix: "righe" },
    { re: /(\d+)\s+candidat/i, suffix: "candidati" },
    { re: /(\d+)\s+strip/i, suffix: "strip spostate" },
    { re: /(\d+)\s+shot/i, suffix: "shot" },
  ];
  let countSuffix: string | null = null;
  for (const { re, suffix } of COUNT_PATTERNS) {
    const m = content.match(re);
    if (m) {
      countSuffix = `${m[1]} ${suffix}`;
      if (updates.length === 0) {
        updates.push({
          id: `${page}-batch`,
          kind,
          label: countSuffix,
        });
      }
      break;
    }
  }

  // Fallback: when we cannot recover a specific entity, still surface the
  // page itself so the user sees that "something" changed on that page.
  if (updates.length === 0) {
    const pageLabel = PAGE_LABELS[page];
    updates.push({
      id: `${page}-page`,
      kind,
      label: pageLabel.toLowerCase(),
    });
  }

  // Compose the title. When we recovered a count, append it as the rationale.
  const titleSuffix = countSuffix
    ? ` · ${countSuffix}`
    : meta.rewrite
      ? ` · Sc.${meta.rewrite.scene_number}`
      : "";
  const title = `${baseLabel}${titleSuffix}`;

  // Thoughts: derive simple phases from the action verbs present in the reply.
  const thoughts: string[] = [];
  if (lc.includes("leggo") || lc.includes("letto") || lc.includes("lettura")) {
    thoughts.push("Lettura contesto");
  }
  if (lc.includes("analiz")) thoughts.push("Analisi");
  if (
    lc.includes("genero") ||
    lc.includes("generato") ||
    lc.includes("propost") ||
    lc.includes("scritto") ||
    lc.includes("riscritto") ||
    lc.includes("aggiunto") ||
    lc.includes("aggiornato")
  ) {
    thoughts.push("Esecuzione");
  }

  return { title, updates, thoughts };
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
  /** Spec 44 — bell / avatar / gear icons migrated from the BottomDock when
   *  Cesare state ≠ closed. AppShell supplies the same handlers it gives to
   *  the BottomDock so the user keeps a single command surface visible. */
  dockIcons?: CesareDrawerDockIcons;
  /** Rendering surface (Spec 46 ?peek=, Spec 47 A4). `"floating"` is the
   *  bottom-right sub-window; `"split"` flows the chat inside the shell's
   *  page-collapsing peek column. The shell renders exactly one instance —
   *  never both — so there is a single chat container. */
  surface?: "floating" | "split";
  /** "Open as split column" affordance — shown only on the floating surface. */
  onOpenAsSplit?: () => void;
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
  dockIcons,
  surface = "floating",
  onOpenAsSplit,
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
  // Spec 47a: the chat lifecycle (optimistic bubbles, per-session threads,
  // delivery status, streamed live trace) is owned by `useCesareChat`. The
  // composer value stays local because it is purely a controlled-input concern.
  const [input, setInput] = useState("");

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

  // ── Assistant-reply side channels ────────────────────────────────────────
  // The final reply still carries the legacy `<!--ohw:…-->` markers (Spec 47a
  // keeps them in `done.result`). After the turn lands we dispatch the same DOM
  // events the legacy sheet emitted so the editor's blocking/rewrite stores and
  // AppShell's notification/invalidation flow keep working unchanged.
  const handleAssistantSideChannels = useCallback(
    (content: string) => {
      onAssistantResponse?.(content);
      if (typeof window === "undefined") return;

      const proposal = parseBlockingProposalMarker(content);
      if (proposal) {
        window.dispatchEvent(
          new CustomEvent("ohw:cesare:blocking-proposal", { detail: proposal }),
        );
      }

      const rewrite = parseRewriteSceneMarker(content);
      if (rewrite) {
        try {
          window.sessionStorage.setItem(
            "ohw:cesare:pending-rewrite",
            JSON.stringify({ ...rewrite, projectId, ts: Date.now() }),
          );
        } catch {
          // sessionStorage may be unavailable (private mode, iframe).
        }
        window.dispatchEvent(
          new CustomEvent("ohw:cesare:rewrite-scene", { detail: rewrite }),
        );
        if (page === "screenplay") drawer.peek();
      }
    },
    [onAssistantResponse, projectId, page, drawer],
  );

  // ── Send pipeline (stream-first, askCesare fallback) ─────────────────────
  const chat = useCesareChat({
    activeSessionId,
    askCesare,
    pageContext: {
      projectId,
      page,
      sceneId: sceneId ?? null,
      sceneNumber: sceneNumber ?? null,
      requirementId: requirementId ?? null,
      documentId: documentId ?? null,
      shootingDayId: shootingDayId ?? null,
      shootingDayNumber: shootingDayNumber ?? null,
    },
    onAssistantResponse: handleAssistantSideChannels,
  });
  const messages = chat.messages;
  const isLoading = chat.isLoading;

  // Switching the active session keeps each thread intact (A1): a swap can
  // never wipe a just-sent bubble — it only changes which thread is visible.
  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      setActiveSessionId(sessionId);
      chat.selectSession(sessionId);
      setInput("");
    },
    [activeSessionId, chat],
  );

  const handleSessionNew = useCallback(async () => {
    const result = await createSession.mutateAsync(undefined);
    setActiveSessionId(result.id);
    chat.selectSession(result.id);
    setInput("");
  }, [createSession, chat]);

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

  const handleUndoDocApply = useCallback((marker: DocAppliedMarker) => {
    // Cesare applied the generated content live to the open document. Reverting
    // means switching the document's active version back to the one that was
    // current before the apply. AppShell owns the server call + query
    // invalidation so the editor refreshes; we keep the chat decoupled from the
    // documents feature by emitting a DOM event (symmetric with cancel-rewrite).
    if (typeof window === "undefined") return;
    if (!marker.previousVersionId) return;
    window.dispatchEvent(
      new CustomEvent("ohw:cesare:undo-doc-apply", {
        detail: {
          documentType: marker.documentType,
          previousVersionId: marker.previousVersionId,
        },
      }),
    );
  }, []);

  // Live-doc inline diff toggle (Spec 44, canonical Notion model). Cesare edits
  // already landed on the open document; "Mostra modifiche" reveals a highlight
  // overlay on the live page (no detached drawer, no separate render), and
  // "Nascondi modifiche" removes it. The shell reads body[data-cesare-diff] to
  // paint the highlight on <main>; consumers that want a finer-grained marker
  // can listen for the broadcast event.
  const handleToggleLiveDiff = useCallback((showing: boolean) => {
    if (typeof document === "undefined") return;
    if (showing) {
      document.body.setAttribute("data-cesare-diff", "on");
    } else {
      document.body.removeAttribute("data-cesare-diff");
    }
    window.dispatchEvent(
      new CustomEvent("ohw:cesare:live-diff", {
        detail: { showing },
      }),
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (isLoading) return;
    const text = input;
    setInput("");
    void chat.send(text);
  }, [input, isLoading, chat]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      void chat.send(prompt);
    },
    [chat],
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
      {messages.length === 0 && <EmptyState page={page} />}
      {messages.map((m) => (
        <MessageView
          key={m.id}
          message={m}
          page={page}
          onShowChangesForRewrite={handleShowChangesForRewrite}
          onCancelRewrite={handleCancelRewrite}
          onToggleLiveDiff={handleToggleLiveDiff}
          onUndoDocApply={handleUndoDocApply}
        />
      ))}
      {messages.length === 0 && (
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
      surface={surface}
      onOpenAsSplit={onOpenAsSplit}
      sessions={drawerSessions}
      activeSessionId={activeSessionId ?? undefined}
      onSessionSelectorClick={handleSessionSelectorClick}
      contextTags={contextTags}
      dockIcons={dockIcons}
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
  page,
  onShowChangesForRewrite,
  onCancelRewrite,
  onToggleLiveDiff,
  onUndoDocApply,
}: {
  message: ChatMessage;
  page: CesarePage;
  onShowChangesForRewrite: (rewrite: {
    scene_number: number;
    new_content: string;
  }) => void;
  onCancelRewrite: (rewrite: {
    scene_number: number;
    new_content: string;
  }) => void;
  onToggleLiveDiff: (showing: boolean) => void;
  onUndoDocApply: (marker: DocAppliedMarker) => void;
}) {
  // Per-message control of the diff toggle so the button label and the live
  // highlight on the open document stay in lockstep. Each trace card owns its
  // own showing flag; toggling drives body[data-cesare-diff] via the parent.
  const [isShowingDiff, setShowingDiff] = useState(false);

  const handleShowChanges = useCallback(() => {
    setShowingDiff(true);
    onToggleLiveDiff(true);
  }, [onToggleLiveDiff]);

  const handleHideChanges = useCallback(() => {
    setShowingDiff(false);
    onToggleLiveDiff(false);
  }, [onToggleLiveDiff]);

  if (message.role === "user") {
    // A1: the bubble carries a delivery status. `pending` shows a spinner dot,
    // `failed` tints the bubble + surfaces the failure (retry lives in the
    // failed assistant text). `delivered` shows nothing extra.
    return (
      <div
        className={[
          styles.bubbleUser,
          message.status === "failed" ? styles.bubbleUserFailed : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="cesare-user-bubble"
        data-status={message.status}
      >
        <p className={styles.bubbleText}>{message.content}</p>
        {message.status === "pending" && (
          <span
            className={styles.bubbleStatusDot}
            aria-label="Invio in corso"
            data-testid="cesare-bubble-pending"
          />
        )}
        {message.status === "failed" && (
          <span className={styles.bubbleStatusFailed}>Invio non riuscito</span>
        )}
      </div>
    );
  }

  // Assistant turn still in flight (A2): render the live trace from the streamed
  // step events while the reply is empty + pending.
  if (message.status === "pending") {
    return message.trace.length > 0 ? (
      <LiveTrace steps={message.trace} />
    ) : (
      <LoadingIndicator />
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
  const docApplied = metadata.docApplied;
  const hasChanges = rewrite != null || metadata.hasProposal;
  const parsed = parseToolUpdates(message.content, page);
  // Undo priority: a live document apply (Spec 44 canonical pattern) takes
  // precedence — it reverts the open document to its previous version. Falls
  // back to the single-scene rewrite cancel.
  const undoHandler =
    docApplied && docApplied.previousVersionId
      ? () => onUndoDocApply(docApplied)
      : rewrite && hasChanges
        ? () => onCancelRewrite(rewrite)
        : undefined;

  return (
    <div className={styles.assistantWithSteps}>
      {rendered && <div className={styles.bubbleMarkdown}>{rendered}</div>}
      <ChangeTrace
        title={parsed.title}
        stepCount={metadata.toolCount}
        thoughts={parsed.thoughts}
        updates={parsed.updates}
        isShowingChanges={isShowingDiff}
        onShowChanges={() => {
          // Always reveal the live diff highlight on the open document; when a
          // single-scene rewrite is present, also surface the scene preview.
          handleShowChanges();
          if (rewrite) onShowChangesForRewrite(rewrite);
        }}
        onHideChanges={handleHideChanges}
        onUndo={undoHandler}
        defaultStepsOpen={false}
        testId="cesare-change-trace"
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

// ─── Live trace (A2) ─────────────────────────────────────────────────────────
// Renders the streamed step events as the inline Step Block while the assistant
// turn is in flight. Each step shows a verb + entity ("sta leggendo
// Sceneggiatura", "sta scrivendo Soggetto"); the latest step is mirrored into an
// aria-live region so screen readers and E2E observe progress in real time.

const TRACE_VERB: Record<TraceStep["kind"], string> = {
  reasoning: "Sto ragionando",
  reading: "Sto leggendo",
  writing: "Sto scrivendo",
  tool: "Eseguo",
};

function LiveTrace({ steps }: { steps: ReadonlyArray<TraceStep> }) {
  const last = steps[steps.length - 1];
  const liveLabel = last
    ? `Cesare ${TRACE_VERB[last.kind].toLowerCase()}${
        last.entity ? ` ${last.entity.label}` : ""
      }`
    : "Cesare sta lavorando";
  return (
    <div
      className={styles.liveTrace}
      data-testid="cesare-live-trace"
      aria-busy="true"
    >
      <ul className={styles.liveTraceList}>
        {steps.map((step, i) => (
          <li
            key={`${step.kind}-${i}-${step.text}`}
            className={styles.liveTraceStep}
            data-step-kind={step.kind}
            data-entity-domain={step.entity?.domain ?? ""}
          >
            <span className={styles.liveTraceVerb}>
              {TRACE_VERB[step.kind]}
            </span>
            {step.kind === "reasoning" ? (
              <span className={styles.liveTraceText}>{step.text}</span>
            ) : (
              <span className={styles.liveTraceEntity}>
                {step.entity ? step.entity.label : step.text}
              </span>
            )}
          </li>
        ))}
      </ul>
      <span
        className={styles.liveTraceStatus}
        role="status"
        aria-live="polite"
        data-testid="cesare-live-status"
      >
        {liveLabel}…
      </span>
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
