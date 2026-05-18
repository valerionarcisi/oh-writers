/**
 * Mock framework for the Cesare agentic tool loop.
 *
 * Activated only when `process.env.MOCK_AI === "true"`. Provides a deterministic
 * drop-in replacement for the Anthropic SDK client. The real tool executors run
 * unchanged — only the LLM brain is faked.
 *
 * How scenarios are picked:
 * - The mock matches the *last user message* against each scenario's `match`
 *   pattern, in order. The first hit wins.
 * - Each scenario describes a sequence of LLM turns: a turn either emits
 *   `tool_use` blocks (the loop will execute them and call back) or emits text
 *   and ends the conversation.
 *
 * Per-conversation turn tracking:
 * - The mock keeps a Map<conversationKey, turnIndex>. The conversation key is
 *   built from the last user-message text. Each subsequent call within the
 *   same tool loop advances the index. When the index runs past the scenario
 *   length, the mock returns an end_turn with a generic acknowledgement so the
 *   loop terminates safely.
 *
 * Placeholder substitution:
 * - Tool inputs may include `{{KEY}}` placeholders. The mock substitutes them
 *   from the module-level context map set via `setMockContext()`. Tests call
 *   this through a dedicated test-only server function before each scenario.
 */

// Local block shapes — kept independent from anthropic-client.ts so the mock
// can decorate tool_use blocks with the required `id` field that
// runGenericToolLoop reads via `block.id`.
interface MockTextBlock {
  readonly type: "text";
  readonly text: string;
}
interface MockToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}
type MockContentBlock = MockTextBlock | MockToolUseBlock;

// ─── Public mock context API ──────────────────────────────────────────────────

let MOCK_CONTEXT: Record<string, string> = {};

export const setMockContext = (ctx: Record<string, string>): void => {
  MOCK_CONTEXT = { ...ctx };
};

export const getMockContext = (): Readonly<Record<string, string>> =>
  MOCK_CONTEXT;

export const clearMockContext = (): void => {
  MOCK_CONTEXT = {};
};

// ─── Scenario shape ───────────────────────────────────────────────────────────

