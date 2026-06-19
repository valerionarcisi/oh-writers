import { describe, it, expect } from "vitest";
import { matchCase } from "./proposed-edit-decoration";

// A screenplay rename must keep each occurrence's case convention: the character
// cue / slugline is ALL-CAPS, body mentions are Capitalized.
describe("[OHW-rename-case] matchCase", () => {
  it("an ALL-CAPS occurrence (cue/heading) → uppercase replacement", () => {
    expect(matchCase("JOHN", "Jack")).toBe("JACK");
  });

  it("a Capitalized occurrence (body mention) → capitalised replacement", () => {
    expect(matchCase("John", "jack")).toBe("Jack");
  });

  it("a lowercase occurrence → verbatim replacement", () => {
    expect(matchCase("john", "Jack")).toBe("Jack");
  });

  it("a multi-word ALL-CAPS sample upper-cases the whole replacement", () => {
    expect(matchCase("OLD BAR", "new venue")).toBe("NEW VENUE");
  });

  it("an empty sample returns the replacement unchanged", () => {
    expect(matchCase("", "Jack")).toBe("Jack");
  });
});
