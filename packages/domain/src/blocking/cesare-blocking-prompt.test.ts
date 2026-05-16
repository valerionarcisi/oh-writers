import { describe, it, expect } from "vitest";
import {
  buildCesareBlockingPrompt,
  parseCesareBlockingResponse,
  type CesareBlockingInput,
} from "./cesare-blocking-prompt";

const INPUT: CesareBlockingInput = {
  fountainText: "Giulia siede al tavolo. Sergio entra dalla porta.",
  sceneHeading: "INT. PIZZERIA SOTTOSCALA — NOTTE",
  cast: [
    { id: "giulia", label: "Giulia" },
    { id: "sergio", label: "Sergio" },
  ],
  props: [{ id: "prop-1", label: "Tavolo principale" }],
  shots: [
    { id: "shot-1", shotSize: "WS", cameraMovement: "STATIC", cameraLabel: "A · WS" },
    { id: "shot-2", shotSize: "CU", cameraMovement: "STATIC", cameraLabel: "B · CU G" },
  ],
  locationPrimitives: [
    { type: "furniture", x: 400, y: 300, w: 200, h: 120, label: "Tavolo principale", propRef: null },
  ],
  widthCm: 1400,
  heightCm: 1000,
  projectSuggestionHistory: { accepted: [], ignored: [] },
};

describe("buildCesareBlockingPrompt", () => {
  it("includes scene heading", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("INT. PIZZERIA SOTTOSCALA");
  });

  it("includes all cast names", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("Giulia");
    expect(prompt).toContain("Sergio");
  });

  it("includes shot ids", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("shot-1");
    expect(prompt).toContain("shot-2");
  });

  it("includes canvas dimensions", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("1400");
    expect(prompt).toContain("1000");
  });

  it("includes furniture label", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("Tavolo principale");
  });
});

describe("parseCesareBlockingResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      actorPositions: [
        { castId: "giulia", label: "Giulia", x: 400, y: 300, arrow: null },
      ],
      cameraPins: [
        { shotId: "shot-1", label: "A · WS", x: 900, y: 800, coneAngle: 60, coneDirection: 0, movement: null },
      ],
    });
    const result = parseCesareBlockingResponse(raw, INPUT);
    expect(result.actorPositions).toHaveLength(1);
    expect(result.cameraPins).toHaveLength(1);
    expect(result.actorPositions[0]!.castId).toBe("giulia");
  });

  it("falls back to safe defaults on malformed JSON", () => {
    const result = parseCesareBlockingResponse("not json", INPUT);
    expect(result.actorPositions).toHaveLength(INPUT.cast.length);
    expect(result.cameraPins).toHaveLength(INPUT.shots.length);
  });

  it("falls back to safe defaults on schema violation", () => {
    const result = parseCesareBlockingResponse(
      JSON.stringify({ actorPositions: "wrong", cameraPins: [] }),
      INPUT,
    );
    expect(result.actorPositions).toHaveLength(INPUT.cast.length);
  });
});
