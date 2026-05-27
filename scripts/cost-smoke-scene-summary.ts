/**
 * cost-smoke-scene-summary — measures the real cost of generating scene summaries
 * via Haiku (spec 38). Runs 3 real scene-summary calls and logs token usage.
 *
 * NOT for CI. Run ad-hoc when you change the scene-summary prompt or tool shape.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:scene-summary
 *
 * Pricing reference (Haiku 4.x): $1.00 / M input, $5.00 / M output
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

const EMIT_TOOL_NAME = "emit_scene_summary";
const EMIT_TOOL = {
  name: EMIT_TOOL_NAME,
  description: "Emit a structured summary of the screenplay scene.",
  input_schema: {
    type: "object",
    properties: {
      sceneNumber: { type: "integer" },
      heading: { type: "string" },
      settingDescription: { type: "string" },
      timeOfDay: { type: ["string", "null"] },
      presentCharacters: { type: "array", items: { type: "string" } },
      keyActions: { type: "array", items: { type: "string" } },
      productionNotes: { type: "array", items: { type: "string" } },
    },
    required: [
      "sceneNumber",
      "heading",
      "settingDescription",
      "timeOfDay",
      "presentCharacters",
      "keyActions",
      "productionNotes",
    ],
  },
};

const SYSTEM_PROMPT = `You are a film production analyst.
Given the Fountain-formatted body of a screenplay scene, emit a structured JSON summary.`;

const TEST_SCENES = [
  {
    number: 1,
    heading: "INT. RISTORANTE DA DANTE - BANCONE - GIORNO",
    body: "DANTE pulisce il bancone con uno straccio umido.\nEntra FILIPPO, trafelato.\n\nFILIPPO\nHo trovato il comico!\n\nDANTE\n(senza voltarsi)\nBuono per te.\n\nFILIPPO\nFarà ridere tutti. Vedrai.\n\nDANTE\nL'ultima volta mi hai detto la stessa cosa.",
  },
  {
    number: 2,
    heading: "INT. RISTORANTE DA DANTE - SALA - SERA",
    body: "TEA apparecchia i tavoli.\nDANTE conta i tovaglioli.\n\nDANTE\nSei sicuro che viene?\n\nFILIPPO\nSicurissimo.\n\nTEA\n(senza alzare la testa)\nDiceva così anche la volta con il mago.",
  },
  {
    number: 3,
    heading: "EXT. STRADA DEL PAESE - NOTTE",
    body: "La strada è deserta.\nFILIPPO cammina veloce verso il parcheggio.\nSi ferma davanti alla macchina del comico — parcheggiata storta sul marciapiede.",
  },
];

interface RunResult {
  readonly scene: number;
  readonly heading: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
  readonly costCents: number;
}

async function runSceneSummarySmoke(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  const results: RunResult[] = [];

  for (const scene of TEST_SCENES) {
    console.log(`\nRunning scene ${scene.number}: ${scene.heading}`);

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "{}", cache_control: { type: "ephemeral" } },
      ],
      tools: [EMIT_TOOL],
      tool_choice: { type: "tool", name: EMIT_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `SCENE ${scene.number}: ${scene.heading}\n\n${scene.body}`,
        },
      ],
    });

    const u = response.usage ?? {};
    const inputTokens = u.input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheCreation = u.cache_creation_input_tokens ?? 0;

    // Haiku pricing: $1/M input, $5/M output, $0.10/M cache read
    const costCents =
      ((inputTokens * 1.0 + cacheCreation * 1.25 + cacheRead * 0.1) /
        1_000_000 +
        (outputTokens * 5.0) / 1_000_000) *
      100;

    console.log(
      `  input=${inputTokens} output=${outputTokens} cache_read=${cacheRead} cache_creation=${cacheCreation} cost≈$${(costCents / 100).toFixed(5)}`,
    );

    results.push({
      scene: scene.number,
      heading: scene.heading,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheCreation,
      costCents,
    });
  }

  const totalCost = results.reduce((s, r) => s + r.costCents, 0);
  const totalInput = results.reduce((s, r) => s + r.inputTokens, 0);

  const report = [
    `# Cost Smoke — Scene Summary (spec 38)`,
    `Date: ${new Date().toISOString()}`,
    `Model: claude-haiku-4-5`,
    "",
    "| Scene | Input | Output | Cache Read | Cache Creation | Cost |",
    "|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| Sc.${r.scene} ${r.heading.slice(0, 30)} | ${r.inputTokens} | ${r.outputTokens} | ${r.cacheRead} | ${r.cacheCreation} | $${(r.costCents / 100).toFixed(5)} |`,
    ),
    "",
    `**Total**: ${totalInput} input tokens, $${(totalCost / 100).toFixed(4)} for ${results.length} scenes.`,
    `**Per-scene average**: $${(totalCost / 100 / results.length).toFixed(5)}`,
  ].join("\n");

  const outDir = path.join(REPO_ROOT, "vernissage", "context-engineering");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `scene-summary-cost-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  );
  await writeFile(outFile, report, "utf8");
  console.log(`\nReport written to: ${outFile}`);
  console.log(`Total cost: $${(totalCost / 100).toFixed(4)}`);
}

runSceneSummarySmoke().catch((e) => {
  console.error(e);
  process.exit(1);
});
