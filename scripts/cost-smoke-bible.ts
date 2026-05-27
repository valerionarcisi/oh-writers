/**
 * cost-smoke-bible — measures the real cost of Film Bible distillation via
 * Sonnet 4.6 (spec 38). Runs 2 real distillations and logs token usage.
 *
 * NOT for CI. Run ad-hoc when you change the distillation prompt or tool shape.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:bible
 *
 * Pricing reference (Sonnet 4.6): $3.00 / M input, $15.00 / M output
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const require = createRequire(
  path.join(REPO_ROOT, "apps", "web", "package.json"),
);

interface AnthropicUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}
interface AnthropicResponse {
  readonly content: ReadonlyArray<{
    type: string;
    name?: string;
    input?: unknown;
  }>;
  readonly usage?: AnthropicUsage;
}
interface AnthropicCtor {
  new (config: { apiKey: string }): {
    messages: {
      create(args: Record<string, unknown>): Promise<AnthropicResponse>;
    };
  };
}

const loadAnthropic = (): AnthropicCtor => {
  const sdk = require("@anthropic-ai/sdk") as {
    default?: AnthropicCtor;
  } & AnthropicCtor;
  return (sdk.default ?? sdk) as AnthropicCtor;
};

const EMIT_TOOL_NAME = "emit_film_bible";
const EMIT_TOOL = {
  name: EMIT_TOOL_NAME,
  description: "Emit the distilled Film Bible for the project.",
  input_schema: {
    type: "object",
    properties: {
      settingSummary: { type: "string" },
      genreAndTone: { type: "string" },
      centralConflict: { type: "string" },
      productionConstraints: { type: "array", items: { type: "string" } },
      recurringLocations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            canonicalName: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            locationType: { type: "string" },
            sceneCount: { type: "integer" },
            settingPrior: { type: "string" },
          },
          required: [
            "canonicalName",
            "aliases",
            "locationType",
            "sceneCount",
            "settingPrior",
          ],
        },
      },
      keyCharacters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            arc: { type: ["string", "null"] },
          },
          required: ["name", "role", "arc"],
        },
      },
    },
    required: [
      "settingSummary",
      "genreAndTone",
      "centralConflict",
      "productionConstraints",
      "recurringLocations",
      "keyCharacters",
    ],
  },
};

const SYSTEM_PROMPT = `You are a senior script editor and production analyst.
Synthesise a Film Bible from scene summaries and narrative documents.
Group sibling set names into one recurring location (Bancone/Sala/Cucina → restaurant).
The settingPrior must be specific: city, region, type.`;

const TEST_INPUTS = [
  {
    label: "Non fa ridere — 3 scene summaries + soggetto",
    userMessage: `PROGETTO:
Titolo: Non fa ridere
Genere: comedy
Formato: feature
Logline: Un oste burbero delle Marche si ritrova a gestire una disastrosa serata di cabaret.

SCENE SUMMARIES:
## Scena 1: INT. RISTORANTE DA DANTE - BANCONE - GIORNO
Setting: Counter of a small provincial restaurant in the Marche region
Orario: GIORNO
Personaggi: DANTE, FILIPPO
Azioni principali:
  - Filippo arrives with news about the comedian
  - Dante is skeptical

## Scena 2: INT. RISTORANTE DA DANTE - SALA - SERA
Setting: Dining room of the same restaurant
Orario: SERA
Personaggi: DANTE, FILIPPO, TEA
Azioni principali:
  - Service preparation
  - Tension around the evening show

## Scena 3: INT. RISTORANTE DA DANTE - CUCINA - NOTTE
Setting: Kitchen of the same restaurant
Orario: NOTTE
Personaggi: DANTE
Note produzione:
  - Open flame gas range

NARRATIVE DOCUMENTS:
[SOGGETTO]
"Non fa ridere" è ambientato a Falerone, piccolo paese nelle Marche.
Dante gestisce un ristorante di provincia ereditato dal padre.
Un sabato sera decide di organizzare una serata con un comico per attirare clienti.
Il comico scelto da Filippo, il cameriere, non fa ridere nessuno.
Il film esplora l'imbarazzo, la dignità e la resilienza provinciale.`,
  },
  {
    label:
      "Non fa ridere — second distillation (fingerprint change simulation)",
    userMessage: `PROGETTO:
Titolo: Non fa ridere
Genere: comedy
Formato: feature
Logline: Un oste burbero delle Marche si ritrova a gestire una disastrosa serata di cabaret.

SCENE SUMMARIES:
(same as first run — simulating a minimal fingerprint change for cache hit measurement)

## Scena 1: INT. RISTORANTE DA DANTE - BANCONE - GIORNO
Setting: Counter area of a small restaurant

NARRATIVE DOCUMENTS:
[SOGGETTO]
Film ambientato a Falerone, Marche.`,
  },
];

interface RunResult {
  readonly label: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
  readonly costCents: number;
}

async function runBibleSmoke(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  const results: RunResult[] = [];

  for (const input of TEST_INPUTS) {
    console.log(`\nRunning: ${input.label}`);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EMIT_TOOL],
      tool_choice: { type: "tool", name: EMIT_TOOL_NAME },
      messages: [{ role: "user", content: input.userMessage }],
    });

    const u = response.usage ?? {};
    const inputTokens = u.input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheCreation = u.cache_creation_input_tokens ?? 0;

    // Sonnet pricing: $3/M input, $15/M output, $0.30/M cache read
    const costCents =
      ((inputTokens * 3.0 + cacheCreation * 3.75 + cacheRead * 0.3) /
        1_000_000 +
        (outputTokens * 15.0) / 1_000_000) *
      100;

    console.log(
      `  input=${inputTokens} output=${outputTokens} cache_read=${cacheRead} cache_creation=${cacheCreation} cost≈$${(costCents / 100).toFixed(5)}`,
    );

    results.push({
      label: input.label,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheCreation,
      costCents,
    });

    // Short pause between calls to allow cache TTL to register
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const totalCost = results.reduce((s, r) => s + r.costCents, 0);

  const report = [
    `# Cost Smoke — Film Bible Distillation (spec 38)`,
    `Date: ${new Date().toISOString()}`,
    `Model: claude-sonnet-4-6`,
    "",
    "| Run | Input | Output | Cache Read | Cache Creation | Cost |",
    "|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.label.slice(0, 40)} | ${r.inputTokens} | ${r.outputTokens} | ${r.cacheRead} | ${r.cacheCreation} | $${(r.costCents / 100).toFixed(5)} |`,
    ),
    "",
    `**Total**: $${(totalCost / 100).toFixed(4)} for ${results.length} distillations.`,
    "",
    "## Notes",
    "- Bible distillation runs once per fingerprint change (lazy).",
    "- Subsequent Cesare calls read the cached [FILM BIBLE] block (cache_read_input_tokens ≈ 90% of bible tokens).",
    "- Expected per-session amortised cost: <$0.001 (bible cached after first call).",
  ].join("\n");

  const outDir = path.join(REPO_ROOT, "vernissage", "context-engineering");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `bible-cost-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  );
  await writeFile(outFile, report, "utf8");
  console.log(`\nReport written to: ${outFile}`);
  console.log(`Total cost: $${(totalCost / 100).toFixed(4)}`);
}

runBibleSmoke().catch((e) => {
  console.error(e);
  process.exit(1);
});
