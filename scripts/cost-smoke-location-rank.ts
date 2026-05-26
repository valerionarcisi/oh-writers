/**
 * cost-smoke-location-rank — one real Haiku call ranking discovered places by
 * scene atmosphere (spec 37c). Confirms the per-action cost stays tiny.
 *
 * NOT for CI. Prompt + tool mirror `rank.server.ts` (inlined: that module imports
 * server-only deps). Keep the two in sync.
 *
 * Usage: ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:location-rank
 * Output: vernissage/location-matching/rank-cost-<ISO>.md
 *
 * Pricing: Claude Haiku 4.x — $1.00 / M input, $5.00 / M output.
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

interface Usage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}
interface Ctor {
  new (c: { apiKey: string }): {
    messages: {
      create(a: Record<string, unknown>): Promise<{ usage?: Usage }>;
    };
  };
}
const loadAnthropic = (): Ctor => {
  const sdk = require("@anthropic-ai/sdk") as { default?: Ctor } & Ctor;
  return (sdk.default ?? sdk) as Ctor;
};

const HAIKU = "claude-haiku-4-5-20251001";
const SYSTEM = `Sei Cesare, location scout per il cinema italiano. Ricevi una scena
(intestazione + testo) e una lista di posti reali. Ordina i posti per quanto si
adattano all'ATMOSFERA della scena (tono, luce, energia, classe del locale). Dai a
ciascuno un punteggio 0-1 e una riga di motivo in italiano.`;

const TOOL = {
  name: "rank_places",
  description: "Rank candidate filming locations by scene mood fit.",
  input_schema: {
    type: "object",
    properties: {
      rankings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            placeId: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
          },
          required: ["placeId", "score", "reason"],
        },
      },
    },
    required: ["rankings"],
  },
} as const;

const USER = `SCENA:
Ristorante - Forno
INT. RISTORANTE - NOTTE. Le luci si abbassano. Atmosfera tesa, quasi horror.

POSTI:
id=p1 | Trattoria del Cerchio | tipi: restaurant | rating: 3.9 | prezzo: PRICE_LEVEL_INEXPENSIVE | Trattoria casalinga e informale
id=p2 | Ristorante Stellato | tipi: restaurant | rating: 4.8 | prezzo: PRICE_LEVEL_EXPENSIVE | Locale elegante, atmosfera raffinata e luci soffuse
id=p3 | Pizzeria Express | tipi: restaurant,meal_takeaway | rating: 3.5 | prezzo: PRICE_LEVEL_INEXPENSIVE | Pizza al taglio veloce`;

const main = async (): Promise<void> => {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:location-rank\n",
    );
    return;
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    process.stderr.write("ANTHROPIC_API_KEY is not set.\n");
    process.exit(2);
  }
  const client = new (loadAnthropic())({ apiKey });
  process.stdout.write("▶ One ranking call…\n");
  const res = await client.messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: USER }],
  });
  const u = res.usage ?? {};
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cost = (input * 1.0 + output * 5.0) / 1_000_000;

  const at = new Date().toISOString();
  const md = [
    `# Location rank cost-smoke — ${at}`,
    "",
    "> One real Haiku call ranking 3 places for a tense restaurant scene.",
    "",
    "| Input | Output | Cost |",
    "| --- | --- | --- |",
    `| ${input} | ${output} | $${cost.toFixed(6)} |`,
    "",
    `Per ranking action: **$${cost.toFixed(6)}** · 1000 actions: **$${(cost * 1000).toFixed(2)}**`,
    "",
  ].join("\n");
  const dir = path.join(REPO_ROOT, "vernissage", "location-matching");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `rank-cost-${at.replace(/[:.]/g, "-")}.md`);
  await writeFile(out, md);
  process.stdout.write(
    `  input=${input} output=${output} cost=$${cost.toFixed(6)}\n✓ ${path.relative(REPO_ROOT, out)}\n`,
  );
};

main().catch((e: unknown) => {
  process.stderr.write(
    `cost-smoke-location-rank crashed: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(99);
});
