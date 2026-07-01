import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { okAsync } from "neverthrow";
import type { HaikuResult } from "~/features/ai";

// The classifier calls the neverthrow `callHaiku` from `~/features/ai`. We stub
// it so the test is deterministic and offline: it returns whatever JSON the
// current scenario sets. `extractText` is the real implementation re-exported.
const callHaikuMock = vi.fn();

vi.mock("~/features/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/features/ai")>();
  return {
    ...actual,
    callHaiku: (...args: unknown[]) => callHaikuMock(...args),
  };
});

import { classifyIntent } from "./cesare-intent-classifier";

const haikuJson = (json: string): HaikuResult => ({
  content: [{ type: "text", text: json }],
  stopReason: "end_turn",
});

const DOC_TOOLS = new Set([
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
  "generate_screenplay_from_narrative",
]);

const SCREENPLAY_TOOLS = new Set([
  "propose_screenplay_revision",
  "rewrite_scene",
]);

beforeEach(() => {
  callHaikuMock.mockReset();
  // The classifier short-circuits under MOCK_AI; force the real path so the
  // stubbed callHaiku is exercised.
  vi.stubEnv("MOCK_AI", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyIntent — page routing (Bug #4)", () => {
  it("is a no-op on a page with no classifier prompt (budget)", async () => {
    const result = await classifyIntent({
      userMessage: "abbassa la voce del catering",
      page: "budget",
      availableTools: DOC_TOOLS,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    expect(callHaikuMock).not.toHaveBeenCalled();
  });

  it("is a no-op under MOCK_AI even on a classifier page", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const result = await classifyIntent({
      userMessage: "scrivimi una logline su un detective",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    expect(callHaikuMock).not.toHaveBeenCalled();
  });
});

describe("classifyIntent — document generation intents (Bug #4)", () => {
  it("maps a free logline request to write_logline on a document page", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_logline","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "scrivimi una logline su un detective che non dorme",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe("write_logline");
  });

  it("maps a free summary request to the synopsis generator", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_synopsis","confidence":0.9}')),
    );
    const result = await classifyIntent({
      userMessage: "fai un riassunto di cosa abbiamo scritto finora",
      page: "synopsis",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_synopsis_from_screenplay",
    );
  });

  it("maps a soggetto-from-logline request to propose_soggetto_v2", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_soggetto","confidence":0.92}')),
    );
    const result = await classifyIntent({
      userMessage: "genera il soggetto dalla logline",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe("propose_soggetto_v2");
  });

  it("maps a treatment request to propose_treatment_from_narrative (F-A2)", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_treatment","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "scrivi il trattamento dalla scaletta",
      page: "treatment",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_treatment_from_narrative",
    );
  });

  it("maps a screenplay-from-narrative request to generate_screenplay_from_narrative (BUG-N67)", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_screenplay","confidence":0.96}')),
    );
    const result = await classifyIntent({
      userMessage:
        "partendo dal soggetto attivo scrivimi la prima stesura della sceneggiatura",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "generate_screenplay_from_narrative",
    );
  });

  it("does NOT force a tool for a genuine chat question", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"question","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "di cosa parla la storia?",
      page: "soggetto",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });

  it("does NOT force a tool below the confidence threshold", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.4}')),
    );
    const result = await classifyIntent({
      userMessage: "forse una scaletta?",
      page: "outline",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });

  it("does NOT force a tool absent from availableTools", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "fammi la scaletta",
      page: "outline",
      // Outline generator deliberately not in the set.
      availableTools: new Set(["write_logline"]),
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });
});

describe("classifyIntent — screenplay intents still work", () => {
  it("maps a macro rewrite to propose_screenplay_revision", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"macro_rewrite","confidence":0.95}')),
    );
    const result = await classifyIntent({
      userMessage: "traduci tutta la sceneggiatura in inglese",
      page: "screenplay",
      availableTools: SCREENPLAY_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_screenplay_revision",
    );
  });
});

