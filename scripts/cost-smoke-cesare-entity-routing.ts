/**
 * cost-smoke-cesare-entity-routing — burns a tiny amount of real Anthropic
 * credit to verify BUG-N67 is fixed: asking Cesare for the SCENEGGIATURA from
 * the soggetto context must route to the screenplay first-draft tool
 * (`propose_screenplay_from_narrative`, a WRITE on the screenplay entity) and
 * must NOT be remapped onto the treatment generator.
 *
 * It exercises the EXACT production layers that caused the bug:
 *   1. the document-page intent-classifier prompt (real Haiku call) — before
 *      the fix it had no screenplay intent, so the request was forced into
 *      write_treatment and the loop wrote the WRONG entity;
 *   2. the deterministic intent→tool resolution + availability gating
 *      (pure, imported from cesare-intent-rules.ts);
 *   3. the tracer entity map (the chosen tool is a WRITE on `screenplay`);
 *   4. the first-draft generator prompt (real call) — the output must be
 *      Fountain scenes, not treatment prose.
 *
 * Mock mode skips the classifier entirely, so this is the ONLY way to validate
 * the routing on the real model. NOT for CI — run ad-hoc when the classifier
 * prompts or the screenplay first-draft tooling change.
 *
 * Usage:
 *   pnpm cost:smoke:cesare-entity-routing   (reads ANTHROPIC_API_KEY from apps/web/.env)
 *
 * Cost: 3 Haiku classifier calls (~100 output tokens each) + 1 Haiku
 * generation call (≤700 output tokens) — well under $0.01 total.
 *
 * Output: key-free transcript at vernissage/n67-entity-routing/smoke-<ISO>.md.
 * Exit code is non-zero if any routing assertion fails.
 */

import "./_load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  DOCUMENT_SYSTEM_PROMPT,
  parseIntentJson,
  resolveSuggestedTool,
} from "../apps/web/app/features/predictions/cesare-intent-rules";
import {
  SCREENPLAY_FIRST_DRAFT_SYSTEM,
  buildFirstDraftUserPrompt,
} from "../apps/web/app/features/predictions/cesare-screenplay-draft-prompt";
import { mappingForTool } from "../apps/web/app/features/predictions/cesare-tool-entity-map";
import { HAIKU_MODEL } from "../apps/web/app/features/predictions/cesare-model-router";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const require = createRequire(
  path.join(REPO_ROOT, "apps", "web", "package.json"),
);

