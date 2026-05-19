import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useButton } from "react-aria";
import type { ResultShape } from "@oh-writers/utils";
import styles from "./CesareSheet.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  onOpenFullPage: () => void;
  /** Server function for chat. Pass null until the server fn is implemented. */
  askCesare?: AskCesareFn | null;
  /** Called after each assistant response — used to invalidate queries (e.g. locations). */
  onAssistantResponse?: (reply: string) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<CesarePage, string> = {
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  schedule: "Calendarizzazione",
  "shooting-plan": "Inquadrature",
  locations: "Location",
};

// Initial quick prompts shown before any conversation
const QUICK_PROMPTS_INITIAL: Record<CesarePage, string[]> = {
  soggetto: [
    "Il conflitto centrale è chiaro?",
    "Suggerisci un arco del personaggio",
    "Come rendere il finale più forte?",
    "Analizza la struttura in tre atti",
  ],
  synopsis: [
    "La sinossi è efficace per un produttore?",
    "Riassumi in tre righe",
    "Mancano elementi narrativi importanti?",
    "Rendi il tono più commerciale",
  ],
  outline: [
    "C'è squilibrio tra gli atti?",
    "Questa scena è necessaria?",
    "Suggerisci un twist al secondo atto",
    "Compatta le scene ridondanti",
  ],
  treatment: [
    "Il ritmo narrativo funziona?",
    "Questa sequenza è troppo lunga?",
    "Suggerisci come migliorare la transizione",
    "Identifica i punti deboli",
  ],
  screenplay: [
    "Questa scena è fattibile domani?",
    "Aiutami a scrivere il dialogo",
    "Come riduco i costi di questa scena?",
    "Analizza il personaggio",
  ],
  breakdown: [
    "Cosa costa di più in questa scena?",
    "Suggerisci dove tagliare",
    "Il cast è disponibile?",
    "Compara con scene simili",
  ],
  budget: [
    "Dove stiamo sforando?",
    "Ottimizza questa categoria",
    "Stima il costo della prossima giornata",
    "Riassumi lo stato del budget",
  ],
  schedule: [
    "Ottimizza i giorni di ripresa",
    "Ci sono conflitti tra attori?",
    "Raggruppa per location",
    "Quanti giorni rimangono?",
  ],
  "shooting-plan": [
    "Quanto tempo ci vuole per questa scena?",
    "Raggruppa le inquadrature per setup",
    "Ordine ottimale delle riprese",
    "Stima le ore di set",
  ],
  locations: [
    "Trova candidati per questa location",
    "Quale zona geografica esplorare?",
    "Cosa controllare durante il sopralluogo?",
    "Suggerisci alternative simili nella zona",
  ],
};

// Follow-up prompts shown after Cesare responds — keyed by page
const QUICK_PROMPTS_FOLLOWUP: Record<CesarePage, string[]> = {
  soggetto: [
    "Approfondisci il personaggio principale",
    "Come risolverei questo problema?",
    "Analizza un altro aspetto",
    "Dammi un esempio concreto",
  ],
  synopsis: [
    "Rendi più cinematografico",
    "Adatta per un pitch di 30 secondi",
    "Confronta con film simili",
    "Cosa manca ancora?",
  ],
  outline: [
    "Approfondisci questa scena",
    "Come riduco il secondo atto?",
    "Suggerisci una scena di transizione",
    "Verifica la coerenza dei personaggi",
  ],
  treatment: [
    "Espandi questa sequenza",
    "Dove posso tagliare?",
    "Il tono è coerente?",
    "Suggerisci un'immagine forte",
  ],
  screenplay: [
    "Scrivi una versione alternativa",
    "Come rendo il dialogo più asciutto?",
    "Questa azione è chiara?",
    "Suggerisci una reazione del personaggio",
  ],
  breakdown: [
    "Dove posso risparmiare?",
    "Questo elemento è essenziale?",
    "Raggruppa elementi simili",
    "Stima i costi aggiuntivi",
  ],
  budget: [
    "Come ottimizzare questa voce?",
    "Dove stiamo rischiando?",
    "Confronta con budget simili",
    "Proietta il costo finale",
  ],
  schedule: [
    "Posso spostare questa scena?",
    "Ottimizza il giorno di ripresa",
    "Ci sono scene da accorpare?",
    "Verifica i conflitti",
  ],
  "shooting-plan": [
    "Riduci i setup mantenendo l'idea",
    "Qual è l'inquadratura chiave?",
    "Stima il tempo per questo setup",
    "Suggerisci un'alternativa più economica",
  ],
  locations: [
    "Scrivi una scheda sopralluogo",
    "Confronta i candidati trovati",
    "Quale visitare per primo?",
    "Trova altri candidati nella zona",
  ],
};

