import { describe, it, expect } from "vitest";
import {
  parseToolsExecuted,
  parseRewriteSceneMarker,
  parseDocAppliedMarker,
  parseEntityAppliedMarkers,
  parseLiveDiffMarker,
  parseLiveDiffMarkers,
  extractStepBlockMetadata,
  hasAppliedEdit,
  parseToolUpdates,
} from "./CesareConversation";

const docAppliedMarker = (documentType: string): string =>
  `<!--ohw:doc-applied:${JSON.stringify({
    document_type: documentType,
    version_id: "v-new",
    previous_version_id: "v-old",
  })}-->`;

const entityAppliedMarker = (domain: string, label: string): string =>
  `<!--ohw:entity-applied:${JSON.stringify({ domain, label })}-->`;

describe("parseToolsExecuted", () => {
  it("returns 0 when the marker is absent", () => {
    expect(parseToolsExecuted("just a reply")).toBe(0);
  });

  it("parses single-digit tool counts", () => {
    expect(parseToolsExecuted("reply <!--ohw:tools=3-->")).toBe(3);
  });

  it("parses multi-digit tool counts", () => {
    expect(parseToolsExecuted("text <!--ohw:tools=42-->")).toBe(42);
  });

  it("ignores malformed markers", () => {
    expect(parseToolsExecuted("<!--ohw:tools=foo-->")).toBe(0);
  });
});

describe("parseRewriteSceneMarker", () => {
  const encode = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  it("returns null when no marker is present", () => {
    expect(parseRewriteSceneMarker("plain text")).toBeNull();
  });

  it("decodes a valid base64 marker", () => {
    const payload = { scene_number: 5, new_content: "INT. STANZA - GIORNO" };
    const marker = `prefix <!--ohw:rewrite-scene-b64:${encode(payload)}--> suffix`;
    expect(parseRewriteSceneMarker(marker)).toEqual(payload);
  });

  it("rejects payloads with wrong field types", () => {
    const bad = { scene_number: "5", new_content: "" };
    const marker = `<!--ohw:rewrite-scene-b64:${encode(bad)}-->`;
    expect(parseRewriteSceneMarker(marker)).toBeNull();
  });
});

