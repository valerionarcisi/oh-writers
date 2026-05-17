import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useButton } from "react-aria";
import type { ResultShape } from "@oh-writers/utils";
import styles from "./CesareSheet.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CesarePage =
  | "screenplay"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan";

export interface CesareSheetProps {
  projectId: string;
  page: CesarePage;
  sceneId?: string | null;
  sceneNumber?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullPage: () => void;
  /** Server function for chat. Pass null until the server fn is implemented. */
  askCesare?: AskCesareFn | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<CesarePage, string> = {
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  schedule: "Piano",
  "shooting-plan": "Inquadrature",
};

const QUICK_PROMPTS: Record<CesarePage, string[]> = {
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
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string | null> => {
  if (!fn) {
    return "Cesare non è ancora disponibile su questa sezione. Tornerà presto.";
  }

  const shape = await fn({
    data: {
      projectId,
      message,
      pageContext: { page, sceneId: sceneId ?? null, sceneNumber: sceneNumber ?? null },
      conversationHistory: history,
    },
  });

  if (!shape.isOk) return "Mi dispiace, si è verificato un errore. Riprova.";
  return shape.value;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CloseButton({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, "aria-label": "Chiudi Cesare" }, ref);
  return (
    <button ref={ref} {...buttonProps} className={styles.closeBtn} type="button">
      ✕
    </button>
  );
}

function FullPageButton({ onPress }: { onPress: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress }, ref);
  return (
    <button ref={ref} {...buttonProps} className={styles.fullPageBtn} type="button">
      Pagina intera →
    </button>
  );
}

function SendButton({ onPress, isDisabled }: { onPress: () => void; isDisabled: boolean }) {
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

function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={[
        styles.bubble,
        message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
      ].join(" ")}
    >
      {message.role === "assistant" && (
        <span className={styles.bubbleIcon} aria-hidden>✦</span>
      )}
      <p className={styles.bubbleText}>{message.content}</p>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className={[styles.bubble, styles.bubbleAssistant, styles.bubbleLoading].join(" ")}>
      <span className={styles.bubbleIcon} aria-hidden>✦</span>
      <span className={styles.loadingDots} aria-label="Cesare sta rispondendo">···</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon} aria-hidden>✦</span>
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
  isOpen,
  onClose,
  onOpenFullPage,
  askCesare = null,
}: CesareSheetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sheetHeight, setSheetHeight] = useState(() => Math.round(getViewportHeight() * 0.42));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = sheetHeight;
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const maxH = Math.round(getViewportHeight() * 0.85);
      const delta = dragStartY.current - ev.clientY;
      const next = Math.max(MIN_HEIGHT, Math.min(maxH, dragStartHeight.current + delta));
      setSheetHeight(next);
    };
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [sheetHeight]);

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
          prev, // history before the new user message
        ).then((reply) => {
          const content = reply ?? "Mi dispiace, si è verificato un errore. Riprova.";
          setMessages((m) => [...m, { role: "assistant", content }]);
        }).finally(() => {
          setIsLoading(false);
        });
        return next;
      });
      setInput("");
      setIsLoading(true);
    },
    [askCesare, isLoading, projectId, page, sceneId, sceneNumber],
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
  const contextLabel =
    sceneNumber != null ? `SC. ${sceneNumber}` : pageLabel;

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
            <span className={styles.agentIcon} aria-hidden>✦</span>
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
                // eslint-disable-next-line react/no-array-index-key
                <MessageBubble key={i} message={msg} />
              ))}
              {isLoading && <LoadingIndicator />}
            </>
          )}
        </div>

        {/* Quick prompts */}
        <div className={styles.quickPrompts} aria-label="Suggerimenti rapidi">
          {QUICK_PROMPTS[page].map((prompt) => (
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
          <SendButton onPress={handleSend} isDisabled={!input.trim() || isLoading} />
        </div>
      </div>
    </>
  );
}

