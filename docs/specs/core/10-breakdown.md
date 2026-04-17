# 10 — Scene Breakdown

## Overview

The breakdown is the process of reading a screenplay and extracting every production element from each scene. It transforms a creative document into an operational list: who is needed, what is needed, where, and under what conditions.

In oh-writers, the breakdown is generated automatically by AI from the screenplay, then reviewed and corrected by the user. The human is always in control — AI is a first draft, not a final answer.

---

## Core Concepts

### Breakdown Sheet

One breakdown sheet per scene. It contains:

- Scene reference (number, slug, INT/EXT, location, time of day)
- Page count (in eighths — the industry standard, e.g. 2 3/8 pages)
- All production elements grouped by category
- Notes from the production team

### Element Categories

Every element extracted from a scene belongs to one of these categories:

| Category            | Color code | Examples                                          |
| ------------------- | ---------- | ------------------------------------------------- |
| Cast                | Red        | Protagonists, named characters with dialogue      |
| Extras / Background | Orange     | Crowd, passers-by, unnamed background             |
| Props               | Yellow     | Objects handled or mentioned by characters        |
| Costumes            | Purple     | Specific wardrobe requirements                    |
| Locations           | Green      | Practical location or set requirement             |
| Vehicles            | Blue       | Cars, trucks, motorcycles, boats                  |
| VFX                 | Cyan       | Visual effects shots, compositing, CGI            |
| Special Effects     | Pink       | Practical on-set effects: rain, fire, smoke       |
| Sound               | White      | Specific sound requirements: live music, playback |
| Notes               | Grey       | Everything else that needs attention              |

Colors are semantic, not decorative. They appear consistently across breakdown sheets, strip board, and budget.

### Page Count in Eighths

Industry standard: one screenplay page = 8 eighths. A scene of 1 3/8 pages = 11 eighths.

```typescript
// Always store as integer eighths, display as fraction
type PageCount = number; // integer, eighths

const formatPageCount = (eighths: number): string => {
  const full = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (remainder === 0) return `${full}`;
  if (full === 0) return `${remainder}/8`;
  return `${full} ${remainder}/8`;
};
```

---

## Data Model

```typescript
export const BreakdownElementSchema = z.object({
  id: z.string().uuid(),
  breakdownSheetId: z.string().uuid(),
  category: z.enum([
    "cast",
    "extras",
    "props",
    "costumes",
    "locations",
    "vehicles",
    "vfx",
    "sfx",
    "sound",
    "notes",
  ]),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  quantity: z.number().int().positive().nullable(),
  aiGenerated: z.boolean(), // true if extracted by AI, false if added manually
  confirmed: z.boolean(), // true if reviewed and confirmed by user
});

export const BreakdownSheetSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  projectId: z.string().uuid(),
  pageCount: z.number().int().positive(), // in eighths
  shootingDayEstimate: z.number().nullable(), // AI estimate of how long this scene takes
  notes: z.string().nullable(),
  elements: z.array(BreakdownElementSchema),
  status: z.enum(["pending", "ai_generated", "in_review", "confirmed"]),
});

export type BreakdownSheet = z.infer<typeof BreakdownSheetSchema>;
export type BreakdownElement = z.infer<typeof BreakdownElementSchema>;
```

---

## AI Extraction

### How it works

1. User triggers breakdown generation on a project (all scenes) or a single scene
2. Server sends scene text + context to Anthropic API
3. AI returns structured JSON matching `BreakdownElementSchema[]`
4. Result is stored with `aiGenerated: true`, `confirmed: false`
5. User reviews each sheet, confirms, edits, or deletes elements
6. When all sheets are confirmed, breakdown status moves to `confirmed`

### AI prompt constraints

The AI must:

- Extract only elements explicitly present or strongly implied in the scene text
- Never invent elements not supported by the screenplay
- Flag ambiguous cases in the `notes` category rather than guessing
- Return page count estimate based on scene length
- Respect industry naming conventions (e.g. "HERO - STUNT DOUBLE" not "stunt man")

### Confidence score

Each AI-generated element carries a confidence score (0–1). Elements below 0.7 are flagged for mandatory review in the UI.

```typescript
export const AiBreakdownElementSchema = BreakdownElementSchema.extend({
  confidence: z.number().min(0).max(1),
  sourceText: z.string(), // the excerpt from the screenplay that generated this element
});
```

---

## User Flows

### Generate breakdown for entire project

1. User opens project → Breakdown tab
2. If no breakdown exists: prompt to generate
3. User confirms → loading state per scene (streaming progress)
4. Each scene's sheet appears as it completes
5. Summary view shows: total scenes, total pages (eighths), elements by category

### Review a single breakdown sheet

1. User clicks a scene in the breakdown list
2. Sheet opens showing all elements grouped by category
3. AI-generated elements show source text on hover
4. User can: confirm element, edit name/description/quantity, delete element, add new element manually
5. When all elements are confirmed, sheet status → `confirmed`

### Edit elements

- Inline editing — click name to edit directly
- Category reassignment — drag element to different category
- Bulk actions — select multiple elements, change category or delete

---

## Server Functions

```typescript
// features/breakdown/breakdown.server.ts

export const generateBreakdown = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<Result<void, ForbiddenError | AiError>> => {
      // auth + permission check
      // for each scene: call AI extraction, store results
      // returns immediately, progress via websocket
    },
  );

export const confirmBreakdownElement = createServerFn({ method: "POST" })
  .validator(z.object({ elementId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<Result<BreakdownElement, NotFoundError | ForbiddenError>> => {
      // set confirmed: true
    },
  );

export const updateBreakdownElement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      elementId: z.string().uuid(),
      patch: BreakdownElementSchema.partial(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<Result<BreakdownElement, NotFoundError | ForbiddenError>> => {
      // apply patch
    },
  );
```

---

## Breakdown Summary

The summary aggregates all confirmed elements across all scenes. It feeds directly into:

- **Budget** — each element category maps to a budget line
- **Schedule** — cast availability drives shooting day clustering
- **Locations** — all location elements become location candidates

```typescript
export const BreakdownSummarySchema = z.object({
  projectId: z.string().uuid(),
  totalScenes: z.number(),
  totalPageCount: z.number(), // eighths
  estimatedShootingDays: z.number().nullable(),
  elementsByCategory: z.record(
    z.enum([
      "cast",
      "extras",
      "props",
      "costumes",
      "locations",
      "vehicles",
      "vfx",
      "sfx",
      "sound",
      "notes",
    ]),
    z.array(z.object({ name: z.string(), sceneCount: z.number() })),
  ),
});
```

---

## Spec References

- Scene data model: `05-screenplay-editor.md`
- AI infrastructure: `07-ai-predictions.md`
- Budget integration: `11-budget.md`
- Schedule integration: `12-schedule.md`
