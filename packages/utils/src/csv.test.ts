import { describe, expect, it } from "vitest";
import { escapeCsv, toCsv } from "./csv.js";

describe("escapeCsv", () => {
  it("passes plain cells through", () => {
    expect(escapeCsv("hello world")).toBe("hello world");
  });

  it("quotes cells containing commas, quotes, CR or LF", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsv("line\rbreak")).toBe('"line\rbreak"');
  });
});

describe("toCsv", () => {
  it("writes header + rows, one line each", () => {
    const out = toCsv(
      ["A", "B"],
      [
        ["1", "x"],
        ["2", "y,z"],
      ],
    );
    expect(out).toBe('A,B\n1,x\n2,"y,z"');
  });

  it("escapes every cell including header", () => {
    const out = toCsv(["H,1"], [["v\r\nw"]]);
    expect(out).toBe('"H,1"\n"v\r\nw"');
  });
});