describe("parseDocAppliedMarker", () => {
  it("returns null when no marker is present", () => {
    expect(parseDocAppliedMarker("just a reply")).toBeNull();
  });

  it("parses a doc-applied marker with a previous version", () => {
    const payload = {
      document_type: "soggetto",
      version_id: "v-new",
      previous_version_id: "v-old",
    };
    const marker = `reply <!--ohw:doc-applied:${JSON.stringify(payload)}-->`;
    expect(parseDocAppliedMarker(marker)).toEqual({
      documentType: "soggetto",
      versionId: "v-new",
      previousVersionId: "v-old",
    });
  });

  it("tolerates a null previous version (first content ever written)", () => {
    const payload = {
      document_type: "logline",
      version_id: "v-new",
      previous_version_id: null,
    };
    const marker = `<!--ohw:doc-applied:${JSON.stringify(payload)}-->`;
    expect(parseDocAppliedMarker(marker)).toEqual({
      documentType: "logline",
      versionId: "v-new",
      previousVersionId: null,
    });
  });

  it("returns null when version_id is missing", () => {
    const marker = `<!--ohw:doc-applied:${JSON.stringify({ document_type: "x" })}-->`;
    expect(parseDocAppliedMarker(marker)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(
      parseDocAppliedMarker("<!--ohw:doc-applied:{not json-->"),
    ).toBeNull();
  });
});

// [OHW-047d] word-level live-diff markers — one per touched document, keyed by
// documentType so each involved doc paints its own green inline highlight.
const encodeLiveDiff = (obj: unknown): string => {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

describe("parseEntityAppliedMarkers", () => {
  it("returns an empty array when no marker is present", () => {
    expect(parseEntityAppliedMarkers("just a reply")).toEqual([]);
  });

  it("parses a single entity-applied marker", () => {
    const content = `ok ${entityAppliedMarker("budget", "Budget")}`;
    expect(parseEntityAppliedMarkers(content)).toEqual([
      { domain: "budget", label: "Budget" },
    ]);
  });

  it("parses one marker per touched entity in a turn", () => {
    const content = `${entityAppliedMarker(
      "locations",
      "Location",
    )} ${entityAppliedMarker("schedule", "Calendario")}`;
    expect(parseEntityAppliedMarkers(content).map((m) => m.domain)).toEqual([
      "locations",
      "schedule",
    ]);
  });

  it("falls back to the domain when the label is missing", () => {
    const content = `<!--ohw:entity-applied:${JSON.stringify({
      domain: "budget",
    })}-->`;
    expect(parseEntityAppliedMarkers(content)).toEqual([
      { domain: "budget", label: "budget" },
    ]);
  });

  it("skips markers without a domain and malformed JSON", () => {
    expect(
      parseEntityAppliedMarkers(
        `<!--ohw:entity-applied:${JSON.stringify({ label: "X" })}-->`,
      ),
    ).toEqual([]);
    expect(
      parseEntityAppliedMarkers("<!--ohw:entity-applied:{not json-->"),
    ).toEqual([]);
  });
});

// F-A3 — the result card may claim a change ONLY when a REAL apply signal is
// present. A chat-only reply, a no-op, or a failed tool yields no success card.
describe("hasAppliedEdit (honest success gate)", () => {
  it("is false for a chat-only reply, even with tools executed", () => {
    // tools ran (reads), but nothing was applied: no apply marker present
    const content = "Ho letto il soggetto e ti rispondo. <!--ohw:tools=2-->";
    expect(hasAppliedEdit(extractStepBlockMetadata(content))).toBe(false);
  });

  it("is false when the reply CLAIMS an update but no marker backs it", () => {
    // This is the F-A3 bug shape: text says 'ho aggiornato' but the DB was not
    // touched (no doc-applied / entity-applied marker).
    const content =
      "Ho aggiornato il budget come richiesto. <!--ohw:tools=1-->";
    expect(hasAppliedEdit(extractStepBlockMetadata(content))).toBe(false);
  });

  it("is true when a doc-applied marker is present", () => {
    const content = `Fatto. ${docAppliedMarker("soggetto")} <!--ohw:tools=1-->`;
    expect(hasAppliedEdit(extractStepBlockMetadata(content))).toBe(true);
  });

  it("is true when an entity-applied marker is present", () => {
    const content = `Fatto. ${entityAppliedMarker(
      "budget",
      "Budget",
    )} <!--ohw:tools=1-->`;
    expect(hasAppliedEdit(extractStepBlockMetadata(content))).toBe(true);
  });
});

// F-M1 — the card label comes from the marker's entity (what was actually
// edited), NOT from the current page.
describe("parseToolUpdates (card from real markers)", () => {
  it("labels the card from the doc-applied document_type, not the page", () => {
    // A logline edit issued while on the Soggetto page must say 'logline'.
    const content = `Fatto. ${docAppliedMarker("logline")} <!--ohw:tools=1-->`;
    const parsed = parseToolUpdates(content);
    expect(parsed.title).toBe("Aggiornata Logline");
    expect(parsed.updates).toHaveLength(1);
    expect(parsed.updates[0]!.label).toBe("logline");
    expect(parsed.updates[0]!.kind).toBe("doc");
  });

  it("labels the card from the entity-applied domain for non-doc tools", () => {
    const content = `Fatto. ${entityAppliedMarker(
      "locations",
      "Location",
    )} <!--ohw:tools=1-->`;
    const parsed = parseToolUpdates(content);
    expect(parsed.title).toBe("Aggiornate Location");
    expect(parsed.updates[0]!.kind).toBe("location");
    expect(parsed.updates[0]!.label).toBe("location");
  });

  it("summarises a multi-entity turn with a single honest title", () => {
    const content = `Fatto. ${docAppliedMarker("soggetto")} ${entityAppliedMarker(
      "budget",
      "Budget",
    )} <!--ohw:tools=2-->`;
    const parsed = parseToolUpdates(content);
    expect(parsed.title).toBe("Modifiche applicate");
    expect(parsed.updates.map((u) => u.label)).toEqual(["soggetto", "budget"]);
  });

  it("uses the scene rewrite as the card subject", () => {
    const encode = (obj: unknown): string => {
      const bytes = new TextEncoder().encode(JSON.stringify(obj));
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    };
    const content = `Fatto. <!--ohw:rewrite-scene-b64:${encode({
      scene_number: 4,
      new_content: "INT. CASA - NOTTE",
    })}--> <!--ohw:tools=1-->`;
    const parsed = parseToolUpdates(content);
    expect(parsed.title).toBe("Aggiornata Sceneggiatura · Sc.4");
    expect(parsed.updates[0]!.label).toBe("Sc.4 riscritta");
  });
});

describe("parseLiveDiffMarker", () => {
  it("returns null when no marker is present", () => {
    expect(parseLiveDiffMarker("plain reply")).toBeNull();
  });

  it("decodes a valid word-diff marker and carries the documentType", () => {
    const payload = {
      documentType: "soggetto",
      label: "Soggetto",
      segments: [
        { op: "eq", text: "Il " },
        { op: "del", text: "gatto" },
        { op: "add", text: "cane" },
        { op: "eq", text: " dorme" },
      ],
    };
    const marker = `reply <!--ohw:live-diff-b64:${encodeLiveDiff(payload)}-->`;
    const parsed = parseLiveDiffMarker(marker);
    expect(parsed).not.toBeNull();
    expect(parsed!.documentType).toBe("soggetto");
    expect(parsed!.label).toBe("Soggetto");
    expect(parsed!.segments).toHaveLength(4);
    expect(
      parsed!.segments.some((s) => s.op === "add" && s.text === "cane"),
    ).toBe(true);
    expect(
      parsed!.segments.some((s) => s.op === "del" && s.text === "gatto"),
    ).toBe(true);
  });

  it("defaults documentType to empty for legacy markers without it", () => {
    const payload = { label: "x", segments: [{ op: "add", text: "z" }] };
    const marker = `<!--ohw:live-diff-b64:${encodeLiveDiff(payload)}-->`;
    expect(parseLiveDiffMarker(marker)!.documentType).toBe("");
  });

  it("drops segments with unknown ops and rejects an empty result", () => {
    const payload = { label: "x", segments: [{ op: "weird", text: "z" }] };
    const marker = `<!--ohw:live-diff-b64:${encodeLiveDiff(payload)}-->`;
    expect(parseLiveDiffMarker(marker)).toBeNull();
  });

  it("returns null on malformed base64 / json", () => {
    expect(
      parseLiveDiffMarker("<!--ohw:live-diff-b64:@@notbase64@@-->"),
    ).toBeNull();
  });
});

describe("parseLiveDiffMarkers (per-document)", () => {
  it("returns an empty array when no marker is present", () => {
    expect(parseLiveDiffMarkers("plain reply")).toEqual([]);
  });

  it("parses one marker per touched document, keyed by documentType", () => {
    const soggetto = {
      documentType: "soggetto",
      label: "Soggetto",
      segments: [{ op: "add", text: "nuovo soggetto" }],
    };
    const sinossi = {
      documentType: "synopsis",
      label: "Sinossi",
      segments: [{ op: "add", text: "nuova sinossi" }],
    };
    const content = `done <!--ohw:live-diff-b64:${encodeLiveDiff(
      soggetto,
    )}--> e <!--ohw:live-diff-b64:${encodeLiveDiff(sinossi)}-->`;
    const markers = parseLiveDiffMarkers(content);
    expect(markers.map((m) => m.documentType)).toEqual([
      "soggetto",
      "synopsis",
    ]);
    expect(markers[0]!.segments[0]!.text).toBe("nuovo soggetto");
    expect(markers[1]!.segments[0]!.text).toBe("nuova sinossi");
  });

  it("skips malformed markers but keeps the valid ones", () => {
    const valid = {
      documentType: "treatment",
      label: "Trattamento",
      segments: [{ op: "add", text: "x" }],
    };
    const content = `<!--ohw:live-diff-b64:@@bad@@--> <!--ohw:live-diff-b64:${encodeLiveDiff(
      valid,
    )}-->`;
    const markers = parseLiveDiffMarkers(content);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.documentType).toBe("treatment");
  });
});
