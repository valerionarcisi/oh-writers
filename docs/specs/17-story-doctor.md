# Spec 17 — Story Doctor

## Context

The writer has completed (or drafted) the outline — a structured `OutlineContent` JSON saved in the `documents` table (`type="outline"`). They want structural feedback before committing to a full draft. Clicking **"Story Doctor"** in the timeline toolbar sends the outline to the AI and receives a structured report with findings anchored to specific scenes and acts.

The Story Doctor is **read-only**: it produces a textual report, never mutates the outline. The writer decides what to do with each finding.

Depends on: Spec 15 (Timeline Scaletta — OutlineContent schema, timeline toolbar), Spec 14b (outline generation pattern). Sits inside the `features/predictions/` domain boundary.

---

## User Story

- As a writer, I want to get structural feedback on my outline so I can fix pacing, turning points, and character arcs before I start writing
- As a writer, I want the feedback panel to stay open while I work on the timeline, so I can act on suggestions without losing context
- As a writer, I want to dismiss individual findings without deleting them, so I can keep a record of what I reviewed
- As a writer, I want to re-run Story Doctor after editing the outline, so I can see if the issues were resolved

---

## Behaviour

### "Story Doctor" button

Located in the timeline toolbar (`OutlineToolbar`), after the existing toolbar actions. Always visible when the outline has at least one scene. Disabled (not hidden) when the outline is empty.

```
[ Add scene ] [ Generate ] [ ... ]  |  [ Story Doctor ]
```

The button label is always "Story Doctor". No icon-only mode at this stage.

Clicking the button:

1. Opens the `StoryDoctorPanel` (side panel, not a modal)
2. If a previous report exists for the current panel session, shows it immediately with a "Re-run" option
3. If no report exists, triggers analysis automatically

### StoryDoctorPanel

A side panel that slides in from the right, overlapping the detail panel if open. The timeline remains interactive behind it — the writer can scroll, click scenes, and edit them while the panel is open.

```
+------------------------------------+
|  Story Doctor              [x]     |
|  --------------------------------- |
|  [Re-run]                         |
|                                   |
|  PACING                           |
|  +-----------------------------+  |
|  | Warning: Act II compressed  |  |
|  | Scenes 12-18 cover 6 major  |  |
|  | beats in estimated 8 pages. |  |
|  | Scene 14 . Act II           |  |
|  |               [Dismiss]     |  |
|  +-----------------------------+  |
|                                   |
|  TURNING POINTS                   |
|  +-----------------------------+  |
|  | OK: Inciting incident found |  |
|  | Scene 3 - "Sara's discovery"|  |
|  +-----------------------------+  |
|  +-----------------------------+  |
|  | Error: Midpoint missing     |  |
|  | No scene anchored near 50%. |  |
|  |               [Dismiss]     |  |
|  +-----------------------------+  |
|                                   |
|  ARCHIVED (2)          [Show]     |
+------------------------------------+
```

Panel width: `var(--panel-story-doctor-width)` (default 360px). On viewports narrower than 1200px, the panel overlaps the timeline fully and shows a close button prominently.

### Loading state

While the AI is running, the panel shows a spinner with the label "Analysing outline...". The "Story Doctor" toolbar button shows a loading indicator and is disabled. Cancellation is not supported in v1.

### Finding cards

Each finding is a `FindingCard`. Findings are grouped by `category`. Categories are displayed as section headings in this order:

1. `pacing`
2. `turning_points`
3. `characters`
4. `act_balance`
5. `scene_notes`

Within each group, findings are sorted by severity: `error` first, then `warning`, then `info`.

A `FindingCard` shows:

- Severity icon (error, warning, or info)
- Title (one line)
- Body (2-4 lines of explanation)
- Scene anchor (optional): "Scene N . Act X" — clicking it highlights the scene in the timeline
- `[Dismiss]` button — only on `error` and `warning` findings; `info` findings cannot be dismissed

Dismissed findings move to the **Archived** section at the bottom of the panel. The archived section is collapsed by default. Findings can be un-dismissed from the archive. Dismissal is stored in component state only (not persisted to DB) — it resets when the panel is closed or the page is reloaded.

### Re-run

The "Re-run" button at the top of the panel triggers a new analysis. It is visible only after a report has been produced. While re-running, the existing findings remain visible until the new report arrives, then are replaced atomically.

### Scene highlight