interface AnthropicContentBlock {
  readonly type: string;
  readonly text?: string;
}
interface AnthropicMessageResponse {
  readonly content: ReadonlyArray<AnthropicContentBlock>;
  readonly stop_reason: string | null;
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

const textOf = (response: AnthropicMessageResponse): string =>
  response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

// Mirrors production `DOCUMENT_PAGE_CLASSIFIER_TOOLS` (cesare.server.ts).
const DOCUMENT_PAGE_CLASSIFIER_TOOLS = new Set([
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
  "propose_screenplay_from_narrative",
]);

interface ClassifierCase {
  readonly id: string;
  readonly userMessage: string;
  readonly expectedIntent: string;
  readonly expectedTool: string;
}

const CLASSIFIER_CASES: ReadonlyArray<ClassifierCase> = [
  {
    // The exact real-use phrasing from the BUG-N67 session.
    id: "bug-phrase",
    userMessage:
      "partendo dal soggetto attivo, riesci a scrivermi la prima stesura della sceneggiatura?",
    expectedIntent: "write_screenplay",
    expectedTool: "propose_screenplay_from_narrative",
  },
  {
    id: "screenplay-imperative",
    userMessage: "scrivimi la prima stesura della sceneggiatura",
    expectedIntent: "write_screenplay",
    expectedTool: "propose_screenplay_from_narrative",
  },
  {
    // Control: a request NAMING the treatment must still reach the treatment
    // generator — the fix must not over-rotate.
    id: "treatment-control",
    userMessage: "scrivi il trattamento dalla scaletta",
    expectedIntent: "write_treatment",
    expectedTool: "propose_treatment_from_narrative",
  },
];

const SOGGETTO_FIXTURE = `Marta gestisce una piccola libreria di provincia ereditata dal padre.
Tra gli scaffali trova un manoscritto mai pubblicato, scritto a mano, senza firma.
Le pagine raccontano la sua stessa infanzia con dettagli che nessuno potrebbe conoscere.
Marta inizia a cercare chi lo ha scritto, e ogni indizio la riporta dentro la libreria.
Capisce che il manoscritto continua a scriversi da solo, una pagina ogni notte.`;

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || !apiKey.startsWith("sk-")) {
    console.error("ANTHROPIC_API_KEY missing or invalid (expected sk-…).");
    process.exit(2);
  }

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  const failures: string[] = [];
  const transcript: string[] = [];
  const log = (line: string): void => {
    console.log(line);
    transcript.push(line);
  };

  log(`# N67 entity-routing smoke — ${new Date().toISOString()}`);
  log("");
  log("## 1. Classifier routing (real Haiku, production document-page prompt)");
  log("");

  for (const c of CLASSIFIER_CASES) {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 100,
      system: DOCUMENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: c.userMessage }],
    });
    const raw = textOf(response);
    const parsed = parseIntentJson(raw);
    const resolved = parsed
      ? resolveSuggestedTool(parsed, DOCUMENT_PAGE_CLASSIFIER_TOOLS)
      : null;

    log(`### ${c.id}`);
    log(`- user: "${c.userMessage}"`);
    log(`- model raw: \`${raw}\``);
    log(
      `- resolved: intent=${resolved?.type ?? "null"} confidence=${resolved?.confidence ?? "n/a"} tool=${resolved?.suggestedTool ?? "none"}`,
    );

    if (!resolved) {
      failures.push(`${c.id}: classifier output unparsable: ${raw}`);
    } else {
      if (resolved.type !== c.expectedIntent) {
        failures.push(
          `${c.id}: expected intent ${c.expectedIntent}, got ${resolved.type}`,
        );
      }
      if (resolved.suggestedTool !== c.expectedTool) {
        failures.push(
          `${c.id}: expected tool ${c.expectedTool}, got ${resolved.suggestedTool ?? "none"}`,
        );
      }
    }
    log("");
  }

  log("## 2. Tracer entity map (pure)");
  const mapping = mappingForTool("propose_screenplay_from_narrative");
  log(
    `- propose_screenplay_from_narrative → ${JSON.stringify(mapping)} (expected write/screenplay)`,
  );
  if (mapping?.access !== "write" || mapping?.domain !== "screenplay") {
    failures.push(
      `entity map: propose_screenplay_from_narrative resolves to ${JSON.stringify(mapping)}, not a screenplay WRITE`,
    );
  }
  log("");

  log("## 3. First-draft generator output is Fountain, not treatment prose");
  // Tiny fixture + tight cap: the smoke checks the FORMAT contract, not length.
  const gen = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 700,
    system: SCREENPLAY_FIRST_DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildFirstDraftUserPrompt(
          `SOGGETTO:\n---\n${SOGGETTO_FIXTURE}\n---`,
          "Massimo 3 scene, molto breve: è uno smoke test di formato.",
        ),
      },
    ],
  });
  const fountain = textOf(gen);
  const sluglines = fountain
    .split("\n")
    .filter((l) => /^(INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.)/i.test(l.trim()));
  log(`- output (first 400 chars):`);
  log("```fountain");
  log(fountain.slice(0, 400));
  log("```");
  log(`- sluglines found: ${sluglines.length}`);
  if (sluglines.length === 0) {
    failures.push(
      "generator: no Fountain slugline (INT./EXT.) in the first-draft output — looks like prose, not a screenplay",
    );
  }
  log("");

  log("──────────────────────────────────────────────");
  if (failures.length > 0) {
    log(`❌ N67 entity routing FAILED (${failures.length}):`);
    for (const f of failures) log(`   - ${f}`);
  } else {
    log(
      "✅ N67 entity routing PASSED — sceneggiatura request routes to the screenplay first-draft tool (write/screenplay), treatment control intact, generator emits Fountain.",
    );
  }

  const outDir = path.join(REPO_ROOT, "vernissage", "n67-entity-routing");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `smoke-${stamp}.md`);
  await writeFile(outPath, `${transcript.join("\n")}\n`);
  console.log(`\nTranscript written to ${path.relative(REPO_ROOT, outPath)}`);

  if (failures.length > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(
    `cost-smoke-cesare-entity-routing crashed: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(99);
});
