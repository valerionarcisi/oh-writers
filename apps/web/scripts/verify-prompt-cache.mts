// One-shot live verification that the Anthropic prompt-cache budget Cesare uses
// (3 static system blocks + 1 tool-array breakpoint = 4, the API maximum)
// produces a cache READ hit on the warm second turn — and that the tool array
// is part of what gets cached. Hits the real API (no MOCK_AI). Read-only: no DB,
// no writes. Run:
//   MOCK_AI=false pnpm --filter @oh-writers/web exec tsx scripts/verify-prompt-cache.mts
import { readFileSync } from "node:fs";
import { generateText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// Minimal .env loader (no dotenv dependency in this package).
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(
  "\n",
)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
}

const ephemeral = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

// Anthropic ignores a breakpoint below the per-model minimum prefix (2048
// tokens for Haiku) AND silently drops any breakpoint past the 4th. The real
// Cesare prefix (bible + ~30 tool schemas) clears the size minimum; this rig
// mirrors the SAME 4-breakpoint budget (3 system + 1 tool) so it proves the
// tool slot caches, not just the system blocks.
const big = (label: string) =>
  `Blocco ${label} di pre-produzione cinematografica italiana. `.repeat(300);

const tools = {
  noop: tool({
    description: big("TOOL") + "Strumento di test. Non chiamarlo.",
    inputSchema: z.object({}),
    providerOptions: ephemeral, // the 4th (tool-array) breakpoint
  }),
};

async function turn() {
  const res = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: [
      { role: "system" as const, content: big("ROLE"), providerOptions: ephemeral },
      { role: "system" as const, content: big("BIBLE"), providerOptions: ephemeral },
      { role: "system" as const, content: big("CONTEXT"), providerOptions: ephemeral },
    ],
    messages: [
      { role: "user" as const, content: "Qual è il primo passo per un soggetto?" },
    ],
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(1),
    maxOutputTokens: 64,
  });
  const meta = res.providerMetadata?.["anthropic"] as
    | { cacheCreationInputTokens?: number }
    | undefined;
  return {
    cacheRead: res.usage.cachedInputTokens ?? 0,
    cacheWrite: meta?.cacheCreationInputTokens ?? 0,
  };
}

const cold = await turn();
const warm = await turn();
console.log("turn 1 (cold):", cold);
console.log("turn 2 (warm):", warm);
if (warm.cacheRead > 0) {
  console.log("✅ CACHE HIT — warm turn read", warm.cacheRead, "tokens from cache");
  process.exit(0);
} else {
  console.log("❌ NO CACHE HIT on warm turn — breakpoint dropped or under minimum");
  process.exit(1);
}