When the writer clicks a scene anchor in a `FindingCard`, the timeline scrolls to that scene and applies a transient highlight class (`isHighlighted`) for 2 seconds, then removes it. No state is persisted.

---

## AI Prompt Strategy

### System prompt

```
You are a professional script analyst specialising in screenplay structure.
You will receive a complete outline in JSON format. Analyse it for structural
issues and return a JSON report strictly matching the provided schema.

Focus on:
- Narrative pacing (page-estimate distribution across scenes and acts)
- Presence and position of classical turning points: inciting incident, first
  act break, midpoint, second act break, climax, resolution
- Character continuity (characters absent for long stretches of the outline)
- Act balance (number of scenes and estimated pages per act vs expected ratios)
- Specific scene-level observations (redundancy, tonal inconsistency, missing
  transition)

Rules:
- Never invent scene content beyond what is in the outline
- Every finding must reference at least one scene id or act id when applicable
- Return ONLY the JSON object, no prose, no markdown fences
```

### User message

```
Outline title: {{projectTitle}}
Format: {{projectFormat}}  (feature | short | series_episode | pilot)
Total estimated pages: {{totalPages}}

{{outlineJSON}}
```

`outlineJSON` is the serialised `OutlineContent` object. Characters arrays and notes are included; comments are stripped (they are writer-facing, not story structure).

`totalPages` is computed server-side as `sum(scene.pageEstimate ?? 0)` across all scenes. If the total is 0, the prompt omits the page-estimate guidance and instructs the AI to base pacing solely on scene count.

### Output JSON schema

```typescript
// apps/web/app/features/predictions/story-doctor.schema.ts

export const FindingSeveritySchema = z.enum(["error", "warning", "info"]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingCategorySchema = z.enum([
  "pacing",
  "turning_points",
  "characters",
  "act_balance",
  "scene_notes",
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const FindingAnchorSchema = z.object({
  sceneId: z.string().uuid().nullable(),
  actId: z.string().uuid().nullable(),
  sceneIndex: z.number().int().nullable(), // 1-based display index
  actLabel: z.string().nullable(), // "Act I", "Act II", etc.
});

export const StoryDoctorFindingSchema = z.object({
  id: z.string().uuid(),
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  anchor: FindingAnchorSchema.nullable(),
});

export const StoryDoctorReportSchema = z.object({
  findings: z.array(StoryDoctorFindingSchema),
  generatedAt: z.string().datetime(),
});

export type StoryDoctorFinding = z.infer<typeof StoryDoctorFindingSchema>;
export type StoryDoctorReport = z.infer<typeof StoryDoctorReportSchema>;
```

The server validates the AI response against `StoryDoctorReportSchema` before returning it to the client. If validation fails, a `StoryDoctorParseError` is returned.

---

## Server Architecture

### Location

`apps/web/app/features/predictions/server/story-doctor.server.ts`

### Server function

```typescript
export const analyzeOutlineStructure = createServerFn({ method: "POST" })
  .validator(
    z.object({
      documentId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<StoryDoctorReport, StoryDoctorAnalysisError>> => {
      await requireUser();
      const db = await getDb();
      return toShape(
        await fetchOutlineForAnalysis(db, data.documentId, data.projectId)
          .andThen(callStoryDoctorAI)
          .andThen(validateReport),
      );
    },
  );
```

### Internal functions

```
fetchOutlineForAnalysis(db, documentId, projectId)
  -> ResultAsync<OutlineAnalysisInput, NotFoundError | ForbiddenError | DbError>

callStoryDoctorAI(input: OutlineAnalysisInput)
  -> ResultAsync<unknown, AiCallError>

validateReport(raw: unknown)
  -> Result<StoryDoctorReport, StoryDoctorParseError>
```

`fetchOutlineForAnalysis` reads the document, verifies ownership via the project, parses the `OutlineContent`, and builds the prompt input. It strips `comments` from each scene before building the prompt.

`callStoryDoctorAI` checks `process.env.MOCK_AI`. If `"true"`, returns the mock response from `mocks/ai-responses.ts` without calling Anthropic.

`validateReport` parses the AI JSON string with `StoryDoctorReportSchema.safeParse`. On failure it returns `StoryDoctorParseError`.

### Error types

`apps/web/app/features/predictions/story-doctor.errors.ts`:

