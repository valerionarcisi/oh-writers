import { describe, it, expect } from "vitest";
import {
  buildEditChangelogMarkdown,
  buildEditChangelogListMarkdown,
} from "./changelog.js";
import type { EditChangelogSource } from "./types.js";

// [OHW-051] — per-edit changelog markdown builder (DERIVED, pure).

const baseEdit: EditChangelogSource = {
  entity: "soggetto",
  entityLabel: "Soggetto",
  versionId: "v-2",
  previousVersionId: "v-1",
  versionNumber: 2,
  previousVersionNumber: 1,
  diffSegments: [
    { op: "eq", text: "Milano, " },
    { op: "del", text: "fine anni Novanta" },
    { op: "add", text: "primi anni Duemila" },
    { op: "eq", text: ". Marta." },
  ],
  createdAt: "2026-05-31T10:00:00.000Z",
};

describe("buildEditChangelogMarkdown", () => {
  it("renders entity, version transition, word counts and inline diff", () => {
    const md = buildEditChangelogMarkdown(baseEdit);
    expect(md).toContain("### Soggetto");
    expect(md).toContain("v1 (`v-1`) → v2 (`v-2`)");
    // 3 added words, 3 removed words
    expect(md).toContain("+3 parole, −3 parole");
    expect(md).toContain("2026-05-31T10:00:00.000Z");
    // additions bold, removals strikethrough — NO raw HTML
    expect(md).toContain("**primi anni Duemila**");
    expect(md).toContain("~~fine anni Novanta~~");
    expect(md).not.toMatch(/<[a-z]/i);
  });

  it("renders a first-version edit (no previous) without a phantom version", () => {
    const md = buildEditChangelogMarkdown({
      ...baseEdit,
      previousVersionId: null,
      previousVersionNumber: null,
      diffSegments: [{ op: "add", text: "Tutto nuovo." }],
    });
    expect(md).toContain("_(prima versione)_ → v2 (`v-2`)");
    expect(md).toContain("**Tutto nuovo.**");
  });

  it("renders an empty-diff edit with an explicit placeholder", () => {
    const md = buildEditChangelogMarkdown({ ...baseEdit, diffSegments: [] });
    expect(md).toContain("+0 parole, −0 parole");
    expect(md).toContain("_(nessuna differenza testuale)_");
  });

  it("contains no raw HTML for any op", () => {
    const md = buildEditChangelogMarkdown({
      ...baseEdit,
      diffSegments: [
        { op: "del", text: "<script>alert(1)</script>" },
        { op: "add", text: "safe" },
      ],
    });
    // The diff text is data, not markup we generate — we never EMIT HTML tags.
    // The angle brackets that survive come from the source text, but our own
    // decoration is markdown only.
    expect(md).toContain("~~<script>alert(1)</script>~~");
    expect(md).toContain("**safe**");
  });
});

describe("buildEditChangelogListMarkdown", () => {
  it("renders an empty-state when there are no edits", () => {
    expect(buildEditChangelogListMarkdown([])).toBe(
      "## Modifiche\n\n_(nessuna modifica registrata)_",
    );
  });

  it("renders one section per edit", () => {
    const md = buildEditChangelogListMarkdown([
      baseEdit,
      { ...baseEdit, entityLabel: "Sinossi", versionId: "v-9" },
    ]);
    expect(md).toContain("## Modifiche");
    expect(md).toContain("### Soggetto");
    expect(md).toContain("### Sinossi");
  });
});

// ─── Regenerability proof: same input → byte-identical output ──────────────────

describe("regenerability (DERIVED view, not a divergent store)", () => {
  it("produces byte-identical markdown for identical source data", () => {
    const a = buildEditChangelogMarkdown(baseEdit);
    const b = buildEditChangelogMarkdown(structuredClone(baseEdit));
    expect(a).toBe(b);
  });

  it("re-deriving the list after a 'cache delete' reproduces the same output", () => {
    const sources = [baseEdit, { ...baseEdit, versionId: "v-3" }];
    const firstRender = buildEditChangelogListMarkdown(sources);
    // Simulate deleting any cached markdown and re-deriving from source only.
    const cache: string | null = firstRender;
    const cacheDeleted: string | null = null;
    void cache;
    void cacheDeleted;
    const reRendered = buildEditChangelogListMarkdown(structuredClone(sources));
    expect(reRendered).toBe(firstRender);
  });
});
