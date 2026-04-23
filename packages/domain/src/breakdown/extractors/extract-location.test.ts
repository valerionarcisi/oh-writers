import { describe, it, expect } from "vitest";
import { extractLocation } from "./extract-location.js";

describe("extractLocation", () => {
  it("parses a simple INT. heading", () => {
    const items = extractLocation("INT. CUCINA - NOTTE");
    expect(items).toEqual([
      {
        category: "locations",
        name: "Cucina",
        quantity: 1,
        defaultStatus: "accepted",
        source: "regex",
      },
    ]);
  });

  it("parses an EXT. heading without time-of-day", () => {
    const items = extractLocation("EXT. STRADA");
    expect(items[0]?.name).toBe("Strada");
  });

  it("splits compound INT/EXT. heading on '/'", () => {
    const items = extractLocation(
      "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE",
    );
    expect(items.map((i) => i.name)).toEqual([
      "Angolo Open Grezzo",
      "Fuori Dalla Porta",
    ]);
  });

  it("handles I/E. prefix", () => {
    const items = extractLocation("I/E. AUTO - GIORNO");
    expect(items[0]?.name).toBe("Auto");
  });

  it("returns empty for empty input", () => {
    expect(extractLocation("")).toEqual([]);
    expect(extractLocation("   ")).toEqual([]);
  });

  it("dedupes when same location appears twice in compound heading", () => {
    const items = extractLocation("INT. CUCINA/CUCINA - NOTTE");
    expect(items).toHaveLength(1);
  });
});
