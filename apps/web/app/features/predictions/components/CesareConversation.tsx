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
import type { TranslationKey } from "@oh-writers/domain";
import type { ChatMessage, TraceStep } from "../use-cesare-chat-reducer";
import { useTranslation } from "~/features/i18n";
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

/** Page label key per Cesare page. Resolved to the active locale via
 *  `pageLabel(page, t)`. The labels are uppercase chip copy. */
export const PAGE_LABEL_KEYS: Record<CesarePage, TranslationKey> = {
  soggetto: "cesare.page.soggetto",
  synopsis: "cesare.page.synopsis",
  outline: "cesare.page.outline",
  treatment: "cesare.page.treatment",
  screenplay: "cesare.page.screenplay",
  breakdown: "cesare.page.breakdown",
  budget: "cesare.page.budget",
  schedule: "cesare.page.schedule",
  "shooting-plan": "cesare.page.shootingPlan",
  locations: "cesare.page.locations",
};

/** Resolve a page's chip label to the active locale. */
export const pageLabel = (
  page: CesarePage,
  t: (key: TranslationKey) => string,
): string => t(PAGE_LABEL_KEYS[page]);

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

/**
 * Honest success signal for the NON-document write tools (budget, location,
 * schedule, shooting-plan). Emitted by the server ONLY when such a tool actually
 * mutated the DB (F-A3). Each marker carries the entity the TOOL touched, so the
 * card labels the real edited entity rather than the current page (F-M1).
 */
export interface EntityAppliedMarker {
  readonly domain: string;
  readonly label: string;
}

export function parseEntityAppliedMarkers(
  content: string,
): EntityAppliedMarker[] {
  const pattern = /<!--ohw:entity-applied:([\s\S]*?)-->/g;
  const markers: EntityAppliedMarker[] = [];
  for (const m of content.matchAll(pattern)) {
    if (!m[1]) continue;
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      const domain = parsed["domain"];
      if (typeof domain !== "string" || domain.length === 0) continue;
      markers.push({
        domain,
        label:
          typeof parsed["label"] === "string" && parsed["label"].length > 0
            ? parsed["label"]
            : domain,
      });
    } catch {
      // best-effort: a malformed marker is skipped, never throws
    }
  }
  return markers;
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
    .replace(/<!--ohw:entity-applied:[\s\S]*?-->/g, "")
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
  /** Generic applied-entity markers for non-document write tools (F-A3). */
  entitiesApplied: ReadonlyArray<EntityAppliedMarker>;
  /** One live-diff per touched document (Spec 47d). Empty when none applied. */
  liveDiffs: ReadonlyArray<LiveDiffMarker>;
}

export function extractStepBlockMetadata(content: string): StepBlockMetadata {
  return {
    toolCount: parseToolsExecuted(content),
    rewrite: parseRewriteSceneMarker(content),
    hasProposal: parseBlockingProposalMarker(content) !== null,
    docApplied: parseDocAppliedMarker(content),
    entitiesApplied: parseEntityAppliedMarkers(content),
    liveDiffs: parseLiveDiffMarkers(content),
  };
}

/**
 * Did the turn ACTUALLY apply an edit? The card may claim a change ONLY when a
 * real apply signal is present. This is the tracer invariant in code: never
 * fabricate a success from the page or from heuristics on the chat text. A
 * chat-only reply, a no-op tool, or a failed tool yields `false` and the message
 * renders as plain prose (the tool's own outcome text) — no success card, no
 * "Mostra modifiche".
 */
export function hasAppliedEdit(meta: StepBlockMetadata): boolean {
  return (
    meta.docApplied !== null ||
    meta.entitiesApplied.length > 0 ||
    meta.rewrite !== null
  );
}

/**
 * The set of entity domains the turn ACTUALLY applied an edit to, read from the
 * real markers (never from the page or the chat text). Empty when the turn
 * changed nothing. Consumers (e.g. the shell's success toast) use this to avoid
 * announcing a change that didn't happen — the same tracer invariant as the
 * result card, applied to side effects.
 */
export function appliedEntityDomains(content: string): ReadonlySet<string> {
  const meta = extractStepBlockMetadata(content);
  const domains = new Set<string>();
  if (meta.docApplied) domains.add(meta.docApplied.documentType);
  for (const e of meta.entitiesApplied) domains.add(e.domain);
  if (meta.rewrite) domains.add("screenplay");
  return domains;
}

// Canonical per-entity presentation, keyed by the entity the TOOL actually
// touched (the marker's domain / document_type), NOT by the current page. This
// is the F-M1 fix: a logline edit issued from the Soggetto page must read
// "logline", because the marker says `logline`. `StreamEntityDomain` and the
// `DocumentType` strings carried by `doc-applied` share these keys.
interface EntityDisplay {
  readonly kind: ChangeUpdate["kind"];
  readonly title: string;
  readonly label: string;
}

