# Spec 21 — SIAE Metadata Persistence + E2E Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining Spec 21 deliverables: persist SIAE form state to the DB so the modal pre-populates on reopen, and rewrite the E2E flow spec to match the new FreeNarrativeEditor.

**Architecture:** Add a nullable `siae_metadata jsonb` column to `projects`. Two server functions (`loadSiaeMetadata` / `saveSiaeMetadata`) read and write it. The modal internally saves form state on each successful export. `useSiaeMetadata` (TanStack Query) pre-populates the modal's `defaults` via the soggetto route.

**Tech Stack:** Drizzle (migration), Zod (`SiaeMetadataSchema`), `createServerFn` + neverthrow, TanStack Query, Playwright (E2E).

---

## What is already done (do not redo)

- `cartelle-counter.ts` + `cartelle-counter.test.ts` ✅
- `FreeNarrativeEditor.tsx` + `.module.css` mounted on the soggetto route ✅
- SubjectEditor, section-marker plugin, AI generation hooks — deleted ✅
- `soggetto-export.spec.ts` covers DOCX + SIAE download ✅

---

## File map

| File                                                                     | Action         | Purpose                                                                         |
| ------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------- |
| `packages/db/src/schema/projects.ts`                                     | Modify         | Add `siaeMetadata` column                                                       |
| `packages/db/drizzle/0012_add_siae_metadata.sql`                         | Auto-generated | Migration SQL                                                                   |
| `apps/web/app/features/documents/documents.schema.ts`                    | Modify         | Add `SiaeMetadataSchema` + type                                                 |
| `apps/web/app/features/documents/documents.schema.test.ts`               | Modify         | Tests for `SiaeMetadataSchema`                                                  |
| `apps/web/app/features/documents/server/subject-siae-metadata.server.ts` | Create         | `loadSiaeMetadata` + `saveSiaeMetadata` server fns                              |
| `apps/web/app/features/documents/hooks/useSiaeMetadata.ts`               | Create         | `useSiaeMetadata` (query) + `useSaveSiaeMetadata` (mutation)                    |
| `apps/web/app/features/documents/lib/siae-initial-state.ts`              | Modify         | Extend `SiaeFormDefaults`, update `buildSiaeInitialState`, add `toSiaeMetadata` |
| `apps/web/app/features/documents/lib/siae-initial-state.test.ts`         | Modify         | Tests for saved-metadata path                                                   |
| `apps/web/app/features/documents/components/ExportSiaeModal.tsx`         | Modify         | Internal `useSaveSiaeMetadata` call on export success                           |
| `apps/web/app/features/documents/index.ts`                               | Modify         | Export new hook                                                                 |
| `apps/web/app/routes/_app.projects.$id_.soggetto.tsx`                    | Modify         | Load metadata, pass as enriched defaults                                        |
| `tests/soggetto/soggetto-flow.spec.ts`                                   | Rewrite        | Spec 21 flow tests (replace Spec 04f tests)                                     |

---

## Task 1: DB migration — add `siae_metadata` column

**Files:**

- Modify: `packages/db/src/schema/projects.ts`
- Auto-generated: `packages/db/drizzle/0012_add_siae_metadata.sql`

- [ ] **Step 1.1: Add the column to the Drizzle schema**

  In `packages/db/src/schema/projects.ts`, add inside the `pgTable` columns object, after `titlePageDoc`:

  ```ts
  siaeMetadata: jsonb("siae_metadata"),
  ```

  The `jsonb` import is already at the top of the file. No `.$type<>()` — the server function will parse it with `SiaeMetadataSchema.safeParse`.

- [ ] **Step 1.2: Generate the migration**

  ```bash
  pnpm db:migrate:create
  ```

  Expected: Drizzle creates `packages/db/drizzle/0012_add_siae_metadata.sql` and updates `meta/_journal.json`. The SQL should contain:

  ```sql
  ALTER TABLE "projects" ADD COLUMN "siae_metadata" jsonb;
  ```

  Verify the file exists and contains that statement before continuing.

- [ ] **Step 1.3: Apply the migration locally**

  ```bash
  pnpm db:migrate
  ```

  Expected: `All migrations applied successfully` (or similar). No errors.

