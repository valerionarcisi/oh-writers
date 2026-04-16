# Spec 14 — Auto-generate Logline and Synopsis from Screenplay

## Context

After importing a PDF (Spec 05c) the narrative documents (logline, synopsis) are empty. The writer has the screenplay but no pitch materials. This spec adds AI generation of logline and synopsis from the screenplay content, via a **"Generate from screenplay"** button that opens a modal showing 3 alternatives to choose from.

Depends on: Spec 05c (PDF import), Spec 04 (narrative editor), Spec 07 (AI predictions).
Outline generation: Spec 14b.

---

## User Stories

- As a writer, I want to generate a logline from my screenplay and pick the best of 3 alternatives
- As a writer, I want to generate a synopsis from my screenplay and pick the best of 3 alternatives
- As a writer, I always want to choose explicitly which version to apply — the modal always shows options, even if the document is empty
- As a writer, after importing a PDF, I want to be prompted to generate logline and synopsis automatically

---

## Primary E2E Scenario (step-by-step)

Golden path — logline generation from an imported screenplay:

1. User logs in
2. User creates a new project (title: "Test Project", format: "feature")
3. User navigates to screenplay editor (`/projects/:id/screenplay`)
4. User clicks **"Import PDF"** → selects `fixtures/sample-screenplay.pdf`
5. Import completes → editor content populated
6. User navigates to `/projects/:id/logline`
7. Banner shown: _"Screenplay imported. Generate logline and synopsis?"_ → user clicks **"Generate"**
8. Modal opens, spinner while generating
9. Modal shows **3 logline alternatives**, each in its own card with a "Use this" button
10. User clicks "Use this" on alternative 2
11. Modal closes → logline editor populated with selected text, auto-saved
12. User edits the logline manually → edits persist on reload (not re-generated)

**Assertions:**

- Step 9: 3 non-empty cards visible; each matches a `mockLoglines[n]` string
- Step 11: editor value equals `mockLoglines[1]`; no error state; document is dirty/saved
- Step 12: after reload, editor value is the edited version, not a generated one

---

## Behaviour

### "Generate from screenplay" button

Present in the toolbar of every narrative document editor (logline, synopsis) when:

- A screenplay exists for the project (has non-null `pm_doc`)

Always visible regardless of whether the document has existing content.

Clicking the button always opens the **Generation Modal** — no inline confirmation dialogs.

### Generation Modal

```
┌─────────────────────────────────────────────────────┐
│  Generate logline from screenplay                    │
│                                                     │
│  [loading state: spinner + "Generating 3 versions…"]│
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Version 1                                     │  │
│  │ A burned-out detective must solve her…        │  │
│  │                                [Use this]     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Version 2                                     │  │
│  │ When her mentor is murdered…                  │  │
│  │                                [Use this]     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Version 3                                     │  │
│  │ Three days from retirement…                   │  │
│  │                                [Use this]     │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [Regenerate]                          [Cancel]     │
└─────────────────────────────────────────────────────┘
```

States:

- **Loading**: spinner, cards skeleton, buttons disabled
- **Ready**: 3 version cards, each with "Use this" button
- **Error**: error message + "Try again" button, no cards
- **Applying**: "Use this" clicked → modal closes, editor updates

"Regenerate" calls the server function again, replaces all 3 cards.

Clicking "Use this" on any version:

1. Closes modal
2. Replaces editor content with selected text
3. Auto-saves

Clicking "Cancel" closes modal, document unchanged.

### Post-import banner

After PDF import, if logline or synopsis is empty, show dismissible banner at top of the narrative editor:

> **Screenplay imported.** Generate logline and synopsis from it?
> [Generate logline] [Generate synopsis] [Dismiss]

Each button opens the respective Generation Modal directly.
Banner dismissed permanently per-project once the user clicks Dismiss (stored in DB on the project row).
Banner auto-hides once both logline and synopsis are non-empty.

---

## AI Prompts

### Logline generation (3 alternatives in one call)

**Input:** full Fountain text (stripped of scene numbers, revision marks via `fountainToText`)
**Max input tokens:** 8 000 (truncate from end — opening acts carry more pitch weight)
**Output:** JSON array of 3 strings, each max 50 words

```
System: You are a professional Hollywood script analyst. Write loglines in active voice,
present tense, following the structure: protagonist + want + obstacle + stakes.
No spoilers for the ending. Return valid JSON only: ["logline1", "logline2", "logline3"].

User: Generate 3 alternative loglines for this screenplay.

[SCREENPLAY]
```

### Synopsis generation (3 alternatives in one call)

**Input:** same Fountain text
**Max input tokens:** 16 000
**Output:** JSON array of 3 strings, each 3–5 paragraphs, max 400 words

```
System: You are a professional script reader. Write synopses in active voice,
present tense, third person. Cover all three acts. Return valid JSON only:
["synopsis1", "synopsis2", "synopsis3"]. Each synopsis is a single string
with paragraphs separated by \n\n.

User: Generate 3 alternative synopses for this screenplay.

[SCREENPLAY]
```

