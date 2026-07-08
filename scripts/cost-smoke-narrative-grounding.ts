/**
 * cost-smoke-narrative-grounding — burns a tiny amount of real Anthropic credit
 * to verify Cesare narrative margin notes stay both grounded AND useful:
 *   N-27 side: must NOT (a) invent characters/events not in the text, nor
 *              (b) impose a three-act frame on prose that declares no acts.
 *   #99 side:  must NOT collapse everything into "OK editoriale" — a substantial
 *              soggetto must surface ≥1 real_problem/risk note, not laundered
 *              into authorial_choice/optional.
 * The two checks form a two-sided balance gate (too harsh vs too permissive).
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
  NARRATIVE_POLISH_MAX_TOKENS,
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
// ("vicino" was dropped: too many false positives — it's the common word for
// "near/close", not just the noun "neighbour".)
const INVENTED_TOKENS = ["notaio", "parente geloso", "fratello", "sorella"];
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
    // Alias, not a pinned snapshot, so the smoke tracks the model prod serves
    // (anthropic-client.ts DEFAULT_MODEL). max_tokens shared with prod (#99).
    model: "claude-haiku-4-5",
    max_tokens: NARRATIVE_POLISH_MAX_TOKENS,
    system: buildNarrativeSystemPrompt(DocumentTypes.SOGGETTO),
    tools: [NARRATIVE_POLISH_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: SOGGETTO }],
  });

  const toolBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === TOOL_NAME,
  );
  const suggestions = toolBlock?.input?.suggestions ?? [];

  // A truncated response (stop_reason=max_tokens) yields an empty tool input →
  // 0 suggestions → silent [] in prod. Surface it here so the smoke is diagnosable.
  if (suggestions.length === 0) {
    console.error(
      `⚠ empty tool input — stop_reason=${response.stop_reason}, blocks=[${response.content
        .map((b) => b.type)
        .join(",")}]`,
    );
  }

  console.log(`\nReceived ${suggestions.length} suggestions:\n`);
  const failures: string[] = [];

  // #99 targets "hiding behind soft classification": a real weakness must surface
  // as an actual real_problem/risk, not be laundered into optional/authorial_choice
  // /approved. So the balance signal is the TYPE (a genuine problem was raised),
  // decoupled from the model's often-conservative severity labeling.
  const REAL_RILIEVO_TYPES = new Set(["real_problem", "risk"]);
  let realRilievoCount = 0;

  // A proposal exempts an invented token only when the marker directly frames
  // THAT token ("potresti introdurre un notaio"), not when a stray modal appears
  // elsewhere in the note ("il notaio potrebbe complicare…" is still a violation).
  const isProposedNear = (text: string, tokenIdx: number): boolean =>
    PROPOSAL_MARKERS.some((m) => {
      const from = Math.max(0, tokenIdx - 40);
      return text.slice(from, tokenIdx).includes(m);
    });

  for (const s of suggestions) {
    // Real tool schema fields (see NARRATIVE_POLISH_TOOL): area/title/body/type/severity.
    const type = (s["type"] ?? "").toLowerCase();
    const severity = (s["severity"] ?? "").toLowerCase();
    const title = (s["title"] ?? "").toLowerCase();
    const body = (s["body"] ?? "").toLowerCase();
    const text = `${title} ${body}`;

    if (REAL_RILIEVO_TYPES.has(type)) realRilievoCount += 1;

    console.log(
      `  • [${s["area"]} › ${type}/${severity}] ${s["title"]} — ${s["body"]}`,
    );

    for (const tok of ACT_TOKENS) {
      if (text.includes(tok))
        failures.push(`ACT frame imposed ("${tok}"): ${s["title"]}`);
    }
    // An invented element is a failure only when asserted as present (i.e. NOT
    // framed as a proposal directly on that element). Rule 2 allows proposing
    // new elements explicitly.
    for (const tok of INVENTED_TOKENS) {
      const idx = text.indexOf(tok);
      if (idx !== -1 && !isProposedNear(text, idx)) {
        failures.push(
          `Invented element asserted as present ("${tok}"): ${s["title"]}`,
        );
      }
    }
  }

  console.log("\n──────────────────────────────────────────────");
  if (suggestions.length < 3) {
    failures.push(`Expected ≥3 suggestions, got ${suggestions.length}`);
  }
  // Balance gate (#99): the Marta soggetto has real editorial texture (abrupt
  // reveal, thin antagonist pressure), so an over-permissive prompt that launders
  // every weakness into optional/authorial_choice/approved must fail here. This is
  // the two-sided counterpart to the N-27 grounding check above.
  if (realRilievoCount < 1) {
    failures.push(
      `BALANCE: no real_problem/risk note surfaced (got ${realRilievoCount}) — prompt hides rilievi behind soft classification (#99).`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `\n❌ narrative grounding+balance FAILED (${failures.length}):`,
    );
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }
  console.log(
    `\n✅ PASSED — no invented elements, no imposed acts, and ${realRilievoCount} real_problem/risk note(s) surfaced.`,
  );
}

void main();
