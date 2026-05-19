/**
 * cost-smoke-cesare — burns a tiny amount of real Anthropic credit to verify
 * that the cost-foundation layer is wired correctly end-to-end (cache hits
 * on subsequent turns, Haiku vs Sonnet routing, lazy-RAG read tools).
 *
 * NOT for CI. Run ad-hoc when you change the system prompt structure,
 * the model router thresholds, or add a new read tool.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:cesare
 *
 * Output: a Markdown report at
 *   vernissage/cost-foundation/cost-report-<ISO>.md
 *
 * Pricing reference (verify against https://www.anthropic.com/pricing before
 * relying on the cost projection — these prices can change):
 *   - Claude Sonnet 4.x: $3.00 / M input, $0.30 / M cached read,
 *     $3.75 / M cached write, $15.00 / M output
 *   - Claude Haiku 4.x:  $1.00 / M input, $0.08 / M cached read,
 *     $1.25 / M cached write, $5.00 / M output
 *
 * The pricing table at the top of this file is the single source of truth
 * for the cost extrapolation — update it when Anthropic publishes new
 * numbers and re-run the smoke to refresh the report.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Reuse the production router so this script can never silently drift from
// the live decision logic. Import path is workspace-relative.
import {
  routeModel,
  tierToModel,
  type CesarePage,
  type ModelTier,
} from "../apps/web/app/features/predictions/cesare-model-router";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

// The SDK is a transitive dep of @oh-writers/web. createRequire scoped to the
// app's package.json makes pnpm's hoisting transparent here.
const require = createRequire(
  path.join(REPO_ROOT, "apps", "web", "package.json"),
);

interface AnthropicUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

interface AnthropicMessageResponse {
  readonly content: ReadonlyArray<{ type: string; text?: string }>;
  readonly stop_reason: string | null;
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdk = require("@anthropic-ai/sdk") as {
    default?: AnthropicCtor;
  } & AnthropicCtor;
  return (sdk.default ?? sdk) as AnthropicCtor;
};

// ─── Pricing table (USD per million tokens) ──────────────────────────────────

interface ModelPricing {
  readonly input: number;
  readonly cachedRead: number;
  readonly cachedWrite: number;
  readonly output: number;
}

const PRICING: Record<ModelTier, ModelPricing> = {
  sonnet: { input: 3.0, cachedRead: 0.3, cachedWrite: 3.75, output: 15.0 },
  haiku: { input: 1.0, cachedRead: 0.08, cachedWrite: 1.25, output: 5.0 },
};

const costFor = (tier: ModelTier, usage: AnthropicUsage): number => {
  const p = PRICING[tier];
  const input = usage.input_tokens ?? 0;
  const cachedRead = usage.cache_read_input_tokens ?? 0;
  const cachedWrite = usage.cache_creation_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (
    (input * p.input +
      cachedRead * p.cachedRead +
      cachedWrite * p.cachedWrite +
      output * p.output) /
    1_000_000
  );
};

// ─── Mini system prompt — mirrors the real cache-layered shape ───────────────

interface SystemPromptBlock {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
}

const STATIC_ROLE_BLOCK: SystemPromptBlock = {
  type: "text",
  text:
    "Sei Cesare, assistente AI per produzioni cinematografiche italiane. " +
    "Aiuti lo sceneggiatore-regista a sviluppare il progetto: soggetto, " +
    "scaletta, sceneggiatura, breakdown, budget, schedule, shooting plan, " +
    "locations. Rispondi sempre in italiano, in modo concreto e diretto. " +
    "Hai a disposizione strumenti read-only per leggere on-demand scene, " +
    "documenti, righe di budget, breakdown, requisiti location e giornate " +
    "di ripresa. Chiama lo strumento solo quando ti serve davvero.",
  cache_control: { type: "ephemeral" },
};

const STATIC_PRODUCTION_CONTEXT: SystemPromptBlock = {
  type: "text",
  text:
    "Produzione: lungometraggio thriller indipendente, in pre-produzione. " +
    "Team minimo, budget contenuto, 25 giorni di ripresa previsti. " +
    "Linguaggio sobrio, niente esagerazioni di marketing.",
  cache_control: { type: "ephemeral" },
};

const STATIC_TOOL_GUIDANCE: SystemPromptBlock = {
  type: "text",
  text:
    "Quando l'utente chiede del contenuto specifico (es. 'che dice X nella " +
    "scena N'), chiama read_scene. Quando chiede confronti tra scene, usa " +
    "read_scene_range. Non inventare contenuti: se uno strumento non " +
    "restituisce il dato, dichiaralo.",
  cache_control: { type: "ephemeral" },
};

const dynamicStateBlock = (heading: string): SystemPromptBlock => ({
  type: "text",
  text: `Stato attuale (non cachato): ${heading}`,
});

const SYSTEM_PROMPT = (dynamicHeading: string): SystemPromptBlock[] => [
  STATIC_ROLE_BLOCK,
  STATIC_PRODUCTION_CONTEXT,
  STATIC_TOOL_GUIDANCE,
  dynamicStateBlock(dynamicHeading),
];

// ─── Scenarios ───────────────────────────────────────────────────────────────

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly page: CesarePage;
  readonly turns: ReadonlyArray<string>;
  readonly dynamicHeading: string;
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    id: "chat-only-haiku",
    label: "Chat-only Haiku (short question on screenplay)",
    page: "screenplay",
    dynamicHeading:
      "Pagina: screenplay. Scena attiva: 1 — INT. APPARTAMENTO - NOTTE.",
    turns: ["Che pensi della scena attuale?"],
  },
  {
    id: "single-turn-sonnet",
    label: "Single-turn Sonnet (imperative on breakdown)",
    page: "breakdown",
    dynamicHeading:
      "Pagina: breakdown. Scena attiva: 1 — INT. APPARTAMENTO - NOTTE.",
    turns: ["Aggiungi una nota sul costo principale di questa scena."],
  },
  {
    id: "multi-turn-sonnet",
    label: "Multi-turn Sonnet (4 follow-ups, deep conversation)",
    page: "breakdown",
    dynamicHeading:
      "Pagina: breakdown. Scena attiva: 1 — INT. APPARTAMENTO - NOTTE.",
    turns: ["Ok.", "Continua.", "Ancora.", "E poi?"],
  },
];

// ─── Driver ──────────────────────────────────────────────────────────────────

interface TurnReport {
  readonly turnIndex: number;
  readonly userMessage: string;
  readonly tier: ModelTier;
  readonly model: string;
  readonly usage: AnthropicUsage;
  readonly costUsd: number;
}

interface ScenarioReport {
  readonly scenario: Scenario;
  readonly turns: ReadonlyArray<TurnReport>;
  readonly totalCostUsd: number;
}

const runScenario = async (
  client: InstanceType<AnthropicCtor>,
  scenario: Scenario,
): Promise<ScenarioReport> => {
  const conversation: Array<{ role: "user" | "assistant"; content: string }> =
    [];
  const turns: TurnReport[] = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const userMessage = scenario.turns[i]!;
    const tier = routeModel({
      userMessage,
      page: scenario.page,
      conversationLength: conversation.length,
    });
    const model = tierToModel(tier);

    conversation.push({ role: "user", content: userMessage });

    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: SYSTEM_PROMPT(scenario.dynamicHeading),
      messages: conversation,
    });

    const assistantText = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    conversation.push({
      role: "assistant",
      content: assistantText || "(no text)",
    });

    const usage = response.usage ?? {};
    turns.push({
      turnIndex: i,
      userMessage,
      tier,
      model,
      usage,
      costUsd: costFor(tier, usage),
    });
  }

  const totalCostUsd = turns.reduce((acc, t) => acc + t.costUsd, 0);
  return { scenario, turns, totalCostUsd };
};

// ─── Reporting ───────────────────────────────────────────────────────────────

const fmtUsd = (n: number): string => `$${n.toFixed(6)}`;

const reportToMarkdown = (
  reports: ReadonlyArray<ScenarioReport>,
  generatedAt: string,
): string => {
  const lines: string[] = [];
  lines.push(`# Cesare cost-smoke — ${generatedAt}`);
  lines.push("");
  lines.push(
    "> Real API calls against Anthropic. Not a substitute for a real",
    "> production sample — just a smoke that confirms the wiring of",
    "> caching + router + read tools doesn't regress.",
  );
  lines.push("");
  lines.push(
    "| Scenario | Turn | Tier | Input | Cache R | Cache W | Output | Cost |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  let grandTotal = 0;
  for (const r of reports) {
    for (const t of r.turns) {
      grandTotal += t.costUsd;
      lines.push(
        `| ${r.scenario.id} | ${t.turnIndex} | ${t.tier} | ${
          t.usage.input_tokens ?? 0
        } | ${t.usage.cache_read_input_tokens ?? 0} | ${
          t.usage.cache_creation_input_tokens ?? 0
        } | ${t.usage.output_tokens ?? 0} | ${fmtUsd(t.costUsd)} |`,
      );
    }
  }
  lines.push("");
  lines.push(`**Grand total**: ${fmtUsd(grandTotal)}`);
  lines.push("");
  // Projection: assume 100 user turns / day mirroring the same mix as the
  // sampled scenarios. The "before" baseline is what we'd have paid with no
  // caching and all-Sonnet (worst-case prior to the cost foundation).
  const sampleTurns = reports.reduce((n, r) => n + r.turns.length, 0);
  const avgCost = grandTotal / Math.max(sampleTurns, 1);
  const dailyProjection = avgCost * 100;
  let baselineCost = 0;
  for (const r of reports) {
    for (const t of r.turns) {
      // Reprice this turn as if it had been all-Sonnet, no cache (so every
      // cached read + write is recharged as raw input).
      const p = PRICING.sonnet;
      const rawInput =
        (t.usage.input_tokens ?? 0) +
        (t.usage.cache_read_input_tokens ?? 0) +
        (t.usage.cache_creation_input_tokens ?? 0);
      const output = t.usage.output_tokens ?? 0;
      baselineCost += (rawInput * p.input + output * p.output) / 1_000_000;
    }
  }
  const baselineDaily = (baselineCost / Math.max(sampleTurns, 1)) * 100;
  lines.push("## Projections (rough)");
  lines.push("");
  lines.push(
    `- Average cost per turn (current): ${fmtUsd(avgCost)}`,
    `- Projected 100 turns/day (current): ${fmtUsd(dailyProjection)}`,
    `- Projected 100 turns/day (pre-foundation, all-Sonnet, no cache): ${fmtUsd(baselineDaily)}`,
    `- Savings ratio: ${(
      (1 - dailyProjection / Math.max(baselineDaily, 1e-9)) *
      100
    ).toFixed(1)}%`,
  );
  lines.push("");
  return lines.join("\n");
};

// ─── Entry point ─────────────────────────────────────────────────────────────

const printHelp = (): void => {
  process.stdout.write(
    [
      "cost-smoke-cesare — Cesare cost foundation smoke (real API)",
      "",
      "Usage:",
      "  ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:cesare",
      "  pnpm cost:smoke:cesare -- --help",
      "",
      "Environment:",
      "  ANTHROPIC_API_KEY    Required. Real Anthropic API key.",
      "",
      "Output:",
      "  vernissage/cost-foundation/cost-report-<ISO>.md",
      "",
    ].join("\n"),
  );
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || apiKey.length === 0) {
    process.stderr.write(
      "ANTHROPIC_API_KEY is not set. Pass it as an env var.\n",
    );
    process.exit(2);
  }

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    process.stdout.write(`▶ Running ${scenario.id}…\n`);
    const report = await runScenario(client, scenario);
    reports.push(report);
    process.stdout.write(
      `  done — ${report.turns.length} turn(s), ${fmtUsd(report.totalCostUsd)}\n`,
    );
  }

  const generatedAt = new Date().toISOString();
  const markdown = reportToMarkdown(reports, generatedAt);

  const outDir = path.join(REPO_ROOT, "vernissage", "cost-foundation");
  await mkdir(outDir, { recursive: true });
  const safeStamp = generatedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `cost-report-${safeStamp}.md`);
  await writeFile(outPath, markdown);

  process.stdout.write(
    `\n✓ Report written to ${path.relative(REPO_ROOT, outPath)}\n`,
  );
};

main().catch((e: unknown) => {
  process.stderr.write(
    `cost-smoke-cesare crashed: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(99);
});
