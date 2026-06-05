/**
 * cost-smoke-narrative-grounding — burns a tiny amount of real Anthropic credit
 * to verify N-27 is fixed: Cesare narrative margin notes must stay grounded in
 * the document and must NOT (a) invent characters/events not in the text, nor
 * (b) impose a three-act frame on prose that declares no acts.
 *
 * Mock mode returns static fixtures, so this is the ONLY way to validate the
 * grounding constraints in `narrative-polish.server.ts`. NOT for CI — run
 * ad-hoc when the grounding rules or the narrative system prompts change.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-… pnpm cost:smoke:narrative-grounding
 *
 * Exit code is non-zero if any grounding assertion fails.
 */

import "./_load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  buildNarrativeSystemPrompt,
  NARRATIVE_POLISH_TOOL,
  TOOL_NAME,
} from "../apps/web/app/features/documents/server/narrative-polish-prompt";
import { DocumentTypes } from "@oh-writers/domain";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const require = createRequire(
  path.join(REPO_ROOT, "apps", "web", "package.json"),
);

interface AnthropicContentBlock {
  readonly type: string;
  readonly name?: string;
  readonly input?: { suggestions?: ReadonlyArray<Record<string, string>> };
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

// A controlled soggetto: only Marta + the manoscritto + the libreria exist. No
// notaio, no jealous relative, no declared acts. Any note that names a person
// or structure not present here is a grounding violation.
const SOGGETTO = `Marta gestisce una piccola libreria di provincia ereditata dal padre.
Tra gli scaffali trova un manoscritto mai pubblicato, scritto a mano, senza firma.
Le pagine raccontano la sua stessa infanzia con dettagli che nessuno potrebbe conoscere.
Marta inizia a cercare chi lo ha scritto, e ogni indizio la riporta dentro la libreria.
Capisce che il manoscritto continua a scriversi da solo, una pagina ogni notte.`;

// Tokens that, if asserted as present (not framed as a proposal), prove the
// model invented an element. We check these only in non-proposal context below.
const INVENTED_TOKENS = [
  "notaio",
  "parente geloso",
  "fratello",
  "sorella",
  "vicino",
];
const ACT_TOKENS = [
  "atto i",
  "atto ii",
  "atto iii",
  "primo atto",
  "secondo atto",
  "terzo atto",
];
const PROPOSAL_MARKERS = [
  "potresti",
  "valuta se",
  "considera",
  "potrebbe",
  "se aggiung",
];

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || !apiKey.startsWith("sk-")) {
    console.error("ANTHROPIC_API_KEY missing or invalid (expected sk-…).");
    process.exit(2);
  }

  const Anthropic = loadAnthropic();
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: buildNarrativeSystemPrompt(DocumentTypes.SOGGETTO),
    tools: [NARRATIVE_POLISH_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: SOGGETTO }],
  });

  const toolBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === TOOL_NAME,
  );
  const suggestions = toolBlock?.input?.suggestions ?? [];

  console.log(`\nReceived ${suggestions.length} suggestions:\n`);
  const failures: string[] = [];

  for (const s of suggestions) {
    const category = (s["category"] ?? "").toLowerCase();
    const message = (s["message"] ?? "").toLowerCase();
    const text = `${category} ${message}`;
    const isProposal = PROPOSAL_MARKERS.some((m) => message.includes(m));

    console.log(`  • [${s["group"]} › ${s["category"]}] ${s["message"]}`);

    for (const tok of ACT_TOKENS) {
      if (text.includes(tok))
        failures.push(`ACT frame imposed ("${tok}"): ${s["message"]}`);
    }
    // An invented element is a failure only when asserted as present (i.e. NOT
    // framed as a proposal). Rule 2 allows proposing new elements explicitly.
    for (const tok of INVENTED_TOKENS) {
      if (text.includes(tok) && !isProposal) {
        failures.push(
          `Invented element asserted as present ("${tok}"): ${s["message"]}`,
        );
      }
    }
  }

  console.log("\n──────────────────────────────────────────────");
  if (suggestions.length < 3) {
    failures.push(`Expected ≥3 suggestions, got ${suggestions.length}`);
  }
  if (failures.length > 0) {
    console.error(`\n❌ N-27 grounding FAILED (${failures.length}):`);
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }
  console.log(
    "\n✅ N-27 grounding PASSED — no invented elements asserted, no imposed acts.",
  );
}

void main();
