/**
 * cost-smoke-provider-compare — runs the SAME Cesare scenarios against Anthropic
 * and Mistral side by side and reports per-turn tokens, cost, and a
 * function-calling probe, so the "Mistral for margin + EU privacy" decision
 * (docs/ai-cost-audit-mistral.md) rests on measured numbers, not vendor
 * benchmarks.
 *
 * NOT for CI. Run ad-hoc when evaluating a provider/model switch.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… MISTRAL_API_KEY=… pnpm cost:smoke:provider-compare
 *
 * A provider whose key is absent is skipped (so you can run Mistral-only, etc.).
 * Output: a Markdown report at
 *   vernissage/cost-foundation/provider-compare-<ISO>.md
 *
 * Self-contained: talks to each provider's HTTP API via `fetch` (no SDK import,
 * no extra dependency to install). Anthropic uses the Messages API; Mistral uses
 * its OpenAI-compatible Chat Completions API.
 *
 * Pricing reference (USD / 1M tokens, June 2026 — re-verify at the provider
 * pages; this table is the single source of truth for the cost projection and
 * MUST be kept in sync with docs/ai-cost-audit-mistral.md):
 *   - Claude Sonnet 4.6: in 3.00 / cached-read 0.30 / cached-write 3.75 / out 15.00
 *   - Claude Haiku 4.5:  in 1.00 / cached-read 0.08 / cached-write 1.25 / out 5.00
 *   - Mistral Large 3:   in 0.50 / out 1.50  (no prompt-cache tier)
 *   - Mistral Small:     in 0.20 / out 0.60  (no prompt-cache tier)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Reuse the production router so this script can never silently drift from the
// live decision logic.
import {
  routeModel,
  type CesarePage,
  type ModelTier,
} from "../apps/web/app/features/predictions/cesare-model-router";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

// ─── Provider + model catalogue ──────────────────────────────────────────────

type ProviderId = "anthropic" | "mistral";

interface ModelPricing {
  readonly input: number;
  readonly cachedRead: number;
  readonly cachedWrite: number;
  readonly output: number;
}

interface ModelEntry {
  readonly provider: ProviderId;
  readonly id: string;
  readonly label: string;
  readonly pricing: ModelPricing;
}

// One entry per tier per provider. The tier mapping mirrors how the audit
// proposes to route: a provider's cheap model stands in for Haiku, its flagship
// for Sonnet. Mistral has no cache tier, so cachedRead/Write equal input.
const CATALOGUE: Record<ProviderId, Record<ModelTier, ModelEntry>> = {
  anthropic: {
    haiku: {
      provider: "anthropic",
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      pricing: { input: 1.0, cachedRead: 0.08, cachedWrite: 1.25, output: 5.0 },
    },
    sonnet: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      pricing: { input: 3.0, cachedRead: 0.3, cachedWrite: 3.75, output: 15.0 },
    },
  },
  mistral: {
    haiku: {
      provider: "mistral",
      id: "mistral-small-latest",
      label: "Mistral Small",
      pricing: { input: 0.2, cachedRead: 0.2, cachedWrite: 0.2, output: 0.6 },
    },
    sonnet: {
      provider: "mistral",
      id: "mistral-large-latest",
      label: "Mistral Large 3",
      pricing: { input: 0.5, cachedRead: 0.5, cachedWrite: 0.5, output: 1.5 },
    },
  },
};

// ─── Usage + cost ────────────────────────────────────────────────────────────

interface Usage {
  readonly input: number;
  readonly cachedRead: number;
  readonly cachedWrite: number;
  readonly output: number;
}

const ZERO_USAGE: Usage = { input: 0, cachedRead: 0, cachedWrite: 0, output: 0 };

const costFor = (pricing: ModelPricing, usage: Usage): number =>
  (usage.input * pricing.input +
    usage.cachedRead * pricing.cachedRead +
    usage.cachedWrite * pricing.cachedWrite +
    usage.output * pricing.output) /
  1_000_000;

// ─── System prompt (mirrors the cache-layered shape of cost-smoke-cesare) ─────

const SYSTEM_PROMPT =
  "Sei Cesare, assistente AI per produzioni cinematografiche italiane. " +
  "Aiuti lo sceneggiatore-regista a sviluppare il progetto: soggetto, scaletta, " +
  "sceneggiatura, breakdown, budget, schedule, shooting plan, locations. " +
  "Rispondi sempre in italiano, in modo concreto e diretto.";

// A single tool definition used by the function-calling probe. We only check
// that the provider can emit a well-formed call to it — the agentic risk the
// audit flags is malformed/hallucinated tool calls, so this is the signal that
// matters before moving the Cesare mutation tier.
const PROBE_TOOL = {
  name: "read_scene",
  description: "Legge il contenuto di una scena dato il suo numero.",
  parameters: {
    type: "object",
    properties: {
      scene_number: { type: "integer", description: "Numero della scena" },
    },
    required: ["scene_number"],
  },
} as const;

// ─── Scenarios (same mix as cost-smoke-cesare) ────────────────────────────────

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly page: CesarePage;
  readonly turns: ReadonlyArray<string>;
  // When set, the turn is run with PROBE_TOOL offered and the report records
  // whether the model emitted a valid tool call.
  readonly toolProbe?: boolean;
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    id: "chat-only",
    label: "Short question on screenplay (router → cheap tier)",
    page: "screenplay",
    turns: ["Che pensi della scena attuale?"],
  },
  {
    id: "imperative",
    label: "Imperative on breakdown (router → flagship tier)",
    page: "breakdown",
    turns: ["Aggiungi una nota sul costo principale di questa scena."],
  },
  {
    id: "tool-probe",
    label: "Function-calling probe (read_scene)",
    page: "screenplay",
    turns: ["Che dice il protagonista nella scena 1?"],
    toolProbe: true,
  },
];

// ─── Provider adapters ────────────────────────────────────────────────────────

interface TurnOutcome {
  readonly usage: Usage;
  readonly text: string;
  readonly toolCallOk: boolean | null; // null = not probed
}

const callAnthropic = async (
  apiKey: string,
  model: string,
  userMessage: string,
  withTool: boolean,
): Promise<TurnOutcome> => {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    ...(withTool
      ? {
          tools: [
            {
              name: PROBE_TOOL.name,
              description: PROBE_TOOL.description,
              input_schema: PROBE_TOOL.parameters,
            },
          ],
        }
      : {}),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    content?: ReadonlyArray<{ type: string; text?: string; name?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  const content = json.content ?? [];
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  const toolCallOk = withTool
    ? content.some((b) => b.type === "tool_use" && b.name === PROBE_TOOL.name)
    : null;
  const u = json.usage ?? {};
  return {
    usage: {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cachedRead: u.cache_read_input_tokens ?? 0,
      cachedWrite: u.cache_creation_input_tokens ?? 0,
    },
    text,
    toolCallOk,
  };
};

const callMistral = async (
  apiKey: string,
  model: string,
  userMessage: string,
  withTool: boolean,
): Promise<TurnOutcome> => {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 256,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    ...(withTool
      ? {
          tools: [
            {
              type: "function",
              function: {
                name: PROBE_TOOL.name,
                description: PROBE_TOOL.description,
                parameters: PROBE_TOOL.parameters,
              },
            },
          ],
          tool_choice: "auto",
        }
      : {}),
  };
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Mistral ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: ReadonlyArray<{
      message?: {
        content?: string | null;
        tool_calls?: ReadonlyArray<{ function?: { name?: string } }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = json.choices?.[0]?.message;
  const text = (message?.content ?? "").trim();
  const toolCallOk = withTool
    ? (message?.tool_calls ?? []).some(
        (c) => c.function?.name === PROBE_TOOL.name,
      )
    : null;
  const u = json.usage ?? {};
  // Mistral does not expose a cached-token split; everything is fresh input.
  return {
    usage: {
      input: u.prompt_tokens ?? 0,
      output: u.completion_tokens ?? 0,
      cachedRead: 0,
      cachedWrite: 0,
    },
    text,
    toolCallOk,
  };
};

const callProvider = (
  provider: ProviderId,
  apiKey: string,
  model: string,
  userMessage: string,
  withTool: boolean,
): Promise<TurnOutcome> =>
  provider === "anthropic"
    ? callAnthropic(apiKey, model, userMessage, withTool)
    : callMistral(apiKey, model, userMessage, withTool);

// ─── Driver ───────────────────────────────────────────────────────────────────

interface TurnReport {
  readonly scenarioId: string;
  readonly turnIndex: number;
  readonly userMessage: string;
  readonly provider: ProviderId;
  readonly model: ModelEntry;
  readonly tier: ModelTier;
  readonly usage: Usage;
  readonly costUsd: number;
  readonly toolCallOk: boolean | null;
}

const runScenarioForProvider = async (
  provider: ProviderId,
  apiKey: string,
  scenario: Scenario,
): Promise<TurnReport[]> => {
  const out: TurnReport[] = [];
  for (let i = 0; i < scenario.turns.length; i++) {
    const userMessage = scenario.turns[i]!;
    const tier = routeModel({
      userMessage,
      page: scenario.page,
      conversationLength: i,
    });
    const model = CATALOGUE[provider][tier];
    try {
      const outcome = await callProvider(
        provider,
        apiKey,
        model.id,
        userMessage,
        scenario.toolProbe === true,
      );
      out.push({
        scenarioId: scenario.id,
        turnIndex: i,
        userMessage,
        provider,
        model,
        tier,
        usage: outcome.usage,
        costUsd: costFor(model.pricing, outcome.usage),
        toolCallOk: outcome.toolCallOk,
      });
    } catch (e) {
      process.stderr.write(
        `  ! ${provider}/${model.id} failed on "${userMessage}": ${
          e instanceof Error ? e.message : String(e)
        }\n`,
      );
      out.push({
        scenarioId: scenario.id,
        turnIndex: i,
        userMessage,
        provider,
        model,
        tier,
        usage: ZERO_USAGE,
        costUsd: 0,
        toolCallOk: scenario.toolProbe === true ? false : null,
      });
    }
  }
  return out;
};

// ─── Reporting ──────────────────────────────────────────────────────────────

const fmtUsd = (n: number): string => `$${n.toFixed(6)}`;
const fmtTool = (ok: boolean | null): string =>
  ok === null ? "—" : ok ? "✅" : "❌";

const reportToMarkdown = (
  rows: ReadonlyArray<TurnReport>,
  providers: ReadonlyArray<ProviderId>,
  generatedAt: string,
): string => {
  const lines: string[] = [];
  lines.push(`# Provider cost comparison — ${generatedAt}`);
  lines.push("");
  lines.push(
    `> Real API calls. Providers run: **${providers.join(", ")}**.`,
    "> Routing reuses the production `routeModel`. Pricing table pinned in this",
    "> script and in docs/ai-cost-audit-mistral.md. Not a CI job.",
  );
  lines.push("");
  lines.push(
    "| Scenario | Turn | Provider | Model | Tier | Input | Cache R | Cache W | Output | Cost | Tool |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const r of rows) {
    lines.push(
      `| ${r.scenarioId} | ${r.turnIndex} | ${r.provider} | ${r.model.label} | ${r.tier} | ${r.usage.input} | ${r.usage.cachedRead} | ${r.usage.cachedWrite} | ${r.usage.output} | ${fmtUsd(r.costUsd)} | ${fmtTool(r.toolCallOk)} |`,
    );
  }
  lines.push("");

  // Per-provider totals + the headline margin delta vs Anthropic.
  lines.push("## Totals & margin delta");
  lines.push("");
  const totalByProvider = new Map<ProviderId, number>();
  for (const r of rows) {
    totalByProvider.set(
      r.provider,
      (totalByProvider.get(r.provider) ?? 0) + r.costUsd,
    );
  }
  lines.push("| Provider | Total sampled cost |");
  lines.push("| --- | --- |");
  for (const p of providers) {
    lines.push(`| ${p} | ${fmtUsd(totalByProvider.get(p) ?? 0)} |`);
  }
  lines.push("");
  const anthropicTotal = totalByProvider.get("anthropic");
  const mistralTotal = totalByProvider.get("mistral");
  if (anthropicTotal && anthropicTotal > 0 && mistralTotal !== undefined) {
    const savings = (1 - mistralTotal / anthropicTotal) * 100;
    lines.push(
      `**Mistral vs Anthropic on this sample**: ${savings.toFixed(1)}% ${
        savings >= 0 ? "cheaper" : "more expensive"
      }.`,
    );
    lines.push("");
    lines.push(
      "> Reminder: Mistral has no prompt-cache tier. On real Cesare traffic the",
      "> cached prefix (film bible) lowers the Anthropic side, so re-measure with",
      "> production-shaped context before extrapolating to monthly margin.",
    );
  }
  lines.push("");
  return lines.join("\n");
};

// ─── Entry point ──────────────────────────────────────────────────────────────

const printHelp = (): void => {
  process.stdout.write(
    [
      "cost-smoke-provider-compare — Anthropic vs Mistral on Cesare scenarios",
      "",
      "Usage:",
      "  ANTHROPIC_API_KEY=sk-… MISTRAL_API_KEY=… pnpm cost:smoke:provider-compare",
      "",
      "A provider whose key is absent is skipped. At least one key is required.",
      "",
      "Output: vernissage/cost-foundation/provider-compare-<ISO>.md",
      "",
    ].join("\n"),
  );
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const keys: Partial<Record<ProviderId, string>> = {};
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const mistralKey = process.env["MISTRAL_API_KEY"];
  if (anthropicKey && anthropicKey.length > 0) keys.anthropic = anthropicKey;
  if (mistralKey && mistralKey.length > 0) keys.mistral = mistralKey;

  const providers = Object.keys(keys) as ProviderId[];
  if (providers.length === 0) {
    process.stderr.write(
      "No provider key set. Set ANTHROPIC_API_KEY and/or MISTRAL_API_KEY.\n",
    );
    process.exit(2);
  }

  const rows: TurnReport[] = [];
  for (const provider of providers) {
    const apiKey = keys[provider]!;
    for (const scenario of SCENARIOS) {
      process.stdout.write(`▶ ${provider} — ${scenario.id}…\n`);
      const turns = await runScenarioForProvider(provider, apiKey, scenario);
      rows.push(...turns);
    }
  }

  const generatedAt = new Date().toISOString();
  const markdown = reportToMarkdown(rows, providers, generatedAt);

  const outDir = path.join(REPO_ROOT, "vernissage", "cost-foundation");
  await mkdir(outDir, { recursive: true });
  const safeStamp = generatedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `provider-compare-${safeStamp}.md`);
  await writeFile(outPath, markdown);

  process.stdout.write(
    `\n✓ Report written to ${path.relative(REPO_ROOT, outPath)}\n`,
  );
};

main().catch((e: unknown) => {
  process.stderr.write(
    `cost-smoke-provider-compare crashed: ${
      e instanceof Error ? e.message : String(e)
    }\n`,
  );
  process.exit(99);
});
