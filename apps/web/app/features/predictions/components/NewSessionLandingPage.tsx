// Spec 52 — the glowy Cesare new-session landing (Notion AI style).
//
// Reached from the LeftRail "Nuova sessione" / "+ Nuova" affordance
// (`/projects/:id/sessions/new`, routed + deep-linkable). Per N-13 the landing
// lives INSIDE the AppShell — the rail + TopBar stay present — and centres the
// Cesare prompt WITHIN the main content lane (it is not a bare full-screen
// takeover / focus mode). It renders the Cesare sparkle, an Italian heading, a
// LARGE centred input with the token-driven glow, and a few quick-prompt
// suggestions (the next narrative step from spec 50 + generic starters).
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
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { useRegisterCesareSurface } from "~/features/app-shell";
import { useCreateSession } from "../sessions";
import { useCesareChatStore } from "../cesare-chat-store";
import { useNarrativeNextStep } from "../use-narrative-next-step";
import type { NarrativeStep } from "../narrative-next-step";
import styles from "./NewSessionLandingPage.module.css";

// Generic starters that always make sense, regardless of how far along the
// narrative chain the project is. They seed the composer (the user can refine
// before sending) so the landing is never a dead end. Labels + prompts resolve
// to the active locale.
const GENERIC_STARTERS: ReadonlyArray<{
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly promptKey: TranslationKey;
}> = [
  {
    id: "brainstorm",
    labelKey: "cesare.landing.starterBrainstormLabel",
    promptKey: "cesare.landing.starterBrainstormPrompt",
  },
  {
    id: "review",
    labelKey: "cesare.landing.starterReviewLabel",
    promptKey: "cesare.landing.starterReviewPrompt",
  },
];

export function NewSessionLandingPage({ projectId }: { projectId: string }) {
  // N-13 — the landing stays INSIDE the AppShell (rail + TopBar present); it
  // centres the prompt within the main lane rather than engaging focus mode.
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useCesareChatStore();
  const createSession = useCreateSession(projectId);
  const { suggestion: nextStep } = useNarrativeNextStep(projectId);
  // This landing IS the chat — suppress the shell's floating Cesare drawer + pill.
  useRegisterCesareSurface();

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Guards a double-submit while the create-session + first-send is in flight.
  const [isStarting, setStarting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-grow the landing composer with its content up to the CSS cap (40vh),
  // then scroll internally — writing a multi-sentence first prompt is
  // comfortable (BUG-N65). Mirrors the SessionConversationPage composer.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [input]);

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
          {t("cesare.landing.heading")}
        </h1>
        <p className={styles.subheading}>{t("cesare.landing.subheading")}</p>

        <GlowComposer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isDisabled={isStarting}
        />

        <div
          className={styles.suggestions}
          aria-label={t("cesare.landing.suggestionsAria")}
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
              label={t(starter.labelKey)}
              prompt={t(starter.promptKey)}
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
            {t("cesare.landing.error")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────────
// The large centred input. It is the existing composer pattern scaled up +
// centred, with a focus-ring border when typing (no animated background).
// react-aria `useButton` drives the send affordance.

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
  const { t } = useTranslation();
  const sendRef = useRef<HTMLButtonElement>(null);
  const canSend = value.trim().length > 0 && !isDisabled;
  const { buttonProps } = useButton(
    {
      onPress: onSubmit,
      isDisabled: !canSend,
      "aria-label": t("cesare.landing.startSession"),
    },
    sendRef,
  );

  return (
    <div className={styles.glowWrap} data-testid="new-session-glow">
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
          placeholder={t("cesare.landing.placeholder")}
          disabled={isDisabled}
          rows={1}
          aria-label={t("cesare.landing.messageAria")}
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