- [ ] **Step 1.4: Commit**

  ```bash
  git add packages/db/src/schema/projects.ts packages/db/drizzle/
  git commit -m "[OHW] feat(db): add siae_metadata jsonb column to projects"
  ```

---

## Task 2: `SiaeMetadataSchema` + unit tests

**Files:**

- Modify: `apps/web/app/features/documents/documents.schema.ts`
- Modify: `apps/web/app/features/documents/documents.schema.test.ts`

- [ ] **Step 2.1: Add the schema to `documents.schema.ts`**

  Append after `SiaeExportInputSchema` (line 103):

  ```ts
  export const SiaeMetadataSchema = z.object({
    title: z.string().min(1).max(200),
    authors: z.array(SiaeAuthorSchema).min(1),
    declaredGenre: z.string().max(100),
    estimatedDurationMinutes: z.number().int().min(1).max(600),
    depositNotes: z.string().max(500).nullable(),
  });
  export type SiaeMetadata = z.infer<typeof SiaeMetadataSchema>;
  ```

  `SiaeAuthorSchema` is already defined in the same file.

- [ ] **Step 2.2: Write the failing tests**

  In `apps/web/app/features/documents/documents.schema.test.ts`, add at the end:

  ```ts
  import { SiaeMetadataSchema, type SiaeMetadata } from "./documents.schema";

  const makeValidMetadata = (
    overrides: Partial<SiaeMetadata> = {},
  ): SiaeMetadata => ({
    title: "Il regista di matrimoni",
    authors: [{ fullName: "Mario Martone", taxCode: null }],
    declaredGenre: "commedia",
    estimatedDurationMinutes: 105,
    depositNotes: null,
    ...overrides,
  });

  describe("SiaeMetadataSchema", () => {
    it("accepts a valid metadata object", () => {
      expect(SiaeMetadataSchema.safeParse(makeValidMetadata()).success).toBe(
        true,
      );
    });

    it("rejects empty title", () => {
      expect(
        SiaeMetadataSchema.safeParse(makeValidMetadata({ title: "" })).success,
      ).toBe(false);
    });

    it("rejects empty authors array", () => {
      expect(
        SiaeMetadataSchema.safeParse(makeValidMetadata({ authors: [] }))
          .success,
      ).toBe(false);
    });

    it("accepts null depositNotes", () => {
      expect(
        SiaeMetadataSchema.safeParse(makeValidMetadata({ depositNotes: null }))
          .success,
      ).toBe(true);
    });

    it("rejects estimatedDurationMinutes = 0", () => {
      expect(
        SiaeMetadataSchema.safeParse(
          makeValidMetadata({ estimatedDurationMinutes: 0 }),
        ).success,
      ).toBe(false);
    });
  });
  ```

  Note: the `import` line already exists at the top of the file for `SiaeExportInputSchema` — add `SiaeMetadataSchema` and `SiaeMetadata` to that import.

- [ ] **Step 2.3: Run tests and verify they fail first**

  ```bash
  pnpm test:unit -- --reporter=verbose documents.schema.test.ts
  ```

  Expected: FAIL — `SiaeMetadataSchema` is not exported yet.

- [ ] **Step 2.4: Verify tests pass after adding the schema**

  ```bash
  pnpm test:unit -- --reporter=verbose documents.schema.test.ts
  ```

  Expected: all `SiaeMetadataSchema` tests PASS.

- [ ] **Step 2.5: Commit**

  ```bash
  git add apps/web/app/features/documents/documents.schema.ts \
          apps/web/app/features/documents/documents.schema.test.ts
  git commit -m "[OHW] feat(documents): add SiaeMetadataSchema"
  ```

---

## Task 3: Server functions — load + save

**Files:**

- Create: `apps/web/app/features/documents/server/subject-siae-metadata.server.ts`

