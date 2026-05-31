import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { documents, screenplays } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import {
  buildDraftLabel,
  executeDocumentGenTool,
  formatUpstreamSource,
  isDocumentGenToolName,
  parseScalettaList,
  resolveLoglineMode,
  scalettaToOutlineContent,
  sanitizeLogline,
} from "./cesare-document-tools";

describe("buildDraftLabel", () => {
  it("returns the default label when no hint is given", () => {
    expect(buildDraftLabel(DocumentTypes.LOGLINE)).toBe(
      "draft Cesare · logline",
    );
  });

  it("includes a trimmed hint inside parentheses", () => {
    expect(
      buildDraftLabel(DocumentTypes.SOGGETTO, "  più asciutto e tematico  "),
    ).toBe("draft Cesare · soggetto (più asciutto e tematico)");
  });

  it("collapses whitespace runs inside the hint", () => {
    expect(
      buildDraftLabel(DocumentTypes.SYNOPSIS, "focus\n\nsu\tpersonaggio"),
    ).toBe("draft Cesare · sinossi (focus su personaggio)");
  });

  it("truncates a long hint to ~40 chars", () => {
    const longHint = "x".repeat(120);
    const result = buildDraftLabel(DocumentTypes.OUTLINE, longHint);
    expect(result.length).toBeLessThanOrEqual(
      "draft Cesare · scaletta (".length + 40 + 1,
    );
    expect(result.startsWith("draft Cesare · scaletta (")).toBe(true);
  });

  it("falls back to default label for an empty / whitespace hint", () => {
    expect(buildDraftLabel(DocumentTypes.TREATMENT, "   ")).toBe(
      "draft Cesare · trattamento",
    );
    expect(buildDraftLabel(DocumentTypes.TREATMENT, null)).toBe(
      "draft Cesare · trattamento",
    );
  });
});

describe("parseScalettaList", () => {
  it("parses a basic numbered list with descriptions", () => {
    const raw = `1. INT. CASA - GIORNO — Marco entra e trova Anna.
2. EXT. PIAZZA - GIORNO — La troupe arriva.
3. INT. BAR - SERA — Conflitto al tavolo.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toEqual({
      number: 1,
      heading: "INT. CASA - GIORNO",
      description: "Marco entra e trova Anna.",
    });
    expect(scenes[2]?.heading).toBe("INT. BAR - SERA");
  });

  it("tolerates parentheses style numbering '1)'", () => {
    const raw = `1) INT. CASA - GIORNO: Marco entra.
2) EXT. STRADA - NOTTE: Inseguimento.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[1]?.number).toBe(2);
    expect(scenes[1]?.heading).toBe("EXT. STRADA - NOTTE");
  });

  it("accepts 'Scena N' prefix", () => {
    const raw = `Scena 1 — INT. CASA - GIORNO — Marco entra.
Scena 2 — EXT. PARCO - GIORNO — Anna corre.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.heading).toBe("INT. CASA - GIORNO");
  });

  it("appends continuation lines to the previous scene's description", () => {
    const raw = `1. INT. CASA - GIORNO
Marco entra.
Trova Anna alla finestra.
2. EXT. STRADA - NOTTE
Inseguimento.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.description).toBe(
      "Marco entra. Trova Anna alla finestra.",
    );
    expect(scenes[1]?.description).toBe("Inseguimento.");
  });

  it("returns an empty array when no numbered scene is present", () => {
    expect(parseScalettaList("")).toEqual([]);
    expect(parseScalettaList("just some prose without numbers")).toEqual([]);
  });

  it("ignores invalid numbers (0, NaN)", () => {
    const raw = `0. NOT A SCENE — should be ignored
1. INT. CASA - GIORNO — valid`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.number).toBe(1);
  });
});

describe("scalettaToOutlineContent", () => {
  it("wraps scenes into one act / one sequence", () => {
    const parsed = [
      { number: 1, heading: "INT. A", description: "alpha" },
      { number: 2, heading: "EXT. B", description: "beta" },
    ];
    const out = scalettaToOutlineContent(parsed, "test");
    expect(out.acts).toHaveLength(1);
    expect(out.acts[0]?.title).toBe("Atto unico");
    expect(out.acts[0]?.sequences[0]?.scenes).toHaveLength(2);
    expect(out.acts[0]?.sequences[0]?.scenes[0]).toMatchObject({
      heading: "INT. A",
      description: "alpha",
      characters: [],
      pageEstimate: null,
      notes: null,
    });
  });

  it("returns an empty acts array for an empty parsed list", () => {
    expect(scalettaToOutlineContent([], "test")).toEqual({ acts: [] });
  });

  it("assigns stable ids using the seed", () => {
    const parsed = [{ number: 1, heading: "INT. A", description: "" }];
    const out = scalettaToOutlineContent(parsed, "seed-X");
    expect(out.acts[0]?.id).toContain("seed-X-act");
    expect(out.acts[0]?.sequences[0]?.id).toContain("seed-X-seq");
    expect(out.acts[0]?.sequences[0]?.scenes[0]?.id).toContain("seed-X-scene");
  });
});

