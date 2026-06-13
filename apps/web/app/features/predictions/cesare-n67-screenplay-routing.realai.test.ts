// Real-AI smoke for BUG-N67 (Spec 75): "scrivimi la prima stesura della
// sceneggiatura partendo dal soggetto" must route to the SCREENPLAY generator,
// NOT the Trattamento generator.
//
// This calls the REAL Haiku classifier — it is the trust-critical path the bug
// exposed (a mock can't prove the model disambiguates screenplay vs treatment).
// It runs ONLY when ANTHROPIC_API_KEY is set, and is skipped otherwise so CI and
// the offline unit run stay green and free. Run ad-hoc:
//
//   ANTHROPIC_API_KEY=sk-… pnpm -C apps/web exec vitest run \
//     app/features/predictions/cesare-n67-screenplay-routing.realai.test.ts
//
// NOTE: no `vi.mock("~/features/ai")` here on purpose — we exercise the live
// Haiku call.
import { describe, it, expect, beforeAll } from "vitest";
import { classifyIntent } from "./cesare-intent-classifier";

const hasKey = !!process.env["ANTHROPIC_API_KEY"];
const run = hasKey ? describe : describe.skip;

const DOC_TOOLS = new Set([
  "write_logline",
  "propose_soggetto_v2",
  "propose_synopsis_from_screenplay",
  "propose_scaletta_from_soggetto",
  "propose_treatment_from_narrative",
  "generate_screenplay_from_narrative",
]);

run(
  "[OHW-N67] real-AI: screenplay request routes to the screenplay generator",
  () => {
    beforeAll(() => {
      // The classifier short-circuits under MOCK_AI; ensure the real path runs.
      if (process.env["MOCK_AI"] === "true") {
        throw new Error("Unset MOCK_AI to run the real-AI N67 smoke.");
      }
    });

    const phrasings = [
      "partendo dal soggetto attivo, riesci a scrivermi la prima stesura della sceneggiatura?",
      "scrivimi la sceneggiatura",
      "dal soggetto fammi la sceneggiatura",
    ];

    for (const userMessage of phrasings) {
      it(`routes to generate_screenplay_from_narrative — "${userMessage.slice(0, 40)}…"`, async () => {
        const result = await classifyIntent({
          userMessage,
          page: "soggetto",
          availableTools: DOC_TOOLS,
        });
        const intent = result._unsafeUnwrap();
        // The whole point of N67: NOT the treatment generator.
        expect(intent.suggestedTool).not.toBe(
          "propose_treatment_from_narrative",
        );
        expect(intent.suggestedTool).toBe("generate_screenplay_from_narrative");
      }, 30_000);
    }
  },
);