- [ ] **Step 3.1: Create the server file**

  ```ts
  // apps/web/app/features/documents/server/subject-siae-metadata.server.ts
  import { createServerFn } from "@tanstack/start";
  import { eq } from "drizzle-orm";
  import { z } from "zod";
  import { ok, ResultAsync } from "neverthrow";
  import { projects } from "@oh-writers/db/schema";
  import { toShape, type ResultShape } from "@oh-writers/utils";
  import { getDb, type Db } from "~/server/db";
  import { requireProjectAccess } from "~/server/access";
  import { SiaeMetadataSchema, type SiaeMetadata } from "../documents.schema";
  import { DbError, ForbiddenError } from "../documents.errors";

  type LoadError = ForbiddenError | DbError;
  type SaveError = ForbiddenError | DbError;

  const readSiaeMetadata = (
    db: Db,
    projectId: string,
  ): ResultAsync<SiaeMetadata | null, DbError> =>
    ResultAsync.fromPromise(
      db.query.projects
        .findFirst({ where: eq(projects.id, projectId) })
        .then((row) => {
          if (!row?.siaeMetadata) return null;
          const parsed = SiaeMetadataSchema.safeParse(row.siaeMetadata);
          return parsed.success ? parsed.data : null;
        }),
      (e) => new DbError("siae-metadata/load", e),
    );

  export const loadSiaeMetadata = createServerFn({ method: "GET" })
    .validator(z.object({ projectId: z.string().uuid() }))
    .handler(
      async ({
        data,
      }): Promise<ResultShape<SiaeMetadata | null, LoadError>> => {
        const db = await getDb();
        return toShape(
          await requireProjectAccess(db, data.projectId, "view")
            .mapErr((e): LoadError => e)
            .andThen(() => readSiaeMetadata(db, data.projectId)),
        );
      },
    );

  export const saveSiaeMetadata = createServerFn({ method: "POST" })
    .validator(
      z.object({ projectId: z.string().uuid(), metadata: SiaeMetadataSchema }),
    )
    .handler(async ({ data }): Promise<ResultShape<void, SaveError>> => {
      const db = await getDb();
      return toShape(
        await requireProjectAccess(db, data.projectId, "edit")
          .mapErr((e): SaveError => e)
          .andThen(() =>
            ResultAsync.fromPromise(
              db
                .update(projects)
                .set({ siaeMetadata: data.metadata, updatedAt: new Date() })
                .where(eq(projects.id, data.projectId)),
              (e) => new DbError("siae-metadata/save", e),
            ).map(() => ok<void, SaveError>(undefined).value),
          ),
      );
    });
  ```

- [ ] **Step 3.2: Typecheck**

  ```bash
  pnpm --filter @oh-writers/web typecheck
  ```

  Expected: no errors. Fix any import path issues before continuing.

- [ ] **Step 3.3: Commit**

  ```bash
  git add apps/web/app/features/documents/server/subject-siae-metadata.server.ts
  git commit -m "[OHW] feat(documents): server fns loadSiaeMetadata + saveSiaeMetadata"
  ```

---

## Task 4: Client hooks

**Files:**

- Create: `apps/web/app/features/documents/hooks/useSiaeMetadata.ts`
- Modify: `apps/web/app/features/documents/index.ts`

- [ ] **Step 4.1: Create the hooks file**

  ```ts
  // apps/web/app/features/documents/hooks/useSiaeMetadata.ts
  import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
  } from "@tanstack/react-query";
  import { unwrapResult } from "@oh-writers/utils";
  import type { SiaeMetadata } from "../documents.schema";
  import {
    loadSiaeMetadata,
    saveSiaeMetadata,
  } from "../server/subject-siae-metadata.server";

  export const siaeMetadataQueryOptions = (projectId: string) =>
    queryOptions({
      queryKey: ["siae-metadata", projectId],
      queryFn: () =>
        loadSiaeMetadata({ data: { projectId } }).then(unwrapResult),
    });

  export const useSiaeMetadata = (projectId: string) =>
    useQuery(siaeMetadataQueryOptions(projectId));

  export const useSaveSiaeMetadata = (projectId: string) => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (metadata: SiaeMetadata) =>
        saveSiaeMetadata({ data: { projectId, metadata } }).then(unwrapResult),
      onSuccess: () =>
        void qc.invalidateQueries({ queryKey: ["siae-metadata", projectId] }),
    });
  };
  ```

