// apps/web/app/features/app-shell/versions-peek.test.ts
//
// [OHW-049] Unit coverage for the `?versions=` validator that drives the routed
// Versions SplitDrawer (Spec 49 W1). The parser must fail CLOSED: a malformed
// document id yields an error so the shell renders the host page alone. The
// same-project guard is enforced downstream (the versions server fn read-gates
// the document), so a shape-valid but foreign UUID parses here and resolves to
// not-found at fetch time — never leaked content.

import { describe, it, expect } from "vitest";
import {
  parseVersionsPeek,
  parseVersionsCompare,
  serializeVersionsCompare,
  versionsSearchSchema,
  VERSIONS_SURFACE_STATES,
} from "./versions-peek";

const DOC = "00000000-0000-4000-a000-000000000022";
const OTHER_DOC = "11111111-1111-4111-b111-111111111111";
const CUR = "22222222-2222-4222-a222-222222222222";
const VA = "33333333-3333-4333-a333-333333333333";
const VB = "44444444-4444-4444-a444-444444444444";

describe("parseVersionsPeek — happy paths", () => {
  it("accepts a well-formed document UUID, defaulting to the split state", () => {
    const r = parseVersionsPeek(DOC, null);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({
      documentId: DOC,
      state: "split",
      currentVersionId: null,
    });
  });

  it("honours the `full` state companion", () => {
    const r = parseVersionsPeek(DOC, "full");
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().state).toBe("full");
  });

  it("treats any non-`full` state as split (fail soft on the layout flag)", () => {
    expect(parseVersionsPeek(DOC, "split")._unsafeUnwrap().state).toBe("split");
    expect(parseVersionsPeek(DOC, "garbage")._unsafeUnwrap().state).toBe(
      "split",
    );
    expect(parseVersionsPeek(DOC, null)._unsafeUnwrap().state).toBe("split");
  });

  it("carries a well-formed `vcur` baseline", () => {
    const r = parseVersionsPeek(DOC, "split", CUR);
    expect(r._unsafeUnwrap().currentVersionId).toBe(CUR);
  });

  it("ignores a malformed `vcur` baseline (falls back client-side)", () => {
    expect(
      parseVersionsPeek(DOC, "split", "not-a-uuid")._unsafeUnwrap()
        .currentVersionId,
    ).toBeNull();
    expect(
      parseVersionsPeek(DOC, "split", "")._unsafeUnwrap().currentVersionId,
    ).toBeNull();
  });

  it("trims surrounding whitespace on the document id", () => {
    const r = parseVersionsPeek(`  ${DOC}  `, null);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().documentId).toBe(DOC);
  });

  it("accepts a foreign-but-shape-valid UUID (cross-project guard is downstream)", () => {
    // The param carries no project segment; a foreign document id is
    // shape-valid here and is rejected at the read-gated server fn (not-found),
    // so this MUST parse — the guard cannot live in the param validator.
    const r = parseVersionsPeek(OTHER_DOC, null);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().documentId).toBe(OTHER_DOC);
  });
});

describe("parseVersionsPeek — fail closed (sad paths)", () => {
  it("rejects empty / nullish", () => {
    expect(parseVersionsPeek(null, null).isErr()).toBe(true);
    expect(parseVersionsPeek(undefined, null).isErr()).toBe(true);
    expect(parseVersionsPeek("", null).isErr()).toBe(true);
    expect(parseVersionsPeek("   ", null).isErr()).toBe(true);
    expect(parseVersionsPeek("", null)._unsafeUnwrapErr().reason).toBe("empty");
  });

  it("rejects a non-UUID document id (no open surface on junk)", () => {
    const r = parseVersionsPeek("../../etc/passwd", null);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-a-uuid");
  });

  it("rejects a path-shaped value (the param is an id, never a path)", () => {
    const r = parseVersionsPeek(`/projects/x/${DOC}`, null);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-a-uuid");
  });

  it("rejects an absolute URL (open-redirect surface guard)", () => {
    const r = parseVersionsPeek("https://evil.example/steal", null);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-a-uuid");
  });
});

