// Real-AI smoke for the classifier prompt (#119) — NOT part of the normal
// suite: runs only with RUN_REAL_AI_SMOKE=1 (spends ~$0.001 of the connected
// user's OpenRouter credit, read-only against the dev DB). Kept as a file so
// the next prompt change has a ready-made harness:
//
//   RUN_REAL_AI_SMOKE=1 SMOKE_USER_ID=<uuid> pnpm vitest run \
//     app/features/predictions/cesare-intent-classifier.smoke.test.ts
//
// Requires apps/web/.env (DATABASE_URL, AI_KEY_ENCRYPTION_SECRET) loaded by
// the config below, and a user with a connected provider + chosen models.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const enabled = process.env["RUN_REAL_AI_SMOKE"] === "1";

// Minimal .env loader (dotenv is not a dependency of apps/web): KEY=VALUE
// lines only, existing process.env wins. Only when the smoke is armed — in CI
// there is no .env and the file must stay an importable no-op.
if (enabled) {
  for (const line of readFileSync(
    path.resolve(__dirname, "../../../.env"),
    "utf8",
  ).split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}
const userId =
  process.env["SMOKE_USER_ID"] ?? "00000000-0000-4000-a000-000000000003";

describe.runIf(enabled)("classifier real-AI smoke (#119)", () => {
  it("classifies a translation ask and an explicit new-version ask live", async () => {
    const { getDb } = await import("~/server/db");
    const db = await getDb();
    const { classifyIntent } = await import("./cesare-intent-classifier");

    const tools = new Set(["transform_document", "propose_soggetto_v2"]);

    const translation = await classifyIntent({
      userMessage: "mi serve una versione in ingelse da mandare ai produttori",
      page: "soggetto",
      availableTools: tools,
      userId,
      db,
    });
    expect(translation.isOk()).toBe(true);
    const t = translation._unsafeUnwrap();
    expect(t.type).toBe("translate_document");
    expect(t.suggestedTool).toBe("transform_document");

    const mint = await classifyIntent({
      userMessage: "keep this version and rewrite the soggetto shorter",
      page: "soggetto",
      availableTools: tools,
      userId,
      db,
    });
    expect(mint.isOk()).toBe(true);
    const m = mint._unsafeUnwrap();
    expect(m.versionDirective).toBe("mint");

    const plain = await classifyIntent({
      userMessage: "riscrivi il soggetto più asciutto",
      page: "soggetto",
      availableTools: tools,
      userId,
      db,
    });
    const p = plain._unsafeUnwrap();
    expect(p.versionDirective).toBeUndefined();
  }, 60_000);
});

describe.runIf(!enabled)("classifier real-AI smoke (skipped)", () => {
  it("is disabled without RUN_REAL_AI_SMOKE=1", () => {
    expect(enabled).toBe(false);
  });
});