- [ ] **Step 4.2: Export from `index.ts`**

  Add at the end of `apps/web/app/features/documents/index.ts`:

  ```ts
  export {
    siaeMetadataQueryOptions,
    useSiaeMetadata,
    useSaveSiaeMetadata,
  } from "./hooks/useSiaeMetadata";
  ```

- [ ] **Step 4.3: Typecheck**

  ```bash
  pnpm --filter @oh-writers/web typecheck
  ```

  Expected: no errors.

- [ ] **Step 4.4: Commit**

  ```bash
  git add apps/web/app/features/documents/hooks/useSiaeMetadata.ts \
          apps/web/app/features/documents/index.ts
  git commit -m "[OHW] feat(documents): useSiaeMetadata + useSaveSiaeMetadata hooks"
  ```

---

## Task 5: Wire defaults + modal + route

**Files:**

- Modify: `apps/web/app/features/documents/lib/siae-initial-state.ts`
- Modify: `apps/web/app/features/documents/lib/siae-initial-state.test.ts`
- Modify: `apps/web/app/features/documents/components/ExportSiaeModal.tsx`
- Modify: `apps/web/app/routes/_app.projects.$id_.soggetto.tsx`

### 5a — Extend `SiaeFormDefaults` and update helpers

- [ ] **Step 5a.1: Update `siae-initial-state.ts`**

  Replace the current `SiaeFormDefaults` interface and `buildSiaeInitialState` function, and add `toSiaeMetadata`. The full updated file:

  ```ts
  // apps/web/app/features/documents/lib/siae-initial-state.ts
  import type { AuthorEntry } from "../components/AuthorListField";
  import type { SiaeExportInput, SiaeMetadata } from "../documents.schema";

  export const DEFAULT_DURATION_MINUTES = 90;

  export interface SiaeFormDefaults {
    readonly title: string;
    readonly declaredGenre: string;
    readonly ownerFullName: string | null;
    readonly savedMetadata?: SiaeMetadata | null;
  }

  export interface SiaeFormState {
    readonly title: string;
    readonly authors: ReadonlyArray<AuthorEntry>;
    readonly declaredGenre: string;
    readonly estimatedDurationMinutes: number;
    readonly compilationDate: string;
    readonly depositNotes: string;
  }

  export const formatDateYmd = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  export const buildSiaeInitialState = (
    defaults: SiaeFormDefaults,
    now: Date = new Date(),
    authorIdFactory: () => string = () => crypto.randomUUID(),
  ): SiaeFormState => {
    const saved = defaults.savedMetadata ?? null;
    if (saved) {
      return {
        title: saved.title,
        authors: saved.authors.map((a) => ({
          id: authorIdFactory(),
          fullName: a.fullName,
          taxCode: a.taxCode,
        })),
        declaredGenre: saved.declaredGenre,
        estimatedDurationMinutes: saved.estimatedDurationMinutes,
        compilationDate: formatDateYmd(now),
        depositNotes: saved.depositNotes ?? "",
      };
    }
    return {
      title: defaults.title,
      authors: [
        {
          id: authorIdFactory(),
          fullName: defaults.ownerFullName ?? "",
          taxCode: null,
        },
      ],
      declaredGenre: defaults.declaredGenre,
      estimatedDurationMinutes: DEFAULT_DURATION_MINUTES,
      compilationDate: formatDateYmd(now),
      depositNotes: "",
    };
  };

  export const toSiaeMetadata = (state: SiaeFormState): SiaeMetadata => ({
    title: state.title.trim(),
    authors: state.authors.map((a) => ({
      fullName: a.fullName.trim(),
      taxCode:
        a.taxCode && a.taxCode.trim().length > 0 ? a.taxCode.trim() : null,
    })),
    declaredGenre: state.declaredGenre.trim(),
    estimatedDurationMinutes: state.estimatedDurationMinutes,
    depositNotes:
      state.depositNotes.trim().length > 0 ? state.depositNotes.trim() : null,
  });

  export const toSiaeExportInput = (
    projectId: string,
    state: SiaeFormState,
  ): SiaeExportInput => ({
    projectId,
    title: state.title.trim(),
    authors: state.authors.map((a) => ({
      fullName: a.fullName.trim(),
      taxCode:
        a.taxCode && a.taxCode.trim().length > 0 ? a.taxCode.trim() : null,
    })),
    declaredGenre: state.declaredGenre.trim(),
    estimatedDurationMinutes: state.estimatedDurationMinutes,
    compilationDate: state.compilationDate,
    depositNotes:
      state.depositNotes.trim().length > 0 ? state.depositNotes.trim() : null,
  });
  ```