// ─── R3 — broad reliability table ─────────────────────────────────────────────
//
// A Cesare-only writer phrases a write/edit request a hundred different ways, and
// in a SESSION the shell resolves the page to "screenplay" by default
// (`deriveCesarePage`). So the classifier on the screenplay page must dispatch the
// document generators too. This table proves that the FULL intent→tool mapping is
// correct for every entity (write + derive + edit) and that genuine questions and
// borderline-confidence input never force a tool.
//
// The Haiku model is stubbed: each row gives the (type, confidence) the model is
// expected to emit for that phrasing and asserts the resulting tool. The
// breadth-of-phrasing-per-intent guarantee on the real model lives in the prompt's
// few-shot examples; the MOCK_AI deterministic mapping lives in the mock regexes
// exercised by the E2E suite. Here we lock down the mapping + gating logic.

// Mirrors production `SCREENPLAY_PAGE_CLASSIFIER_TOOLS` (cesare.server.ts): on the
// screenplay/session page the classifier may force either a screenplay propose_*
// tool or a document generator.
const SESSION_PAGE_TOOLS = new Set([
  ...SCREENPLAY_TOOLS,
  "propose_screenplay_revision",
  "propose_rename_entity",
  "merge_scenes",
  "delete_scene",
  ...DOC_TOOLS,
]);

interface IntentRow {
  readonly phrasing: string;
  readonly type: string;
  readonly confidence: number;
  readonly expectedTool: string;
}

// Write / derive / edit phrasings per narrative entity. Each row is a distinct
// natural Italian phrasing; the expected intent is what the prompt teaches the
// model to emit, and the expected tool is what TOOL_BY_INTENT resolves.
const DOC_INTENT_ROWS: ReadonlyArray<IntentRow> = [
  // ── logline: write ──
  {
    phrasing: "scrivimi una logline su un detective insonne",
    type: "write_logline",
    confidence: 0.95,
    expectedTool: "write_logline",
  },
  {
    phrasing: "buttami giù la logline",
    type: "write_logline",
    confidence: 0.9,
    expectedTool: "write_logline",
  },
  {
    phrasing: "abbozzami una logline",
    type: "write_logline",
    confidence: 0.88,
    expectedTool: "write_logline",
  },
  {
    phrasing: "metti giù la logline dallo spunto",
    type: "write_logline",
    confidence: 0.9,
    expectedTool: "write_logline",
  },
  {
    phrasing: "dammi una logline",
    type: "write_logline",
    confidence: 0.85,
    expectedTool: "write_logline",
  },
  {
    phrasing: "sviluppa la logline",
    type: "write_logline",
    confidence: 0.82,
    expectedTool: "write_logline",
  },
  // ── logline: edit ──
  {
    phrasing: "rendi la logline più tesa",
    type: "write_logline",
    confidence: 0.9,
    expectedTool: "write_logline",
  },
  {
    phrasing: "accorcia la logline",
    type: "write_logline",
    confidence: 0.85,
    expectedTool: "write_logline",
  },
  {
    phrasing: "cambia il protagonista della logline",
    type: "write_logline",
    confidence: 0.88,
    expectedTool: "write_logline",
  },
  // ── soggetto: write + derive + edit ──
  {
    phrasing: "scrivi il soggetto",
    type: "write_soggetto",
    confidence: 0.92,
    expectedTool: "propose_soggetto_v2",
  },
  {
    phrasing: "buttami giù il soggetto",
    type: "write_soggetto",
    confidence: 0.88,
    expectedTool: "propose_soggetto_v2",
  },
  {
    phrasing: "genera il soggetto dalla logline",
    type: "write_soggetto",
    confidence: 0.95,
    expectedTool: "propose_soggetto_v2",
  },
  {
    phrasing: "dato lo spunto fammi il soggetto",
    type: "write_soggetto",
    confidence: 0.9,
    expectedTool: "propose_soggetto_v2",
  },
  {
    phrasing: "rendi il soggetto più asciutto",
    type: "write_soggetto",
    confidence: 0.9,
    expectedTool: "propose_soggetto_v2",
  },
  {
    phrasing: "fammi un v2 del soggetto",
    type: "write_soggetto",
    confidence: 0.92,
    expectedTool: "propose_soggetto_v2",
  },
  // ── sinossi: write + derive + summarise + edit ──
  {
    phrasing: "scrivimi la sinossi",
    type: "write_synopsis",
    confidence: 0.92,
    expectedTool: "propose_synopsis_from_screenplay",
  },
  {
    phrasing: "genera la sinossi dal soggetto",
    type: "write_synopsis",
    confidence: 0.95,
    expectedTool: "propose_synopsis_from_screenplay",
  },
  {
    phrasing: "fai un riassunto di cosa abbiamo scritto finora",
    type: "write_synopsis",
    confidence: 0.85,
    expectedTool: "propose_synopsis_from_screenplay",
  },
  {
    phrasing: "rendi la sinossi più commovente",
    type: "write_synopsis",
    confidence: 0.88,
    expectedTool: "propose_synopsis_from_screenplay",
  },
  // ── scaletta: write + derive ──
  {
    phrasing: "fammi la scaletta",
    type: "write_outline",
    confidence: 0.9,
    expectedTool: "propose_scaletta_from_soggetto",
  },
  {
    phrasing: "dato il soggetto fammi la scaletta",
    type: "write_outline",
    confidence: 0.95,
    expectedTool: "propose_scaletta_from_soggetto",
  },
  {
    phrasing: "dividi la storia in scene",
    type: "write_outline",
    confidence: 0.85,
    expectedTool: "propose_scaletta_from_soggetto",
  },
  // ── trattamento: write + derive + edit ──
  {
    phrasing: "scrivi il trattamento",
    type: "write_treatment",
    confidence: 0.92,
    expectedTool: "propose_treatment_from_narrative",
  },
  {
    phrasing: "genera il trattamento dalla scaletta",
    type: "write_treatment",
    confidence: 0.95,
    expectedTool: "propose_treatment_from_narrative",
  },
  {
    phrasing: "buttami giù il trattamento",
    type: "write_treatment",
    confidence: 0.88,
    expectedTool: "propose_treatment_from_narrative",
  },
  {
    phrasing: "espandi l'Atto II del trattamento",
    type: "write_treatment",
    confidence: 0.75,
    expectedTool: "propose_treatment_from_narrative",
  },
];