// After Cesare finds candidates in locations, offer more specific prompts
const QUICK_PROMPTS_LOCATIONS_AFTER_SEARCH: string[] = [
  "Scrivi una scheda sopralluogo dettagliata",
  "Quale candidato si adatta meglio alla scena?",
  "Trova altri candidati nella stessa area",
  "Confronta luce naturale e accessibilità",
];

const deriveQuickPrompts = (
  page: CesarePage,
  messages: Message[],
): string[] => {
  if (messages.length === 0) return QUICK_PROMPTS_INITIAL[page];

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) return QUICK_PROMPTS_INITIAL[page];

  // Locations: after a search that found candidates, show specific follow-up
  if (
    page === "locations" &&
    (lastAssistant.content.includes("aggiunto") ||
      lastAssistant.content.includes("Trovato") ||
      lastAssistant.content.includes("candidat"))
  ) {
    return QUICK_PROMPTS_LOCATIONS_AFTER_SEARCH;
  }

  return QUICK_PROMPTS_FOLLOWUP[page];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scrollToBottom = (el: HTMLElement | null): void => {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

// The real askCesare server fn is in cesare.server.ts.
// Its return shape is ResultShape<string, CesareError>.
// We model it here so the sheet doesn't import server-only code directly.
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

// Calls the askCesare server function. Returns a plain string on success,
// null on error. When no fn is injected the sheet degrades gracefully.
const callAskCesare = async (
  fn: AskCesareFn | null,
  projectId: string,
  page: CesarePage,
  message: string,
  sceneId: string | null | undefined,
  sceneNumber: number | null | undefined,
  requirementId: string | null | undefined,
  documentId: string | null | undefined,
  shootingDayId: string | null | undefined,
  shootingDayNumber: number | null | undefined,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string | null> => {
  if (!fn) {
    return "Cesare non è ancora disponibile su questa sezione. Tornerà presto.";
  }

  const shape = await fn({
    data: {
      projectId,
      message,
      pageContext: {
        page,
        sceneId: sceneId ?? null,
        sceneNumber: sceneNumber ?? null,
        requirementId: requirementId ?? null,
        documentId: documentId ?? null,
        shootingDayId: shootingDayId ?? null,
        shootingDayNumber: shootingDayNumber ?? null,
      },
      conversationHistory: history,
    },
  });

  if (!shape.isOk) return "Mi dispiace, si è verificato un errore. Riprova.";
  return shape.value;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CloseButton({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": "Chiudi Cesare" },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.closeBtn}
      type="button"
    >
      ✕
    </button>
  );
}

function FullPageButton({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress }, ref);
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.fullPageBtn}
      type="button"
    >
      Pagina intera →
    </button>
  );
}

function SendButton({
  onPress,
  isDisabled,
}: {
  onPress: () => void;
  isDisabled: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, isDisabled }, ref);
  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.sendBtn}
      type="button"
      aria-label="Invia"
    >
      ▶
    </button>
  );
}

// ─── Minimal markdown renderer ───────────────────────────────────────────────
// Covers the patterns Cesare produces: headings, bold, italic, hr, bullet lists.
// No external dependency — keeps the bundle small and the style fully controlled.

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Bold (**text**) and italic (*text*) — process in one pass
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0].startsWith("**")) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else {
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type ListState =
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | null;

// Strip raw <tool_call>{...}</tool_call> and <tool_response>…</tool_response>
// blocks that occasionally leak into the assistant text when the model echoes
// back internal protocol scaffolding. They are intended for the server, never
// the user.
function stripToolCalls(content: string): string {
  return (
    content
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
      .replace(/<tool_call>[\s\S]*$/g, "")
      .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
      .replace(/<tool_response>[\s\S]*$/g, "")
      .replace(/<\/tool_response>/g, "")
      // XML-style tool calls some models emit as plain text instead of the
      // native Anthropic `tool_use` content block.
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "")
      .replace(/<function_calls>[\s\S]*$/g, "")
      .replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/g, "")
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
      .trim()
  );
}

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
 * Server side-channel for tool payloads that the canvas/UI needs (e.g. a
 * blocking proposal that must render as ghost overlays). Returns the parsed
 * payload or null when no marker is present / JSON is malformed.
 */