describe("versionsSearchSchema", () => {
  it("accepts an absent surface", () => {
    expect(versionsSearchSchema.parse({})).toEqual({});
  });

  it("accepts a present document id + companions", () => {
    expect(
      versionsSearchSchema.parse({
        versions: DOC,
        vstate: "full",
        vcur: CUR,
        compare: `${VA},${VB}`,
      }),
    ).toEqual({
      versions: DOC,
      vstate: "full",
      vcur: CUR,
      compare: `${VA},${VB}`,
    });
  });

  it("rejects an empty-string versions param", () => {
    expect(versionsSearchSchema.safeParse({ versions: "" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown vstate value", () => {
    expect(
      versionsSearchSchema.safeParse({ versions: DOC, vstate: "weird" })
        .success,
    ).toBe(false);
  });

  it("exposes the canonical surface states", () => {
    expect(VERSIONS_SURFACE_STATES).toEqual(["split", "full"]);
  });
});

describe("parseVersionsCompare — happy paths (W3 Confronta)", () => {
  it("accepts two distinct well-formed version UUIDs", () => {
    const r = parseVersionsCompare(`${VA},${VB}`);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({ a: VA, b: VB });
  });

  it("preserves the pair order (a = left/old, b = right/new)", () => {
    expect(parseVersionsCompare(`${VB},${VA}`)._unsafeUnwrap()).toEqual({
      a: VB,
      b: VA,
    });
  });

  it("trims surrounding whitespace around each id", () => {
    const r = parseVersionsCompare(`  ${VA} ,  ${VB}  `);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toEqual({ a: VA, b: VB });
  });

  it("round-trips through serializeVersionsCompare", () => {
    const pair = { a: VA, b: VB };
    const s = serializeVersionsCompare(pair);
    expect(s).toBe(`${VA},${VB}`);
    expect(parseVersionsCompare(s)._unsafeUnwrap()).toEqual(pair);
  });

  it("accepts a foreign-but-shape-valid pair (same-document guard is downstream)", () => {
    // The param carries no document segment; a pair belonging to another
    // document is shape-valid here and is dropped client-side (an id absent
    // from the loaded version list resolves to no content). So this MUST parse.
    const r = parseVersionsCompare(`${OTHER_DOC},${CUR}`);
    expect(r.isOk()).toBe(true);
  });
});

describe("parseVersionsCompare — fail closed (sad paths)", () => {
  it("rejects empty / nullish (no compare on absence)", () => {
    expect(parseVersionsCompare(null).isErr()).toBe(true);
    expect(parseVersionsCompare(undefined).isErr()).toBe(true);
    expect(parseVersionsCompare("").isErr()).toBe(true);
    expect(parseVersionsCompare("   ").isErr()).toBe(true);
    expect(parseVersionsCompare("")._unsafeUnwrapErr().reason).toBe("empty");
  });

  it("rejects a single id (a compare needs exactly two)", () => {
    const r = parseVersionsCompare(VA);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-a-pair");
  });

  it("rejects more than two ids", () => {
    const r = parseVersionsCompare(`${VA},${VB},${CUR}`);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("not-a-pair");
  });

  it("rejects a pair where either id is not a UUID", () => {
    expect(
      parseVersionsCompare(`${VA},not-a-uuid`)._unsafeUnwrapErr().reason,
    ).toBe("not-a-uuid");
    expect(
      parseVersionsCompare(`../../etc,${VB}`)._unsafeUnwrapErr().reason,
    ).toBe("not-a-uuid");
  });

  it("rejects two identical ids (a self-compare is meaningless)", () => {
    const r = parseVersionsCompare(`${VA},${VA}`);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().reason).toBe("same-version");
  });

  it("rejects a path/URL-shaped value (no open compare on junk)", () => {
    expect(
      parseVersionsCompare(
        "https://evil.example/a,https://evil.example/b",
      ).isErr(),
    ).toBe(true);
  });
});
