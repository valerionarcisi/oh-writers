import { describe, it, expect } from "vitest";
import { extractVehicles } from "./extract-vehicles.js";

describe("extractVehicles", () => {
  it("matches singular and plural via stem", () => {
    const items = extractVehicles("una macchina passa, le macchine sono ferme");
    const macchina = items.find((i) => i.name === "Macchina");
    expect(macchina?.quantity).toBe(2);
  });

  it("matches multiple distinct vehicles in one scene", () => {
    const items = extractVehicles(
      "Un furgone si ferma. Una moto sfreccia. Un'ambulanza arriva.",
    );
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(["Ambulanza", "Furgone", "Moto"]);
  });

  it("does not false-match 'scarpa' as 'macchina'", () => {
    expect(extractVehicles("una sola scarpa")).toEqual([]);
  });

  it("default status is pending (low confidence)", () => {
    const items = extractVehicles("un taxi nero");
    expect(items[0]?.defaultStatus).toBe("pending");
  });

  it("returns empty for empty body", () => {
    expect(extractVehicles("")).toEqual([]);
  });
});
