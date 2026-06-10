import { describe, expect, it } from "vitest";
import { yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import {
  plainTextToNarrativeDoc,
  yjsStateFromNarrativeContent,
} from "./yjs-seed.server";

const decode = (state: Buffer) => {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(state));
  const json = yDocToProsemirrorJSON(ydoc, "prosemirror");
  ydoc.destroy();
  return json as {
    type: string;
    content: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>;
  };
};

describe("yjsStateFromNarrativeContent", () => {
  it("encodes plain text into paragraphs split on blank lines", () => {
    const state = yjsStateFromNarrativeContent(
      "Primo paragrafo.\n\nSecondo paragrafo.",
    );
    expect(state).not.toBeNull();
    const doc = decode(state!);
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]!.content![0]!.text).toBe("Primo paragrafo.");
    expect(doc.content[1]!.content![0]!.text).toBe("Secondo paragrafo.");
  });

  it("encodes single newlines as hard breaks inside one paragraph", () => {
    const state = yjsStateFromNarrativeContent("riga uno\nriga due");
    const doc = decode(state!);
    expect(doc.content).toHaveLength(1);
    const inline = doc.content[0]!.content!;
    expect(inline.map((n) => n.type)).toEqual(["text", "hard_break", "text"]);
    expect(inline[2]!.text).toBe("riga due");
  });

  it("collapses whitespace the way the client's DOM parse would", () => {
    const state = yjsStateFromNarrativeContent(
      "doppio  spazio\tqui \r\nseconda riga ",
    );
    const doc = decode(state!);
    const inline = doc.content[0]!.content!;
    expect(inline[0]!.text).toBe("doppio spazio qui");
    expect(inline[2]!.text).toBe("seconda riga");
  });

  it("round-trips the seeded soggetto template without loss", () => {
    const template =
      "Milano, fine anni Novanta. Marta, trentacinque anni.\n\nTornata al paese per il funerale, Marta scopre la libreria.\n\nCancella questo testo e scrivi il tuo soggetto.\n";
    const state = yjsStateFromNarrativeContent(template);
    const doc = decode(state!);
    const text = doc.content
      .map((p) => (p.content ?? []).map((n) => n.text ?? "").join(""))
      .join("\n\n");
    expect(`${text}\n`).toBe(template);
  });

  it("returns null for empty or whitespace-only content", () => {
    expect(yjsStateFromNarrativeContent("")).toBeNull();
    expect(yjsStateFromNarrativeContent("  \n\n ")).toBeNull();
  });

  it("returns null for HTML content (needs a DOM to parse)", () => {
    expect(yjsStateFromNarrativeContent("<p>già html</p>")).toBeNull();
  });
});

describe("plainTextToNarrativeDoc", () => {
  it("builds a schema-valid doc (no empty text nodes from blank lines)", () => {
    const doc = plainTextToNarrativeDoc("a\n \nb\n\nc");
    expect(() => doc.check()).not.toThrow();
  });
});
