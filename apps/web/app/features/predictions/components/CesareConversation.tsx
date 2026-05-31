// apps/web/app/features/predictions/components/CesareConversation.tsx
//
// Spec 47b FIX 2 — the conversation rendering extracted from `CesareSheet` so
// BOTH surfaces share one renderer (no fork):
//   - the floating `CesareDrawer` body, and
//   - the full-page session route (`/sessions/:sessionId`).
//
// It owns ONLY presentation: the user/assistant bubble list, the streamed live
// trace while a turn is in flight, and the `ChangeTrace` step block (with
// Mostra/Nascondi modifiche + Annulla) when an agentic edit happened. All state
// (threads, send pipeline) lives in the shared `CesareChatStoreProvider`.
import { useState, type ReactNode } from "react";
import type React from "react";
import {
  ChangeTrace,
  type ChangeUpdate,
  type TraceMarker,
} from "@oh-writers/ui";
import type { ChatMessage, TraceStep } from "../use-cesare-chat-reducer";
import styles from "./CesareSheet.module.css";

// ─── Cesare page model (shared with CesareSheet's server callers) ──────────

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

export const PAGE_LABELS: Record<CesarePage, string> = {
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

// ─── Marker parsers (kept here so server consumers keep working) ───────────

export function parseToolsExecuted(content: string): number {
  const m = content.match(/<!--ohw:tools=(\d+)-->/);
  if (!m) return 0;
  return parseInt(m[1]!, 10);
}

function parseBlockingProposalMarker(content: string): unknown | null {
  const m = content.match(/<!--ohw:blocking-proposal:([\s\S]*?)-->/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** Public alias so the floating sheet can re-emit the blocking-proposal DOM
 *  event from the assistant reply side-channel. */
export const parseBlockingProposalMarkerForSideChannel = (
  content: string,
): unknown | null => parseBlockingProposalMarker(content);

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

/**
 * Parses the word-level live diff side-channel markers (Spec 47d). The server
 * precomputes the word-diff segments — already stripped of HTML block markup —
 * when it applies a document edit, and emits ONE marker per touched document
 * carrying that document's type. The client paints them as the inline coloured
 * word highlight inside each document's prose (keyed by `documentType`), not an
 * overlay panel. Returns `null`/`[]` when no marker is present or malformed.
 */
export interface LiveDiffMarker {
  /** The document the highlight belongs to (e.g. "soggetto"). Empty for legacy
   *  single-doc markers that predate per-document keying. */
  readonly documentType: string;
  readonly label: string;
  readonly segments: ReadonlyArray<{
    readonly op: "eq" | "add" | "del";
    readonly text: string;
  }>;
}

function decodeLiveDiffPayload(b64: string): LiveDiffMarker | null {
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>)["segments"])
    ) {
      return null;
    }
    const raw = parsed as {
      documentType?: unknown;
      label?: unknown;
      segments: unknown[];
    };
    const segments = raw.segments
      .filter(
        (s): s is { op: string; text: string } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>)["op"] === "string" &&
          typeof (s as Record<string, unknown>)["text"] === "string",
      )
      .filter((s) => s.op === "eq" || s.op === "add" || s.op === "del")
      .map((s) => ({ op: s.op as "eq" | "add" | "del", text: s.text }));
    if (segments.length === 0) return null;
    return {
      documentType:
        typeof raw.documentType === "string" ? raw.documentType : "",
      label: typeof raw.label === "string" ? raw.label : "",
      segments,
    };
  } catch {
    return null;
  }
}

/**
 * All live-diff markers in the assistant turn, one per touched document. A
 * cross-entity edit (soggetto + sinossi + …) yields several entries, each keyed
 * by its `documentType` so the shell can arm a highlight for every doc.
 */
export function parseLiveDiffMarkers(content: string): LiveDiffMarker[] {
  const pattern = /<!--ohw:live-diff-b64:([A-Za-z0-9+/=]+)-->/g;
  const markers: LiveDiffMarker[] = [];
  for (const m of content.matchAll(pattern)) {
    if (!m[1]) continue;
    const decoded = decodeLiveDiffPayload(m[1]);
    if (decoded) markers.push(decoded);
  }
  return markers;
}

/** First live-diff marker (back-compat for single-doc callers/tests). */
export function parseLiveDiffMarker(content: string): LiveDiffMarker | null {
  return parseLiveDiffMarkers(content)[0] ?? null;
}

// ─── Markdown rendering ─────────────────────────────────────────────────────

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
    .replace(/<!--ohw:live-diff-b64:[A-Za-z0-9+/=]+-->/g, "")
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

export interface StepBlockMetadata {
  toolCount: number;
  rewrite: { scene_number: number; new_content: string } | null;
  hasProposal: boolean;
  docApplied: DocAppliedMarker | null;
  /** One live-diff per touched document (Spec 47d). Empty when none applied. */
  liveDiffs: ReadonlyArray<LiveDiffMarker>;
}