- [ ] **Step 5a.2: Add tests for the saved-metadata path**

  In `apps/web/app/features/documents/lib/siae-initial-state.test.ts`, add at the end:

  ```ts
  import { toSiaeMetadata } from "./siae-initial-state";
  import type { SiaeMetadata } from "../documents.schema";

  const SAVED: SiaeMetadata = {
    title: "Pane e tulipani",
    authors: [{ fullName: "Silvio Soldini", taxCode: "SLDSV60A01F205X" }],
    declaredGenre: "commedia romantica",
    estimatedDurationMinutes: 112,
    depositNotes: "Depositato a Venezia",
  };

  describe("buildSiaeInitialState — with savedMetadata", () => {
    const fixedNow = new Date(2026, 3, 24);
    let counter = 0;
    const idFactory = () => `author-${++counter}`;

    it("uses saved metadata when present, ignoring project defaults", () => {
      counter = 0;
      const state = buildSiaeInitialState(
        {
          title: "Ignored Title",
          declaredGenre: "ignored",
          ownerFullName: "Ignored Owner",
          savedMetadata: SAVED,
        },
        fixedNow,
        idFactory,
      );
      expect(state.title).toBe("Pane e tulipani");
      expect(state.authors).toEqual([
        {
          id: "author-1",
          fullName: "Silvio Soldini",
          taxCode: "SLDSV60A01F205X",
        },
      ]);
      expect(state.declaredGenre).toBe("commedia romantica");
      expect(state.estimatedDurationMinutes).toBe(112);
      expect(state.depositNotes).toBe("Depositato a Venezia");
      expect(state.compilationDate).toBe("2026-04-24"); // always today
    });

    it("falls back to project defaults when savedMetadata is null", () => {
      counter = 0;
      const state = buildSiaeInitialState(
        {
          title: "Untitled",
          declaredGenre: "drama",
          ownerFullName: "Jane Doe",
          savedMetadata: null,
        },
        fixedNow,
        idFactory,
      );
      expect(state.title).toBe("Untitled");
      expect(state.authors[0]?.fullName).toBe("Jane Doe");
    });
  });

  describe("toSiaeMetadata", () => {
    it("trims strings and maps authors", () => {
      const state: SiaeFormState = {
        title: "  Dune  ",
        authors: [
          { id: "x", fullName: "  Frank  ", taxCode: "  RSSMRA00A01H501U  " },
        ],
        declaredGenre: " sci-fi ",
        estimatedDurationMinutes: 180,
        compilationDate: "2026-04-24",
        depositNotes: "  note  ",
      };
      expect(toSiaeMetadata(state)).toEqual({
        title: "Dune",
        authors: [{ fullName: "Frank", taxCode: "RSSMRA00A01H501U" }],
        declaredGenre: "sci-fi",
        estimatedDurationMinutes: 180,
        depositNotes: "note",
      });
    });

    it("collapses blank depositNotes to null", () => {
      const state: SiaeFormState = {
        title: "T",
        authors: [{ id: "x", fullName: "F", taxCode: null }],
        declaredGenre: "d",
        estimatedDurationMinutes: 90,
        compilationDate: "2026-04-24",
        depositNotes: "   ",
      };
      expect(toSiaeMetadata(state).depositNotes).toBeNull();
    });
  });
  ```

  Add the missing imports at the top of the test file:

  ```ts
  import {
    buildSiaeInitialState,
    formatDateYmd,
    toSiaeExportInput,
    toSiaeMetadata,
    DEFAULT_DURATION_MINUTES,
    type SiaeFormState,
  } from "./siae-initial-state";
  ```

