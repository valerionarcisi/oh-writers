// Spec 52 — the full-screen, glowy Cesare new-session landing (Notion AI style).
//
// Reached from the LeftRail "Nuova sessione" / "+ Nuova" affordance
// (`/projects/:id/sessions/new`, routed + deep-linkable). The page engages the
// AppShell focus mode (spec 44) for its lifetime so the rail + topstrip recede
// and the landing owns the viewport. It renders the Cesare sparkle, an Italian
// heading, a LARGE centred input with the token-driven glow, and a few
// quick-prompt suggestions (the next narrative step from spec 50 + generic
// starters).
//
// Submitting the first message starts the session and DOCKS into the normal
// conversation view — without forking the chat. We reuse the SAME shared chat
// store (`useCesareChatStore`): the landing creates the session (if needed),
// pushes the message through the store, then routes to the central
// `/sessions/:sessionId` conversation which renders the same store thread (the
// message + its streamed trace are already live there). One chat container, two
// layouts.

import { useCallback, useEffect, useRef, useState } from "react";
import { useButton } from "react-aria";
import { useNavigate } from "@tanstack/react-router";
import { useRequestShellFocus } from "~/features/app-shell";
import { useCreateSession } from "../sessions";
import { useCesareChatStore } from "../cesare-chat-store";
import { useNarrativeNextStep } from "../use-narrative-next-step";
import type { NarrativeStep } from "../narrative-next-step";
import styles from "./NewSessionLandingPage.module.css";

const PLACEHOLDER = "Chiedi qualunque cosa a Cesare…";

// Generic starters that always make sense, regardless of how far along the
// narrative chain the project is. They seed the composer (the user can refine
// before sending) so the landing is never a dead end.
const GENERIC_STARTERS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
}> = [
  {
    id: "brainstorm",
    label: "Esplora un'idea per il film",
    prompt:
      "Aiutami a esplorare un'idea per un film: facciamo brainstorming sul tema, i personaggi e il conflitto.",
  },
  {
    id: "review",
    label: "Rivedi cosa ho scritto finora",
    prompt:
      "Dai un'occhiata a quello che ho scritto finora nel progetto e dimmi cosa funziona e cosa migliorare.",
  },
];

export function NewSessionLandingPage({ projectId }: { projectId: string }) {
  // Engage focus mode for the lifetime of this route (spec 44 / spec 52).
  useRequestShellFocus();

  const navigate = useNavigate();
  const store = useCesareChatStore();
  const createSession = useCreateSession(projectId);
  const { suggestion: nextStep } = useNarrativeNextStep(projectId);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Guards a double-submit while the create-session + first-send is in flight.
  const [isStarting, setStarting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Start the session from a given text: create the row, push the first message
  // through the shared store, then route to the conversation. The conversation
  // page reads the SAME store thread, so the message + its streamed trace are
  // already live when it mounts — no fork, no replay.
  const start = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || isStarting || !store) return;
      setStarting(true);
      void createSession
        .mutateAsync(undefined)
        .then((session) => {
          store.selectSession(session.id);
          void store.send(trimmed, session.id);
          void navigate({
            to: "/projects/$id/sessions/$sessionId",
            params: { id: projectId, sessionId: session.id },
          });
        })
        // The mutation records its own error state (rendered below); swallow the
        // floating rejection and re-enable the composer so the user can retry.
        .catch(() => setStarting(false));
    },
    [createSession, isStarting, navigate, projectId, store],
  );

  const handleSubmit = useCallback(() => start(input), [start, input]);

  // A quick-prompt seeds the composer and focuses it: the user can send as-is or
  // refine first. This keeps every starter on the single send path (spec 50).
  const seedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  return (
    <div className={styles.page} data-testid="cesare-new-session-landing">
      <div className={styles.center}>
        <span className={styles.brandGlyph} aria-hidden="true">
          ✦
        </span>
        <h1 className={styles.heading} data-testid="new-session-heading">
          Cosa scriviamo oggi?
        </h1>
        <p className={styles.subheading}>
          Cesare ti aiuta a scrivere e revisionare il tuo film, passo dopo
          passo.
        </p>

        <GlowComposer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isDisabled={isStarting}
        />

        <div
          className={styles.suggestions}
          aria-label="Suggerimenti"
          data-testid="new-session-suggestions"
        >
          {nextStep && (
            <SuggestionChip
              label={nextStep.chipLabel}
              prompt={nextStep.prompt}
              step={nextStep.step}
              onPick={start}
              isDisabled={isStarting}
              variant="next-step"
            />
          )}
          {GENERIC_STARTERS.map((starter) => (
            <SuggestionChip
              key={starter.id}
              label={starter.label}
              prompt={starter.prompt}
              onPick={seedPrompt}
              isDisabled={isStarting}
              variant="starter"
            />
          ))}
        </div>

        {createSession.isError && (
          <p
            className={styles.error}
            role="alert"
            data-testid="new-session-error"
          >
            Impossibile avviare la sessione. Riprova.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Glow composer ─────────────────────────────────────────────────────────
// The large centred input with the token-driven glowing focus ring. It is the
// existing composer pattern scaled up + centred — the glow is CSS only (no new
// input primitive). react-aria `useButton` drives the send affordance.

interface GlowComposerProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly isDisabled: boolean;
}

const GlowComposer = ({
  ref,
  value,
  onChange,
  onSubmit,
  isDisabled,
}: GlowComposerProps & { ref: React.Ref<HTMLTextAreaElement> }) => {
  const sendRef = useRef<HTMLButtonElement>(null);
  const canSend = value.trim().length > 0 && !isDisabled;
  const { buttonProps } = useButton(
    {
      onPress: onSubmit,
      isDisabled: !canSend,
      "aria-label": "Avvia la sessione",
    },
    sendRef,
  );

  return (
    <div className={styles.glowWrap} data-testid="new-session-glow">
      <div className={styles.glowRing} aria-hidden="true" />
      <div className={styles.composer}>
        <textarea
          ref={ref}
          className={styles.composerInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends (Shift+Enter inserts a newline) — Notion AI parity.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={PLACEHOLDER}
          disabled={isDisabled}
          rows={1}
          aria-label="Messaggio per Cesare"
          data-testid="new-session-input"
        />
        <button
          ref={sendRef}
          {...buttonProps}
          type="button"
          className={styles.composerSend}
          data-testid="new-session-send"
        >
          ↑
        </button>
      </div>
    </div>
  );
};

// ─── Suggestion chip ───────────────────────────────────────────────────────
// One quick-prompt. `next-step` chips START the flow directly (spec 50 — one
// generation per click); `starter` chips seed the composer for refinement.
// react-aria `useButton` is mandatory.

interface SuggestionChipProps {
  readonly label: string;
  readonly prompt: string;
  /** Present only for narrative next-step chips; drives the `data-step` hook. */
  readonly step?: NarrativeStep;
  readonly onPick: (prompt: string) => void;
  readonly isDisabled: boolean;
  readonly variant: "next-step" | "starter";
}

function SuggestionChip({
  label,
  prompt,
  step,
  onPick,
  isDisabled,
  variant,
}: SuggestionChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: () => onPick(prompt),
      isDisabled,
      "aria-label": label,
    },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.suggestion}
      data-variant={variant}
      data-step={step}
      data-testid="new-session-suggestion"
    >
      <span className={styles.suggestionSpark} aria-hidden="true">
        ✦
      </span>
      <span className={styles.suggestionLabel}>{label}</span>
    </button>
  );
}