```typescript
import { NotFoundError, ForbiddenError, DbError } from "@oh-writers/utils";

export class StoryDoctorParseError {
  readonly _tag = "StoryDoctorParseError" as const;
  readonly message: string;
  constructor(readonly zodIssues: z.ZodIssue[]) {
    this.message = "AI response did not match the expected schema";
  }
}

export class AiCallError {
  readonly _tag = "AiCallError" as const;
  readonly message: string;
  readonly aiCause: string | null;
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    this.message = `AI call failed in ${operation}`;
    this.aiCause =
      cause instanceof Error ? cause.message : String(cause ?? null);
  }
}

export type StoryDoctorAnalysisError =
  | NotFoundError
  | ForbiddenError
  | DbError
  | AiCallError
  | StoryDoctorParseError;
```

---

## Mock Responses

`mocks/ai-responses.ts` — add `mockStoryDoctorReport: StoryDoctorReport`:

```typescript
export const mockStoryDoctorReport: StoryDoctorReport = {
  generatedAt: "2026-04-16T10:00:00.000Z",
  findings: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      category: "pacing",
      severity: "warning",
      title: "Act II is overly compressed",
      body: "Scenes 12-18 account for 6 major beats within an estimated 8 pages. Consider expanding at least two of these scenes to give the audience time to absorb the reversals.",
      anchor: {
        sceneId: null,
        actId: null,
        sceneIndex: 12,
        actLabel: "Act II",
      },
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      category: "turning_points",
      severity: "info",
      title: "Inciting incident is well-placed",
      body: "Scene 3 introduces the central conflict at roughly 8% of the estimated runtime, within the expected 5-15% window for a feature.",
      anchor: { sceneId: null, actId: null, sceneIndex: 3, actLabel: "Act I" },
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      category: "turning_points",
      severity: "error",
      title: "Midpoint is missing",
      body: "There is no scene anchored near the structural midpoint (~50% of estimated pages). A strong midpoint raises the stakes and reorients the protagonist's goal. Consider adding or promoting a scene around page 50.",
      anchor: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      category: "characters",
      severity: "warning",
      title: "Marco disappears for 14 scenes",
      body: "Marco (introduced in Scene 2) is absent from Scenes 5-19. Characters who vanish for long stretches risk feeling disposable. Consider a brief appearance or mention to maintain continuity.",
      anchor: { sceneId: null, actId: null, sceneIndex: 5, actLabel: "Act I" },
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      category: "act_balance",
      severity: "warning",
      title: "Act III is unusually short",
      body: "Act III contains 4 scenes (estimated 6 pages), while Act I has 11 scenes (22 pages) and Act II has 18 scenes (42 pages). A feature's third act typically runs 20-25% of total pages. The resolution may feel rushed.",
      anchor: {
        sceneId: null,
        actId: null,
        sceneIndex: null,
        actLabel: "Act III",
      },
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      category: "scene_notes",
      severity: "warning",
      title: "Scene 4 appears redundant with Scene 2",
      body: "Both scenes show Sara confronting her supervisor about the missing file. The second confrontation adds little new information. Consider merging them or differentiating the stakes in Scene 4.",
      anchor: { sceneId: null, actId: null, sceneIndex: 4, actLabel: "Act I" },
    },
    {
      id: "00000000-0000-0000-0000-000000000007",
      category: "pacing",
      severity: "info",
      title: "Act I pacing is well-balanced",
      body: "Act I distributes its estimated pages evenly across scenes. No single scene dominates the opening act, which allows a natural rhythm of setup and complication.",
      anchor: {
        sceneId: null,
        actId: null,
        sceneIndex: null,
        actLabel: "Act I",
      },
    },
  ],
};
```

---

## UI Components

### File locations

```
apps/web/app/features/predictions/
├── components/
│   ├── StoryDoctorPanel.tsx
│   ├── StoryDoctorPanel.module.css
│   ├── FindingCard.tsx
│   ├── FindingCard.module.css
│   └── FindingCategorySection.tsx
├── hooks/
│   └── useStoryDoctor.ts
├── server/
│   └── story-doctor.server.ts
├── story-doctor.schema.ts
└── story-doctor.errors.ts
```

### StoryDoctorPanel

Props:

```typescript
type StoryDoctorPanelProps = {
  documentId: string;
  projectId: string;
  outline: OutlineContent;
  onClose: () => void;
  onSceneHighlight: (sceneIndex: number) => void;
};
```

Internal state via `useReducer`:

