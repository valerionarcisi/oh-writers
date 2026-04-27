# Soggetto (Spec 04f) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il document type `soggetto` come secondo step della pipeline documenti (dopo logline), con editor ProseMirror, marker cartelle, Cesare section-by-section, export PDF/DOCX e export SIAE-IT con modal dedicato.

**Architecture:** Riuso totale dello stack esistente. Domain enum allargato + costante `DOCUMENT_PIPELINE` unica source-of-truth. Editor = `NarrativeEditor` esistente con plugin decoration marker cartelle e overlay ✨ per heading. Server fn Haiku pattern Cesare (mock + rate limit + caching ephemeral). Export riusa `ExportPdfModal` + nuovo `ExportSiaeModal` input-only (zero DB). Zero nuove tabelle.

**Tech Stack:** TypeScript, TanStack Start (`createServerFn`), Drizzle, PostgreSQL, Zod, neverthrow, ProseMirror, CSS Modules, Vitest, Playwright, Claude Haiku (Anthropic SDK), `docx` npm (nuova dep — approvazione richiesta in Task 14), `afterwriting` (PDF, già presente).

**Spec:** `docs/specs/core/04f-soggetto.md`

---

## File structure

Nuovi file (create):

- `packages/domain/src/subject/length.ts` — cartelle/pages/words pure utils
- `packages/domain/src/subject/length.test.ts` — Vitest
- `packages/domain/src/subject/template.ts` — SOGGETTO_INITIAL_TEMPLATE
- `packages/domain/src/subject/template.test.ts`
- `packages/domain/src/subject/sections.ts` — `SubjectSection` enum + metadata
- `packages/domain/src/subject/index.ts` — barrel
- `apps/web/app/features/documents/lib/subject-prompt.ts` — system prompt + few-shot
- `apps/web/app/features/documents/server/subject-ai.server.ts` — generateSubjectSection, generateLoglineFromSubject
- `apps/web/app/features/documents/server/subject-export.server.ts` — exportSubjectDocx, exportSubjectSiae
- `apps/web/app/features/documents/hooks/useSubjectAI.ts`
- `apps/web/app/features/documents/hooks/useExportSubject.ts`
- `apps/web/app/features/documents/components/SubjectEditor.tsx` + `.module.css`
- `apps/web/app/features/documents/components/SubjectFooter.tsx` + `.module.css`
- `apps/web/app/features/documents/components/cartella-marker-plugin.ts` — PM plugin
- `apps/web/app/features/documents/components/InlineGenerateButton.tsx` + `.module.css`
- `apps/web/app/features/documents/components/ExportSiaeModal.tsx` + `.module.css`
- `apps/web/app/routes/projects.$projectId.soggetto.tsx`
- `tests/soggetto/helpers.ts`
- `tests/soggetto/soggetto-flow.spec.ts`
- `tests/soggetto/soggetto-export.spec.ts`

File modificati:

- `packages/domain/src/constants.ts` — add `SOGGETTO` + `DOCUMENT_PIPELINE`
- `packages/domain/src/schemas/versions.schema.ts` — add soggetto to enum
- `packages/domain/src/schemas/project.schema.ts` — add soggetto to doc type enum
- `packages/domain/src/index.ts` — re-export subject/\*
- `packages/db/src/schema/documents.ts` — enum `text` allowlist → add "soggetto"
- `packages/db/src/seed/index.ts` — seed soggetto dev row (optional, for E2E)
- `apps/web/app/features/documents/documents.schema.ts` — add schemas Zod
- `apps/web/app/features/documents/documents.errors.ts` — add SubjectNotFoundError, SubjectRateLimitedError
- `apps/web/app/features/documents/components/ExportPdfModal.tsx` — aggiungere radio DOCX
- `apps/web/app/features/documents/server/documents.server.ts` — supportare `soggetto` in `saveDocument` content cap
- `apps/web/app/mocks/ai-responses.ts` — `mockSubjectSection`
- `apps/web/app/routes/__root.tsx` o il componente sidebar — aggiungere link "Soggetto"
- `apps/web/app/features/projects/components/ProjectDashboard.tsx` — card Soggetto tra logline e synopsis (da verificare il nome esatto nella feature)
- `README.md` — update docs map (sezione todolist se esiste)

---

## Phase 0 — Prerequisiti

### Task 0.1: Approvazione dipendenza `docx`

**Files:** none

- [ ] **Step 1: Chiedere approvazione utente prima di installare**

Messaggio all'utente:

> Per l'export DOCX installo `docx@^9.5.0` da `https://nexus.cleafy.org` (vedi instructions globali). Approvi?

Attendere risposta prima di procedere. Se rifiutato → Task 14 (export DOCX) salta; spec marca DOCX come fuori v1 con nota.

- [ ] **Step 2: Install dopo approvazione**

```bash
pnpm add -w docx@9.5.0 --filter @oh-writers/web
```

Expected: `docx` in `apps/web/package.json` `dependencies`, version pinned.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "[OHW] chore(deps): add docx@9.5.0 for subject DOCX export"
```

---

## Phase 1 — Domain

### Task 1.1: `DocumentTypes.SOGGETTO` + `DOCUMENT_PIPELINE`

**Files:**

- Modify: `packages/domain/src/constants.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/constants.test.ts` (se non esiste già, altrimenti append):

```ts
import { describe, it, expect } from "vitest";
import { DocumentTypes, DOCUMENT_PIPELINE } from "./constants.js";

describe("DocumentTypes", () => {
  it("includes SOGGETTO", () => {
    expect(DocumentTypes.SOGGETTO).toBe("soggetto");
  });
});