describe("classifyIntent — R3 broad document table (write + derive + edit)", () => {
  for (const row of DOC_INTENT_ROWS) {
    it(`dispatches "${row.phrasing}" → ${row.expectedTool} on a document page`, async () => {
      callHaikuMock.mockReturnValue(
        okAsync(
          haikuJson(`{"type":"${row.type}","confidence":${row.confidence}}`),
        ),
      );
      const result = await classifyIntent({
        userMessage: row.phrasing,
        page: "soggetto",
        availableTools: DOC_TOOLS,
      });
      expect(result._unsafeUnwrap().suggestedTool).toBe(row.expectedTool);
    });

    it(`dispatches "${row.phrasing}" → ${row.expectedTool} from a SESSION (page defaults to screenplay)`, async () => {
      callHaikuMock.mockReturnValue(
        okAsync(
          haikuJson(`{"type":"${row.type}","confidence":${row.confidence}}`),
        ),
      );
      const result = await classifyIntent({
        userMessage: row.phrasing,
        page: "screenplay",
        availableTools: SESSION_PAGE_TOOLS,
      });
      expect(result._unsafeUnwrap().suggestedTool).toBe(row.expectedTool);
    });
  }
});

// Screenplay mutation phrasings: a writer phrases a screenplay change many ways.
const SCREENPLAY_INTENT_ROWS: ReadonlyArray<IntentRow> = [
  {
    phrasing: "fammi una v2 più corta",
    type: "macro_rewrite",
    confidence: 0.9,
    expectedTool: "propose_screenplay_revision",
  },
  {
    phrasing: "ambienta tutto in un ristorante stellato",
    type: "macro_rewrite",
    confidence: 0.9,
    expectedTool: "propose_screenplay_revision",
  },
  {
    phrasing: "riscrivi la scena 3 più tesa",
    type: "rewrite_one_scene",
    confidence: 0.95,
    expectedTool: "rewrite_scene",
  },
  {
    phrasing: "unisci la 1 e la 2",
    type: "merge_scenes",
    confidence: 0.95,
    expectedTool: "merge_scenes",
  },
  {
    phrasing: "elimina la scena 5",
    type: "delete_scene",
    confidence: 0.97,
    expectedTool: "delete_scene",
  },
  {
    phrasing: "rinomina Marco in Luca",
    type: "rename",
    confidence: 0.98,
    expectedTool: "propose_rename_entity",
  },
  {
    // Spec 80 — a single-scene micro-edit now routes to the universal
    // rewrite_scene (whole-scene return, no fragile find/replace).
    phrasing: "cambia 'ciao' con 'salve' nella scena 3",
    type: "micro_edit",
    confidence: 0.9,
    expectedTool: "rewrite_scene",
  },
];

