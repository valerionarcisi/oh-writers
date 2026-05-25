/**
 * cost-smoke-location-normalise — burns a tiny amount of real Anthropic credit
 * to measure the cost of ONE batch requirement-normalisation call (spec 37,
 * Step 1). Confirms the per-project cost stays in the fraction-of-a-cent range.
 *
 * NOT for CI. Run ad-hoc when you change the normalisation prompt or tool shape.
 *
 * The prompt + tool here mirror `normalise.server.ts`. They are inlined (not
 * imported) because that module imports server-only deps (`~/server/db`); this
 * script must run standalone with only the SDK. Keep the two in sync.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:location-normalise
 *
 * Output: vernissage/location-matching/normalise-cost-<ISO>.md
 *
 * Pricing reference (verify at https://www.anthropic.com/pricing):
 *   Claude Haiku 4.x: $1.00 / M input, $5.00 / M output
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
}
interface AnthropicMessageResponse {
  readonly content: ReadonlyArray<{ type: string }>;
  readonly usage?: AnthropicUsage;
}
interface AnthropicCtor {
  new (config: { apiKey: string }): {
    messages: {
      create(args: Record<string, unknown>): Promise<AnthropicMessageResponse>;
    };
  };
}

const loadAnthropic = (): AnthropicCtor => {
  const sdk = require("@anthropic-ai/sdk") as {
    default?: AnthropicCtor;
  } & AnthropicCtor;
  return (sdk.default ?? sdk) as AnthropicCtor;
};

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const PRICE_INPUT = 1.0;
const PRICE_OUTPUT = 5.0;

const LOCATION_TYPES = [
  "ristorante",
  "bar",
  "appartamento",
  "casa",
  "strada",
  "piazza",
  "spiaggia",
  "ufficio",
  "negozio",
  "esterno_natura",
  "interno_generico",
  "altro",
] as const;

const SYSTEM_PROMPT = `You are Cesare, an expert location scout for Italian cinema.
You receive a list of location requirements extracted from a screenplay breakdown.
Each requirement is a SET NAME as the writer wrote it ("Bancone", "Angolo Open Grezzo", "Sala") — not a category.
Map each to exactly ONE canonical place type from the allowed enum.
Reason about the whole project: sibling set names that belong to the same physical place should map to the SAME type.
Use the linked scene headings as context. If a requirement is not a physical filming location, map it to "altro" with low confidence.`;

const TOOL = {
  name: "normalise_requirements",
  description:
    "Map each Italian screenplay location requirement to one canonical place type.",
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirementId: { type: "string" },
            locationType: { type: "string", enum: LOCATION_TYPES },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["requirementId", "locationType", "confidence"],
        },
      },
    },
    required: ["verdicts"],
  },
} as const;

// Mirrors the "Non fa ridere" set names that miss the dictionary and need Haiku.
const SAMPLE_USER = `id=a1
name: Angolo Open Grezzo
scenes: INT. RISTORANTE CUCINA - GIORNO | INT. RISTORANTE - SERA

id=a2
name: Sala
scenes: INT. RISTORANTE SALA - SERA

id=a3
name: Cucina
scenes: INT. RISTORANTE CUCINA - NOTTE

id=a4
name: Fuori Dalla Porta
scenes: EST. RISTORANTE INGRESSO - GIORNO

id=a5
name: Montage di Filippo che lavora. Comici che si alterano. Pubblico ride.
scenes: (no linked scenes)`;

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(
      "cost-smoke-location-normalise — one batch normalisation call (real API)\n" +
        "  ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:location-normalise\n",
    );
    return;
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    process.stderr.write("ANTHROPIC_API_KEY is not set.\n");
    process.exit(2);
  }

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  process.stdout.write("▶ Running one batch normalisation call…\n");
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: SAMPLE_USER }],
  });

  const usage = response.usage ?? {};
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const costUsd = (input * PRICE_INPUT + output * PRICE_OUTPUT) / 1_000_000;

  const generatedAt = new Date().toISOString();
  const md = [
    `# Location normalise cost-smoke — ${generatedAt}`,
    "",
    "> One real batch Haiku call normalising 5 unresolved requirements.",
    "> Represents the worst case per project (everything missed the dictionary).",
    "",
    "| Input tokens | Output tokens | Cost |",
    "| --- | --- | --- |",
    `| ${input} | ${output} | $${costUsd.toFixed(6)} |`,
    "",
    `Per-project cost (one-time, persisted): **$${costUsd.toFixed(6)}**`,
    `Projected 1000 projects: **$${(costUsd * 1000).toFixed(2)}**`,
    "",
  ].join("\n");

  const outDir = path.join(REPO_ROOT, "vernissage", "location-matching");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `normalise-cost-${generatedAt.replace(/[:.]/g, "-")}.md`,
  );
  await writeFile(outPath, md);
  process.stdout.write(
    `  input=${input} output=${output} cost=$${costUsd.toFixed(6)}\n`,
  );
  process.stdout.write(
    `✓ Report written to ${path.relative(REPO_ROOT, outPath)}\n`,
  );
};

main().catch((e: unknown) => {
  process.stderr.write(
    `cost-smoke-location-normalise crashed: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(99);
});