```typescript
type State =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      report: StoryDoctorReport;
      dismissed: ReadonlySet<string>;
    }
  | { status: "error"; error: StoryDoctorAnalysisError };
```

On mount, if `status === "idle"` the hook triggers analysis automatically. Re-run resets to `loading`.

Dismissed finding IDs are tracked in a `ReadonlySet<string>` in state. Dismissed findings are filtered out of each category section and collected in the archived section.

### FindingCard

Props:

```typescript
type FindingCardProps = {
  finding: StoryDoctorFinding;
  isDismissed?: boolean;
  onDismiss?: (id: string) => void;
  onUndismiss?: (id: string) => void;
  onAnchorClick?: (sceneIndex: number) => void;
};
```

Severity maps to a CSS data attribute for styling: `data-severity="error"`, `data-severity="warning"`, `data-severity="info"`. Never use inline styles or class name branching for severity — the data attribute drives all visual variants via CSS attribute selectors.

### FindingCategorySection

Groups a list of `StoryDoctorFinding` items under a category heading. No dismiss logic here — delegates to `FindingCard`. Renders nothing when the filtered list is empty (no empty section headers).

### useStoryDoctor

```typescript
const useStoryDoctor = (documentId: string, projectId: string) => {
  // useReducer with the State union above
  // exposes: state, runAnalysis
};
```

`runAnalysis` calls `analyzeOutlineStructure({ data: { documentId, projectId } })` and dispatches the result into the reducer.

---

## Data Flow

```
OutlineToolbar
  -> user clicks "Story Doctor"
  -> parent page sets showStoryDoctorPanel = true

OutlineTimelinePage (route component)
  -> renders <StoryDoctorPanel> alongside <TimelineView>

StoryDoctorPanel
  -> mounts -> useStoryDoctor dispatches "run"
  -> calls analyzeOutlineStructure (createServerFn POST)

analyzeOutlineStructure (server)
  -> fetchOutlineForAnalysis (DB read + ownership check)
  -> callStoryDoctorAI (Anthropic API or mock)
  -> validateReport (Zod parse)
  -> toShape(result) -> ResultShape<StoryDoctorReport, StoryDoctorAnalysisError>

StoryDoctorPanel
  -> receives ResultShape
  -> isOk: dispatch "ready", render FindingCategorySection x5
  -> isErr: dispatch "error", render inline error message + retry button

FindingCard
  -> user clicks scene anchor -> onAnchorClick(sceneIndex)
  -> parent scrolls timeline to scene + applies isHighlighted class for 2s
  -> user clicks Dismiss -> finding id added to dismissed Set in state
```

No new DB table. Reports are not persisted server-side. Each invocation is stateless on the server.

---

## Integration point: OutlineToolbar

Add a "Story Doctor" button to the existing toolbar. The parent page owns `showStoryDoctorPanel` boolean state. The button receives a `disabled` prop when the outline contains zero scenes across all acts.

The timeline page layout must accommodate the side panel. When `showStoryDoctorPanel` is true:

- Viewport >= 1200px: the timeline container shrinks by `var(--panel-story-doctor-width)` using a CSS data attribute on the layout root (`data-story-doctor-open="true"`), handled entirely in CSS
- Viewport < 1200px: the panel overlays at full height with a prominent close button

---

## Tests

File: `tests/outline/story-doctor.spec.ts`

All tests run with `MOCK_AI=true`. The mock response is `mockStoryDoctorReport` from `mocks/ai-responses.ts`.

### [OHW-320] Story Doctor button visible when outline has scenes

```
Given: outline with at least one scene
When:  user navigates to /projects/:id/outline
Then:  "Story Doctor" button is visible in the toolbar
```

### [OHW-321] Story Doctor button disabled when outline is empty

```
Given: outline with zero scenes
When:  user navigates to /projects/:id/outline
Then:  "Story Doctor" button is visible but has aria-disabled="true"
```

### [OHW-322] Panel opens and analysis runs automatically

```
Given: outline with scenes, MOCK_AI=true
When:  user clicks "Story Doctor"
Then:  StoryDoctorPanel slides in from the right
And:   loading state ("Analysing outline...") is shown while request is in flight
And:   panel renders findings grouped by category once complete
```

### [OHW-323] Findings render with correct severity indicators

```
Given: panel is open with mockStoryDoctorReport
Then:  cards with severity="error" have data-severity="error" attribute
And:   cards with severity="warning" have data-severity="warning" attribute
And:   cards with severity="info" have data-severity="info" attribute
```

