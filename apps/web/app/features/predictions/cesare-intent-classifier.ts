// Semantic intent classifier for the Cesare agentic loop.
//
// Why this file exists:
//   The model (Sonnet) is perfectly capable of producing a v2 of the
//   screenplay translated to English, set in a Michelin-starred restaurant,
//   or rewritten as a noir. The problem isn't capability — it's *control
//   flow*. By default the model writes the new Fountain inline in chat
//   instead of calling `propose_screenplay_revision`, which would create a
//   proper DRAFT in `screenplay_versions` and surface a diff to the user.
//
//   A regex on the user message ("scrivi v2", "riscrivi") would never
//   generalise to "traduci in inglese", "in 5 atti", "tutto al femminile",
//   "in italiano del '600". So we ask a small/cheap LLM (Haiku) to classify
//   the intent and emit a tight JSON object. The result drives the
//   `tool_choice` of the main tool loop — when the classifier is confident,
//   the API forces the model to use the right tool.
//
//   Costs: ~$0.0001 per turn (Haiku, ~200 input tokens, JSON-only output).
//   Negligible compared to the determinism gained.
//
//   Falls back to "auto" silently on any error / low confidence — the
//   user-visible behaviour is "best effort", never blocking.
//
// The deterministic half (intent catalogue, prompts, intent→tool mapping,
// JSON parsing, availability gating) lives in cesare-intent-rules.ts — a
// dependency-free module shared with the unit tests and the real-AI smokes
// (BUG-N67). This file only owns the Haiku I/O.

import { ResultAsync } from "neverthrow";
import { callHaiku, extractText } from "~/features/ai";
import { HAIKU_MODEL } from "./cesare-model-router";
import { CesareError } from "./cesare.errors";
import {
  NO_OP_INTENT,
  parseIntentJson,
  promptForPage,
  resolveSuggestedTool,
  type IntentResult,
  type IntentType,
} from "./cesare-intent-rules";

export type { IntentResult, IntentType };

export interface ClassifyOpts {
  readonly userMessage: string;
  readonly page: string;
  /** Names of the propose_* tools available on the current page. The
   *  classifier only forces a tool that is actually registered. */
  readonly availableTools: ReadonlySet<string>;
}

/**
 * Classify the user's last message into an intent bucket.
 * Returns `suggestedTool` only when the intent maps to a registered generation
 * or mutation tool and confidence clears the threshold.
 *
 * Uses callHaiku internally — no raw Anthropic SDK client needed.
 */
export const classifyIntent = (
  opts: ClassifyOpts,
): ResultAsync<IntentResult, CesareError> => {
  // Run the classifier on the screenplay page (screenplay mutations) and on the
  // narrative document pages (document generation — Bug #4). On any other page
  // (budget, schedule, locations) tool adherence is already good thanks to the
  // narrower scope, so we skip the extra Haiku call and let "auto" choose.
  const systemPrompt = promptForPage(opts.page);
  if (!systemPrompt) {
    return ResultAsync.fromSafePromise(Promise.resolve(NO_OP_INTENT));
  }

  // MOCK_AI escape hatch: the scripted client matches scenarios on the
  // user text, so calling it for classification would consume the first
  // scripted turn meant for the main tool loop. Skip the classifier and
  // let the loop run with tool_choice: "auto".
  if (process.env["MOCK_AI"] === "true") {
    return ResultAsync.fromSafePromise(Promise.resolve(NO_OP_INTENT));
  }

  return callHaiku(
    {
      system: systemPrompt,
      fewShot: [],
      user: opts.userMessage.slice(0, 800),
      model: HAIKU_MODEL,
      maxTokens: 100,
    },
    "cesare.intent-classifier",
  )
    .mapErr((e) => new CesareError(`intent classifier failed: ${e.message}`))
    .map((result) => {
      const text = extractText(result.content);
      if (!text) return NO_OP_INTENT;

      const parsed = parseIntentJson(text);
      if (!parsed) return NO_OP_INTENT;

      return resolveSuggestedTool(parsed, opts.availableTools);
    });
};
