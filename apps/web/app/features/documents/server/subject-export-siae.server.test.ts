import { describe, it, expect } from "vitest";
import {
  buildSiaeCoverLines,
  formatCartellaFooter,
  parseSubjectMarkdown,
  buildSiaeFilename,
  exportSubjectSiae,
} from "./subject-export-siae.server";
import type { SiaeExportInput } from "../documents.schema";

const baseInput = (over: Partial<SiaeExportInput> = {}): SiaeExportInput => ({
  projectId: "11111111-1111-4111-8111-111111111111",
  title: "Il Sole di Notte",
  authors: [{ fullName: "Mario Rossi", taxCode: "RSSMRA80A01H501U" }],
  declaredGenre: "drama",
  estimatedDurationMinutes: 95,
  compilationDate: "2026-04-24",
  depositNotes: null,
  ...over,
});

describe("buildSiaeCoverLines", () => {
  it("renders the fixed Italian legal header", () => {
    const lines = buildSiaeCoverLines(baseInput(), { logline: "A logline." });
    expect(lines[0]).toBe("REPUBBLICA ITALIANA");
    expect(lines[1]).toBe("SIAE — Sezione OLAF");
    expect(lines[2]).toBe("SOGGETTO PER OPERA CINEMATOGRAFICA");
  });

  it("includes title, genre, duration, compilation date", () => {
    const joined = buildSiaeCoverLines(baseInput(), { logline: null }).join(
      "\n",
    );
    expect(joined).toContain("Titolo:              Il Sole di Notte");
    expect(joined).toContain("Genere dichiarato:   drama");
    expect(joined).toContain("Durata stimata:      95 minuti");
    expect(joined).toContain("Data di compilazione: 2026-04-24");
  });

  it("renders author with tax code when present", () => {
    const lines = buildSiaeCoverLines(baseInput(), { logline: null });
    expect(lines.some((l) => l.includes("[CF: RSSMRA80A01H501U]"))).toBe(true);
  });

  it("omits [CF: ...] when tax code is null or empty", () => {
    const lines = buildSiaeCoverLines(
      baseInput({
        authors: [{ fullName: "Anna Bianchi", taxCode: null }],
      }),
      { logline: null },
    );
    const authorLine = lines.find((l) => l.includes("Anna Bianchi"));
    expect(authorLine).toBeDefined();
    expect(authorLine).not.toContain("CF:");
  });

  it("renders multiple authors as separate bullet lines", () => {
    const lines = buildSiaeCoverLines(
      baseInput({
        authors: [
          { fullName: "Autore Uno", taxCode: null },
          { fullName: "Autore Due", taxCode: "XYZ123" },
        ],
      }),
      { logline: null },
    );
    expect(lines.filter((l) => l.trimStart().startsWith("• ")).length).toBe(2);
  });

  it("falls back to 'non definita' when logline is null", () => {
    const lines = buildSiaeCoverLines(baseInput(), { logline: null });
    expect(lines.join("\n")).toContain("non definita");
  });

  it("uses the provided logline when present", () => {
    const lines = buildSiaeCoverLines(baseInput(), {
      logline: "Un detective insegue un killer.",
    });
    expect(lines.join("\n")).toContain("Un detective insegue un killer.");
  });

  it("falls back to 'non dichiarato' for empty declared genre", () => {
    const lines = buildSiaeCoverLines(baseInput({ declaredGenre: "" }), {
      logline: null,
    });
    expect(lines.join("\n")).toContain("Genere dichiarato:   non dichiarato");
  });

  it("appends deposit notes when present", () => {
    const lines = buildSiaeCoverLines(
      baseInput({ depositNotes: "Prima stesura." }),
      { logline: null },
    );
    expect(lines.join("\n")).toContain("Note di deposito:");
    expect(lines.join("\n")).toContain("Prima stesura.");
  });
});

describe("formatCartellaFooter", () => {
  it("returns 'cartella 1' at offset 0", () => {
    expect(formatCartellaFooter(0)).toBe("cartella 1");
  });

  it("stays in cartella 1 just under the 1,800-char threshold", () => {
    expect(formatCartellaFooter(1_799)).toBe("cartella 1");
  });

  it("rolls to cartella 2 exactly at 1,800 chars", () => {
    expect(formatCartellaFooter(1_800)).toBe("cartella 2");
  });

  it("rolls to cartella 3 at 3,600 chars", () => {
    expect(formatCartellaFooter(3_600)).toBe("cartella 3");
  });

  it("clamps negative offsets to cartella 1", () => {
    expect(formatCartellaFooter(-50)).toBe("cartella 1");
  });
});

describe("parseSubjectMarkdown", () => {
  it("returns an empty array for empty input", () => {
    expect(parseSubjectMarkdown("")).toEqual([]);
    expect(parseSubjectMarkdown("   \n  \n")).toEqual([]);
  });

  it("parses headings and paragraphs", () => {
    const blocks = parseSubjectMarkdown(
      "## Premessa\n\nUn inizio.\n\n## Arco\n\nUno sviluppo.",
    );
    expect(blocks).toEqual([
      { kind: "heading", text: "Premessa" },
      { kind: "paragraph", text: "Un inizio." },
      { kind: "heading", text: "Arco" },
      { kind: "paragraph", text: "Uno sviluppo." },
    ]);
  });

  it("joins wrapped lines into the same paragraph", () => {
    const blocks = parseSubjectMarkdown("Prima riga\nseconda riga.\n\nAltro.");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "Prima riga seconda riga." },
      { kind: "paragraph", text: "Altro." },
    ]);
  });
});

describe("buildSiaeFilename", () => {
  it("slugifies the title and appends the suffix", () => {
    expect(buildSiaeFilename("Il Sole di Notte!")).toBe(
      "il-sole-di-notte-soggetto-siae.pdf",
    );
  });

  it("falls back to 'project' when title has no alphanumerics", () => {
    expect(buildSiaeFilename("...")).toBe("project-soggetto-siae.pdf");
  });
});

describe("exportSubjectSiae server fn contract", () => {
  it("is exported and callable", () => {
    expect(exportSubjectSiae).toBeDefined();
    expect(typeof exportSubjectSiae).toBe("function");
  });
});
