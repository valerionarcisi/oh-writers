import { describe, it, expect } from "vitest";
import type { DocumentVersion } from "@oh-writers/db/schema";
import { activateVersionSet } from "./versions.server";

// BUG-N72: activating a narrative version must reseed documents.yjs_state for
// PM-room doc types, otherwise the realtime editor keeps the previous version's
// text. Non-room types (logline/outline) and empty/HTML content leave the CRDT
// untouched (nulling it would wipe a live room).

const doc = (type: string) =>
  ({ id: "doc-1", type }) as unknown as Parameters<
    typeof activateVersionSet
  >[0];

const version = (content: string): DocumentVersion =>
  ({ id: "v2", content }) as unknown as DocumentVersion;

describe("[OHW-N72] activateVersionSet — narrative CRDT reseed", () => {
  it("soggetto + plain content → reseeds yjsState", () => {
    const set = activateVersionSet(doc("soggetto"), version("Nuovo testo."));
    expect(set.currentVersionId).toBe("v2");
    expect(set.content).toBe("Nuovo testo.");
    expect("yjsState" in set).toBe(true);
    expect((set as { yjsState?: unknown }).yjsState).toBeInstanceOf(Buffer);
  });

  it("logline (no PM room) → does NOT touch yjsState", () => {
    const set = activateVersionSet(doc("logline"), version("Una logline."));
    expect("yjsState" in set).toBe(false);
  });

  it("empty content → leaves the CRDT untouched (no wipe)", () => {
    const set = activateVersionSet(doc("soggetto"), version(""));
    expect(set.content).toBe("");
    expect("yjsState" in set).toBe(false);
  });

  // parseCanonicalNarrativeHtml (#92) rebuilds the ProseMirror doc from our
  // own editor's closed HTML vocabulary WITHOUT a DOM, so canonical HTML like
  // this reseeds the CRDT same as plain text — it no longer bails to null.
  it("canonical HTML content → reseeds yjsState (no DOM needed)", () => {
    const set = activateVersionSet(doc("treatment"), version("<p>html</p>"));
    expect("yjsState" in set).toBe(true);
    expect((set as { yjsState?: unknown }).yjsState).toBeInstanceOf(Buffer);
  });

  it("non-canonical HTML (foreign tag) → leaves the CRDT untouched", () => {
    const set = activateVersionSet(
      doc("treatment"),
      version("<div>not canonical</div>"),
    );
    expect("yjsState" in set).toBe(false);
  });
});