const ENTITY_DISPLAY: Record<string, EntityDisplay> = {
  logline: { kind: "doc", title: "Aggiornata Logline", label: "logline" },
  soggetto: { kind: "doc", title: "Aggiornato Soggetto", label: "soggetto" },
  synopsis: { kind: "doc", title: "Aggiornata Sinossi", label: "sinossi" },
  outline: { kind: "doc", title: "Aggiornata Scaletta", label: "scaletta" },
  treatment: {
    kind: "doc",
    title: "Aggiornato Trattamento",
    label: "trattamento",
  },
  screenplay: {
    kind: "scene",
    title: "Aggiornata Sceneggiatura",
    label: "sceneggiatura",
  },
  breakdown: {
    kind: "breakdown",
    title: "Aggiornato Breakdown",
    label: "breakdown",
  },
  budget: { kind: "budget", title: "Aggiornato Budget", label: "budget" },
  schedule: {
    kind: "schedule",
    title: "Aggiornato Calendario",
    label: "calendario",
  },
  "shooting-plan": {
    kind: "scene",
    title: "Aggiornato Piano Inquadrature",
    label: "piano inquadrature",
  },
  locations: {
    kind: "location",
    title: "Aggiornate Location",
    label: "location",
  },
};

const FALLBACK_DISPLAY: EntityDisplay = {
  kind: "doc",
  title: "Modifica applicata",
  label: "modifica",
};

const displayForEntity = (domain: string): EntityDisplay =>
  ENTITY_DISPLAY[domain] ?? {
    ...FALLBACK_DISPLAY,
    label: domain,
  };

export interface ParsedToolUpdates {
  readonly title: string;
  readonly updates: ReadonlyArray<ChangeUpdate>;
  readonly thoughts: ReadonlyArray<string>;
}

/**
 * Builds the result-card model from the REAL apply signals in the turn — never
 * from the page or from a text heuristic. Callers must first gate on
 * `hasAppliedEdit(meta)`; this assumes at least one apply signal is present and
 * returns the honest "what was edited" card keyed by the touched entity.
 */
export function parseToolUpdates(content: string): ParsedToolUpdates {
  const meta = extractStepBlockMetadata(content);
  const lc = content.toLowerCase();

  const updates: ChangeUpdate[] = [];
  let title = "";

  if (meta.rewrite) {
    updates.push({
      id: `scene-${meta.rewrite.scene_number}`,
      kind: "scene",
      label: `Sc.${meta.rewrite.scene_number} riscritta`,
    });
    title = `Aggiornata Sceneggiatura · Sc.${meta.rewrite.scene_number}`;
  }

  if (meta.docApplied) {
    const display = displayForEntity(meta.docApplied.documentType);
    updates.push({
      id: `doc-${meta.docApplied.documentType}`,
      kind: display.kind,
      label: display.label,
    });
    if (!title) title = display.title;
  }

  for (const entity of meta.entitiesApplied) {
    const display = displayForEntity(entity.domain);
    updates.push({
      id: `entity-${entity.domain}`,
      kind: display.kind,
      label: display.label,
    });
    if (!title) title = display.title;
  }

  // Several entities touched in one turn — keep a single honest summary title.
  if (updates.length > 1) title = "Modifiche applicate";
  if (!title) title = FALLBACK_DISPLAY.title;

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
  // `page` is kept in the public prop contract (callers still pass the active
  // page) but it no longer drives the result card — the card now reads the real
  // tool markers (F-A3/F-M1), so the rendered entity is the one actually edited.
  page: _page,
  emptyState,
  testId = "cesare-conversation",
  ...handlers
}: CesareConversationProps) {
  return (
    <div className={styles.conversation} data-testid={testId}>
      {messages.length === 0 && emptyState}
      {messages.map((m) => (
        <MessageView key={m.id} message={m} {...handlers} />
      ))}
    </div>
  );
}

// ─── Message view ──────────────────────────────────────────────────────────

export function MessageView({
  message,
  onShowChanges,
  onHideChanges,
}: { message: ChatMessage } & ConversationHandlers) {
  const { t } = useTranslation();
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
            aria-label={t("cesare.bubble.sending")}
            data-testid="cesare-bubble-pending"
          />
        )}
        {message.status === "failed" && (
          <span className={styles.bubbleStatusFailed}>
            {t("cesare.bubble.sendFailed")}
          </span>
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

  // The result card may claim a change ONLY when the turn actually applied an
  // edit (real apply signal: doc-applied / entity-applied / scene rewrite).
  // Tools that only READ, no-op'd, or FAILED leave no apply signal: the turn
  // renders as plain prose (the tool's own honest outcome text), never a
  // "Aggiornato X · Mostra modifiche" card. This is the tracer invariant — no
  // fabricated success. The `page` no longer drives the card.
  if (!hasAppliedEdit(metadata)) {
    return (
      <div className={styles.bubbleAssistant} data-testid="cesare-no-change">
        <div className={styles.bubbleMarkdown}>{rendered}</div>
      </div>
    );
  }

  const rewrite = metadata.rewrite;
  const parsed = parseToolUpdates(message.content);

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
  const { t } = useTranslation();
  return (
    <div
      className={styles.bubbleAssistant}
      aria-busy="true"
      aria-label={t("cesare.bubble.replying")}
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

const TRACE_VERB_KEY: Record<TraceStep["kind"], TranslationKey> = {
  reasoning: "cesare.trace.reasoning",
  reading: "cesare.trace.reading",
  writing: "cesare.trace.writing",
  tool: "cesare.trace.tool",
};

export function LiveTrace({ steps }: { steps: ReadonlyArray<TraceStep> }) {
  const { t } = useTranslation();
  const last = steps[steps.length - 1];
  const liveLabel = last
    ? `Cesare ${t(TRACE_VERB_KEY[last.kind]).toLowerCase()}${
        last.entity ? ` ${last.entity.label}` : ""
      }`
    : t("cesare.trace.working");
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
              {t(TRACE_VERB_KEY[step.kind])}
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