export function parseBlockingProposalMarker(content: string): unknown | null {
  const m = content.match(/<!--ohw:blocking-proposal:([\s\S]*?)-->/);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

interface TableState {
  header: string[];
  rows: string[][];
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return false;
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function renderMarkdown(content: string): React.ReactNode {
  const clean = stripToolCalls(content);
  const lines = clean.split("\n");
  const nodes: React.ReactNode[] = [];
  let list: ListState = null;
  let table: TableState | null = null;
  let key = 0;

  const flushTable = () => {
    if (!table) return;
    const t = table;
    nodes.push(
      <div key={key++} className={styles.mdTableWrap}>
        <table className={styles.mdTable}>
          <thead>
            <tr>
              {t.header.map((h, i) => (
                <th key={i}>{renderInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  const flushList = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    const items = list.items;
    if (list.kind === "ol") {
      nodes.push(
        <ol key={key++} className={styles.mdOrderedList}>
          {items.map((item, i) => (
            <li key={i} className={styles.mdListItem}>
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
    } else {
      nodes.push(
        <ul key={key++} className={styles.mdList}>
          {items.map((item, i) => (
            <li key={i} className={styles.mdListItem}>
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
    }
    list = null;
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;

    // Code fence block: capture everything between the opening ``` and the
    // closing ``` as a <pre>. The opening line may carry a language hint
    // (e.g. ```fountain) — we keep it as a data attribute for styling but
    // do not syntax-highlight (CSS handles the monospace block look).
    const fenceOpen = line.match(/^```(\w+)?\s*$/);
    if (fenceOpen) {
      flushList();
      flushTable();
      const lang = fenceOpen[1] ?? "";
      const buf: string[] = [];
      li++;
      while (li < lines.length && !/^```\s*$/.test(lines[li]!)) {
        buf.push(lines[li]!);
        li++;
      }
      nodes.push(
        <pre key={key++} className={styles.mdCodeBlock} data-lang={lang}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const h4 = line.match(/^#### (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    const bullet = line.match(/^[-*] (.+)/);
    const ordered = line.match(/^\d+\.\s+(.+)/);
    const hr = line.match(/^---+$/);
    const tableCells = parseTableRow(line);
    const nextLine = lines[li + 1] ?? "";

    // Table detection: a header row followed by a separator row.
    if (table) {
      if (tableCells) {
        table.rows.push(tableCells);
        continue;
      }
      flushTable();
    } else if (tableCells && isTableSeparator(nextLine)) {
      flushList();
      table = { header: tableCells, rows: [] };
      li++; // skip the separator line
      continue;
    }

    if (h4) {
      flushList();
      nodes.push(
        <h5 key={key++} className={styles.mdH3}>
          {renderInline(h4[1]!)}
        </h5>,
      );
    } else if (h3) {
      flushList();
      nodes.push(
        <h4 key={key++} className={styles.mdH3}>
          {renderInline(h3[1]!)}
        </h4>,
      );
    } else if (h2) {
      flushList();
      nodes.push(
        <h3 key={key++} className={styles.mdH2}>
          {renderInline(h2[1]!)}
        </h3>,
      );
    } else if (h1) {
      flushList();
      nodes.push(
        <h2 key={key++} className={styles.mdH1}>
          {renderInline(h1[1]!)}
        </h2>,
      );
    } else if (hr) {
      flushList();
      nodes.push(<hr key={key++} className={styles.mdHr} />);
    } else if (bullet) {
      if (!list || list.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(bullet[1]!);
    } else if (ordered) {
      if (!list || list.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ordered[1]!);
    } else if (line.trim() === "") {
      flushList();
      nodes.push(<div key={key++} className={styles.mdSpacer} />);
    } else {
      flushList();
      nodes.push(
        <p key={key++} className={styles.mdPara}>
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  flushTable();
  return nodes;
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={[
        styles.bubble,
        message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
      ].join(" ")}
    >
      {message.role === "assistant" && (
        <span className={styles.bubbleIcon} aria-hidden>
          ✦
        </span>
      )}
      {message.role === "assistant" ? (
        <div className={[styles.bubbleText, styles.bubbleMarkdown].join(" ")}>
          {renderMarkdown(message.content)}
        </div>
      ) : (
        <p className={styles.bubbleText}>{message.content}</p>
      )}
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div
      className={[
        styles.bubble,
        styles.bubbleAssistant,
        styles.bubbleLoading,
      ].join(" ")}
      aria-busy="true"
      aria-label="Cesare sta rispondendo"
    >
      <span className={styles.bubbleIcon} aria-hidden>
        ✦
      </span>
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

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon} aria-hidden>
        ✦
      </span>
      <p className={styles.emptyText}>Ciao. Sono Cesare.</p>
      <p className={styles.emptyHint}>Chiedimi qualcosa sul progetto.</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MIN_HEIGHT = 260;
const getViewportHeight = () =>
  typeof window !== "undefined" ? window.innerHeight : 800;

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
  askCesare = null,
  onAssistantResponse,
}: CesareSheetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sheetHeight, setSheetHeight] = useState(() =>
    Math.round(getViewportHeight() * 0.42),
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartHeight.current = sheetHeight;
      setIsDragging(true);

      const onMove = (ev: PointerEvent) => {
        const maxH = Math.round(getViewportHeight() * 0.85);
        const delta = dragStartY.current - ev.clientY;
        const next = Math.max(
          MIN_HEIGHT,
          Math.min(maxH, dragStartHeight.current + delta),
        );
        setSheetHeight(next);
      };
      const onUp = () => {
        setIsDragging(false);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [sheetHeight],
  );

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Auto-scroll conversation to bottom whenever messages update
  useEffect(() => {
    scrollToBottom(conversationRef.current);
  }, [messages, isLoading]);

  // Focus textarea when sheet opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 280);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: Message = { role: "user", content: trimmed };
      // Capture history before the state update so we send the correct slice
      setMessages((prev) => {
        const next = [...prev, userMessage];
        void callAskCesare(
          askCesare,
          projectId,
          page,
          trimmed,
          sceneId,
          sceneNumber,
          requirementId,
          documentId,
          shootingDayId,
          shootingDayNumber,
          prev, // history before the new user message
        )
          .then((reply) => {
            const content =
              reply ?? "Mi dispiace, si è verificato un errore. Riprova.";
            setMessages((m) => [...m, { role: "assistant", content }]);
            onAssistantResponse?.(content);
            // Side-channel: if Cesare emitted a blocking-proposal marker, fan
            // it out as a DOM event so the BlockingCanvas can render ghost
            // overlays. The canvas is mounted in a different feature tree and
            // we want to avoid plumbing this through props.
            const proposal = parseBlockingProposalMarker(content);
            if (proposal && typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("ohw:cesare:blocking-proposal", {
                  detail: proposal,
                }),
              );
            }
          })
          .finally(() => {
            setIsLoading(false);
          });
        return next;
      });
      setInput("");
      setIsLoading(true);
    },
    [
      askCesare,
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

  const handleSend = useCallback(() => {
    void sendMessage(input);
  }, [input, sendMessage]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      void sendMessage(prompt);
    },
    [sendMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const pageLabel = PAGE_LABELS[page];
  const contextLabel = sceneNumber != null ? `SC. ${sceneNumber}` : pageLabel;

  return (
    <>
      {/* Scrim */}
      <div
        className={styles.scrim}
        data-open={isOpen ? "true" : "false"}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={styles.sheet}
        data-open={isOpen ? "true" : "false"}
        data-dragging={isDragging ? "true" : undefined}
        role="complementary"
        aria-label="Cesare — assistente AI"
        aria-hidden={!isOpen}
        style={{ height: sheetHeight }}
      >
        {/* Drag handle */}
        <div
          className={styles.handle}
          onPointerDown={handleHandlePointerDown}
          role="separator"
          aria-label="Ridimensiona Cesare"
          aria-orientation="horizontal"
        />

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerStart}>
            <span className={styles.agentIcon} aria-hidden>
              ✦
            </span>
            <span className={styles.agentName}>Cesare</span>
            <span className={styles.contextChip}>{contextLabel}</span>
          </div>
          <div className={styles.headerEnd}>
            <FullPageButton onPress={onOpenFullPage} />
            <CloseButton onPress={onClose} />
          </div>
        </header>

        {/* Conversation */}
        <div
          className={styles.conversation}
          ref={conversationRef}
          role="log"
          aria-live="polite"
          aria-label="Conversazione con Cesare"
        >
          {messages.length === 0 && !isLoading ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((msg, i) => (
                // Messages are append-only; index is stable
                <MessageBubble key={`msg-${i}-${msg.role}`} message={msg} />
              ))}
              {isLoading && <LoadingIndicator />}
            </>
          )}
        </div>

        {/* Quick prompts — derived from conversation state */}
        <div className={styles.quickPrompts} aria-label="Suggerimenti rapidi">
          {deriveQuickPrompts(page, messages).map((prompt) => (
            <button
              key={prompt}
              type="button"
              className={styles.quickPromptBtn}
              onClick={() => handleQuickPrompt(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Chiedi a Cesare…"
            rows={1}
            aria-label="Messaggio per Cesare"
            disabled={isLoading}
          />
          <SendButton
            onPress={handleSend}
            isDisabled={!input.trim() || isLoading}
          />
        </div>
      </div>
    </>
  );
}
