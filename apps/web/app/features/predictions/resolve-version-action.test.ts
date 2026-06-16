import { describe, it, expect } from "vitest";
import { resolveVersionAction } from "./resolve-version-action";

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

const base = (
  over: Partial<Parameters<typeof resolveVersionAction>[0]> = {},
) => ({
  previousContent: words(100),
  nextContent: words(100).replace("w0", "x"), // small by default
  userRequestedNewVersion: false,
  largeEditConfirmed: false,
  ...over,
});

describe("resolveVersionAction — precedence", () => {
  it("user explicitly asked ⇒ mint (even for a small edit)", () => {
    expect(resolveVersionAction(base({ userRequestedNewVersion: true }))).toBe(
      "mint",
    );
  });

  it("user-asked wins over an otherwise-ask large unconfirmed edit", () => {
    expect(
      resolveVersionAction(
        base({
          userRequestedNewVersion: true,
          nextContent: words(400), // large
          largeEditConfirmed: false,
        }),
      ),
    ).toBe("mint");
  });

  it("first write (empty previous) ⇒ mint", () => {
    expect(
      resolveVersionAction(
        base({ previousContent: "", nextContent: words(20) }),
      ),
    ).toBe("mint");
    expect(
      resolveVersionAction(
        base({ previousContent: "   ", nextContent: words(5) }),
      ),
    ).toBe("mint");
  });

  it("small edit ⇒ overwrite", () => {
    expect(resolveVersionAction(base())).toBe("overwrite");
  });

  it("large edit, not confirmed ⇒ ask", () => {
    expect(
      resolveVersionAction(
        base({ previousContent: words(50), nextContent: words(400) }),
      ),
    ).toBe("ask");
  });

  it("large edit, confirmed ⇒ mint", () => {
    expect(
      resolveVersionAction(
        base({
          previousContent: words(50),
          nextContent: words(400),
          largeEditConfirmed: true,
        }),
      ),
    ).toBe("mint");
  });
});