### [OHW-324] Category sections appear in defined order

```
Given: panel is open with mockStoryDoctorReport
Then:  section headings appear in order:
       Pacing, Turning Points, Characters, Act Balance, Scene Notes
```

### [OHW-325] Dismiss moves a finding to Archived

```
Given: panel is open with a warning finding visible
When:  user clicks "Dismiss" on that finding
Then:  finding is removed from its category section
And:   "ARCHIVED (1)" section appears at the bottom of the panel
And:   finding is visible inside the archived section when it is expanded
```

### [OHW-326] Un-dismiss restores a finding

```
Given: one finding is in the archived section
When:  user expands Archived and clicks "Un-dismiss" on that finding
Then:  finding reappears in its original category section
And:   archived count decrements by one
```

### [OHW-327] Info findings have no Dismiss button

```
Given: panel is open with at least one info-severity finding
Then:  no "Dismiss" button is rendered on any info card
```

### [OHW-328] Scene anchor click highlights scene in timeline

```
Given: panel is open with a finding that has sceneIndex=3
When:  user clicks the anchor "Scene 3 . Act I"
Then:  timeline scrolls to scene 3
And:   scene 3 element has the isHighlighted class applied
And:   the isHighlighted class is removed after approximately 2 seconds
```

### [OHW-329] Re-run replaces findings and clears dismissed state

```
Given: panel is open, findings are visible, one finding is dismissed
When:  user clicks "Re-run"
Then:  loading state is shown
And:   after completion, findings list is refreshed from the new mock response
And:   the previously dismissed finding is no longer dismissed
```

### [OHW-330] Error state shown on AI failure (sad path)

```
Given: MOCK_AI=false, no valid Anthropic API key configured
When:  user clicks "Story Doctor"
Then:  panel shows an inline error message
And:   a "Retry" button is visible
And:   the timeline behind the panel remains interactive
```

---

## Files

### New

| Path                                                                       | Description                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/web/app/features/predictions/server/story-doctor.server.ts`          | `analyzeOutlineStructure` server function                                |
| `apps/web/app/features/predictions/story-doctor.schema.ts`                 | Zod schemas: finding, report, anchor, severity, category                 |
| `apps/web/app/features/predictions/story-doctor.errors.ts`                 | `StoryDoctorParseError`, `AiCallError`, `StoryDoctorAnalysisError` union |
| `apps/web/app/features/predictions/components/StoryDoctorPanel.tsx`        | Side panel root component                                                |
| `apps/web/app/features/predictions/components/StoryDoctorPanel.module.css` | Panel layout, slide-in animation, reduced-motion variant                 |
| `apps/web/app/features/predictions/components/FindingCard.tsx`             | Individual finding card                                                  |
| `apps/web/app/features/predictions/components/FindingCard.module.css`      | Card styles, severity variants via data-severity attribute selectors     |
| `apps/web/app/features/predictions/components/FindingCategorySection.tsx`  | Category group with heading                                              |
| `apps/web/app/features/predictions/hooks/useStoryDoctor.ts`                | Reducer + server call orchestration                                      |
| `tests/outline/story-doctor.spec.ts`                                       | Playwright E2E tests OHW-320 through OHW-330                             |

### Modified

| Path                          | Change                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `mocks/ai-responses.ts`       | Add `mockStoryDoctorReport` export                                                       |
| Timeline toolbar component    | Add "Story Doctor" button; expose `onStoryDoctorOpen` prop                               |
| Timeline page route component | Add `showStoryDoctorPanel` state; render `StoryDoctorPanel`; wire `onSceneHighlight`     |
| Timeline page CSS             | Add `--panel-story-doctor-width` token; handle layout shift via `data-story-doctor-open` |

---

## Constraints

- Story Doctor **never writes to the DB** — no new tables, no document mutations, no version creation
- The report is **not cached** server-side — each invocation calls the AI fresh
- Dismissal state is **ephemeral** — it is reset on panel close or page reload; persistence is out of scope for v1
- The panel **must not block** the timeline — the writer can edit scenes while reading feedback
- The AI prompt includes **outline content only** — no screenplay text, no Yjs binary columns, no comments
- `MOCK_AI=true` must short-circuit before any HTTP call to Anthropic
- All server errors are surfaced **inline in the panel** — never as full-page errors or unhandled rejections