describe("DOCUMENT_PIPELINE", () => {
  it("orders docs: logline → soggetto → synopsis → outline → treatment", () => {
    expect(DOCUMENT_PIPELINE).toEqual([
      "logline",
      "soggetto",
      "synopsis",
      "outline",
      "treatment",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/constants.test.ts
```

Expected: FAIL — `DocumentTypes.SOGGETTO` undefined, `DOCUMENT_PIPELINE` undefined.

- [ ] **Step 3: Edit constants.ts**

```ts
export const DocumentTypes = {
  LOGLINE: "logline",
  SOGGETTO: "soggetto",
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
} as const;

export type DocumentType = (typeof DocumentTypes)[keyof typeof DocumentTypes];

export const DOCUMENT_PIPELINE = [
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
] as const;
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/constants.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/constants.ts packages/domain/src/constants.test.ts
git commit -m "[OHW] feat(domain): add soggetto doc type + DOCUMENT_PIPELINE constant"
```

### Task 1.2: Update Zod enums in versions + project schemas

**Files:**

- Modify: `packages/domain/src/schemas/versions.schema.ts`
- Modify: `packages/domain/src/schemas/project.schema.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/schemas/versions.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DocumentTypeSchema } from "./versions.schema.js";

describe("DocumentTypeSchema", () => {
  it("accepts 'soggetto'", () => {
    expect(DocumentTypeSchema.safeParse("soggetto").success).toBe(true);
  });
  it("rejects unknown", () => {
    expect(DocumentTypeSchema.safeParse("subject").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run & verify FAIL**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/schemas/versions.schema.test.ts
```

Expected: FAIL on "accepts 'soggetto'".

- [ ] **Step 3: Edit `versions.schema.ts`**

```ts
export const DocumentTypeSchema = z.enum([
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
]);
```

- [ ] **Step 4: Edit `project.schema.ts`** — aggiungere `DocumentTypes.SOGGETTO` al z.enum simile. Copia esatta:

```ts
// nel blocco dove oggi elenca i 4 doc types:
z.enum([
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
]);
```

- [ ] **Step 5: Run & verify PASS**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/schemas
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/schemas
git commit -m "[OHW] feat(domain): accept 'soggetto' in DocumentTypeSchema + project schema"
```

### Task 1.3: Length utilities (pure)

**Files:**

- Create: `packages/domain/src/subject/length.ts`
- Create: `packages/domain/src/subject/length.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/domain/src/subject/length.test.ts
import { describe, it, expect } from "vitest";
import {
  analyzeSubjectLength,
  CHARS_PER_CARTELLA,
  SOGGETTO_SOFT_WARNING_WORDS,
  WORDS_PER_PAGE,
} from "./length.js";

describe("analyzeSubjectLength", () => {
  it("returns zeros on empty", () => {
    const r = analyzeSubjectLength("");
    expect(r).toEqual({
      cartelle: 0,
      pages: 0,
      words: 0,
      chars: 0,
      isOverSoftLimit: false,
    });
  });

  it("counts one cartella exactly at 1800 chars", () => {
    const text = "a".repeat(CHARS_PER_CARTELLA);
    const r = analyzeSubjectLength(text);
    expect(r.cartelle).toBe(1);
    expect(r.chars).toBe(1800);
  });

  it("rounds cartelle to 1 decimal", () => {
    const text = "a".repeat(2700);
    expect(analyzeSubjectLength(text).cartelle).toBe(1.5);
  });

  it("counts words split on whitespace", () => {
    expect(analyzeSubjectLength("ciao mondo bello").words).toBe(3);
  });

  it("sets isOverSoftLimit above threshold", () => {
    const longText = "parola ".repeat(SOGGETTO_SOFT_WARNING_WORDS + 1);
    expect(analyzeSubjectLength(longText).isOverSoftLimit).toBe(true);
  });

  it("constants have expected values", () => {
    expect(CHARS_PER_CARTELLA).toBe(1800);
    expect(WORDS_PER_PAGE).toBe(250);
    expect(SOGGETTO_SOFT_WARNING_WORDS).toBe(3600);
  });
});
```

- [ ] **Step 2: Run & verify FAIL**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/subject/length.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/subject/length.ts
export const CHARS_PER_CARTELLA = 1800;
export const WORDS_PER_PAGE = 250;
export const SOGGETTO_SOFT_WARNING_WORDS = 3600;

export interface SubjectLength {
  readonly cartelle: number;
  readonly pages: number;
  readonly words: number;
  readonly chars: number;
  readonly isOverSoftLimit: boolean;
}

const roundTo1 = (n: number): number => Math.round(n * 10) / 10;

export const analyzeSubjectLength = (text: string): SubjectLength => {
  const chars = text.length;
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;
  return {
    chars,
    words,
    cartelle: roundTo1(chars / CHARS_PER_CARTELLA),
    pages: roundTo1(words / WORDS_PER_PAGE),
    isOverSoftLimit: words > SOGGETTO_SOFT_WARNING_WORDS,
  };
};
```

- [ ] **Step 4: Run & verify PASS**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/subject/length.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/subject/length.ts packages/domain/src/subject/length.test.ts
git commit -m "[OHW] feat(domain): analyzeSubjectLength pure util for soggetto counters"
```

### Task 1.4: Template + sections

**Files:**

- Create: `packages/domain/src/subject/template.ts`
- Create: `packages/domain/src/subject/template.test.ts`
- Create: `packages/domain/src/subject/sections.ts`
- Create: `packages/domain/src/subject/index.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/domain/src/subject/template.test.ts
import { describe, it, expect } from "vitest";
import { SOGGETTO_INITIAL_TEMPLATE, SUBJECT_SECTIONS } from "./index.js";

describe("SOGGETTO_INITIAL_TEMPLATE", () => {
  it("contains 5 level-2 headings in order", () => {
    const headings = SOGGETTO_INITIAL_TEMPLATE.split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => l.slice(3).trim().toLowerCase());
    expect(headings).toEqual([
      "premessa",
      "protagonista & antagonista",
      "arco narrativo",
      "mondo",
      "finale",
    ]);
  });
});

describe("SUBJECT_SECTIONS", () => {
  it("has 5 sections keyed by slug", () => {
    expect(SUBJECT_SECTIONS.map((s) => s.slug)).toEqual([
      "premessa",
      "protagonista",
      "arco",
      "mondo",
      "finale",
    ]);
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/subject/template.test.ts
```

- [ ] **Step 3: Implement sections.ts**

```ts
// packages/domain/src/subject/sections.ts
export const SUBJECT_SECTION_SLUGS = [
  "premessa",
  "protagonista",
  "arco",
  "mondo",
  "finale",
] as const;

export type SubjectSectionSlug = (typeof SUBJECT_SECTION_SLUGS)[number];

export interface SubjectSectionMeta {
  readonly slug: SubjectSectionSlug;
  readonly headingIt: string;
}

export const SUBJECT_SECTIONS: readonly SubjectSectionMeta[] = [
  { slug: "premessa", headingIt: "Premessa" },
  { slug: "protagonista", headingIt: "Protagonista & antagonista" },
  { slug: "arco", headingIt: "Arco narrativo" },
  { slug: "mondo", headingIt: "Mondo" },
  { slug: "finale", headingIt: "Finale" },
];

export const sectionForHeading = (heading: string): SubjectSectionMeta | null =>
  SUBJECT_SECTIONS.find(
    (s) => s.headingIt.toLowerCase() === heading.trim().toLowerCase(),
  ) ?? null;
```

- [ ] **Step 4: Implement template.ts**

```ts
// packages/domain/src/subject/template.ts
import { SUBJECT_SECTIONS } from "./sections.js";

export const SOGGETTO_INITIAL_TEMPLATE =
  SUBJECT_SECTIONS.map((s) => `## ${s.headingIt}\n\n`)
    .join("")
    .trimEnd() + "\n";
```

- [ ] **Step 5: Barrel**

```ts
// packages/domain/src/subject/index.ts
export * from "./length.js";
export * from "./sections.js";
export * from "./template.js";
```

- [ ] **Step 6: Re-export from domain package**

Modify `packages/domain/src/index.ts`, aggiungere:

```ts
export * from "./subject/index.js";
```

- [ ] **Step 7: Run & verify PASS**

```bash
pnpm --filter @oh-writers/domain exec vitest run src/subject
```

Expected: PASS (6+ tests).

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/subject packages/domain/src/index.ts
git commit -m "[OHW] feat(domain): soggetto sections, template, barrel exports"
```

### Task 1.5: DB schema allowlist + typecheck gate

**Files:**

- Modify: `packages/db/src/schema/documents.ts:25-27`

- [ ] **Step 1: Edit documents.ts**

```ts
type: text("type", {
  enum: ["logline", "soggetto", "synopsis", "outline", "treatment"],
}).notNull(),
```

- [ ] **Step 2: Run full typecheck**

```bash
pnpm --recursive typecheck
```

Expected: PASS. Se TS segnala errori in altri file che indicizzano il DocumentType (es. switch exhaustive su `logline|synopsis|outline|treatment`), correggerli aggiungendo case `soggetto` dove richiesto. Ogni correzione aggiuntiva è parte di questo task.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/documents.ts
git commit -m "[OHW] feat(db): allow 'soggetto' in documents.type enum"
```

---

## Phase 2 — Schemas & errors app-level

### Task 2.1: Zod schemas

**Files:**

- Modify: `apps/web/app/features/documents/documents.schema.ts`

- [ ] **Step 1: Leggere il file corrente**

```bash
cat apps/web/app/features/documents/documents.schema.ts
```

Identificare dove già stanno schemas esistenti per seguirne lo stile.

- [ ] **Step 2: Aggiungere schemas in fondo al file**

```ts
import { SUBJECT_SECTION_SLUGS } from "@oh-writers/domain";

export const SubjectSectionSlugSchema = z.enum(SUBJECT_SECTION_SLUGS);

export const GenerateSubjectSectionInputSchema = z.object({
  projectId: z.string().uuid(),
  section: SubjectSectionSlugSchema,
});

export const GenerateLoglineFromSubjectInputSchema = z.object({
  projectId: z.string().uuid(),
});

export const SiaeAuthorSchema = z.object({
  fullName: z.string().min(1).max(200),
  taxCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,16}$/u, "CF invalido")
    .nullable(),
});

export const SiaeExportInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  authors: z.array(SiaeAuthorSchema).min(1).max(10),
  declaredGenre: z.string().min(1).max(100),
  estimatedDurationMinutes: z.number().int().min(1).max(600),
  compilationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "ISO date required"),
  depositNotes: z.string().max(500).nullable(),
});

export const SubjectDocxExportInputSchema = z.object({
  projectId: z.string().uuid(),
});
```

- [ ] **Step 3: Unit test schemas**

Create `apps/web/app/features/documents/documents.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SiaeExportInputSchema,
  GenerateSubjectSectionInputSchema,
} from "./documents.schema";

describe("SiaeExportInputSchema", () => {
  const valid = {
    projectId: "00000000-0000-4000-a000-000000000010",
    title: "Titolo",
    authors: [{ fullName: "Mario Rossi", taxCode: null }],
    declaredGenre: "drama",
    estimatedDurationMinutes: 110,
    compilationDate: "2026-04-24",
    depositNotes: null,
  };

  it("accepts valid input", () => {
    expect(SiaeExportInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty authors", () => {
    expect(
      SiaeExportInputSchema.safeParse({ ...valid, authors: [] }).success,
    ).toBe(false);
  });

  it("rejects long tax code", () => {
    expect(
      SiaeExportInputSchema.safeParse({
        ...valid,
        authors: [{ fullName: "X", taxCode: "TOOLONGCODE000000EXTRA" }],
      }).success,
    ).toBe(false);
  });

  it("rejects bad date", () => {
    expect(
      SiaeExportInputSchema.safeParse({
        ...valid,
        compilationDate: "24/04/2026",
      }).success,
    ).toBe(false);
  });
});

describe("GenerateSubjectSectionInputSchema", () => {
  it("accepts known section", () => {
    expect(
      GenerateSubjectSectionInputSchema.safeParse({
        projectId: "00000000-0000-4000-a000-000000000010",
        section: "premessa",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown section", () => {
    expect(
      GenerateSubjectSectionInputSchema.safeParse({
        projectId: "00000000-0000-4000-a000-000000000010",
        section: "prologo",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Run & verify PASS**

```bash
pnpm --filter @oh-writers/web exec vitest run app/features/documents/documents.schema.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/documents/documents.schema.ts apps/web/app/features/documents/documents.schema.test.ts
git commit -m "[OHW] feat(docs-schema): zod schemas for subject AI + SIAE + DOCX export"
```

### Task 2.2: Domain errors

**Files:**

- Modify: `apps/web/app/features/documents/documents.errors.ts`

- [ ] **Step 1: Append errors**

Leggi il file per capire lo stile esistente, poi aggiungi:

```ts
export class SubjectNotFoundError {
  readonly _tag = "SubjectNotFoundError" as const;
  readonly message: string;
  constructor(readonly projectId: string) {
    this.message = `Soggetto not found for project ${projectId}`;
  }
}

export class SubjectRateLimitedError {
  readonly _tag = "SubjectRateLimitedError" as const;
  readonly message = "Rate limit — riprova tra poco";
  constructor(readonly retryAfterMs: number) {}
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/documents/documents.errors.ts
git commit -m "[OHW] feat(docs-errors): SubjectNotFoundError + SubjectRateLimitedError"
```

---

## Phase 3 — Server: mocks + AI

### Task 3.1: Mock section generator

**Files:**

- Modify: `apps/web/app/mocks/ai-responses.ts`
- Modify: `apps/web/app/mocks/ai-responses.test.ts`

- [ ] **Step 1: Failing test**

Aggiungere a `ai-responses.test.ts`:

```ts
import { mockSubjectSection } from "./ai-responses";

describe("mockSubjectSection", () => {
  it("returns deterministic text per section", () => {
    const a = mockSubjectSection("premessa", "drama");
    const b = mockSubjectSection("premessa", "drama");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(50);
  });

  it("differs between sections", () => {
    expect(mockSubjectSection("premessa", null)).not.toBe(
      mockSubjectSection("finale", null),
    );
  });

  it("covers all 5 sections without throwing", () => {
    for (const s of [
      "premessa",
      "protagonista",
      "arco",
      "mondo",
      "finale",
    ] as const) {
      expect(mockSubjectSection(s, null).length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
pnpm --filter @oh-writers/web exec vitest run app/mocks/ai-responses.test.ts
```

- [ ] **Step 3: Implement**

Append a `apps/web/app/mocks/ai-responses.ts`:

```ts
import type { SubjectSectionSlug } from "@oh-writers/domain";
import type { Genre } from "@oh-writers/domain";

const SUBJECT_MOCKS: Record<SubjectSectionSlug, string> = {
  premessa:
    "Negli anni '80, in una provincia italiana stretta tra fabbriche dismesse e ambizioni mai ammesse, un gesto apparentemente minimo innesca una catena di scelte irreversibili. La premessa racconta il mondo prima che qualcosa si incrini — la calma prima della domanda che nessuno voleva farsi.",
  protagonista:
    "La protagonista è una donna di quarant'anni che ha imparato a non pretendere nulla dalla vita, convinta che questo la protegga. L'antagonista non è una persona ma l'abitudine al silenzio del paese che la circonda, personificata in un sindaco paternalista che offre sempre la soluzione più comoda.",
  arco: "Il primo atto la spinge fuori dal rifugio: un incontro la costringe a nominare ciò che ha sempre taciuto. Nel secondo atto cerca alleati e li perde uno a uno, scoprendo che la comunità che credeva sua è costruita sull'omissione. Il terzo atto la vede agire sola, sapendo che il prezzo sarà alto ma che non agire sarebbe peggio.",
  mondo:
    "Il paese è un personaggio: campanile, bar, stabilimento, scuola. Le distanze si misurano in pettegolezzi, non in chilometri. La luce è sempre quella di settembre — calda ma non più luminosa — e tutto accade in ambienti stretti, mai nel grande aperto.",
  finale:
    "La protagonista ottiene quello che voleva ma pagando un prezzo che nessun altro vede: l'isolamento dai pochi che amava. L'ultima scena la mostra in piedi, sola, davanti a un orizzonte che per la prima volta riconosce come suo.",
};

export const mockSubjectSection = (
  section: SubjectSectionSlug,
  _genre: Genre | null,
): string => SUBJECT_MOCKS[section];
```

Nota: `_genre` accetta l'input ma il mock è deterministico ignorandolo — rispetta la firma reale per non rompere il contratto quando la real-call userà il genere.

- [ ] **Step 4: Run PASS**

```bash
pnpm --filter @oh-writers/web exec vitest run app/mocks/ai-responses.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/mocks/ai-responses.ts apps/web/app/mocks/ai-responses.test.ts
git commit -m "[OHW] feat(mocks): mockSubjectSection deterministico per 5 sezioni soggetto"
```

### Task 3.2: Cesare prompt module

**Files:**

- Create: `apps/web/app/features/documents/lib/subject-prompt.ts`

- [ ] **Step 1: Create prompt file**

```ts
// apps/web/app/features/documents/lib/subject-prompt.ts
import type { SubjectSectionSlug } from "@oh-writers/domain";

export const SUBJECT_SYSTEM_PROMPT = `Sei Cesare, assistente AI per sceneggiatori italiani.
Stai aiutando a scrivere un SOGGETTO (2-5 cartelle, prosa narrativa, depositabile SIAE).

Regole:
- Rispondi SOLO in italiano.
- Tono narrativo, mai meta-commentare, mai introdurti.
- Lunghezza target per sezione: 200-400 parole.
- Niente bullet, niente markdown (nessun **bold**, nessun ##).
- Se il contesto è scarso, inventa dettagli coerenti col genere/format dichiarati.
- Non citare "Sezione X" né ripetere l'heading.
`;

export const SUBJECT_FEW_SHOTS = [
  {
    role: "user" as const,
    content: `Progetto: "Il peso del silenzio" — Dramma, lungometraggio.
Logline: Una donna di quarant'anni scopre un segreto del suo paese e deve decidere se parlare.
Sezione richiesta: premessa.`,
  },
  {
    role: "assistant" as const,
    content:
      "In un paese dell'entroterra del Sud, dove la fabbrica ha chiuso vent'anni fa e nessuno l'ha più nominata, una donna torna ad abitare la casa di famiglia dopo la morte del padre. Credeva di sistemare le carte e ripartire, ma nella cantina trova una scatola che il padre aveva tenuto nascosta a tutti, compresa lei. Dentro, prove di un fatto che il paese ha deciso collettivamente di dimenticare. Scoprire non è il suo problema: il problema è che ora sa, e il paese la guarda, perché tutti sanno che lei sa.",
  },
];

export const sectionUserPrompt = (params: {
  section: SubjectSectionSlug;
  projectTitle: string;
  genre: string | null;
  format: string | null;
  logline: string | null;
  existingSubject: string;
}): string => {
  const sectionLabelIt: Record<SubjectSectionSlug, string> = {
    premessa: "premessa",
    protagonista: "protagonista e antagonista",
    arco: "arco narrativo",
    mondo: "mondo",
    finale: "finale",
  };
  return `Progetto: "${params.projectTitle}" — ${params.genre ?? "genere non specificato"}, ${params.format ?? "formato non specificato"}.
Logline: ${params.logline ?? "(non ancora scritta)"}.

Soggetto esistente (per riferimento, non ripetere):
${params.existingSubject || "(vuoto — sei alla prima sezione)"}

Sezione richiesta: ${sectionLabelIt[params.section]}.`;
};

export const LOGLINE_EXTRACT_PROMPT = `Estrai una logline dal soggetto fornito.
Regole:
- Una o due frasi, massimo 500 caratteri.
- Italiano.
- Deve contenere: protagonista, obiettivo, conflitto.
- Nessun virgolette, nessuna intro. Solo la logline.`;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/documents/lib/subject-prompt.ts
git commit -m "[OHW] feat(docs-ai): subject Cesare prompt module (system + few-shot + builder)"
```

### Task 3.3: `generateSubjectSection` server fn

**Files:**

- Create: `apps/web/app/features/documents/server/subject-ai.server.ts`

- [ ] **Step 1: Review pattern esistente**

```bash
cat apps/web/app/features/breakdown/server/cesare-suggest.server.ts | head -120
```

Usare lo stesso schema: `requireUser`, permission check, rate limit, mock branch, real Haiku call.

- [ ] **Step 2: Create file**

```ts
// apps/web/app/features/documents/server/subject-ai.server.ts
import { createServerFn } from "@tanstack/start";
import { eq } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import { documents, projects } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import type { SubjectSectionSlug } from "@oh-writers/domain";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  GenerateSubjectSectionInputSchema,
  GenerateLoglineFromSubjectInputSchema,
} from "../documents.schema";
import {
  DbError,
  ForbiddenError,
  SubjectRateLimitedError,
} from "../documents.errors";
import { mockSubjectSection } from "~/mocks/ai-responses";
import {
  LOGLINE_EXTRACT_PROMPT,
  SUBJECT_FEW_SHOTS,
  SUBJECT_SYSTEM_PROMPT,
  sectionUserPrompt,
} from "../lib/subject-prompt";
import { checkAndStampRateLimit } from "~/features/breakdown/lib/rate-limit";
import { resolveProjectAccess } from "~/features/projects/server/access";

const COOLDOWN_SECTION_MS = 30_000;
const COOLDOWN_LOGLINE_MS = 30_000;

export const generateSubjectSection = createServerFn({ method: "POST" })
  .validator(GenerateSubjectSectionInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { text: string },
        ForbiddenError | DbError | SubjectRateLimitedError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveProjectAccess(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!accessResult.value.canEdit)
        return toShape(err(new ForbiddenError("generate subject section")));

      const rate = await checkAndStampRateLimit(
        db,
        data.projectId,
        `subject:${data.section}`,
        COOLDOWN_SECTION_MS,
      );
      if (rate.isErr()) return toShape(err(rate.error));

      const ctxResult = await loadSubjectContext(db, data.projectId);
      if (ctxResult.isErr()) return toShape(err(ctxResult.error));
      const ctx = ctxResult.value;

      const text =
        process.env["MOCK_AI"] === "true"
          ? mockSubjectSection(data.section, ctx.project.genre)
          : await callHaikuSection(data.section, ctx);
      return toShape(ok({ text }));
    },
  );

export const generateLoglineFromSubject = createServerFn({ method: "POST" })
  .validator(GenerateLoglineFromSubjectInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { logline: string },
        ForbiddenError | DbError | SubjectRateLimitedError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveProjectAccess(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!accessResult.value.canEdit)
        return toShape(err(new ForbiddenError("extract logline")));

      const rate = await checkAndStampRateLimit(
        db,
        data.projectId,
        `subject:logline-extract`,
        COOLDOWN_LOGLINE_MS,
      );
      if (rate.isErr()) return toShape(err(rate.error));

      const ctxResult = await loadSubjectContext(db, data.projectId);
      if (ctxResult.isErr()) return toShape(err(ctxResult.error));
      const ctx = ctxResult.value;

      const logline =
        process.env["MOCK_AI"] === "true"
          ? mockLoglineFromSubject(ctx.subjectText)
          : await callHaikuLogline(ctx.subjectText);
      return toShape(ok({ logline: logline.slice(0, 500) }));
    },
  );

interface SubjectContext {
  project: {
    id: string;
    title: string;
    genre: string | null;
    format: string | null;
    logline: string | null;
  };
  subjectText: string;
}

const loadSubjectContext = (
  db: Db,
  projectId: string,
): ResultAsync<SubjectContext, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const p = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!p) throw new Error("project not found");
      const soggetto = await db.query.documents.findFirst({
        where: (d, { and, eq: e }) =>
          and(e(d.projectId, projectId), e(d.type, "soggetto")),
      });
      return {
        project: {
          id: p.id,
          title: p.title,
          genre: p.genre,
          format: p.format,
          logline: p.logline,
        },
        subjectText: soggetto?.content ?? "",
      };
    })(),
    (e) => new DbError("loadSubjectContext", e),
  );

const mockLoglineFromSubject = (subjectText: string): string =>
  subjectText.trim().length > 0
    ? "Una protagonista di provincia trova la verità sepolta del suo paese e deve decidere se parlare, sapendo che il prezzo del silenzio era comodità condivisa."
    : "Una logline ancora da definire: scrivi almeno una premessa nel soggetto.";

const callHaikuSection = async (
  section: SubjectSectionSlug,
  ctx: SubjectContext,
): Promise<string> => {
  const sdkModule = "@anthropic-ai/sdk";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(/* @vite-ignore */ sdkModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic = (sdk.default ?? sdk) as any;
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"]! });
  const userText = sectionUserPrompt({
    section,
    projectTitle: ctx.project.title,
    genre: ctx.project.genre,
    format: ctx.project.format,
    logline: ctx.project.logline,
    existingSubject: ctx.subjectText,
  });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: SUBJECT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [...SUBJECT_FEW_SHOTS, { role: "user", content: userText }],
  });
  const block = resp.content.find((b: { type: string }) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
};

const callHaikuLogline = async (subjectText: string): Promise<string> => {
  const sdkModule = "@anthropic-ai/sdk";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(/* @vite-ignore */ sdkModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic = (sdk.default ?? sdk) as any;
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"]! });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: [
      {
        type: "text",
        text: LOGLINE_EXTRACT_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: subjectText.slice(0, 8000) }],
  });
  const block = resp.content.find((b: { type: string }) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
};
```

- [ ] **Step 3: Verify `resolveProjectAccess` helper exists**

```bash
grep -rn "resolveProjectAccess\|canEditProject" apps/web/app/features/projects/server/ 2>/dev/null | head -5
```

Se non esiste, **aggiungilo** in un sub-task inline:

Create `apps/web/app/features/projects/server/access.ts` con pattern identico a `resolveBreakdownAccessByProjectId` (vedi `apps/web/app/features/breakdown/server/breakdown-access.ts`), ritorna `{ canEdit, canView, role }` basato su team membership. Se esiste già con altro nome, importarlo al posto del placeholder.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

Risolvere qualsiasi import rotto.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/documents/server/subject-ai.server.ts apps/web/app/features/projects/server/access.ts
git commit -m "[OHW] feat(docs-server): generateSubjectSection + generateLoglineFromSubject server fns"
```

---

## Phase 4 — Client hooks

### Task 4.1: `useSubjectAI` hook

**Files:**

- Create: `apps/web/app/features/documents/hooks/useSubjectAI.ts`

- [ ] **Step 1: Create**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { SubjectSectionSlug } from "@oh-writers/domain";
import {
  generateSubjectSection,
  generateLoglineFromSubject,
} from "../server/subject-ai.server";

export const useGenerateSubjectSection = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: SubjectSectionSlug) =>
      unwrapResult(
        await generateSubjectSection({ data: { projectId, section } }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });
};

export const useGenerateLoglineFromSubject = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(await generateLoglineFromSubject({ data: { projectId } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/documents/hooks/useSubjectAI.ts
git commit -m "[OHW] feat(docs-hooks): useGenerateSubjectSection + useGenerateLoglineFromSubject"
```

---

## Phase 5 — UI atoms (Design System first)

### Task 5.1: `InlineGenerateButton` atom

**Files:**

- Create: `packages/ui/src/components/InlineGenerateButton.tsx`
- Create: `packages/ui/src/components/InlineGenerateButton.module.css`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create component**

```tsx
// packages/ui/src/components/InlineGenerateButton.tsx
import type { MouseEvent } from "react";
import styles from "./InlineGenerateButton.module.css";

export interface InlineGenerateButtonProps {
  readonly onGenerate: () => void;
  readonly isLoading?: boolean;
  readonly label?: string;
  readonly "data-testid"?: string;
}

export function InlineGenerateButton({
  onGenerate,
  isLoading = false,
  label = "genera",
  "data-testid": testId,
}: InlineGenerateButtonProps) {
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    if (!isLoading) onGenerate();
  };
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={isLoading}
      data-testid={testId}
      aria-busy={isLoading}
    >
      <span className={styles.sparkle}>✨</span>
      <span>{isLoading ? "…" : label}</span>
    </button>
  );
}
```

- [ ] **Step 2: CSS**

```css
/* packages/ui/src/components/InlineGenerateButton.module.css */
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
    border-color: var(--color-accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.sparkle {
  font-size: var(--font-size-sm);
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: none;
  }
}
```

- [ ] **Step 3: Export**

Aggiungere a `packages/ui/src/index.ts`:

```ts
export { InlineGenerateButton } from "./components/InlineGenerateButton";
export type { InlineGenerateButtonProps } from "./components/InlineGenerateButton";
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @oh-writers/ui typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/InlineGenerateButton.tsx packages/ui/src/components/InlineGenerateButton.module.css packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): InlineGenerateButton atom for soggetto Cesare heading"
```

### Task 5.2: `SubjectFooter` component (feature-level, non-DS)

**Files:**

- Create: `apps/web/app/features/documents/components/SubjectFooter.tsx`
- Create: `apps/web/app/features/documents/components/SubjectFooter.module.css`

- [ ] **Step 1: Vitest pure render test**

Create `apps/web/app/features/documents/components/SubjectFooter.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubjectFooter } from "./SubjectFooter";

describe("SubjectFooter", () => {
  it("shows cartelle, pages, words", () => {
    render(<SubjectFooter text={"a".repeat(3600)} />);
    expect(screen.getByText(/cartelle/i)).toBeInTheDocument();
    expect(screen.getByText(/parole|parola/i)).toBeInTheDocument();
  });

  it("renders soft-warning banner above threshold", () => {
    const text = "parola ".repeat(3700);
    render(<SubjectFooter text={text} />);
    expect(screen.getByTestId("subject-soft-warning")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify FAIL** (module missing).

- [ ] **Step 3: Implement**

```tsx
// SubjectFooter.tsx
import { useMemo, useState } from "react";
import { analyzeSubjectLength } from "@oh-writers/domain";
import styles from "./SubjectFooter.module.css";

export interface SubjectFooterProps {
  readonly text: string;
}

export function SubjectFooter({ text }: SubjectFooterProps) {
  const stats = useMemo(() => analyzeSubjectLength(text), [text]);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const showWarning = stats.isOverSoftLimit && !warningDismissed;

  return (
    <div className={styles.wrap} data-testid="subject-footer">
      <div className={styles.counters}>
        <span>{stats.cartelle.toLocaleString("it-IT")} cartelle</span>
        <span className={styles.dot}>·</span>
        <span>pag. {stats.pages}</span>
        <span className={styles.dot}>·</span>
        <span>{stats.words} parole</span>
      </div>
      {showWarning && (
        <div
          className={styles.warning}
          data-testid="subject-soft-warning"
          role="status"
        >
          <span>
            Stai entrando in territorio trattamento (&gt;2 cartelle). Il
            soggetto è canonico 2–5 cartelle.
          </span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => setWarningDismissed(true)}
            aria-label="Chiudi avviso"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: CSS**

```css
.wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-block: var(--space-2);
  border-block-start: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.counters {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.dot {
  opacity: 0.5;
}
.warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-warning-bg);
  color: var(--color-warning-fg);
  border-radius: var(--radius-md);
}
.dismiss {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: var(--font-size-md);
}
```

- [ ] **Step 5: Run & verify PASS**

```bash
pnpm --filter @oh-writers/web exec vitest run app/features/documents/components/SubjectFooter.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/documents/components/SubjectFooter.tsx apps/web/app/features/documents/components/SubjectFooter.module.css apps/web/app/features/documents/components/SubjectFooter.test.tsx
git commit -m "[OHW] feat(docs-ui): SubjectFooter with cartelle/pages/words + soft warning"
```

### Task 5.3: Cartella marker ProseMirror plugin

**Files:**

- Create: `apps/web/app/features/documents/components/cartella-marker-plugin.ts`

- [ ] **Step 1: Vitest test**

Create `apps/web/app/features/documents/components/cartella-marker-plugin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCartellaOffsets } from "./cartella-marker-plugin";

describe("computeCartellaOffsets", () => {
  it("returns [] under 1800 chars", () => {
    expect(computeCartellaOffsets("a".repeat(500))).toEqual([]);
  });
  it("returns one offset at 1800", () => {
    expect(computeCartellaOffsets("a".repeat(1800))).toEqual([1800]);
  });
  it("returns multiple offsets for long text", () => {
    expect(computeCartellaOffsets("a".repeat(5500))).toEqual([
      1800, 3600, 5400,
    ]);
  });
});
```

- [ ] **Step 2: Verify FAIL**.

- [ ] **Step 3: Implement pure helper + plugin**

```ts
// cartella-marker-plugin.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { CHARS_PER_CARTELLA } from "@oh-writers/domain";

export const computeCartellaOffsets = (text: string): number[] => {
  const offsets: number[] = [];
  for (let i = CHARS_PER_CARTELLA; i <= text.length; i += CHARS_PER_CARTELLA) {
    offsets.push(i);
  }
  return offsets;
};

export const cartellaMarkerKey = new PluginKey("cartellaMarker");

const makeWidget = (n: number): HTMLElement => {
  const el = document.createElement("div");
  el.className = "cartellaMarker";
  el.setAttribute("aria-hidden", "true");
  el.textContent = `— cartella ${n + 1} —`;
  el.style.textAlign = "center";
  el.style.opacity = "0.5";
  el.style.fontSize = "0.85em";
  el.style.marginBlock = "0.5em";
  return el;
};

const buildDecorations = (doc: import("prosemirror-model").Node) => {
  const text = doc.textContent;
  const offsets = computeCartellaOffsets(text);
  if (offsets.length === 0) return DecorationSet.empty;
  // Map flat text offset → PM doc position by walking text nodes.
  const decorations: Decoration[] = [];
  let flatPos = 0;
  let nextOffsetIdx = 0;
  doc.descendants((node, pos) => {
    if (nextOffsetIdx >= offsets.length) return false;
    if (!node.isText) return true;
    const nodeLen = node.text!.length;
    while (
      nextOffsetIdx < offsets.length &&
      flatPos + nodeLen >= offsets[nextOffsetIdx]!
    ) {
      const delta = offsets[nextOffsetIdx]! - flatPos;
      decorations.push(
        Decoration.widget(pos + delta, () => makeWidget(nextOffsetIdx), {
          side: 1,
          ignoreSelection: true,
        }),
      );
      nextOffsetIdx++;
    }
    flatPos += nodeLen;
    return true;
  });
  return DecorationSet.create(doc, decorations);
};

export const cartellaMarkerPlugin = (): Plugin =>
  new Plugin({
    key: cartellaMarkerKey,
    state: {
      init: (_, { doc }) => buildDecorations(doc),
      apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
```

- [ ] **Step 4: Run PASS**

```bash
pnpm --filter @oh-writers/web exec vitest run app/features/documents/components/cartella-marker-plugin.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/documents/components/cartella-marker-plugin.ts apps/web/app/features/documents/components/cartella-marker-plugin.test.ts
git commit -m "[OHW] feat(docs-ui): ProseMirror plugin for cartella markers in subject editor"
```

---

## Phase 6 — SubjectEditor composition

### Task 6.1: `SubjectEditor` component

**Files:**

- Create: `apps/web/app/features/documents/components/SubjectEditor.tsx`
- Create: `apps/web/app/features/documents/components/SubjectEditor.module.css`

- [ ] **Step 1: Study NarrativeEditor API**

```bash
cat apps/web/app/features/documents/components/NarrativeEditor.tsx
cat apps/web/app/features/documents/components/NarrativeProseMirrorView.tsx
```

Identificare: prop `content`, `onChange`, `plugins` (se esiste), hook di integrazione.

- [ ] **Step 2: Implement**

Nota: l'integrazione del plugin `cartellaMarkerPlugin` richiede che `NarrativeProseMirrorView` accetti un array di plugin extra. Se non accetta, **aggiungere la prop** `extraPlugins?: Plugin[]`.

```tsx
// SubjectEditor.tsx
import { useState } from "react";
import { Plugin } from "prosemirror-state";
import { NarrativeEditor } from "./NarrativeEditor";
import { SubjectFooter } from "./SubjectFooter";
import { InlineGenerateButton } from "@oh-writers/ui";
import {
  SOGGETTO_INITIAL_TEMPLATE,
  SUBJECT_SECTIONS,
} from "@oh-writers/domain";
import type { SubjectSectionSlug } from "@oh-writers/domain";
import { cartellaMarkerPlugin } from "./cartella-marker-plugin";
import { useGenerateSubjectSection } from "../hooks/useSubjectAI";
import styles from "./SubjectEditor.module.css";

export interface SubjectEditorProps {
  readonly projectId: string;
  readonly documentId: string;
  readonly initialContent: string;
  readonly canEdit: boolean;
  readonly onSave: (content: string) => void;
}

export function SubjectEditor({
  projectId,
  documentId,
  initialContent,
  canEdit,
  onSave,
}: SubjectEditorProps) {
  const seed = initialContent || SOGGETTO_INITIAL_TEMPLATE;
  const [content, setContent] = useState(seed);
  const gen = useGenerateSubjectSection(projectId);
  const plugins: Plugin[] = [cartellaMarkerPlugin()];

  const onGenerate = async (section: SubjectSectionSlug) => {
    const result = await gen.mutateAsync(section);
    const sectionMeta = SUBJECT_SECTIONS.find((s) => s.slug === section);
    if (!sectionMeta) return;
    const nextContent = insertSectionBody(
      content,
      sectionMeta.headingIt,
      result.text,
    );
    setContent(nextContent);
    onSave(nextContent);
  };

  return (
    <div className={styles.wrap} data-testid="subject-editor">
      {canEdit && (
        <div className={styles.generateRow} data-testid="subject-generate-row">
          {SUBJECT_SECTIONS.map((s) => (
            <InlineGenerateButton
              key={s.slug}
              label={s.headingIt}
              onGenerate={() => onGenerate(s.slug)}
              isLoading={gen.isPending && gen.variables === s.slug}
              data-testid={`subject-generate-${s.slug}`}
            />
          ))}
        </div>
      )}
      <NarrativeEditor
        documentId={documentId}
        content={content}
        onChange={(next) => {
          setContent(next);
          onSave(next);
        }}
        extraPlugins={plugins}
        readOnly={!canEdit}
      />
      <SubjectFooter text={content} />
    </div>
  );
}

// Pure helper — inserts body text after a heading, replacing any existing
// body up to the next heading. Extracted for Vitest.
export const insertSectionBody = (
  markdown: string,
  headingIt: string,
  body: string,
): string => {
  const headingRegex = new RegExp(
    `(^|\\n)## ${headingIt.replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\$&")}\\n`,
    "u",
  );
  const match = markdown.match(headingRegex);
  if (!match) {
    return `${markdown.trimEnd()}\n\n## ${headingIt}\n\n${body}\n`;
  }
  const start = match.index! + match[0].length;
  const nextHeading = markdown.slice(start).search(/\n## /u);
  const end = nextHeading === -1 ? markdown.length : start + nextHeading;
  return `${markdown.slice(0, start)}${body}\n${markdown.slice(end)}`;
};
```

- [ ] **Step 3: Test `insertSectionBody`**

Create `apps/web/app/features/documents/components/SubjectEditor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { insertSectionBody } from "./SubjectEditor";
import { SOGGETTO_INITIAL_TEMPLATE } from "@oh-writers/domain";

describe("insertSectionBody", () => {
  it("fills an empty section between headings", () => {
    const out = insertSectionBody(
      SOGGETTO_INITIAL_TEMPLATE,
      "Premessa",
      "Testo generato.",
    );
    expect(out).toContain("## Premessa\nTesto generato.\n");
    expect(out).toContain("## Protagonista & antagonista");
  });

  it("replaces an existing body for the same section", () => {
    const md = "## Premessa\nVecchio.\n\n## Finale\nfine\n";
    const out = insertSectionBody(md, "Premessa", "Nuovo.");
    expect(out).toContain("## Premessa\nNuovo.\n");
    expect(out).not.toContain("Vecchio.");
    expect(out).toContain("## Finale");
  });

  it("appends new heading when missing", () => {
    const md = "## Finale\nfine\n";
    const out = insertSectionBody(md, "Premessa", "Testo.");
    expect(out).toContain("## Premessa");
    expect(out).toContain("Testo.");
  });
});
```

- [ ] **Step 4: CSS**

```css
.wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.generateRow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 5: Run & verify PASS**

```bash
pnpm --filter @oh-writers/web exec vitest run app/features/documents/components/SubjectEditor.test.ts
```

- [ ] **Step 6: Adjust `NarrativeProseMirrorView`** se non supporta `extraPlugins`

Leggere `NarrativeProseMirrorView.tsx`. Se non accetta `extraPlugins`, aggiungere prop opzionale `readonly extraPlugins?: Plugin[]` e concatenarla alla lista di plugin prima di `new EditorState.create`. Zero breaking change per gli altri chiamanti.

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/features/documents/components/SubjectEditor.tsx apps/web/app/features/documents/components/SubjectEditor.module.css apps/web/app/features/documents/components/SubjectEditor.test.ts apps/web/app/features/documents/components/NarrativeProseMirrorView.tsx
git commit -m "[OHW] feat(docs-ui): SubjectEditor composes narrative editor + cartella plugin + inline generate"
```

---

## Phase 7 — Route + logline co-editing

### Task 7.1: Route `/projects/:id/soggetto`

**Files:**

- Create: `apps/web/app/routes/projects.$projectId.soggetto.tsx`

- [ ] **Step 1: Scout route patterns**

```bash
ls apps/web/app/routes/projects.*
cat apps/web/app/routes/projects.\$projectId.synopsis.tsx 2>/dev/null | head -60
```

- [ ] **Step 2: Implement**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { DocumentTypes } from "@oh-writers/domain";
import { SubjectEditor } from "~/features/documents/components/SubjectEditor";
import { LoglineBlock } from "~/features/documents/components/LoglineBlock";
import { ExportPdfModal } from "~/features/documents/components/ExportPdfModal";
import { ExportSiaeModal } from "~/features/documents/components/ExportSiaeModal";
import {
  documentQueryOptions,
  useSaveDocument,
} from "~/features/documents/hooks/useDocument";
import styles from "./projects.$projectId.soggetto.module.css";

export const Route = createFileRoute("/projects/$projectId/soggetto")({
  component: SoggettoPage,
});

function SoggettoPage() {
  const { projectId } = Route.useParams();
  return (
    <main className={styles.page} data-testid="soggetto-page">
      <Suspense fallback={<p>Caricamento…</p>}>
        <SoggettoContent projectId={projectId} />
      </Suspense>
    </main>
  );
}

function SoggettoContent({ projectId }: { projectId: string }) {
  const { data } = useSuspenseQuery(
    documentQueryOptions(projectId, DocumentTypes.SOGGETTO),
  );
  const save = useSaveDocument(projectId, DocumentTypes.SOGGETTO);

  return (
    <>
      <header className={styles.header}>
        <h1>{data.project.title}</h1>
        <div className={styles.exportActions}>
          <ExportPdfModal
            projectId={projectId}
            docType={DocumentTypes.SOGGETTO}
            data-testid="subject-export-trigger"
          />
          <ExportSiaeModal
            projectId={projectId}
            data-testid="subject-export-siae-trigger"
          />
        </div>
      </header>
      <LoglineBlock
        projectId={projectId}
        logline={data.project.logline ?? ""}
        canEdit={data.canEdit}
      />
      <SubjectEditor
        projectId={projectId}
        documentId={data.document.id}
        initialContent={data.document.content}
        canEdit={data.canEdit}
        onSave={(content) => save.mutate({ content })}
      />
    </>
  );
}
```

- [ ] **Step 3: CSS module**

Create `apps/web/app/routes/projects.$projectId.soggetto.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  max-inline-size: 900px;
  margin-inline: auto;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.exportActions {
  display: flex;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Verify `documentQueryOptions` + `useSaveDocument` existono**

```bash
grep -rn "documentQueryOptions\|useSaveDocument" apps/web/app/features/documents/hooks 2>/dev/null
```

Se non esistono esattamente con questo nome, adattare gli import agli hook reali (può essere `useDocument(projectId, type)`). Non introdurre nuovi hook — solo uso di API esistente.

Se l'API esistente **non ritorna `canEdit` e `project`** insieme al document, aggiungere un sub-task: estendere `getDocument` (server fn) con un nuovo ResultShape che include `{ document, project: { id, title, logline }, canEdit }`. Zero breaking: nuova server fn `getSubjectContext`.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

Risolvere ogni errore di import / tipo risultante.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/projects.\$projectId.soggetto.tsx apps/web/app/routes/projects.\$projectId.soggetto.module.css
git commit -m "[OHW] feat(routes): /projects/:id/soggetto combines logline + subject editor + export buttons"
```

### Task 7.2: `LoglineBlock` component

**Files:**

- Create: `apps/web/app/features/documents/components/LoglineBlock.tsx`
- Create: `apps/web/app/features/documents/components/LoglineBlock.module.css`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { InlineGenerateButton } from "@oh-writers/ui";
import { useGenerateLoglineFromSubject } from "../hooks/useSubjectAI";
import { useUpdateProjectLogline } from "~/features/projects/hooks/useProject";
import styles from "./LoglineBlock.module.css";

export interface LoglineBlockProps {
  readonly projectId: string;
  readonly logline: string;
  readonly canEdit: boolean;
}

export function LoglineBlock({
  projectId,
  logline,
  canEdit,
}: LoglineBlockProps) {
  const [value, setValue] = useState(logline);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const extract = useGenerateLoglineFromSubject(projectId);
  const save = useUpdateProjectLogline(projectId);

  const onExtract = async () => {
    const out = await extract.mutateAsync();
    setSuggestion(out.logline);
  };

  const accept = () => {
    if (!suggestion) return;
    setValue(suggestion);
    save.mutate({ logline: suggestion });
    setSuggestion(null);
  };

  return (
    <section className={styles.block} data-testid="logline-block">
      <div className={styles.header}>
        <label className={styles.label} htmlFor="logline-input">
          Logline
        </label>
        {canEdit && (
          <InlineGenerateButton
            label="estrai dal soggetto"
            onGenerate={onExtract}
            isLoading={extract.isPending}
            data-testid="logline-extract-trigger"
          />
        )}
      </div>
      <textarea
        id="logline-input"
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== logline && save.mutate({ logline: value })}
        maxLength={500}
        disabled={!canEdit}
        data-testid="logline-input"
      />
      {suggestion && (
        <div className={styles.suggestion} data-testid="logline-suggestion">
          <p>{suggestion}</p>
          <div className={styles.actions}>
            <button type="button" onClick={accept}>
              Usa questa
            </button>
            <button type="button" onClick={() => setSuggestion(null)}>
              Scarta
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify `useUpdateProjectLogline`**

```bash
grep -rn "updateProjectLogline\|useUpdateProject" apps/web/app/features/projects 2>/dev/null
```

Se manca l'hook specifico, usare il generico `useUpdateProject` accettando payload parziale `{ logline }`. Se manca pure quello, aggiungere sub-task: nuovo server fn `updateProject` che accetta patch `z.object({ logline: z.string().max(500).nullable().optional() })`, mutation hook relativo in `features/projects/hooks/useProject.ts`. Minimo indispensabile.

- [ ] **Step 3: CSS**

```css
.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.label {
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}
.input {
  width: 100%;
  min-height: 3.5em;
  padding: var(--space-2);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  resize: vertical;
}
.suggestion {
  padding: var(--space-2) var(--space-3);
  background: var(--color-accent-bg);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.actions {
  display: flex;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @oh-writers/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/documents/components/LoglineBlock.tsx apps/web/app/features/documents/components/LoglineBlock.module.css
git commit -m "[OHW] feat(docs-ui): LoglineBlock with extract-from-subject suggestion popover"
```

---

## Phase 8 — Export (PDF, DOCX, SIAE)

### Task 8.1: Estendere `ExportPdfModal` con radio DOCX

**Files:**

- Modify: `apps/web/app/features/documents/components/ExportPdfModal.tsx`

- [ ] **Step 1: Leggere file**

```bash
cat apps/web/app/features/documents/components/ExportPdfModal.tsx
```

- [ ] **Step 2: Aggiungere state `format` e radio**

Aggiungi stato `const [format, setFormat] = useState<"pdf" | "docx">("pdf");`. Inserisci radio group nella UI del modal, prima del bottone submit:

```tsx
<fieldset className={styles.formatGroup}>
  <legend>Formato</legend>
  <label>
    <input
      type="radio"
      name="export-format"
      value="pdf"
      checked={format === "pdf"}
      onChange={() => setFormat("pdf")}
    />
    PDF
  </label>
  <label>
    <input
      type="radio"
      name="export-format"
      value="docx"
      checked={format === "docx"}
      onChange={() => setFormat("docx")}
    />
    DOCX
  </label>
</fieldset>
```

- [ ] **Step 3: Branch sul submit**

Nel handler onSubmit chiama `exportSubjectDocx` se `format === "docx"` (implementato in Task 8.2), altrimenti il flow PDF esistente.

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/documents/components/ExportPdfModal.tsx apps/web/app/features/documents/components/ExportPdfModal.module.css
git commit -m "[OHW] feat(docs-export): radio PDF/DOCX in ExportPdfModal"
```

### Task 8.2: `exportSubjectDocx` server fn

**Files:**

- Create: `apps/web/app/features/documents/server/subject-export.server.ts`

- [ ] **Step 1: Implement**

```ts
import { createServerFn } from "@tanstack/start";
import { eq } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import {
  Document as DocxDocument,
  Paragraph,
  HeadingLevel,
  Packer,
  TextRun,
} from "docx";
import { documents, projects } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import {
  SubjectDocxExportInputSchema,
  SiaeExportInputSchema,
} from "../documents.schema";
import {
  DbError,
  ForbiddenError,
  SubjectNotFoundError,
} from "../documents.errors";
import { resolveProjectAccess } from "~/features/projects/server/access";

export const exportSubjectDocx = createServerFn({ method: "POST" })
  .validator(SubjectDocxExportInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { base64: string; filename: string },
        SubjectNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      const access = await resolveProjectAccess(db, user.id, data.projectId);
      if (access.isErr()) return toShape(err(access.error));
      if (!access.value.canView)
        return toShape(err(new ForbiddenError("export subject")));

      const loaded = await loadSubjectAndProject(db, data.projectId);
      if (loaded.isErr()) return toShape(err(loaded.error));
      const { project, subject } = loaded.value;
      if (!subject)
        return toShape(err(new SubjectNotFoundError(data.projectId)));

      const docx = buildDocx({
        title: project.title,
        content: subject.content,
      });
      const buf = await Packer.toBuffer(docx);
      return toShape(
        ok({
          base64: buf.toString("base64"),
          filename: `${slugify(project.title)}-soggetto.docx`,
        }),
      );
    },
  );

const buildDocx = (params: {
  title: string;
  content: string;
}): DocxDocument => {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
    }),
  ];
  for (const line of params.content.split("\n")) {
    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
        }),
      );
    } else {
      paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }
  return new DocxDocument({ sections: [{ children: paragraphs }] });
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

const loadSubjectAndProject = (
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
) =>
  ResultAsync.fromPromise(
    (async () => {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!project) throw new Error("project not found");
      const subject = await db.query.documents.findFirst({
        where: (d, { and, eq: e }) =>
          and(e(d.projectId, projectId), e(d.type, "soggetto")),
      });
      return { project, subject: subject ?? null };
    })(),
    (e) => new DbError("loadSubjectAndProject", e),
  );
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/documents/server/subject-export.server.ts
git commit -m "[OHW] feat(docs-export): exportSubjectDocx server fn via docx npm"
```

### Task 8.3: `exportSubjectSiae` server fn

**Files:**

- Modify: `apps/web/app/features/documents/server/subject-export.server.ts`

- [ ] **Step 1: Aggiungere al file**

```ts
export const exportSubjectSiae = createServerFn({ method: "POST" })
  .validator(SiaeExportInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { base64: string; filename: string },
        SubjectNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      const access = await resolveProjectAccess(db, user.id, data.projectId);
      if (access.isErr()) return toShape(err(access.error));
      if (!access.value.canView)
        return toShape(err(new ForbiddenError("export subject SIAE")));

      const loaded = await loadSubjectAndProject(db, data.projectId);
      if (loaded.isErr()) return toShape(err(loaded.error));
      const { project, subject } = loaded.value;
      if (!subject)
        return toShape(err(new SubjectNotFoundError(data.projectId)));

      const pdfBuf = await buildSiaePdf({
        project: {
          title: data.title,
          logline: project.logline,
        },
        siae: data,
        subjectContent: subject.content,
      });
      return toShape(
        ok({
          base64: pdfBuf.toString("base64"),
          filename: `${slugify(data.title)}-soggetto-siae.pdf`,
        }),
      );
    },
  );
```

- [ ] **Step 2: Implementare `buildSiaePdf`**

Verificare quale lib PDF è già in uso:

```bash
grep -rn "pdfkit\|afterwriting\|jspdf" apps/web/app apps/web/package.json | head -10
```

- Se `pdfkit` presente: usarlo.
- Se solo `afterwriting` (PDF screenplay-specific, non adatto a prosa narrativa con frontespizio): **chiedere approvazione** per `pdfkit@^0.15.0` come nuova dep. Se rifiutato, fallback su renderer via `@react-pdf/renderer` (da approvare separatamente).

Assumendo approvazione `pdfkit`:

```ts
import PDFDocument from "pdfkit";

const buildSiaePdf = async (params: {
  project: { title: string; logline: string | null };
  siae: z.infer<typeof SiaeExportInputSchema>;
  subjectContent: string;
}): Promise<Buffer> =>
  new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 72 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // Frontespizio
    doc.fontSize(16).text("REPUBBLICA ITALIANA", { align: "center" });
    doc.fontSize(12).text("SIAE — Sezione OLAF", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .text("SOGGETTO PER OPERA CINEMATOGRAFICA", { align: "center" });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Titolo: ${params.siae.title}`);
    doc.text(`Genere dichiarato: ${params.siae.declaredGenre}`);
    doc.text(`Durata stimata: ${params.siae.estimatedDurationMinutes} minuti`);
    doc.text(`Data di compilazione: ${params.siae.compilationDate}`);
    doc.moveDown();

    doc.text("Autore/i:");
    for (const a of params.siae.authors) {
      const cf = a.taxCode ? `  [CF: ${a.taxCode}]` : "";
      doc.text(`  • ${a.fullName}${cf}`);
    }

    if (params.project.logline) {
      doc.moveDown();
      doc.text("Logline:");
      doc.text(`  ${params.project.logline}`);
    }

    if (params.siae.depositNotes) {
      doc.moveDown();
      doc.text(`Note: ${params.siae.depositNotes}`);
    }

    doc.addPage();

    // Corpo soggetto
    for (const line of params.subjectContent.split("\n")) {
      if (line.startsWith("## ")) {
        doc.moveDown().fontSize(13).text(line.slice(3), { underline: true });
        doc.fontSize(11);
      } else if (line.trim()) {
        doc.text(line);
      } else {
        doc.moveDown(0.3);
      }
    }

    doc.end();
  });
```

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/documents/server/subject-export.server.ts apps/web/package.json pnpm-lock.yaml
git commit -m "[OHW] feat(docs-export): exportSubjectSiae server fn renders IT frontespizio + body via pdfkit"
```

### Task 8.4: `ExportSiaeModal` component

**Files:**

- Create: `apps/web/app/features/documents/components/ExportSiaeModal.tsx`
- Create: `apps/web/app/features/documents/components/ExportSiaeModal.module.css`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { Modal, Button } from "@oh-writers/ui";
import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { exportSubjectSiae } from "../server/subject-export.server";
import { SiaeExportInputSchema } from "../documents.schema";
import type { z } from "zod";
import styles from "./ExportSiaeModal.module.css";

type SiaeInput = z.infer<typeof SiaeExportInputSchema>;

interface Props {
  readonly projectId: string;
  readonly "data-testid"?: string;
}

export function ExportSiaeModal({ projectId, "data-testid": testId }: Props) {
  const [open, setOpen] = useState(false);
  const [authors, setAuthors] = useState<SiaeInput["authors"]>([
    { fullName: "", taxCode: null },
  ]);
  const [title, setTitle] = useState("");
  const [declaredGenre, setDeclaredGenre] = useState("");
  const [duration, setDuration] = useState(100);
  const [compilationDate, setCompilationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [depositNotes, setDepositNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (input: SiaeInput) =>
      unwrapResult(await exportSubjectSiae({ data: input })),
    onSuccess: ({ base64, filename }) => {
      triggerDownload(base64, filename);
      setOpen(false);
    },
  });

  const onSubmit = () => {
    const payload: SiaeInput = {
      projectId,
      title,
      authors,
      declaredGenre,
      estimatedDurationMinutes: duration,
      compilationDate,
      depositNotes: depositNotes.trim() === "" ? null : depositNotes,
    };
    const parsed = SiaeExportInputSchema.safeParse(payload);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    setValidationError(null);
    run.mutate(parsed.data);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="secondary"
        data-testid={testId ?? "export-siae-trigger"}
      >
        Export SIAE
      </Button>
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title="Export SIAE (IT)"
          data-testid="export-siae-modal"
        >
          <div className={styles.form}>
            <label>
              Titolo
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="siae-title"
              />
            </label>
            <label>
              Genere dichiarato
              <input
                value={declaredGenre}
                onChange={(e) => setDeclaredGenre(e.target.value)}
                data-testid="siae-genre"
              />
            </label>
            <label>
              Durata stimata (minuti)
              <input
                type="number"
                value={duration}
                min={1}
                max={600}
                onChange={(e) => setDuration(Number(e.target.value))}
                data-testid="siae-duration"
              />
            </label>
            <label>
              Data compilazione
              <input
                type="date"
                value={compilationDate}
                onChange={(e) => setCompilationDate(e.target.value)}
                data-testid="siae-date"
              />
            </label>
            <AuthorsField authors={authors} onChange={setAuthors} />
            <label>
              Note (opzionale)
              <textarea
                value={depositNotes}
                onChange={(e) => setDepositNotes(e.target.value)}
                maxLength={500}
                data-testid="siae-notes"
              />
            </label>
            {validationError && (
              <p className={styles.error} data-testid="siae-error">
                {validationError}
              </p>
            )}
            <div className={styles.actions}>
              <Button
                onClick={onSubmit}
                disabled={run.isPending}
                data-testid="siae-submit"
              >
                {run.isPending ? "Genero PDF…" : "Genera PDF"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function AuthorsField({
  authors,
  onChange,
}: {
  authors: SiaeInput["authors"];
  onChange: (next: SiaeInput["authors"]) => void;
}) {
  const updateAt = (
    i: number,
    patch: Partial<SiaeInput["authors"][number]>,
  ) => {
    onChange(authors.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };
  return (
    <fieldset className={styles.authors} data-testid="siae-authors">
      <legend>Autori</legend>
      {authors.map((a, i) => (
        <div key={i} className={styles.authorRow}>
          <input
            placeholder="Nome e cognome"
            value={a.fullName}
            onChange={(e) => updateAt(i, { fullName: e.target.value })}
            data-testid={`siae-author-name-${i}`}
          />
          <input
            placeholder="CF (opzionale)"
            value={a.taxCode ?? ""}
            onChange={(e) =>
              updateAt(i, {
                taxCode: e.target.value.trim() === "" ? null : e.target.value,
              })
            }
            maxLength={16}
            data-testid={`siae-author-cf-${i}`}
          />
          {authors.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(authors.filter((_, idx) => idx !== i))}
              aria-label={`Rimuovi autore ${i + 1}`}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...authors, { fullName: "", taxCode: null }])}
        data-testid="siae-add-author"
      >
        + Aggiungi autore
      </button>
    </fieldset>
  );
}

const triggerDownload = (base64: string, filename: string) => {
  const blob = new Blob(
    [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
    { type: "application/pdf" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: CSS**

```css
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.form label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
}
.authors {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}
.authorRow {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: var(--space-2);
}
.actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/documents/components/ExportSiaeModal.tsx apps/web/app/features/documents/components/ExportSiaeModal.module.css
git commit -m "[OHW] feat(docs-ui): ExportSiaeModal with authors list + form validation + PDF download"
```

---

## Phase 9 — Navigation integration

### Task 9.1: Aggiungere soggetto al project dashboard / sidebar

**Files:**

- Modify: il componente che oggi lista i doc nella sidebar o dashboard del progetto

- [ ] **Step 1: Scout**

```bash
grep -rn "logline.*synopsis\|synopsis.*outline\|DocumentTypes.LOGLINE" apps/web/app/features apps/web/app/routes 2>/dev/null | head -20
```

Identificare il/i file che oggi renderizzano la lista ordinata di doc per il progetto.

- [ ] **Step 2: Refactor per usare `DOCUMENT_PIPELINE`**

Ovunque sia hardcoded l'ordine dei 4 doc types, sostituire con `DOCUMENT_PIPELINE.map(...)` da `@oh-writers/domain`. Aggiungere un record label IT:

```ts
const DOCUMENT_LABELS_IT: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
};
```

- [ ] **Step 3: Link route soggetto**

Il link soggetto punta a `/projects/:id/soggetto`.

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Manual smoke** (se possibile tramite `pnpm dev` + `MOCK_AI=true`): verifica che la nav mostri Soggetto tra Logline e Sinossi.

- [ ] **Step 6: Commit**

```bash
git add [files modified]
git commit -m "[OHW] feat(nav): render soggetto between logline and synopsis via DOCUMENT_PIPELINE"
```

### Task 9.2: Seed soggetto per test dev

**Files:**

- Modify: `packages/db/src/seed/index.ts`

- [ ] **Step 1: Aggiungere seed**

Nel blocco che oggi inserisce logline/synopsis per il progetto di test, aggiungere una row soggetto con template + corpo d'esempio. Es. per `TEST_TEAM_PROJECT_ID`:

```ts
await db.insert(documents).values({
  projectId: TEST_TEAM_PROJECT_ID,
  type: "soggetto",
  title: "Soggetto",
  content:
    "## Premessa\n\nUn breve testo di premessa per test E2E.\n\n## Protagonista & antagonista\n\n\n## Arco narrativo\n\n\n## Mondo\n\n\n## Finale\n",
  createdBy: TEST_USER_ID,
});
```

- [ ] **Step 2: Re-seed DB**

```bash
pnpm db:seed
```

Expected: no errors, soggetto row presente.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed/index.ts
git commit -m "[OHW] chore(seed): seed soggetto row for test team project"
```

---

## Phase 10 — E2E tests

### Task 10.1: Test flow base

**Files:**

- Create: `tests/soggetto/helpers.ts`
- Create: `tests/soggetto/soggetto-flow.spec.ts`

- [ ] **Step 1: Helpers**

```ts
// tests/soggetto/helpers.ts
import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

export const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToSoggetto = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/soggetto`);
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 10_000,
  });
};
```

- [ ] **Step 2: Spec**

```ts
// tests/soggetto/soggetto-flow.spec.ts
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToSoggetto, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 04f] Soggetto", () => {
  test("[OHW-SOG-001] editor shows logline + subject with 5 generate buttons", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("logline-block")).toBeVisible();
    await expect(page.getByTestId("subject-editor")).toBeVisible();
    for (const slug of [
      "premessa",
      "protagonista",
      "arco",
      "mondo",
      "finale",
    ]) {
      await expect(page.getByTestId(`subject-generate-${slug}`)).toBeVisible();
    }
  });

  test("[OHW-SOG-002] click ✨ genera premessa inserts mock text", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await page.getByTestId("subject-generate-premessa").click();
    await expect(
      page
        .locator('[data-testid="subject-editor"]')
        .getByText(/provincia italiana|Negli anni/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-SOG-003] footer shows cartelle/pages/words counters", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("subject-footer")).toBeVisible();
    await expect(page.getByTestId("subject-footer")).toContainText("cartelle");
    await expect(page.getByTestId("subject-footer")).toContainText("parole");
  });
});
```

- [ ] **Step 3: Run (richiede dev server con MOCK_AI=true)**

```bash
MOCK_AI=true pnpm dev &
sleep 15
pnpm test tests/soggetto/soggetto-flow.spec.ts
```

Expected: 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/soggetto/helpers.ts tests/soggetto/soggetto-flow.spec.ts
git commit -m "[OHW] test(soggetto): OHW-SOG-001..003 flow + mock generate + footer counters"
```

### Task 10.2: Test export

**Files:**

- Create: `tests/soggetto/soggetto-export.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToSoggetto, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 04f] Soggetto — Export", () => {
  test("[OHW-SOG-004] export PDF/DOCX modal opens and offers both formats", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await page.getByTestId("subject-export-trigger").click();
    await expect(page.getByRole("radio", { name: "PDF" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "DOCX" })).toBeVisible();
  });

  test("[OHW-SOG-005] SIAE modal validates authors and downloads PDF", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);
    await page.getByTestId("subject-export-siae-trigger").click();
    await expect(page.getByTestId("export-siae-modal")).toBeVisible();

    // validation: submit without authors name → error
    await page.getByTestId("siae-submit").click();
    await expect(page.getByTestId("siae-error")).toBeVisible();

    // fill and submit
    await page.getByTestId("siae-title").fill("Il peso del silenzio");
    await page.getByTestId("siae-genre").fill("drama");
    await page.getByTestId("siae-duration").fill("110");
    await page.getByTestId("siae-author-name-0").fill("Mario Rossi");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("siae-submit").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-soggetto-siae\.pdf$/);
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm test tests/soggetto/soggetto-export.spec.ts
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/soggetto/soggetto-export.spec.ts
git commit -m "[OHW] test(soggetto): OHW-SOG-004..005 export PDF/DOCX radio + SIAE modal download"
```

---

## Phase 11 — Documentation + merge

### Task 11.1: README update

**Files:**

- Modify: `README.md` (sezione spec status)

- [ ] **Step 1: Aggiungere riferimento**

Nella sezione che elenca le spec implementate, aggiungere:

```markdown
- **core/04f — Soggetto** (2° step pipeline documenti, editor ProseMirror con marker cartelle, Cesare section-by-section, export PDF/DOCX + SIAE-IT)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "[OHW] docs(readme): reference Spec 04f Soggetto in status section"
```

### Task 11.2: Full typecheck + all tests

- [ ] **Step 1: Typecheck**

```bash
pnpm --recursive typecheck
```

Expected: PASS.

- [ ] **Step 2: Run all unit tests**

```bash
pnpm --filter @oh-writers/domain exec vitest run
pnpm --filter @oh-writers/web exec vitest run
```

Expected: PASS su tutti.

- [ ] **Step 3: Run all Playwright**

```bash
MOCK_AI=true pnpm dev &
sleep 15
pnpm test
```

Expected: PASS.

### Task 11.3: Merge to main

- [ ] **Step 1: FF merge**

```bash
git -C /Users/valerionarcisi/personal/oh-writers merge --ff-only <branch-name>
git -C /Users/valerionarcisi/personal/oh-writers push origin main
```

- [ ] **Step 2: Update MEMORY**

Append a `/Users/valerionarcisi/.claude/projects/-Users-valerionarcisi-personal-oh-writers/memory/MEMORY.md`:

```markdown
- [Soggetto — Spec 04f](project-soggetto-state.md) — document type, editor con marker cartelle, Cesare section-by-section, export PDF/DOCX/SIAE
```

Creare il file `project-soggetto-state.md` (sotto `memory/`) con highlights di file key e gotchas emersi durante lo sviluppo.

---

## Acceptance gate finale

Verificare **manualmente** ogni AC dalla spec (OHW-SOG-010..024) tramite `MOCK_AI=true pnpm dev` + azioni UI. Checklist:

- [ ] OHW-SOG-010 `DOCUMENT_PIPELINE` usata in almeno 2 punti UI
- [ ] OHW-SOG-011 route `/soggetto` accessibile
- [ ] OHW-SOG-012 template pre-popolato
- [ ] OHW-SOG-013 marker cartelle visibile
- [ ] OHW-SOG-014 footer live
- [ ] OHW-SOG-015 soft warning
- [ ] OHW-SOG-016 ✨ genera per heading
- [ ] OHW-SOG-017 rate limit 30s
- [ ] OHW-SOG-018 MOCK_AI deterministico
- [ ] OHW-SOG-019 export PDF/DOCX
- [ ] OHW-SOG-020 SIAE modal campi
- [ ] OHW-SOG-021 SIAE PDF frontespizio
- [ ] OHW-SOG-022 zero DB writes da SIAE
- [ ] OHW-SOG-023 viewer non può editare
- [ ] OHW-SOG-024 versioning funziona su soggetto
