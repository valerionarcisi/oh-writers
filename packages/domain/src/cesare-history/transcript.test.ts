import { describe, it, expect } from "vitest";
import { buildSessionTranscriptMarkdown } from "./transcript.js";
import { buildHistoryContextSummary } from "./context-summary.js";
import type { EditChangelogSource, SessionTranscriptSource } from "./types.js";

// [OHW-051] — per-session transcript markdown + bounded context summary
// (DERIVED, pure).

const edit: EditChangelogSource = {
  entity: "soggetto",
  entityLabel: "Soggetto",
  versionId: "11111111-1111-4111-8111-111111111111",
  previousVersionId: "00000000-0000-4000-8000-000000000000",
  versionNumber: 2,
  previousVersionNumber: 1,
  diffSegments: [
    { op: "eq", text: "Una storia " },
    { op: "add", text: "molto " },
    { op: "eq", text: "intensa." },
  ],
  createdAt: "2026-05-31T10:00:00.000Z",
};

const source: SessionTranscriptSource = {
  title: "Riscrittura soggetto",
  createdAt: "2026-05-31T09:00:00.000Z",
  messages: [
    {
      role: "user",
      content: "Rendi il soggetto più intenso",
      createdAt: "2026-05-31T09:59:00.000Z",
      trace: [],
      editVersionIds: [],
    },
    {
      role: "assistant",
      content: "Fatto, ho aggiornato il soggetto.",
      createdAt: "2026-05-31T10:00:00.000Z",
      trace: [
        { kind: "reading", entityLabel: "Soggetto", text: "Soggetto" },
        {
          kind: "reasoning",
          entityLabel: null,
          text: "Rendo la prosa più viva",
        },
        { kind: "writing", entityLabel: "Soggetto", text: "Soggetto" },
      ],
      editVersionIds: [edit.versionId],
    },
  ],
  edits: [edit],
};

describe("buildSessionTranscriptMarkdown", () => {
  it("renders title, conversation, trace and edit links", () => {
    const md = buildSessionTranscriptMarkdown(source);
    expect(md).toContain("# Sessione: Riscrittura soggetto");
    expect(md).toContain("## Conversazione");
    expect(md).toContain("**Tu**");
    expect(md).toContain("**Cesare**");
    expect(md).toContain("Rendi il soggetto più intenso");
    // trace
    expect(md).toContain("Legge: Soggetto");
    expect(md).toContain("Ragiona: Rendo la prosa più viva");
    expect(md).toContain("Scrive: Soggetto");
    // edit link + changelog section
    expect(md).toContain("## Modifiche");
    expect(md).toContain("Modifiche applicate:");
    expect(md).toContain("**molto**"); // the inline diff
  });

  it("the per-message edit link target matches the changelog heading slug", () => {
    const md = buildSessionTranscriptMarkdown(source);
    // Extract the link target the message points to.
    const link = md.match(/\[Soggetto\]\(#([^)]+)\)/);
    expect(link).not.toBeNull();
    const target = link![1]!;
    // The changelog heading is `### Soggetto (edit-<slug>)`; the GitHub-style
    // auto-slug of that heading must equal the link target.
    const headingMatch = md.match(/### (Soggetto \(edit-[^)]+\))/);
    expect(headingMatch).not.toBeNull();
    const headingSlug = headingMatch![1]!
      .toLowerCase()
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-");
    expect(target).toBe(headingSlug);
  });

  it("contains no raw HTML anchor", () => {
    const md = buildSessionTranscriptMarkdown(source);
    expect(md).not.toContain("<a ");
    expect(md).not.toContain("id=");
  });

  it("renders empty states for an empty session", () => {
    const md = buildSessionTranscriptMarkdown({
      title: "Vuota",
      createdAt: null,
      messages: [],
      edits: [],
    });
    expect(md).toContain("_(nessun messaggio)_");
    expect(md).toContain("_(nessuna modifica registrata)_");
  });
});

describe("buildHistoryContextSummary (bounded context reuse)", () => {
  it("returns null with no edits (caller omits the block)", () => {
    expect(buildHistoryContextSummary([])).toBeNull();
  });

  it("lists recent edits compactly with word counts", () => {
    const md = buildHistoryContextSummary([edit]);
    expect(md).not.toBeNull();
    expect(md!).toContain("CRONOLOGIA MODIFICHE");
    expect(md!).toContain("Soggetto (v2): +1/−0 parole");
  });

  it("caps detail to maxEdits and folds the rest into a count", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...edit,
      versionId: `v-${i}`,
      versionNumber: i + 1,
    }));
    const md = buildHistoryContextSummary(many, { maxEdits: 3 });
    expect(md!).toContain("…e altre 9 modifiche precedenti.");
    // only the 3 most recent (highest version numbers) listed in detail
    expect(md!).toContain("(v12)");
    expect(md!).not.toContain("(v1):");
  });
});

describe("regenerability (transcript is DERIVED)", () => {
  it("produces byte-identical markdown for identical source data", () => {
    expect(buildSessionTranscriptMarkdown(source)).toBe(
      buildSessionTranscriptMarkdown(structuredClone(source)),
    );
  });
});
