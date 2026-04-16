# Spec 14b — Auto-generate Outline from Screenplay

## Context

Extension of Spec 14. After importing a screenplay (PDF or typed), the writer can generate a structured outline automatically. Unlike logline/synopsis (free text), the outline is a block structure: acts → sequences → scenes. Generation extracts real scene headers (INT./EXT.) from the Fountain text and organises them into 3 acts, proposing 3 alternative act-break interpretations.

Depends on: Spec 14 (generation modal pattern), Spec 04b (outline drag-and-drop), Spec 05c (PDF import).

---

## User Stories

- As a writer, I want to generate a structured outline from my screenplay and pick the best of 3 act-break interpretations
- As a writer, I want the outline to use real scene sluglines from my screenplay, not invented ones
- As a writer, I want to be able to rearrange and edit the generated outline after applying it

---

## Primary E2E Scenario (step-by-step)

1. User has a project with an imported screenplay (Spec 14 flow done)
2. User navigates to `/projects/:id/outline`
3. User clicks **"Generate from screenplay"** in the toolbar
4. Generation Modal opens (same component as Spec 14, parameterised for outline)
5. Modal shows 3 alternative outlines, each displayed as a collapsible act → scene list
6. User selects version 2
7. Modal closes → outline editor populated with acts/scenes from version 2
8. User drags a scene from Act II to Act I → change persists

**Assertions:**

- Step 5: each version card shows act labels + scene count per act
- Step 7: outline block structure matches `mockOutlineVariants[1]`
- Step 8: drag-and-drop works on generated outline (no regression)

---

## Behaviour

### "Generate from screenplay" button

Same placement as Spec 14 — toolbar of the outline editor. Visible only when screenplay has non-null `pm_doc`.

### Generation Modal — outline variant

Same `GenerationModal` component as Spec 14, with `type="outline"`. Version cards render differently:

```
┌─────────────────────────────────────────────────────┐
│  Version 1                                          │
│                                                     │
│  Act I  (scenes 1–22)                               │
│    • EXT. POLICE PRECINCT - DAY                     │
│    • INT. SARA'S OFFICE - NIGHT                     │
│    • … +20 more                                     │
│  Act II  (scenes 23–67)                             │
│    • …                                              │
│  Act III  (scenes 68–89)                            │
│    • …                                              │
│                               [Use this]            │
└─────────────────────────────────────────────────────┘
```

Cards are collapsed by default (show act label + scene count). Expandable to see all sluglines.

### Act-break logic

The AI proposes where Acts I/II/III boundaries fall. Each of the 3 alternatives uses a different structural interpretation (e.g. different midpoint, different Act II break). The scenes themselves are fixed — only the act boundaries vary across alternatives.

---

## AI Prompt

**Input:** list of scene sluglines extracted from Fountain, with their order index  
**Max input tokens:** 4 000 (sluglines only, not full screenplay)  
**Output:** JSON — 3 alternative act-break proposals

```
System: You are a professional script analyst specialised in three-act structure.
Given a numbered list of scene sluglines, propose 3 alternative ways to divide them
into Act I, Act II, Act III. Each alternative must use a different structural
interpretation (classic, compressed Act I, compressed Act III).
Return valid JSON only:
[
  { "act1End": 22, "act2End": 67 },
  { "act1End": 18, "act2End": 71 },
  { "act1End": 25, "act2End": 65 }
]
act1End and act2End are the last scene index (0-based) of Act I and Act II respectively.

User: [SCENE LIST]
1. EXT. POLICE PRECINCT - DAY
2. INT. SARA'S OFFICE - NIGHT
…
```

**Client-side assembly:** the 3 act-break JSONs are combined with the full scene list (already extracted client-side from the Fountain text) to build the 3 `OutlineVariant` structures. The AI only returns boundaries — scene data never sent back from the server, just indices.

---

## Types

```typescript
// packages/domain/src/outline.ts

export const ActBreakSchema = z.object({
  act1End: z.number().int().nonnegative(),
  act2End: z.number().int().nonnegative(),
});

export const ActBreakVariantsSchema = z.tuple([
  ActBreakSchema,
  ActBreakSchema,
  ActBreakSchema,
]);

export type ActBreak = z.infer<typeof ActBreakSchema>;
export type ActBreakVariants = z.infer<typeof ActBreakVariantsSchema>;

export interface OutlineScene {
  index: number;
  slugline: string;
}

export interface OutlineAct {
  label: "Act I" | "Act II" | "Act III";
  scenes: OutlineScene[];
}

export interface OutlineVariant {
  acts: [OutlineAct, OutlineAct, OutlineAct];
}
```

---

## Server Architecture

### `generateOutlineVariants` — `features/predictions/predictions.server.ts`

```typescript
export const generateOutlineVariants = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        ActBreakVariants,
        GenerationError | ScreenplayEmptyError | NotFoundError | ForbiddenError
      >
    > => {
      await requireUser();
      // extract sluglines from pm_doc via fountainToSlugs()
      // call Anthropic with slugline list
      // parse and validate JSON response with ActBreakVariantsSchema
      // return ActBreakVariants — NOT full OutlineVariant (client assembles)
    },
  );
```

### `fountainToSlugs` — `packages/domain/src/fountain.ts`

Pure function. Extracts ordered sluglines from a Fountain/ProseMirror doc.

```typescript
const fountainToSlugs = (pmDoc: PmDoc): string[] => { ... }
```

### Saving outline — `features/documents/documents.server.ts`

`saveOutline` already exists (Spec 04). Takes the structured `OutlineVariant` after user selects a version.

---

## Data Flow

```
User clicks "Generate from screenplay"
  → modal opens (loading)
  → generateOutlineVariants({ projectId }) called
  → server: fountainToSlugs(pm_doc) → call Anthropic → return ActBreakVariants
  → client: assembles 3 OutlineVariant from sluglines + act breaks
  → modal: 3 version cards rendered
  → user selects version N
  → saveOutline({ projectId, outline: variants[N] }) called
  → TanStack Query cache invalidated: ["documents", projectId, "outline"]
  → modal closes, outline editor re-renders
```

---

## Mock responses

Add to `mocks/ai-responses.ts`:

```typescript
export const mockActBreakVariants: ActBreakVariants = [
  { act1End: 22, act2End: 67 },
  { act1End: 18, act2End: 71 },
  { act1End: 25, act2End: 65 },
];
```

---

## Tests

### Playwright E2E — `tests/14b-auto-outline.spec.ts`

| Tag            | Scenario                                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| `[OHW-14B-01]` | Click "Generate from screenplay" on outline page → modal opens, 3 alternatives shown |
| `[OHW-14B-02]` | Each version card shows act labels and scene counts                                  |
| `[OHW-14B-03]` | Expand version card → all sluglines visible                                          |
| `[OHW-14B-04]` | Select version 2 → outline editor populated with correct act structure               |
| `[OHW-14B-05]` | Drag scene after generation → change persists                                        |
| `[OHW-14B-06]` | Click "Regenerate" → new act boundaries loaded, same scenes                          |
| `[OHW-14B-07]` | No screenplay → button hidden                                                        |
| `[OHW-14B-08]` | Generation error → error state in modal                                              |

All tests run with `MOCK_AI=true`.

---

## Out of Scope

- Generating scene descriptions (not just sluglines) — future spec
- Multi-episode / series structure (acts per episode) — future spec
- Sequence-level breakdown within acts — future spec (act → sequence → scene, only act → scene now)