Both calls use `MOCK_AI=true` path.

---

## Server Architecture

### `generateLoglineVariants` — `features/predictions/predictions.server.ts`

```typescript
export const generateLoglineVariants = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        [string, string, string],
        GenerationError | ScreenplayEmptyError | NotFoundError | ForbiddenError
      >
    > => {
      await requireUser();
      // load screenplay fountain text
      // call Anthropic → parse JSON array
      // return tuple of 3 strings, do NOT save — client decides
    },
  );
```

### `generateSynopsisVariants` — same file, same pattern

### Saving — `features/documents/documents.server.ts`

`saveLogline` and `saveSynopsis` already exist (Spec 04). No new save functions needed.

---

## Domain Errors

```typescript
// features/predictions/predictions.errors.ts
export class GenerationError {
  readonly _tag = "GenerationError" as const;
  readonly message: string;
  constructor(readonly reason: string) {
    this.message = `AI generation failed: ${reason}`;
  }
}

export class ScreenplayEmptyError {
  readonly _tag = "ScreenplayEmptyError" as const;
  readonly message = "Cannot generate from empty screenplay";
}
```

---

## Data Flow

```
User clicks "Generate from screenplay"
  → GenerationModal opens (loading state)
  → generateLoglineVariants({ projectId }) called
  → server: loadScreenplayFountain → call Anthropic → parse JSON → return [v1, v2, v3]
  → modal: 3 cards rendered
  → user clicks "Use this" on version N
  → saveLogline({ projectId, content: variants[N] }) called
  → TanStack Query cache invalidated: ["documents", projectId, "logline"]
  → modal closes, editor re-renders with new content
```

---

## Fountain text extraction

Reuse `fountainToText(pmDoc)` — pure function in `packages/domain/src/fountain.ts`.
If it doesn't exist, create it before implementing this spec.

---

## Mock responses

Add to `mocks/ai-responses.ts`:

```typescript
export const mockLoglineVariants: [string, string, string] = [
  "A burned-out detective must solve her mentor's murder before the real killer destroys the evidence she needs to clear her own name.",
  "When her mentor is killed and the case closed overnight, a detective three days from retirement must choose between her pension and the truth.",
  "Three days from retirement, Detective Sara Voss risks everything to expose the conspiracy behind her mentor's staged suicide.",
];

export const mockSynopsisVariants: [string, string, string] = [
  `Detective Sara Voss is three days from retirement when her partner Frank Delo is found dead in a staged suicide. The department closes the case immediately.\n\nAgainst orders, Sara investigates, uncovering covered-up brutality that leads to the chief of police. Each lead makes her a bigger target.\n\nFramed for Delo's murder, Sara has 48 hours to surface the evidence — or be arrested. She must choose between her career and the truth she promised Delo she'd protect.`,
  `[variant 2 — different emphasis and tone]`,
  `[variant 3 — different emphasis and tone]`,
];
```

---

## UI States

| State            | Modal                                | Editor                                    |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| Modal not open   | —                                    | "Generate from screenplay" button visible |
| Loading          | spinner + skeleton cards             | unchanged                                 |
| Ready            | 3 version cards + "Use this" buttons | unchanged                                 |
| Error            | error message + "Try again"          | unchanged                                 |
| Version selected | modal closes                         | content replaced + auto-saved             |
| No screenplay    | button hidden                        | —                                         |

---

## Tests

### Playwright E2E — `tests/14-auto-logline-synopsis.spec.ts`

| Tag           | Scenario                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `[OHW-14-01]` | Import PDF → banner shown on logline page                                                          |
| `[OHW-14-02]` | Click "Generate logline" in banner → modal opens, 3 alternatives shown                             |
| `[OHW-14-03]` | Select version 2 → modal closes, logline editor = `mockLoglineVariants[1]`                         |
| `[OHW-14-04]` | Edit logline manually → persists on reload (not re-generated)                                      |
| `[OHW-14-05]` | Click "Generate from screenplay" button on non-empty logline → modal still opens (no confirmation) |
| `[OHW-14-06]` | Click "Regenerate" in modal → new set of 3 variants loaded                                         |
| `[OHW-14-07]` | Click "Cancel" → modal closes, logline unchanged                                                   |
| `[OHW-14-08]` | Generation error → error state in modal, "Try again" button visible                                |
| `[OHW-14-09]` | No screenplay in project → "Generate from screenplay" button not visible                           |
| `[OHW-14-10]` | Dismiss banner → banner gone, not shown on next load                                               |

All tests run with `MOCK_AI=true`.

---

## Out of Scope

- Outline generation → Spec 14b
- Treatment generation → future spec
- Streaming generation (returns full JSON array, no streaming)
- Generation from screenplay typed manually in Monaco (deferred — product decision)
