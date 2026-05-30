// apps/web/app/features/app-shell/cesare-peek.test.ts
//
// [OHW-047-A4] Unit coverage for the `?peek=` validator that drives the
// Notion-style split drawer. The parser must fail CLOSED: any untrusted param
// (cross-project, cross-origin, junk) yields an error so the shell renders the
// host page alone with no leaked content and no open redirect.

import { describe, it, expect } from "vitest";
import {
  parseCesarePeek,
  isCesarePeek,
  peekSearchSchema,
  CESARE_PEEK_TOKEN,
} from "./cesare-peek";

const PROJECT = "00000000-0000-4000-a000-000000000011";
const OTHER_PROJECT = "11111111-1111-4111-b111-111111111111";

describe("parseCesarePeek — happy paths", () => {
  it("accepts the bare `cesare` token", () => {
    const r = parseCesarePeek(CESARE_PEEK_TOKEN, PROJECT);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({ kind: "cesare" });
  });

  it("accepts a same-project in-app path", () => {
    const r = parseCesarePeek(`/projects/${PROJECT}/synopsis`, PROJECT);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({
      kind: "page",
      path: `/projects/${PROJECT}/synopsis`,
    });
  });

  it("accepts a same-project path with a hash anchor", () => {
    const path = `/projects/${PROJECT}/screenplay#scene-3`;
    const r = parseCesarePeek(path, PROJECT);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({ kind: "page", path });
  });

  it("accepts the project home exactly", () => {
    const r = parseCesarePeek(`/projects/${PROJECT}`, PROJECT);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({
      kind: "page",
      path: `/projects/${PROJECT}`,
    });
  });

  it("decodes a URL-encoded same-project path", () => {
    const encoded = encodeURIComponent(`/projects/${PROJECT}/screenplay#sc-3`);
    const r = parseCesarePeek(encoded, PROJECT);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({
      kind: "page",
      path: `/projects/${PROJECT}/screenplay#sc-3`,
    });
  });
});

describe("parseCesarePeek — fail closed (sad paths)", () => {
  it("rejects empty / nullish", () => {
    expect(parseCesarePeek(null, PROJECT).isErr()).toBe(true);
    expect(parseCesarePeek(undefined, PROJECT).isErr()).toBe(true);
    expect(parseCesarePeek("", PROJECT).isErr()).toBe(true);
    expect(parseCesarePeek("   ", PROJECT).isErr()).toBe(true);
    expect(parseCesarePeek("", PROJECT)._unsafeUnwrapErr().reason).toBe(
      "empty",
    );
  });

  it("rejects a cross-project path", () => {
    const r = parseCesarePeek(`/projects/${OTHER_PROJECT}/budget`, PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("cross-project");
  });

  it("rejects a path when there is no current project", () => {
    const r = parseCesarePeek(`/projects/${PROJECT}/budget`, null);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("cross-project");
  });

  it("rejects an absolute cross-origin URL (open-redirect guard)", () => {
    const r = parseCesarePeek("https://evil.example/steal", PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("cross-origin");
  });

  it("rejects a protocol-relative URL", () => {
    const r = parseCesarePeek("//evil.example/steal", PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("cross-origin");
  });

  it("rejects a path outside /projects (not an app path)", () => {
    const r = parseCesarePeek("/settings", PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-app-path");
  });

  it("rejects a peek target carrying its own query string", () => {
    const r = parseCesarePeek(`/projects/${PROJECT}/x?peek=y`, PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("malformed");
  });

  it("rejects a prefix-spoofing project id", () => {
    // `/projects/<PROJECT>-evil/...` must NOT pass the same-project guard.
    const r = parseCesarePeek(`/projects/${PROJECT}-evil/budget`, PROJECT);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("cross-project");
  });
});

describe("isCesarePeek", () => {
  it("is true only for the cesare token in the right project", () => {
    expect(isCesarePeek("cesare", PROJECT)).toBe(true);
    expect(isCesarePeek(`/projects/${PROJECT}/synopsis`, PROJECT)).toBe(false);
    expect(isCesarePeek("nope", PROJECT)).toBe(false);
    expect(isCesarePeek(null, PROJECT)).toBe(false);
  });
});

describe("peekSearchSchema", () => {
  it("accepts an absent peek", () => {
    expect(peekSearchSchema.parse({})).toEqual({});
  });

  it("accepts a present non-empty peek", () => {
    expect(peekSearchSchema.parse({ peek: "cesare" })).toEqual({
      peek: "cesare",
    });
  });

  it("rejects an empty-string peek", () => {
    expect(peekSearchSchema.safeParse({ peek: "" }).success).toBe(false);
  });
});