describe("sanitizeLogline", () => {
  it("keeps a short logline unchanged (sans wrap quotes)", () => {
    expect(sanitizeLogline("Un giovane regista torna a casa.")).toBe(
      "Un giovane regista torna a casa.",
    );
  });

  it("strips surrounding double / italian quotes", () => {
    expect(sanitizeLogline('"Un regista torna a casa."')).toBe(
      "Un regista torna a casa.",
    );
    expect(sanitizeLogline("«Un regista torna a casa.»")).toBe(
      "Un regista torna a casa.",
    );
  });

  it("collapses multi-line / multi-paragraph output to the first paragraph, single line", () => {
    const raw = `Un regista torna a casa.

Ma il paese non vuole essere raccontato.`;
    expect(sanitizeLogline(raw)).toBe("Un regista torna a casa.");
  });

  it("hard caps at 200 characters", () => {
    const raw = `Un protagonista che ${"x".repeat(500)}`;
    const out = sanitizeLogline(raw);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("collapses internal whitespace runs", () => {
    expect(sanitizeLogline("Un\t\t  regista\n  torna.")).toBe(
      "Un regista torna.",
    );
  });
});

describe("resolveLoglineMode (write_logline)", () => {
  it("honours an explicit 'write' regardless of existing content", () => {
    expect(resolveLoglineMode("write", "una logline esistente")).toBe("write");
    expect(resolveLoglineMode("write", null)).toBe("write");
  });

  it("honours an explicit 'edit' regardless of existing content", () => {
    expect(resolveLoglineMode("edit", "una logline esistente")).toBe("edit");
    // The handler rejects edit-with-empty separately; the resolver still
    // reports the requested intent.
    expect(resolveLoglineMode("edit", "")).toBe("edit");
  });

  it("auto edits when a non-empty logline already exists", () => {
    expect(resolveLoglineMode("auto", "una logline esistente")).toBe("edit");
    expect(resolveLoglineMode(undefined, "  testo  ")).toBe("edit");
  });

  it("auto writes a fresh logline when none exists", () => {
    expect(resolveLoglineMode("auto", null)).toBe("write");
    expect(resolveLoglineMode("auto", "")).toBe("write");
    expect(resolveLoglineMode("auto", "   ")).toBe("write");
    expect(resolveLoglineMode(undefined, null)).toBe("write");
  });
});

describe("isDocumentGenToolName", () => {
  it("recognises write_logline (universal-dispatch wiring)", () => {
    expect(isDocumentGenToolName("write_logline")).toBe(true);
  });

  it("still recognises the existing propose_* tools", () => {
    expect(isDocumentGenToolName("propose_logline_from_screenplay")).toBe(true);
    expect(isDocumentGenToolName("propose_synopsis_from_screenplay")).toBe(
      true,
    );
    expect(isDocumentGenToolName("propose_soggetto_v2")).toBe(true);
    expect(isDocumentGenToolName("propose_scaletta_from_soggetto")).toBe(true);
    expect(isDocumentGenToolName("propose_treatment_from_narrative")).toBe(
      true,
    );
  });

  it("rejects unknown tool names", () => {
    expect(isDocumentGenToolName("rewrite_scene")).toBe(false);
    expect(isDocumentGenToolName("")).toBe(false);
  });
});

describe("formatUpstreamSource (Bug #3 — derive from upstream narrative)", () => {
  it("builds a labelled block from the nearest non-empty narrative source", () => {
    const out = formatUpstreamSource([
      { label: "LOGLINE", content: "Un detective insonne caccia un killer." },
      { label: "SCENEGGIATURA", content: "" },
    ]);
    expect(out.label).toBe("LOGLINE");
    expect(out.text).toContain("LOGLINE:");
    expect(out.text).toContain("Un detective insonne caccia un killer.");
    // The empty screenplay source is dropped, not labelled.
    expect(out.text).not.toContain("SCENEGGIATURA");
  });

  it("joins multiple non-empty sources nearest-first", () => {
    const out = formatUpstreamSource([
      { label: "SOGGETTO", content: "Il soggetto." },
      { label: "LOGLINE", content: "La logline." },
    ]);
    expect(out.label).toBe("SOGGETTO + LOGLINE");
    expect(out.text.indexOf("SOGGETTO")).toBeLessThan(
      out.text.indexOf("LOGLINE"),
    );
  });

  it("falls back to the screenplay when no narrative doc has content", () => {
    const out = formatUpstreamSource([
      { label: "LOGLINE", content: "   " },
      { label: "SCENEGGIATURA", content: "INT. CASA - GIORNO\nMarco entra." },
    ]);
    expect(out.label).toBe("SCENEGGIATURA");
    expect(out.text).toContain("Marco entra.");
  });

  it("returns an empty source when nothing upstream has content (no no-op success)", () => {
    const out = formatUpstreamSource([
      { label: "LOGLINE", content: "" },
      { label: "SCENEGGIATURA", content: "   " },
    ]);
    expect(out.text).toBe("");
    expect(out.label).toBe("");
  });
});

// ─── propose_treatment_from_narrative executor (F-A2 audit fix) ───────────────
//
// A minimal Drizzle-shaped fake that serves the exact queries the treatment
// generator + applyVersionLive issue, dispatched by TABLE identity. It lets the
// executor run end-to-end without Postgres so we can assert: (a) the treatment
// derives from the upstream narrative (scaletta/sinossi/soggetto), (b) on
// success the tool_result payload carries the live-applied marker fields the
// `ohw:doc-applied` emitter reads, and (c) on a genuinely empty upstream the
// tool fails — no fabricated success.

interface TreatmentMockState {
  /** Live content per document type (empty string ⇒ absent). */
  readonly contentByType: Partial<Record<DocumentType, string>>;
  readonly screenplay: string;
}

const makeTreatmentMockDb = (state: TreatmentMockState): Db => {
  // documents row id per type, so loadDocumentForType resolves a row with a
  // createdBy and the inner version select can be skipped (currentVersionId null
  // means content comes straight from the documents row).
  const docRow = (type: DocumentType) => ({
    id: `doc-${type}`,
    content: state.contentByType[type] ?? "",
    currentVersionId: null,
    createdBy: "owner-1",
  });

  // The query builder is intentionally permissive: every terminal (`limit`,
  // awaiting `where`, `returning`) resolves rows derived from the table + the
  // requested columns. `tableForType` is inferred from the `sql` filter the
  // loader passes, so we key resolution on a per-select "current type" captured
  // from the select columns instead — simpler: documents selects always carry
  // `createdBy`, version selects carry only `content`.
  let pendingDocType: DocumentType | null = null;

  const select = (columns: Record<string, unknown>) => ({
    from: (table: unknown) => {
      const resolve = (): unknown[] => {
        if (table === screenplays) return [{ content: state.screenplay }];
        if (table === documents && pendingDocType) {
          return [docRow(pendingDocType)];
        }
        // documentVersions content select / max(number) select
        if ("max" in columns) return [{ max: 0 }];
        return [];
      };
      const whereResult = {
        then: (r: (rows: unknown[]) => void) => r(resolve()),
        limit: () => Promise.resolve(resolve()),
      };
      return {
        where: (filter: unknown) => {
          // loadDocumentForType passes a `sql` filter that stringifies the type;
          // capture which document type this select targets so `resolve()`
          // returns the right row.
          const text = String(
            (filter as { queryChunks?: unknown[] })?.queryChunks ?? filter,
          );
          pendingDocType =
            (
              [
                "logline",
                "soggetto",
                "synopsis",
                "outline",
                "treatment",
              ] as DocumentType[]
            ).find((t) => text.includes(t)) ?? pendingDocType;
          return whereResult;
        },
      };
    },
  });

  // applyVersionLive runs inside db.transaction; the tx reuses the same select +
  // supports insert(...).values(...).returning(...) and update(...).set(...).where().
  const insert = () => ({
    values: () => ({
      returning: () => Promise.resolve([{ id: "version-new" }]),
    }),
  });
  const update = () => ({
    set: () => ({ where: () => Promise.resolve() }),
  });

  const db = {
    select,
    insert,
    update,
    transaction: async (fn: (tx: Db) => Promise<unknown>) => fn(db),
  } as unknown as Db;
  return db;
};

const block = (input: Record<string, unknown> = {}) => ({
  type: "tool_use" as const,
  id: "tu-1",
  name: "propose_treatment_from_narrative",
  input,
});

describe("executeDocumentGenTool — propose_treatment_from_narrative (F-A2)", () => {
  beforeEach(() => {
    process.env["MOCK_AI"] = "true";
  });
  afterEach(() => {
    delete process.env["MOCK_AI"];
  });

  it("derives the treatment from the upstream narrative and applies it live", async () => {
    const db = makeTreatmentMockDb({
      contentByType: {
        treatment: "",
        outline: '{"acts":[{"title":"Atto unico"}]}',
        synopsis: "Una sinossi di prova.",
        soggetto: "Un soggetto di prova.",
        logline: "Una logline di prova.",
      },
      screenplay: "",
    });

    const result = await executeDocumentGenTool(
      block(),
      db,
      "project-1",
      "owner-1",
    );
    expect(result.isOk()).toBe(true);
    const payload = JSON.parse(result._unsafeUnwrap().content) as Record<
      string,
      unknown
    >;
    // The success marker the `ohw:doc-applied` emitter reads: applied live, the
    // treatment entity, and a real version id.
    expect(payload["applied_live"]).toBe(true);
    expect(payload["document_type"]).toBe("treatment");
    expect(payload["version_id"]).toBe("version-new");
    expect(payload["error"]).toBeUndefined();
  });

  it("fails (no fabricated success) when there is nothing upstream to build from", async () => {
    const db = makeTreatmentMockDb({
      contentByType: { treatment: "" },
      screenplay: "",
    });

    const result = await executeDocumentGenTool(
      block(),
      db,
      "project-1",
      "owner-1",
    );
    // The generator fails loudly on the err channel — it does NOT produce a
    // success tool_result, so the `ohw:doc-applied` marker is never emitted and
    // the honest card never claims a change happened.
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toMatch(/materiale|trattamento/i);
  });
});
