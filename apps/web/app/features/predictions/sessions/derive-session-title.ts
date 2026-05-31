// apps/web/app/features/predictions/sessions/derive-session-title.ts
// Spec 53 — derive a Notion-style session title from the first user message.
//
// Pure, no I/O: takes the raw first request and returns a short, one-line
// summary suitable as a session title. NO extra LLM call (cost discipline) —
// the summary is a deterministic truncation of the user's own words. The
// persistence side (renameSession / persistTurn) lives in the server fns.

// Target length of the derived title. We cap on a word boundary so the title
// reads as a clean clause, not a mid-word stump.
export const DERIVED_TITLE_MAX = 40;

// Collapse all runs of whitespace (incl. newlines/tabs) to single spaces and
// trim the ends, so a multi-line paste becomes one tidy line.
const normaliseWhitespace = (raw: string): string =>
  raw.replace(/\s+/g, " ").trim();

// Drop trailing terminal punctuation that reads poorly as a title ("?", "!",
// "...", "."). A leading "?" or interior punctuation is kept — we only tidy the
// tail. Done after the length cap so a truncated clause never keeps a dangling
// terminal mark either.
const stripTrailingPunctuation = (text: string): string =>
  text.replace(/[?!.…]+$/u, "").trimEnd();

// Cap to `max` characters on a word boundary: if the limit lands mid-word, back
// up to the last space so we never cut a word in half. When the first word
// already exceeds the limit (no space to back up to), hard-cut at `max`.
const capOnWordBoundary = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(" ");
  return lastSpace > 0 ? head.slice(0, lastSpace) : head;
};

/**
 * Derive a session title from the first user message.
 *
 * Pipeline: normalise whitespace → strip trailing terminal punctuation →
 * cap to ~40 chars on a word boundary → strip any trailing punctuation again.
 * Returns an empty string when the input is blank (caller decides what to do —
 * the server fn keeps the placeholder in that case).
 */
export const deriveSessionTitle = (firstMessage: string): string => {
  const normalised = normaliseWhitespace(firstMessage);
  if (normalised.length === 0) return "";
  const detailed = stripTrailingPunctuation(normalised);
  const capped = capOnWordBoundary(detailed, DERIVED_TITLE_MAX);
  return stripTrailingPunctuation(capped);
};