- [ ] **Step 5a.3: Run unit tests**

  ```bash
  pnpm test:unit -- --reporter=verbose siae-initial-state.test.ts
  ```

  Expected: all tests PASS.

### 5b — ExportSiaeModal: internal save on export success

- [ ] **Step 5b.1: Update `ExportSiaeModal.tsx`**

  Add `useSaveSiaeMetadata` import and call it on successful export. Changes:
  1. Add import at the top:

     ```ts
     import { useSaveSiaeMetadata } from "../hooks/useSiaeMetadata";
     import { toSiaeMetadata } from "../lib/siae-initial-state";
     ```

  2. Inside the component body, after `const exportMutation = useExportSubjectSiae();`, add:

     ```ts
     const saveMetadata = useSaveSiaeMetadata(projectId);
     ```

  3. In `handleSubmit`, update `exportMutation.mutate` to fire the save alongside export:
     ```ts
     exportMutation.mutate(parsed.data, {
       onSuccess: () => {
         saveMetadata.mutate(toSiaeMetadata(state)); // fire and forget
         onClose();
       },
       onError: (err) => {
         // ... existing error handling unchanged ...
       },
     });
     ```

  The save is fire-and-forget: if it fails, the export has already succeeded and the download is delivered — no need to surface a save error to the user.

- [ ] **Step 5b.2: Typecheck**

  ```bash
  pnpm --filter @oh-writers/web typecheck
  ```

  Expected: no errors.

### 5c — Soggetto route: load metadata, pass as defaults

- [ ] **Step 5c.1: Update the route**

  In `apps/web/app/routes/_app.projects.$id_.soggetto.tsx`:
  1. Add import:

     ```ts
     import { useSiaeMetadata } from "~/features/documents";
     ```

  2. In `SoggettoPageReady`, add after `const projectQuery = useProject(projectId);`:

     ```ts
     const siaeMetadataQuery = useSiaeMetadata(projectId);
     const savedMetadata =
       siaeMetadataQuery.data !== undefined ? siaeMetadataQuery.data : null;
     ```

  3. Update `siaeDefaults` to include `savedMetadata`:
     ```ts
     const siaeDefaults = {
       title: projectOk?.title ?? "",
       declaredGenre: projectOk?.genre ?? "",
       ownerFullName: null as string | null,
       savedMetadata,
     };
     ```

- [ ] **Step 5c.2: Typecheck**

  ```bash
  pnpm --filter @oh-writers/web typecheck
  ```

  Expected: no errors.

- [ ] **Step 5c.3: Run all unit tests**

  ```bash
  pnpm test:unit
  ```

  Expected: all PASS.

- [ ] **Step 5c.4: Commit**

  ```bash
  git add apps/web/app/features/documents/lib/siae-initial-state.ts \
          apps/web/app/features/documents/lib/siae-initial-state.test.ts \
          apps/web/app/features/documents/components/ExportSiaeModal.tsx \
          apps/web/app/routes/_app.projects.$id_.soggetto.tsx
  git commit -m "[OHW] feat(soggetto): wire SIAE metadata persistence — load, save, prefill modal"
  ```

---

## Task 6: Rewrite E2E soggetto-flow.spec.ts

**Files:**

- Rewrite: `tests/soggetto/soggetto-flow.spec.ts`

The current `soggetto-flow.spec.ts` tests `SubjectEditor` (Spec 04f) — section headings, generate button, word-limit banner. All three tests are now invalid and must be replaced with Spec 21 tests.

`soggetto-export.spec.ts` already covers DOCX + SIAE downloads (`[OHW-SOG-004]`, `[OHW-SOG-005]`) — do not duplicate those.

