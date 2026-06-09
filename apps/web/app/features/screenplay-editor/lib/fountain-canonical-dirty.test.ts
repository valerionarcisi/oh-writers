/**
 * Spec 63 S2 — the screenplay autosave dirty-check must compare the CANONICAL
 * fountain, not the raw string. The editor emits `docToFountain(doc)` while the
 * stored screenplay (PDF import, Cesare plain edit, older save) may use different
 * indentation / blank lines. A pure re-serialisation must NOT read as dirty,
 * otherwise a phantom autosave clobbers the stored content on every load.
 *
 * These tests pin the behaviour of the canonicaliser used as `normalize`:
 *   normalize = (s) => docToFountain(fountainToDoc(s))
 */
import { describe, it, expect } from "vitest";
import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

const normalize = (s: string): string => docToFountain(fountainToDoc(s));
const isDirty = (content: string, saved: string): boolean =>
  normalize(content) !== normalize(saved);

describe("fountain canonical dirty-check (Spec 63 S2)", () => {
  it("a non-canonical stored fountain vs the editor's re-serialisation is NOT dirty", () => {
    // What a PDF import / older save might store (no indentation, extra blanks).
    const stored = "INT. CASA - GIORNO\n\n\n\nMario entra.\n\n\nMARIO\nCiao.";
    // What the editor emits after loading + re-serialising the same content.
    const editorEmitted = docToFountain(fountainToDoc(stored));

    // Sanity: the raw strings genuinely differ (otherwise the test proves nothing).
    expect(editorEmitted).not.toBe(stored);
    // But canonically they are the same document → not dirty.
    expect(isDirty(editorEmitted, stored)).toBe(false);
  });

  it("the canonical form is a fixed point (normalize∘normalize === normalize)", () => {
    const stored = "INT. CASA - GIORNO\n\nMario entra.\n\nMARIO\nCiao.";
    const once = normalize(stored);
    const twice = normalize(once);
    expect(twice).toBe(once);
  });

  it("a real text edit IS dirty", () => {
    const saved = "INT. CASA - GIORNO\n\nMario entra.";
    const edited = "INT. CASA - GIORNO\n\nMario esce.";
    expect(isDirty(edited, saved)).toBe(true);
  });
});