describe("classifyIntent — R3 broad screenplay table", () => {
  for (const row of SCREENPLAY_INTENT_ROWS) {
    it(`dispatches "${row.phrasing}" → ${row.expectedTool}`, async () => {
      callHaikuMock.mockReturnValue(
        okAsync(
          haikuJson(`{"type":"${row.type}","confidence":${row.confidence}}`),
        ),
      );
      const result = await classifyIntent({
        userMessage: row.phrasing,
        page: "screenplay",
        availableTools: SESSION_PAGE_TOOLS,
      });
      expect(result._unsafeUnwrap().suggestedTool).toBe(row.expectedTool);
    });
  }
});

// Genuine questions / comments must NEVER force a tool — they stay a chat answer.
// This is the guard against over-eager dispatch on a request that only asks
// ABOUT the work rather than asking to change it.
const QUESTION_ROWS: ReadonlyArray<{ phrasing: string; type: string }> = [
  { phrasing: "di cosa parla questo soggetto?", type: "question" },
  { phrasing: "il conflitto è chiaro?", type: "question" },
  { phrasing: "secondo te la scaletta funziona?", type: "question" },
  { phrasing: "chi è il protagonista?", type: "question" },
  { phrasing: "che ne pensi del finale?", type: "question" },
  { phrasing: "quante scene ci sono?", type: "question" },
  { phrasing: "il soggetto mi sembra debole", type: "comment" },
  { phrasing: "non mi convince Tea", type: "comment" },
];

describe("classifyIntent — R3 genuine questions stay in chat (no tool)", () => {
  for (const row of QUESTION_ROWS) {
    it(`does NOT dispatch a tool for "${row.phrasing}" on a document page`, async () => {
      callHaikuMock.mockReturnValue(
        okAsync(haikuJson(`{"type":"${row.type}","confidence":0.95}`)),
      );
      const result = await classifyIntent({
        userMessage: row.phrasing,
        page: "soggetto",
        availableTools: DOC_TOOLS,
      });
      expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    });

    it(`does NOT dispatch a tool for "${row.phrasing}" from a session`, async () => {
      callHaikuMock.mockReturnValue(
        okAsync(haikuJson(`{"type":"${row.type}","confidence":0.95}`)),
      );
      const result = await classifyIntent({
        userMessage: row.phrasing,
        page: "screenplay",
        availableTools: SESSION_PAGE_TOOLS,
      });
      expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
    });
  }
});

// Confidence gating: a clearly-actionable request at the new 0.55 threshold
// dispatches; a genuinely ambiguous one just below it does not.
describe("classifyIntent — R3 confidence gating", () => {
  it("dispatches at the new lowered threshold (0.55)", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.55}')),
    );
    const result = await classifyIntent({
      userMessage: "magari una scaletta",
      page: "outline",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBe(
      "propose_scaletta_from_soggetto",
    );
  });

  it("does NOT dispatch just below the threshold (ambiguous input stays auto)", async () => {
    callHaikuMock.mockReturnValue(
      okAsync(haikuJson('{"type":"write_outline","confidence":0.5}')),
    );
    const result = await classifyIntent({
      userMessage: "forse una scaletta? non so",
      page: "outline",
      availableTools: DOC_TOOLS,
    });
    expect(result._unsafeUnwrap().suggestedTool).toBeUndefined();
  });
});