export interface MockToolUseEmission {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface MockTurn {
  readonly tool_uses?: ReadonlyArray<MockToolUseEmission>;
  readonly text?: string;
  readonly stop_reason: "tool_use" | "end_turn";
}

export interface MockScenario {
  readonly match: string | RegExp;
  readonly turns: ReadonlyArray<MockTurn>;
}

// ─── Default scenario library (one per feature) ───────────────────────────────

export const MOCK_SCENARIOS: ReadonlyArray<MockScenario> = [
  // Locations — search_places + add_candidate flow
  {
    match: /trova candidati|trova location|cerca candidat|trova una piazza|trova due bar|cerca ristorant|trova un|trova locand|trova ristorant/i,
    turns: [
      {
        tool_uses: [
          {
            name: "add_candidate",
            input: {
              requirement_id: "{{REQ_ID}}",
              name: "Ristorante Da Cesare",
              address: "Via Roma 42, Roma",
              lat: 41.9028,
              lng: 12.4964,
              notes:
                "Vetrata sulla strada, luce notturna calda. Adatto alla scena del dialogo.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiunto 1 candidato trovato. Verifica la vetrata e la luce notturna sul posto.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — expand_section
  {
    match: /espandi la sezione|espandi atto|sviluppa la sezione|espandi sezione|espandi il secondo atto|espandi atto ii/i,
    turns: [
      {
        tool_uses: [
          {
            name: "expand_section",
            input: { heading: "Atto II" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho espanso la sezione Atto II con due paragrafi aggiuntivi. Il documento è stato aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — compress_section
  {
    match: /accorcia|riassumi|comprimi/i,
    turns: [
      {
        tool_uses: [
          {
            name: "compress_section",
            input: { heading: "Atto II", target_words: 120 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho compresso la sezione mantenendo i beat chiave. Documento aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Breakdown — estimate_scene_cost
  {
    match: /stima il costo della scena|costo della scena|stima costo/i,
    turns: [
      {
        tool_uses: [
          {
            name: "estimate_scene_cost",
            input: { scene_number: "{{SCENE_NUMBER:number}}" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Costo stimato per la scena: circa €4.200/giornata. Difficoltà bassa. La spesa principale è il cast.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Schedule — move_scene_to_day
  {
    match: /sposta la scena .* al giorno|sposta scena .* giorno/i,
    turns: [
      {
        tool_uses: [
          {
            name: "move_scene_to_day",
            input: {
              scene_number: "{{SCENE_NUMBER:number}}",
              target_day: "{{TARGET_DAY:number}}",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho spostato la scena al giorno richiesto. Lo schedule è stato aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — update_budget_line (decrease)
  {
    match: /abbassa la voce|riduci la voce|abbassa la riga|diminuisci la voce/i,
    turns: [
      {
        tool_uses: [
          {
            name: "update_budget_line",
            input: {
              line_id: "{{BUDGET_LINE_ID}}",
              field: "rate",
              value: "{{NEW_RATE:number}}",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato la voce: il rate è stato modificato. Verifica il totale aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },
];

// ─── Internal: placeholder substitution ───────────────────────────────────────

const PLACEHOLDER_RE = /^\{\{([A-Z0-9_]+)(?::([a-z]+))?\}\}$/;

const substituteValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const match = PLACEHOLDER_RE.exec(value);
  if (!match) return value;
  const key = match[1]!;
  const coerceTo = match[2];
  const resolved = MOCK_CONTEXT[key];
  if (resolved === undefined) {
    // Leave the placeholder visible so the tool surface fails loudly
    // rather than silently passing a literal "{{REQ_ID}}" to the DB.
    return value;
  }
  if (coerceTo === "number") {
    const n = Number(resolved);
    return Number.isFinite(n) ? n : resolved;
  }
  return resolved;
};

const substituteInput = (
  input: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = substituteValue(v);
  }
  return out;
};

// ─── Internal: turn tracking ──────────────────────────────────────────────────

const TURN_INDEX = new Map<string, number>();

const conversationKeyFor = (messages: ReadonlyArray<unknown>): string => {
  // Use the first user message as the conversation key. The same key is hit
  // again on each follow-up call within a single tool loop, so we advance the
  // index per call.
  for (const m of messages) {
    if (
      typeof m === "object" &&
      m !== null &&
      (m as { role?: string }).role === "user"
    ) {
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") return content.toLowerCase();
      // For tool_result follow-ups the user content is an array. Fall back to
      // the first user-text message instead by continuing the loop.
    }
  }
  return "<empty>";
};

const lastUserText = (messages: ReadonlyArray<unknown>): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      typeof m === "object" &&
      m !== null &&
      (m as { role?: string }).role === "user"
    ) {
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") return content;
    }
  }
  return "";
};

const findScenario = (text: string): MockScenario | null => {
  for (const scenario of MOCK_SCENARIOS) {
    const match = scenario.match;
    if (match instanceof RegExp ? match.test(text) : text.toLowerCase().includes(match.toLowerCase())) {
      return scenario;
    }
  }
  return null;
};

// ─── Mock client factory ──────────────────────────────────────────────────────

interface AnthropicResponse {
  content: MockContentBlock[];
  stop_reason: string | null;
}

interface MockAnthropicMessagesClient {
  readonly messages: {
    create(args: Record<string, unknown>): Promise<AnthropicResponse>;
  };
}

const FALLBACK_TEXT =
  "Ho letto la tua richiesta ma non ho strumenti specifici da invocare per questo caso.";

let TOOL_USE_COUNTER = 0;
const nextToolUseId = (): string => {
  TOOL_USE_COUNTER += 1;
  return `mock_tool_use_${TOOL_USE_COUNTER}`;
};

const turnToBlocks = (turn: MockTurn): MockContentBlock[] => {
  const blocks: MockContentBlock[] = [];
  if (turn.text && turn.text.length > 0) {
    blocks.push({ type: "text", text: turn.text });
  }
  if (turn.tool_uses && turn.tool_uses.length > 0) {
    for (const tu of turn.tool_uses) {
      blocks.push({
        type: "tool_use",
        id: nextToolUseId(),
        name: tu.name,
        input: substituteInput(tu.input),
      });
    }
  }
  return blocks;
};

export const createMockAnthropicClient = (): MockAnthropicMessagesClient => ({
  messages: {
    create: async (
      args: Record<string, unknown>,
    ): Promise<AnthropicResponse> => {
      const messages =
        (args["messages"] as ReadonlyArray<unknown> | undefined) ?? [];
      const userText = lastUserText(messages);
      const key = conversationKeyFor(messages);
      const scenario = findScenario(userText);

      if (!scenario) {
        TURN_INDEX.delete(key);
        return {
          content: [{ type: "text", text: FALLBACK_TEXT }],
          stop_reason: "end_turn",
        };
      }

      const idx = TURN_INDEX.get(key) ?? 0;
      const turn = scenario.turns[idx];

      if (!turn) {
        TURN_INDEX.delete(key);
        return {
          content: [
            { type: "text", text: scenario.turns.at(-1)?.text ?? FALLBACK_TEXT },
          ],
          stop_reason: "end_turn",
        };
      }

      TURN_INDEX.set(key, idx + 1);
      const content = turnToBlocks(turn);

      // If this is the final turn for the scenario, reset the counter so the
      // next time the same prompt arrives the scenario restarts from turn 0.
      if (idx + 1 >= scenario.turns.length) {
        TURN_INDEX.delete(key);
      }

      return {
        content,
        stop_reason: turn.stop_reason,
      };
    },
  },
});

// ─── Streaming client (used by callCesare for non-agentic pages) ──────────────

interface MockMessageStream {
  on(event: "inputJson", listener: (delta: string) => void): MockMessageStream;
  finalMessage(): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

interface MockStreamingMessagesClient {
  readonly messages: {
    stream(args: Record<string, unknown>): MockMessageStream;
  };
}

const STREAMING_FALLBACK_TEXT =
  "Ho ricevuto la tua richiesta e ho analizzato il contesto del progetto. Cosa vuoi fare?";

export const createMockStreamingClient = (): MockStreamingMessagesClient => ({
  messages: {
    stream: (args: Record<string, unknown>): MockMessageStream => {
      const messages =
        (args["messages"] as ReadonlyArray<unknown> | undefined) ?? [];
      const userText = lastUserText(messages);
      const scenario = findScenario(userText);
      const replyText =
        scenario?.turns.find((t) => t.text)?.text ?? STREAMING_FALLBACK_TEXT;
      const stream: MockMessageStream = {
        on: () => stream,
        finalMessage: async () => ({
          content: [{ type: "text", text: replyText }],
        }),
      };
      return stream;
    },
  },
});