export function extractStepBlockMetadata(content: string): StepBlockMetadata {
  return {
    toolCount: parseToolsExecuted(content),
    rewrite: parseRewriteSceneMarker(content),
    hasProposal: parseBlockingProposalMarker(content) !== null,
    docApplied: parseDocAppliedMarker(content),
    liveDiffs: parseLiveDiffMarkers(content),
  };
}

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
  readonly title: string;
  readonly updates: ReadonlyArray<ChangeUpdate>;
  readonly thoughts: ReadonlyArray<string>;
}

export function parseToolUpdates(
  content: string,
  page: CesarePage,
): ParsedToolUpdates {
  const meta = extractStepBlockMetadata(content);
  const lc = content.toLowerCase();
  const kind = PAGE_TO_UPDATE_KIND[page];
  const baseLabel = PAGE_TO_UPDATED_LABEL[page];

  const updates: ChangeUpdate[] = [];

  if (meta.rewrite) {
    updates.push({
      id: `scene-${meta.rewrite.scene_number}`,
      kind: "scene",
      label: `Sc.${meta.rewrite.scene_number} riscritta`,
    });
  }

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
        updates.push({ id: `${page}-batch`, kind, label: countSuffix });
      }
      break;
    }
  }

  if (updates.length === 0) {
    const pageLabel = PAGE_LABELS[page];
    updates.push({ id: `${page}-page`, kind, label: pageLabel.toLowerCase() });
  }

  const titleSuffix = countSuffix
    ? ` · ${countSuffix}`
    : meta.rewrite
      ? ` · Sc.${meta.rewrite.scene_number}`
      : "";
  const title = `${baseLabel}${titleSuffix}`;

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

// ─── Conversation handlers (shared contract) ───────────────────────────────

export interface ConversationHandlers {
  /** Flash the GREEN additions inline on the live document (Spec 47e). The edit
   *  is already applied; this is a transient peek at "what changed". `liveDiffs`
   *  carries one entry per touched document so each open doc flashes its own. */
  onShowChanges: (args: {
    traceMarkers: ReadonlyArray<TraceMarker>;
    scope?: string;
    liveDiffs?: ReadonlyArray<LiveDiffMarker>;
  }) => void;
  /** Flash the RED previous text inline (Spec 47e) — a peek at "how it was".
   *  Never a revert: the document keeps the new version. Same per-document
   *  `liveDiffs` payload as `onShowChanges`. */
  onHideChanges: (args: { liveDiffs?: ReadonlyArray<LiveDiffMarker> }) => void;
}

// ─── Conversation list ─────────────────────────────────────────────────────

export interface CesareConversationProps extends ConversationHandlers {
  messages: ReadonlyArray<ChatMessage>;
  page: CesarePage;
  /** Rendered when the thread is empty (e.g. quick prompts in the floating
   *  drawer, or an empty-state lede on the full page). */
  emptyState?: ReactNode;
  testId?: string;
}

export function CesareConversation({
  messages,
  page,
  emptyState,
  testId = "cesare-conversation",
  ...handlers
}: CesareConversationProps) {
  return (
    <div className={styles.conversation} data-testid={testId}>
      {messages.length === 0 && emptyState}
      {messages.map((m) => (
        <MessageView key={m.id} message={m} page={page} {...handlers} />
      ))}
    </div>
  );
}

// ─── Message view ──────────────────────────────────────────────────────────

export function MessageView({
  message,
  page,
  onShowChanges,
  onHideChanges,
}: { message: ChatMessage; page: CesarePage } & ConversationHandlers) {
  const [isShowingDiff, setShowingDiff] = useState(false);

  if (message.role === "user") {
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
  const parsed = parseToolUpdates(message.content, page);

  const traceMarkers: ReadonlyArray<TraceMarker> = parsed.updates.map((u) => ({
    id: u.id ?? u.label,
    kind: "replace" as const,
    anchor: u.label,
  }));
  const scope = rewrite ? `Sc.${rewrite.scene_number}` : undefined;

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
          setShowingDiff(true);
          onShowChanges({ traceMarkers, scope, liveDiffs: metadata.liveDiffs });
        }}
        onHideChanges={() => {
          setShowingDiff(false);
          onHideChanges({ liveDiffs: metadata.liveDiffs });
        }}
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

const TRACE_VERB: Record<TraceStep["kind"], string> = {
  reasoning: "Sto ragionando",
  reading: "Sto leggendo",
  writing: "Sto scrivendo",
  tool: "Eseguo",
};

export function LiveTrace({ steps }: { steps: ReadonlyArray<TraceStep> }) {
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