- [ ] **Step 6.1: Rewrite the file**

  ```ts
  // tests/soggetto/soggetto-flow.spec.ts
  import { expect } from "@playwright/test";
  import { test } from "../fixtures";
  import {
    navigateToSoggetto,
    navigateToProjectDashboard,
    TEAM_PROJECT_ID,
  } from "./helpers";

  /**
   * Spec 21 — Soggetto Free Editor (E2E flow)
   *
   * Covers:
   *   [OHW-SOG-001] Page renders: logline block + free editor (no section
   *                 headings) + cartelle counter + export buttons.
   *                 Soggetto card is reachable from the project dashboard.
   *   [OHW-SOG-002] Editorial template is pre-loaded when the soggetto is empty;
   *                 the counter shows > 0 cartelle.
   *   [OHW-SOG-003] Typing in the editor increments the cartelle counter.
   *   [OHW-SOG-006] SIAE modal pre-populates from saved metadata after a
   *                 successful export (tested alongside soggetto-export.spec.ts
   *                 which covers the actual download).
   *
   * Requires the dev server running (MOCK_AI=true is not needed for these tests).
   */

  test.describe("[Spec 21] Soggetto free editor — page flow", () => {
    test("[OHW-SOG-001] renders logline + free editor + counter + export buttons and is reachable from dashboard", async ({
      authenticatedPage: page,
    }) => {
      await navigateToSoggetto(page, TEAM_PROJECT_ID);

      await expect(page.getByTestId("logline-block")).toBeVisible();
      await expect(page.getByTestId("subject-editor")).toBeVisible();

      // Free editor — no section headings
      const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
      await expect(editor).toBeVisible({ timeout: 10_000 });
      const h2Count = await editor.locator("h2").count();
      // FreeNarrativeEditor may render H1/H2 in the template but NOT the five
      // old section headings from Spec 04f. We only assert no `subject-footer` exists.
      await expect(page.getByTestId("subject-footer")).not.toBeAttached();

      // Cartelle counter
      const counter = page
        .getByTestId("subject-editor")
        .locator("[aria-live='polite']");
      await expect(counter).toBeVisible();
      await expect(counter).toContainText(/cartell/);

      await expect(page.getByTestId("soggetto-export")).toBeVisible();
      await expect(page.getByTestId("soggetto-export-siae")).toBeVisible();

      // Reachable from project dashboard
      await navigateToProjectDashboard(page, TEAM_PROJECT_ID);
      const soggettoCard = page.getByText("Soggetto", { exact: true }).first();
      await expect(soggettoCard).toBeVisible({ timeout: 10_000 });
      await soggettoCard.click();
      await page.waitForURL(/\/projects\/.+\/soggetto$/, { timeout: 10_000 });
      await expect(page.getByTestId("soggetto-page")).toBeVisible();
    });

    test("[OHW-SOG-002] editorial template is visible when soggetto is empty and counter > 0", async ({
      authenticatedPage: page,
    }) => {
      await navigateToSoggetto(page, TEAM_PROJECT_ID);

      const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
      await expect(editor).toBeVisible({ timeout: 10_000 });

      // The editorial template has content — the counter must show at least 1 cartella
      const counter = page
        .getByTestId("subject-editor")
        .locator("[aria-live='polite']");
      await expect(counter).toBeVisible();

      const counterText = await counter.textContent();
      const match = counterText?.match(/^(\d+)\s+cartel/);
      expect(match).not.toBeNull();
      const cartelleCount = parseInt(match![1]!, 10);
      expect(cartelleCount).toBeGreaterThan(0);
    });

    test("[OHW-SOG-003] typing in the editor increments the cartelle counter", async ({
      authenticatedPage: page,
    }) => {
      await navigateToSoggetto(page, TEAM_PROJECT_ID);

      const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
      await expect(editor).toBeVisible({ timeout: 10_000 });

      const counter = page
        .getByTestId("subject-editor")
        .locator("[aria-live='polite']");
      await expect(counter).toBeVisible();

      const readCartelle = async (): Promise<number> => {
        const text = await counter.textContent();
        const m = text?.match(/^(\d+)\s+cartel/);
        return m ? parseInt(m[1]!, 10) : 0;
      };

      const before = await readCartelle();

      // Type a large block of text (> 1,800 chars) to guarantee a visible increment
      await editor.click();
      await page.keyboard.press("ControlOrMeta+End");
      // Insert 2,000 'a' characters via clipboard to keep the test fast
      await page.evaluate(() => {
        const el = document.querySelector(
          '[data-testid="subject-editor"] .ProseMirror',
        ) as HTMLElement | null;
        if (!el) return;
        el.focus();
        const dt = new DataTransfer();
        dt.setData("text/plain", "a".repeat(2000));
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      // Wait for the counter to increase
      await expect
        .poll(() => readCartelle(), { timeout: 5_000 })
        .toBeGreaterThan(before);
    });

    test("[OHW-SOG-006] SIAE modal pre-populates fields on second open after a successful export", async ({
      authenticatedPage: page,
    }) => {
      await navigateToSoggetto(page, TEAM_PROJECT_ID);

      const uniqueGenre = `test-genre-${Date.now()}`;

      // First open: fill genre with a unique value, submit
      await page.getByTestId("soggetto-export-siae").click();
      const form = page.getByTestId("siae-export-form");
      await expect(form).toBeVisible({ timeout: 5_000 });

      const firstFullName = page.getByTestId("siae-authors-fullName-0");
      const currentName = await firstFullName.inputValue();
      if (!currentName || currentName.trim().length === 0) {
        await firstFullName.fill("Mario Rossi");
      }

      await page.getByTestId("siae-genre-input").fill(uniqueGenre);

      const submit = page.getByTestId("siae-export-submit");
      await expect(submit).toBeEnabled();

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 20_000 }),
        submit.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

      // Modal closes after export — reopen it
      await expect(form).not.toBeAttached({ timeout: 5_000 });
      await page.getByTestId("soggetto-export-siae").click();
      await expect(form).toBeVisible({ timeout: 5_000 });

      // The genre field should be pre-populated with the value we saved
      await expect(page.getByTestId("siae-genre-input")).toHaveValue(
        uniqueGenre,
      );
    });
  });
  ```

