import { describe, it, expect } from "vitest";
import { createMockCesareModel } from "./cesare-tool-loop.mock";

// Cesare Task 4 (streaming) — runProductionToolLoopEffect switched from
// generateText to streamText, but MockLanguageModelV3 (used under
// MOCK_AI=true) only implemented doGenerate. streamText calls doStream,
// which defaults to throwing "Not implemented" — this broke EVERY MOCK_AI
// Playwright spec silently (each turn resolved to the generic error bubble,
// not an obvious stack trace). This test locks doStream in place so a future
// change to the mock can't reintroduce the regression without a fast local
// signal, instead of only failing far away in a Playwright run.

const minimalPrompt = (userText: string) => [
  {
    role: "user" as const,
    content: [{ type: "text" as const, text: userText }],
  },
];

describe("createMockCesareModel — doStream", () => {
  it("doStream resolves (does not throw 'Not implemented')", async () => {
    const model = createMockCesareModel();
    await expect(
      model.doStream({
        prompt: minimalPrompt("un messaggio che non matcha nessuno scenario"),
      } as Parameters<typeof model.doStream>[0]),
    ).resolves.toBeDefined();
  });

  it("the stream yields at least a stream-start and a finish part", async () => {
    const model = createMockCesareModel();
    const result = await model.doStream({
      prompt: minimalPrompt("un messaggio che non matcha nessuno scenario"),
    } as Parameters<typeof model.doStream>[0]);

    const parts: unknown[] = [];
    const reader = result.stream.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    const types = parts.map((p) => (p as { type: string }).type);
    expect(types).toContain("stream-start");
    expect(types).toContain("finish");
  });

  it("the streamed text matches what doGenerate would have produced for the same fallback prompt", async () => {
    const model = createMockCesareModel();
    const prompt = minimalPrompt(
      "un messaggio che non matcha nessuno scenario",
    );

    const generated = await model.doGenerate({
      prompt,
    } as Parameters<typeof model.doGenerate>[0]);
    const generatedText = generated.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    const streamed = await model.doStream({
      prompt,
    } as Parameters<typeof model.doStream>[0]);
    const reader = streamed.stream.getReader();
    let streamedText = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value as { type: string; delta?: string };
      if (part.type === "text-delta" && part.delta) streamedText += part.delta;
    }

    expect(streamedText).toBe(generatedText);
  });
});
