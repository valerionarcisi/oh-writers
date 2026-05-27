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
//
// We persist the context in `process.env` (keys are namespaced with the
// `OHW_MOCK_CTX_` prefix). TanStack Start splits the codebase across separate
// Vinxi routers (api, ssr, client) — each router instantiates its own module
// graph, so module-level state set from the api router would not be visible
// to the ssr router where the Cesare tool loop runs. `process.env` is the
// only Node-global both routers share.

const ENV_PREFIX = "OHW_MOCK_CTX_";

export const setMockContext = (ctx: Record<string, string>): void => {
  // Clear previous entries first so two consecutive tests cannot pollute each
  // other.
  clearMockContext();
  for (const [k, v] of Object.entries(ctx)) {
    process.env[`${ENV_PREFIX}${k}`] = v;
  }
};

export const getMockContext = (): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith(ENV_PREFIX) && typeof v === "string") {
      out[k.slice(ENV_PREFIX.length)] = v;
    }
  }
  return out;
};

export const clearMockContext = (): void => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith(ENV_PREFIX)) {
      delete process.env[k];
    }
  }
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
  // Context engineering (spec 38) — verify setting prior injected + no Rome
  {
    match:
      /dove siamo ambientati|dove è ambientato il film|setting del film|film bible/i,
    turns: [
      {
        text: "Il film è ambientato in un ristorante di provincia nelle Marche. Non si tratta di Roma né di una grande città.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Locations — search_places + add_candidate flow
  {
    match:
      /trova candidati|trova location|cerca candidat|trova una piazza|trova due bar|cerca ristorant|trova un|trova locand|trova ristorant/i,
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
    match:
      /espandi la sezione|espandi atto|sviluppa la sezione|espandi sezione|espandi il secondo atto|espandi atto ii/i,
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

  // Budget — set_budget_cap (OHW-590)
  {
    match:
      /imposta tetto|imposta il tetto|fissa il tetto|metti un tetto|metti un cap|non superare/i,
    turns: [
      {
        tool_uses: [
          {
            name: "set_budget_cap",
            input: {
              scope: { kind: "global" },
              amount_cents: 5000000,
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho impostato il tetto budget globale a €50.000.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — evaluate_against_cap (OHW-591)
  {
    match:
      /siamo nel budget|siamo dentro budget|quanto rimane|residuo budget|quanto manca al tetto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "evaluate_against_cap",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Stato budget: rispetto al tetto restano circa €12.000 di residuo. Sei dentro il limite.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — propose_excessive_lines_flags (OHW-592)
  {
    match:
      /voci eccessive|voci troppo costose|cosa costa troppo|cosa sfora di piu|voci anomale/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_excessive_lines_flags",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho trovato alcune voci sopra la media di categoria. Verifica le righe segnalate: decidi tu se ridurle.",
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

  // Cost-foundation — read_scene lazy-RAG (OHW-561)
  // Triggered by a question about a specific scene's dialogue. The first
  // turn invokes the read_scene tool; the second turn cites a string from
  // the seeded scene 1 notes so the spec can assert on it.
  {
    match:
      /che dice john nella scena|cosa dice john nella scena|john nella scena 1|dialogo della scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "read_scene",
            input: { scene_number: 1 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Nella scena 1 John dice: \"Non avrei mai dovuto tornare in questo posto.\" È un'apertura che pesa: regret prima dell'azione.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_logline_from_screenplay (OHW-575)
  {
    match:
      /genera la logline|generare la logline|scrivimi la logline|scrivimi una logline|fammi una logline/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_logline_from_screenplay",
            input: { instruction: "più commerciale" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho generato una logline draft. Vai sulla pagina logline per accettarla o scartarla dal banner sopra l'editor.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_synopsis_from_screenplay (OHW-576)
  {
    match: /scrivimi la sinossi|genera la sinossi|fammi la sinossi/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_synopsis_from_screenplay",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho generato una sinossi draft. Vai sulla pagina sinossi per accettarla o scartarla dal banner sopra l'editor.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_soggetto_v2 (OHW-577)
  {
    match:
      /v2 del soggetto|riscrivi il soggetto|fammi un v2|soggetto piu asciutto|soggetto più asciutto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_soggetto_v2",
            input: {
              instruction: "più asciutto e tematico",
              label: "v2 asciutto",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho generato una bozza v2 del soggetto. La trovi nel banner sopra l'editor del soggetto, puoi confrontarla, promuoverla o scartarla.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_scaletta_from_soggetto (OHW-578)
  {
    match:
      /dato il soggetto fammi la scaletta|genera la scaletta dal soggetto|fammi la scaletta dal soggetto|scaletta dal soggetto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_scaletta_from_soggetto",
            input: { target_scene_count: 10 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho generato una scaletta draft dal soggetto. Vai sulla pagina scaletta per confrontarla e promuoverla.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Cost-foundation — short acknowledgement loop (OHW-562)
  // Matches a bare "ok" so we can drive the multi-turn cached-context test
  // without colliding with the other scenarios above. Each request returns
  // a one-line text turn and ends.
  {
    match: /^\s*ok\s*$/i,
    turns: [
      {
        text: "Ok, dimmi pure il prossimo passo.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_screenplay_edit (OHW-570).
  // "Rendi questa scena più tesa." → micro-edit on scene 1 of the team
  // screenplay (fountain seed: "Si accende una sigaretta."). The replace
  // string contains "le mani che tremano" so the spec assertion on the
  // post-accept fountain hits.
  {
    match:
      /rendi questa scena|rendi la scena|più tesa|piu tesa|più tensione|piu tensione/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_screenplay_edit",
            input: {
              scene_number: 1,
              find: "Si accende una sigaretta.",
              replace: "Si accende una sigaretta con le mani che tremano.",
              reason: "Aggiunge tensione fisica al gesto.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una proposta di modifica sulla scena 1. Vai sull'editor: l'overlay ✓/✕ ti permette di accettarla o scartarla.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_screenplay_revision (OHW-571).
  // "Fammi una v2 più corta." → macro rewrite of the whole screenplay,
  // creates a DRAFT version. The reply mentions "v2" so the spec text
  // assertion (/preparat|v2|versione|draft|diff/) hits.
  {
    match:
      /fammi una v2|v2 più corta|v2 piu corta|riscrivi più corta|riscrivi piu corta|tutto in una stanza/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_screenplay_revision",
            input: {
              scope: { kind: "whole_screenplay" },
              instruction: "più corta, mantieni i beat chiave",
              label: "V2 — più corta",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una v2 draft della sceneggiatura. Apri il diff dal banner sopra l'editor per confrontarla con la versione corrente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_rename_entity (OHW-572).
  // "Rinomina Giulio in Lucia." → whole-word rename on the screenplay.
  // The fountain seed has many GIULIO occurrences so the tool returns
  // multiple proposed_edits and the PM plugin decorates each match.
  {
    match: /rinomina|rinominare|cambia nome|sostituisci .* con/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_rename_entity",
            input: {
              kind: "character",
              from: "Giulio",
              to: "Lucia",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato la proposta di rinomina: trovate diverse occorrenze del personaggio. Accetta in blocco dall'overlay sull'editor.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Spec 39 — verify read_scene skill is active on locations page [OHW-039e]
  // When the user asks about a scene from the locations context, Cesare must
  // call read_scene to fetch the body — confirming the read-scene skill is
  // selected by the V2 registry for the locations page.
  {
    match: /dimmi cosa succede nella scena 1|cosa succede nella scena 1|racconta la scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "read_scene",
            input: { scene_number: 1 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Nella scena 1 si vede John che entra nel ristorante. È una scena di apertura con forte tensione emotiva.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Shooting plan — propose_blocking_for_scene (OHW-580).
  // The real executor loads scene + cast and (in MOCK_AI=true) short-circuits
  // to parseCesareBlockingResponse with an empty LLM response, falling back
  // to a small demo proposal so the ghost UI still renders. We intentionally
  // omit `scene_id` from the tool input: the executor falls back to
  // ShootingPlanToolContext.activeSceneId, which the page sets via
  // setActiveScene() when the user picks a scene from the sidebar. That keeps
  // the test free of any setMockContext({ SCENE_ID }) bootstrap.
  {
    match:
      /suggerisci blocking|proponi blocking|proponi un blocking|dove metto attori|disposizione blocking|proposta blocking/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_blocking_for_scene",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una proposta di blocking: rivedi i ghost-pin sull'editor e accetta quelli che convincono.",
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
  const resolved = process.env[`${ENV_PREFIX}${key}`];
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
    if (
      match instanceof RegExp
        ? match.test(text)
        : text.toLowerCase().includes(match.toLowerCase())
    ) {
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
            {
              type: "text",
              text: scenario.turns.at(-1)?.text ?? FALLBACK_TEXT,
            },
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