- [ ] **Step 6.2: Run the E2E tests (flow spec only)**

  Make sure the dev server is running before this step: `pnpm dev` in a separate terminal.

  ```bash
  pnpm test -- tests/soggetto/soggetto-flow.spec.ts
  ```

  Expected: all 4 tests PASS. Fix any selector mismatches (e.g. if the counter `aria-live` locator doesn't match — check `FreeNarrativeEditor.tsx` for the actual attribute value).

- [ ] **Step 6.3: Run the full soggetto suite to check for regressions**

  ```bash
  pnpm test -- tests/soggetto/
  ```

  Expected: all tests in `soggetto-flow.spec.ts` + `soggetto-export.spec.ts` PASS.

- [ ] **Step 6.4: Commit**

  ```bash
  git add tests/soggetto/soggetto-flow.spec.ts
  git commit -m "[OHW] test(soggetto): rewrite soggetto-flow.spec.ts for Spec 21 (free editor + SIAE prefill)"
  ```

---

## Self-review

### Spec coverage

| Spec 21 requirement                             | Task that covers it   |
| ----------------------------------------------- | --------------------- |
| §4.3 FreeNarrativeEditor + page frame           | Done before this plan |
| §4.5 Cartelle counter                           | Done before this plan |
| §4.6 SIAE modal prefill (step 2 + step 4)       | Task 4 + 5            |
| §4.7 `siae_metadata` DB column                  | Task 1                |
| §7.1 `cartelle-counter.test.ts`                 | Done before this plan |
| §7.1 `siae.schema.test.ts` (SiaeMetadataSchema) | Task 2                |
| §7.2 E2E flow tests                             | Task 6                |
| §9 step 1 (migration)                           | Task 1                |
| §9 step 2 (server + hooks)                      | Tasks 3 + 4           |
| §9 step 4 (ExportSiaeModal prefill)             | Task 5                |
| §9 steps 10–11 (E2E + green)                    | Task 6                |

### Type consistency

- `SiaeMetadata` defined in `documents.schema.ts` (Task 2) and imported everywhere else.
- `SiaeFormDefaults.savedMetadata?: SiaeMetadata | null` added in Task 5a.
- `toSiaeMetadata(state: SiaeFormState): SiaeMetadata` added in Task 5a, used in Task 5b.
- `useSaveSiaeMetadata(projectId: string)` defined in Task 4, imported in Task 5b.
- No renamed functions across tasks.
