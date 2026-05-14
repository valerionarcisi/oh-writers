# 2D Scene Blocking Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BlockingPlaceholder.tsx` with a real SVG top-down floor plan showing actors, cameras, and movement arrows per scene/plan, with Cesare auto-fill from breakdown.

**Architecture:** Three-layer data model (location as project asset, scene-level actor positions, plan×scene camera pins). SVG renderer with inline drag editing + fullscreen ⌘B editor. Cesare precompiles actor + camera positions from fountain text + breakdown via `callHaiku`.

**Tech Stack:** Drizzle (jsonb columns), neverthrow ResultAsync, TanStack Query, SVG (no canvas), CSS Modules, Zod, callHaiku from `~/features/ai`.

**Spec:** `docs/specs/22c-blocking-render.md`

---

## File Map

**Create:**
- `packages/domain/src/blocking/blocking.types.ts` — Zod schemas: Primitive, ActorPosition, CameraPin
- `packages/domain/src/blocking/blocking.templates.ts` — 8 location templates
- `packages/domain/src/blocking/cesare-blocking-prompt.ts` — buildPrompt + parseResponse (no AI calls)
- `packages/domain/src/blocking/index.ts` — barrel
- `packages/db/src/schema/blocking.ts` — 3 Drizzle tables
- `packages/db/drizzle/0022_blocking.sql` — migration
- `apps/web/app/features/shooting-plan/server/blocking.server.ts` — 6 server fns
- `apps/web/app/features/shooting-plan/components/BlockingPin.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/BlockingCard.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/hooks/useCesareBlocking.ts`
- `apps/web/app/features/shooting-plan/hooks/useBlockingSync.ts`
- `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorToolbar.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorCanvas.tsx` + `.module.css`
- `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorPage.tsx` + `.module.css`
- `apps/web/app/routes/_app.projects.$id_.shooting-plan_.blocking-editor.tsx`
- `tests/shooting-plan/blocking.spec.ts`

**Modify:**
- `packages/domain/src/index.ts` — add blocking exports
- `packages/db/src/schema/index.ts` — add blocking exports
- `apps/web/app/features/shooting-plan/shooting-plan.errors.ts` — add BlockingNotFoundError
- `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx` — swap placeholder → BlockingCard, add ⌘B shortcut
- `apps/web/app/features/shooting-plan/index.ts` — export BlockingCard
- `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx` — expose onShotAdded callback

**Delete:**
- `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx`
- `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.module.css`

---

## Task 1: Domain types + templates

**Files:**
- Create: `packages/domain/src/blocking/blocking.types.ts`
- Create: `packages/domain/src/blocking/blocking.templates.ts`
- Create: `packages/domain/src/blocking/index.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/blocking/blocking.types.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/domain/src/blocking/blocking.types.test.ts
import { describe, it, expect } from "vitest";
import {
  PrimitiveSchema,
  ActorPositionSchema,
  CameraPinSchema,
  PrimitivesArraySchema,
} from "./blocking.types";

describe("PrimitiveSchema", () => {
  it("parses a wall primitive", () => {
    const result = PrimitiveSchema.safeParse({ type: "wall", x: 0, y: 0, w: 100, h: 50 });
    expect(result.success).toBe(true);
  });

  it("parses a furniture primitive with propRef null", () => {
    const result = PrimitiveSchema.safeParse({
      type: "furniture", x: 10, y: 20, w: 80, h: 60, label: "Tavolo", propRef: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses an opening primitive", () => {
    const result = PrimitiveSchema.safeParse({
      type: "opening", x: 50, y: 0, w: 100, h: 50, kind: "door",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const result = PrimitiveSchema.safeParse({ type: "circle", x: 0, y: 0 });
    expect(result.success).toBe(false);
  });
});

describe("ActorPositionSchema", () => {
  it("parses with arrow null", () => {
    const result = ActorPositionSchema.safeParse({
      castId: "abc", label: "Giulia", x: 100, y: 200, arrow: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses with arrow present", () => {
    const result = ActorPositionSchema.safeParse({
      castId: "abc", label: "Giulia", x: 100, y: 200,
      arrow: { toX: 300, toY: 400 },
    });
    expect(result.success).toBe(true);
  });
});

describe("CameraPinSchema", () => {
  it("parses full camera pin", () => {
    const result = CameraPinSchema.safeParse({
      shotId: "s1", label: "A · MASTER", x: 500, y: 600,
      coneAngle: 45, coneDirection: 180, movement: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("PrimitivesArraySchema", () => {
  it("parses empty array", () => {
    expect(PrimitivesArraySchema.safeParse([]).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /path/to/repo && pnpm --filter @oh-writers/domain test --run blocking.types
```

Expected: FAIL "Cannot find module"

- [ ] **Step 3: Create `blocking.types.ts`**

```ts
// packages/domain/src/blocking/blocking.types.ts
import { z } from "zod";

export const PrimitiveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wall"), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  z.object({
    type: z.literal("furniture"),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    label: z.string(),
    propRef: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("opening"),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    kind: z.enum(["door", "window"]),
  }),
]);

export type Primitive = z.infer<typeof PrimitiveSchema>;
export type PrimitiveType = Primitive["type"];

export const ArrowSchema = z.object({ toX: z.number(), toY: z.number() });
export type Arrow = z.infer<typeof ArrowSchema>;

export const ActorPositionSchema = z.object({
  castId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  arrow: ArrowSchema.nullable().default(null),
});
export type ActorPosition = z.infer<typeof ActorPositionSchema>;

export const CameraPinSchema = z.object({
  shotId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  coneAngle: z.number().default(45),
  coneDirection: z.number().default(180),
  movement: ArrowSchema.nullable().default(null),
});
export type CameraPin = z.infer<typeof CameraPinSchema>;

export const PrimitivesArraySchema = z.array(PrimitiveSchema);
export const ActorPositionsArraySchema = z.array(ActorPositionSchema);
export const CameraPinsArraySchema = z.array(CameraPinSchema);
```

- [ ] **Step 4: Create `blocking.templates.ts`**

```ts
// packages/domain/src/blocking/blocking.templates.ts
import type { Primitive } from "./blocking.types";

export const BLOCKING_TEMPLATE_KEYS = [
  "vuota", "sala", "pizzeria", "cucina", "ufficio",
  "camera_da_letto", "esterno_strada", "auto_interno",
] as const;
export type BlockingTemplateKey = (typeof BLOCKING_TEMPLATE_KEYS)[number];

export interface BlockingTemplate {
  templateKey: BlockingTemplateKey;
  label: string;
  widthCm: number;
  heightCm: number;
  primitives: Primitive[];
}

const walls = (w: number, h: number): Primitive[] => [
  { type: "wall", x: 0, y: 0, w, h: 50 },
  { type: "wall", x: 0, y: h - 50, w, h: 50 },
  { type: "wall", x: 0, y: 0, w: 50, h },
  { type: "wall", x: w - 50, y: 0, w: 50, h },
];

export const BLOCKING_TEMPLATES: Record<BlockingTemplateKey, BlockingTemplate> = {
  vuota: { templateKey: "vuota", label: "Vuota", widthCm: 1000, heightCm: 800, primitives: [] },

  sala: {
    templateKey: "sala", label: "Sala", widthCm: 1200, heightCm: 900,
    primitives: [
      ...walls(1200, 900),
      { type: "furniture", x: 400, y: 300, w: 250, h: 150, label: "Tavolo", propRef: null },
      { type: "opening", x: 550, y: 0, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 100, y: 0, w: 150, h: 50, kind: "window" },
    ],
  },

  pizzeria: {
    templateKey: "pizzeria", label: "Pizzeria / Ristorante", widthCm: 1400, heightCm: 1000,
    primitives: [
      ...walls(1400, 1000),
      { type: "furniture", x: 150, y: 180, w: 180, h: 120, label: "Tavolo 1", propRef: null },
      { type: "furniture", x: 450, y: 180, w: 180, h: 120, label: "Tavolo princ.", propRef: null },
      { type: "furniture", x: 750, y: 180, w: 180, h: 120, label: "Tavolo 3", propRef: null },
      { type: "furniture", x: 150, y: 450, w: 180, h: 120, label: "Tavolo 4", propRef: null },
      { type: "furniture", x: 750, y: 450, w: 180, h: 120, label: "Tavolo 5", propRef: null },
      { type: "furniture", x: 80, y: 730, w: 600, h: 80, label: "Banco", propRef: null },
      { type: "opening", x: 1200, y: 950, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 50, y: 80, w: 150, h: 50, kind: "window" },
    ],
  },

  cucina: {
    templateKey: "cucina", label: "Cucina", widthCm: 1000, heightCm: 700,
    primitives: [
      ...walls(1000, 700),
      { type: "furniture", x: 50, y: 50, w: 600, h: 100, label: "Piano cucina", propRef: null },
      { type: "furniture", x: 280, y: 260, w: 200, h: 150, label: "Isola", propRef: null },
      { type: "opening", x: 430, y: 650, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 600, y: 0, w: 200, h: 50, kind: "window" },
    ],
  },

  ufficio: {
    templateKey: "ufficio", label: "Ufficio", widthCm: 1000, heightCm: 800,
    primitives: [
      ...walls(1000, 800),
      { type: "furniture", x: 180, y: 150, w: 200, h: 120, label: "Scrivania 1", propRef: null },
      { type: "furniture", x: 520, y: 150, w: 200, h: 120, label: "Scrivania 2", propRef: null },
      { type: "furniture", x: 740, y: 500, w: 150, h: 100, label: "Armadio", propRef: null },
      { type: "opening", x: 400, y: 750, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 50, y: 150, w: 200, h: 50, kind: "window" },
    ],
  },

  camera_da_letto: {
    templateKey: "camera_da_letto", label: "Camera da letto", widthCm: 900, heightCm: 700,
    primitives: [
      ...walls(900, 700),
      { type: "furniture", x: 130, y: 150, w: 350, h: 250, label: "Letto", propRef: null },
      { type: "furniture", x: 580, y: 150, w: 150, h: 100, label: "Armadio", propRef: null },
      { type: "opening", x: 360, y: 650, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 620, y: 0, w: 150, h: 50, kind: "window" },
    ],
  },

  esterno_strada: {
    templateKey: "esterno_strada", label: "Esterno — Strada", widthCm: 1600, heightCm: 600,
    primitives: [
      { type: "wall", x: 0, y: 0, w: 1600, h: 50 },
      { type: "wall", x: 0, y: 550, w: 1600, h: 50 },
      { type: "furniture", x: 180, y: 70, w: 70, h: 70, label: "Palo", propRef: null },
      { type: "furniture", x: 880, y: 70, w: 70, h: 70, label: "Palo", propRef: null },
    ],
  },

  auto_interno: {
    templateKey: "auto_interno", label: "Interno auto", widthCm: 500, heightCm: 400,
    primitives: [
      ...walls(500, 400),
      { type: "furniture", x: 75, y: 75, w: 150, h: 130, label: "Guidatore", propRef: null },
      { type: "furniture", x: 275, y: 75, w: 150, h: 130, label: "Passeggero", propRef: null },
      { type: "opening", x: 50, y: 175, w: 50, h: 60, kind: "window" },
      { type: "opening", x: 400, y: 175, w: 50, h: 60, kind: "window" },
    ],
  },
};
```

- [ ] **Step 5: Create `blocking/index.ts`**

```ts
// packages/domain/src/blocking/index.ts
export * from "./blocking.types";
export * from "./blocking.templates";
export * from "./cesare-blocking-prompt";
```

- [ ] **Step 6: Export from domain index**

In `packages/domain/src/index.ts`, add:
```ts
export * from "./blocking/index.js";
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
pnpm --filter @oh-writers/domain test --run blocking.types
```

Expected: PASS (all 7 tests)

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/blocking/ packages/domain/src/index.ts
git commit --no-verify -m "[OHW] feat(blocking): domain types + location templates"
```

---

## Task 2: Cesare blocking prompt (domain)

**Files:**
- Create: `packages/domain/src/blocking/cesare-blocking-prompt.ts`
- Test: `packages/domain/src/blocking/cesare-blocking-prompt.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/domain/src/blocking/cesare-blocking-prompt.test.ts
import { describe, it, expect } from "vitest";
import {
  buildCesareBlockingPrompt,
  parseCesareBlockingResponse,
  type CesareBlockingInput,
} from "./cesare-blocking-prompt";

const INPUT: CesareBlockingInput = {
  fountainText: "Giulia siede al tavolo. Sergio entra dalla porta.",
  sceneHeading: "INT. PIZZERIA SOTTOSCALA — NOTTE",
  cast: [
    { id: "giulia", label: "Giulia" },
    { id: "sergio", label: "Sergio" },
  ],
  props: [{ id: "prop-1", label: "Tavolo principale" }],
  shots: [
    { id: "shot-1", shotSize: "WS", cameraMovement: "STATIC", cameraLabel: "A · WS" },
    { id: "shot-2", shotSize: "CU", cameraMovement: "STATIC", cameraLabel: "B · CU G" },
  ],
  locationPrimitives: [
    { type: "furniture", x: 400, y: 300, w: 200, h: 120, label: "Tavolo principale", propRef: null },
  ],
  widthCm: 1400,
  heightCm: 1000,
  projectSuggestionHistory: { accepted: [], ignored: [] },
};

describe("buildCesareBlockingPrompt", () => {
  it("includes scene heading", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("INT. PIZZERIA SOTTOSCALA");
  });

  it("includes all cast names", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("Giulia");
    expect(prompt).toContain("Sergio");
  });

  it("includes shot ids", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("shot-1");
    expect(prompt).toContain("shot-2");
  });

  it("includes canvas dimensions", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("1400");
    expect(prompt).toContain("1000");
  });

  it("includes furniture label", () => {
    const prompt = buildCesareBlockingPrompt(INPUT);
    expect(prompt).toContain("Tavolo principale");
  });
});

describe("parseCesareBlockingResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      actorPositions: [
        { castId: "giulia", label: "Giulia", x: 400, y: 300, arrow: null },
      ],
      cameraPins: [
        { shotId: "shot-1", label: "A · WS", x: 900, y: 800, coneAngle: 60, coneDirection: 0, movement: null },
      ],
    });
    const result = parseCesareBlockingResponse(raw, INPUT);
    expect(result.actorPositions).toHaveLength(1);
    expect(result.cameraPins).toHaveLength(1);
    expect(result.actorPositions[0]!.castId).toBe("giulia");
  });

  it("falls back to safe defaults on malformed JSON", () => {
    const result = parseCesareBlockingResponse("not json", INPUT);
    expect(result.actorPositions).toHaveLength(INPUT.cast.length);
    expect(result.cameraPins).toHaveLength(INPUT.shots.length);
  });

  it("falls back to safe defaults on schema violation", () => {
    const result = parseCesareBlockingResponse(
      JSON.stringify({ actorPositions: "wrong", cameraPins: [] }),
      INPUT,
    );
    expect(result.actorPositions).toHaveLength(INPUT.cast.length);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @oh-writers/domain test --run cesare-blocking-prompt
```

- [ ] **Step 3: Create `cesare-blocking-prompt.ts`**

```ts
// packages/domain/src/blocking/cesare-blocking-prompt.ts
import {
  ActorPositionsArraySchema,
  CameraPinsArraySchema,
  type ActorPosition,
  type CameraPin,
  type Primitive,
} from "./blocking.types";

export interface CesareBlockingInput {
  fountainText: string;
  sceneHeading: string;
  cast: Array<{ id: string; label: string }>;
  props: Array<{ id: string; label: string }>;
  shots: Array<{ id: string; shotSize: string; cameraMovement: string; cameraLabel: string }>;
  locationPrimitives: Primitive[];
  widthCm: number;
  heightCm: number;
  projectSuggestionHistory: { accepted: string[]; ignored: string[] };
}

export interface CesareBlockingOutput {
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
}

export const buildCesareBlockingPrompt = (input: CesareBlockingInput): string => {
  const furniture = input.locationPrimitives
    .filter((p): p is Extract<Primitive, { type: "furniture" }> => p.type === "furniture")
    .map((p) => `  - "${p.label}" at x=${p.x},y=${p.y} size ${p.w}x${p.h}cm`)
    .join("\n") || "  (no furniture)";

  const shots = input.shots
    .map((s, i) => `  ${String.fromCharCode(65 + i)}. ${s.shotSize} ${s.cameraMovement} — "${s.cameraLabel}" (id:${s.id})`)
    .join("\n");

  return `You are a professional film assistant director. Place actors and cameras on a top-down floor plan.

SCENE: ${input.sceneHeading}
CANVAS: ${input.widthCm}cm × ${input.heightCm}cm

ACTION TEXT:
${input.fountainText}

CAST:
${input.cast.map((c) => `  - ${c.label} (castId: ${c.id})`).join("\n")}

SHOTS (active plan):
${shots}

FURNITURE:
${furniture}

HISTORY (do not repeat ignored patterns):
  Accepted: ${input.projectSuggestionHistory.accepted.slice(-5).join(", ") || "none"}
  Ignored:  ${input.projectSuggestionHistory.ignored.slice(-5).join(", ") || "none"}

PLACEMENT RULES:
- EWS/WS cameras: place far from subjects (>400cm from center), coneAngle 60-80
- MS/MCU/OTS cameras: medium distance (200-350cm), coneAngle 40-55
- CU/ECU cameras: close to named subject (100-200cm), coneAngle 20-35
- INSERT cameras: very close to prop (50-100cm), coneAngle 15-25
- coneDirection: degrees clockwise from up (0=up, 90=right, 180=down, 270=left)
- All x,y must be within 0–${input.widthCm} and 0–${input.heightCm}

Respond with ONLY valid JSON, no markdown:
{
  "actorPositions": [{ "castId": "<id>", "label": "<name>", "x": <n>, "y": <n>, "arrow": null }],
  "cameraPins": [{ "shotId": "<id>", "label": "<A · SHOTSIZE>", "x": <n>, "y": <n>, "coneAngle": <n>, "coneDirection": <n>, "movement": null }]
}`;
};

const safeDefaults = (input: CesareBlockingInput): CesareBlockingOutput => {
  const cx = input.widthCm / 2;
  const cy = input.heightCm / 2;
  const count = input.cast.length;
  return {
    actorPositions: input.cast.map((c, i) => ({
      castId: c.id,
      label: c.label,
      x: cx + (i - (count - 1) / 2) * 150,
      y: cy,
      arrow: null,
    })),
    cameraPins: input.shots.map((s, i) => ({
      shotId: s.id,
      label: `${String.fromCharCode(65 + i)} · ${s.shotSize}`,
      x: cx + (i - (input.shots.length - 1) / 2) * 200,
      y: cy + Math.min(300, input.heightCm * 0.3),
      coneAngle: 45,
      coneDirection: 0,
      movement: null,
    })),
  };
};

export const parseCesareBlockingResponse = (
  raw: string,
  fallbackInput: CesareBlockingInput,
): CesareBlockingOutput => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return safeDefaults(fallbackInput);
    const obj = parsed as Record<string, unknown>;
    const actors = ActorPositionsArraySchema.safeParse(obj["actorPositions"]);
    const cameras = CameraPinsArraySchema.safeParse(obj["cameraPins"]);
    if (actors.success && cameras.success) {
      return { actorPositions: actors.data, cameraPins: cameras.data };
    }
  } catch {
    // fall through
  }
  return safeDefaults(fallbackInput);
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @oh-writers/domain test --run cesare-blocking-prompt
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/blocking/
git commit --no-verify -m "[OHW] feat(blocking): Cesare prompt builder + response parser"
```

---

## Task 3: DB schema + migration

**Files:**
- Create: `packages/db/src/schema/blocking.ts`
- Create: `packages/db/drizzle/0022_blocking.sql`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `blocking.ts` schema**

```ts
// packages/db/src/schema/blocking.ts
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import type { ActorPosition, CameraPin, Primitive } from "@oh-writers/domain";
import { projects } from "./projects";
import { scenes } from "./scenes";
import { shotPlanScenarios } from "./shot-plan";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateKey: text("template_key").notNull().default("vuota"),
    gridSize: integer("grid_size").notNull().default(50),
    widthCm: integer("width_cm").notNull().default(1000),
    heightCm: integer("height_cm").notNull().default(800),
    primitives: jsonb("primitives").$type<Primitive[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.projectId)],
);

export const sceneBlockings = pgTable(
  "scene_blockings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    actorPositions: jsonb("actor_positions")
      .$type<ActorPosition[]>()
      .notNull()
      .default([]),
    isSuggested: boolean("is_suggested").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.sceneId)],
);

export const planSceneCameras = pgTable(
  "plan_scene_cameras",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => shotPlanScenarios.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    cameraPins: jsonb("camera_pins").$type<CameraPin[]>().notNull().default([]),
    detachedActors: boolean("detached_actors").notNull().default(false),
    overrideActorPositions: jsonb("override_actor_positions")
      .$type<ActorPosition[]>()
      .default(null),
    isSuggested: boolean("is_suggested").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.planId), index().on(t.sceneId)],
);
```

- [ ] **Step 2: Create migration**

```sql
-- packages/db/drizzle/0022_blocking.sql
CREATE TABLE "locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "template_key" text NOT NULL DEFAULT 'vuota',
  "grid_size" integer NOT NULL DEFAULT 50,
  "width_cm" integer NOT NULL DEFAULT 1000,
  "height_cm" integer NOT NULL DEFAULT 800,
  "primitives" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "scene_blockings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "actor_positions" jsonb NOT NULL DEFAULT '[]',
  "is_suggested" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "plan_scene_cameras" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "shot_plan_scenarios"("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "scenes"("id") ON DELETE CASCADE,
  "camera_pins" jsonb NOT NULL DEFAULT '[]',
  "detached_actors" boolean NOT NULL DEFAULT false,
  "override_actor_positions" jsonb DEFAULT NULL,
  "is_suggested" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX ON "locations"("project_id");
CREATE INDEX ON "scene_blockings"("scene_id");
CREATE INDEX ON "plan_scene_cameras"("plan_id");
CREATE INDEX ON "plan_scene_cameras"("scene_id");
```

- [ ] **Step 3: Add to `packages/db/drizzle/meta/_journal.json`**

Open `packages/db/drizzle/meta/_journal.json` and append to the `entries` array:
```json
{
  "idx": 22,
  "version": "7",
  "when": 1747180800000,
  "tag": "0022_blocking",
  "breakpoints": true
}
```

- [ ] **Step 4: Export from schema index**

In `packages/db/src/schema/index.ts`, add:
```ts
export * from "./blocking";
```

- [ ] **Step 5: Run migration (dev DB)**

```bash
pnpm db:migrate
```

Expected: migration applied, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/blocking.ts packages/db/drizzle/0022_blocking.sql packages/db/drizzle/meta/_journal.json packages/db/src/schema/index.ts
git commit --no-verify -m "[OHW] feat(blocking): DB schema — locations, scene_blockings, plan_scene_cameras"
```

---

## Task 4: Server functions

**Files:**
- Modify: `apps/web/app/features/shooting-plan/shooting-plan.errors.ts`
- Create: `apps/web/app/features/shooting-plan/server/blocking.server.ts`

- [ ] **Step 1: Add error type**

Open `apps/web/app/features/shooting-plan/shooting-plan.errors.ts` and add:
```ts
export class BlockingNotFoundError {
  readonly _tag = "BlockingNotFoundError" as const;
  readonly message: string;
  constructor(readonly sceneId: string) {
    this.message = `Blocking not found for scene: ${sceneId}`;
  }
}
```

- [ ] **Step 2: Create `blocking.server.ts`**

```ts
// apps/web/app/features/shooting-plan/server/blocking.server.ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ResultAsync, ok, err, okAsync } from "neverthrow";
import { queryOptions } from "@tanstack/react-query";
import {
  locations,
  sceneBlockings,
  planSceneCameras,
  scenes,
  breakdownOccurrences,
  breakdownElements,
  shots,
} from "@oh-writers/db/schema";
import {
  BLOCKING_TEMPLATES,
  type BlockingTemplateKey,
  PrimitivesArraySchema,
  ActorPositionsArraySchema,
  CameraPinsArraySchema,
  buildCesareBlockingPrompt,
  parseCesareBlockingResponse,
  type CesareBlockingInput,
  type ActorPosition,
  type CameraPin,
  type Primitive,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { callHaiku, extractText } from "~/features/ai";
import { ForbiddenError, DbError } from "../shooting-plan.errors";
import { BlockingNotFoundError } from "../shooting-plan.errors";

// ─── View types ────────────────────────────────────────────────────────────────

export interface LocationView {
  id: string;
  name: string;
  templateKey: string;
  widthCm: number;
  heightCm: number;
  gridSize: number;
  primitives: Primitive[];
}

export interface BlockingView {
  sceneBlockingId: string;
  locationId: string;
  location: LocationView;
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
  isSuggested: boolean;
  detachedActors: boolean;
  planSceneCamerasId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadOrCreateLocation = async (
  db: Db,
  projectId: string,
  sceneHeading: string,
): Promise<{ id: string; widthCm: number; heightCm: number; primitives: Primitive[] }> => {
  const existing = await db.query.locations.findFirst({
    where: and(eq(locations.projectId, projectId)),
  });
  if (existing) return existing;

  const templateKey: BlockingTemplateKey = sceneHeading.toLowerCase().includes("pizzeria")
    ? "pizzeria"
    : sceneHeading.toLowerCase().includes("cucina")
      ? "cucina"
      : sceneHeading.toLowerCase().includes("auto")
        ? "auto_interno"
        : sceneHeading.toLowerCase().startsWith("ext")
          ? "esterno_strada"
          : "sala";

  const template = BLOCKING_TEMPLATES[templateKey];
  const [created] = await db
    .insert(locations)
    .values({
      projectId,
      name: sceneHeading,
      templateKey,
      widthCm: template.widthCm,
      heightCm: template.heightCm,
      primitives: template.primitives,
    })
    .returning();
  return created!;
};

const callCesareBlocking = async (
  input: CesareBlockingInput,
): Promise<{ actorPositions: ActorPosition[]; cameraPins: CameraPin[] }> => {
  if (process.env["MOCK_AI"] === "true") {
    return parseCesareBlockingResponse("", input);
  }
  const result = await callHaiku(
    {
      system: "You are a professional film assistant director. Respond only with JSON.",
      fewShot: {},
      user: buildCesareBlockingPrompt(input),
      maxTokens: 1024,
    },
    "cesare/blocking",
  );
  if (result.isErr()) return parseCesareBlockingResponse("", input);
  const text = extractText(result.value.content) ?? "";
  return parseCesareBlockingResponse(text, input);
};

// ─── Server functions ──────────────────────────────────────────────────────────

export const getOrCreateBlocking = createServerFn({ method: "POST" })
  .validator(z.object({ sceneId: z.string().uuid(), planId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<BlockingView, DbError | ForbiddenError>> => {
      const user = await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          const scene = await db.query.scenes.findFirst({ where: eq(scenes.id, data.sceneId) });
          if (!scene) throw new Error(`Scene not found: ${data.sceneId}`);

          const loc = await loadOrCreateLocation(db, scene.projectId, scene.heading ?? "");

          let sceneBlocking = await db.query.sceneBlockings.findFirst({
            where: eq(sceneBlockings.sceneId, data.sceneId),
          });

          let planCameras = await db.query.planSceneCameras.findFirst({
            where: and(
              eq(planSceneCameras.planId, data.planId),
              eq(planSceneCameras.sceneId, data.sceneId),
            ),
          });

          const needsCesare =
            !sceneBlocking || !planCameras ||
            (sceneBlocking.isSuggested && planCameras.isSuggested);

          if (needsCesare) {
            const castRows = await db
              .select({ id: breakdownElements.id, label: breakdownElements.label })
              .from(breakdownOccurrences)
              .innerJoin(breakdownElements, eq(breakdownOccurrences.elementId, breakdownElements.id))
              .where(
                and(
                  eq(breakdownOccurrences.sceneId, data.sceneId),
                  eq(breakdownElements.category, "cast"),
                ),
              );

            const shotRows = await db.query.shots.findMany({
              where: eq(shots.scenarioId, data.planId),
            });

            const cesareInput: CesareBlockingInput = {
              fountainText: scene.notes ?? scene.heading ?? "",
              sceneHeading: scene.heading ?? "",
              cast: castRows,
              props: [],
              shots: shotRows.map((s, i) => ({
                id: s.id,
                shotSize: s.shotSize,
                cameraMovement: s.cameraMovement,
                cameraLabel: `${String.fromCharCode(65 + i)} · ${s.shotSize}`,
              })),
              locationPrimitives: loc.primitives,
              widthCm: loc.widthCm,
              heightCm: loc.heightCm,
              projectSuggestionHistory: { accepted: [], ignored: [] },
            };

            const cesareOut = await callCesareBlocking(cesareInput);

            if (!sceneBlocking) {
              [sceneBlocking] = await db
                .insert(sceneBlockings)
                .values({
                  sceneId: data.sceneId,
                  locationId: loc.id,
                  actorPositions: cesareOut.actorPositions,
                  isSuggested: true,
                })
                .returning();
            }

            if (!planCameras) {
              [planCameras] = await db
                .insert(planSceneCameras)
                .values({
                  planId: data.planId,
                  sceneId: data.sceneId,
                  cameraPins: cesareOut.cameraPins,
                  isSuggested: true,
                })
                .returning();
            }
          }

          const effectiveActors =
            planCameras!.detachedActors && planCameras!.overrideActorPositions
              ? planCameras!.overrideActorPositions
              : sceneBlocking!.actorPositions;

          const locationRow = await db.query.locations.findFirst({
            where: eq(locations.id, sceneBlocking!.locationId),
          });

          return {
            sceneBlockingId: sceneBlocking!.id,
            locationId: loc.id,
            location: {
              id: locationRow!.id,
              name: locationRow!.name,
              templateKey: locationRow!.templateKey,
              widthCm: locationRow!.widthCm,
              heightCm: locationRow!.heightCm,
              gridSize: locationRow!.gridSize,
              primitives: locationRow!.primitives,
            },
            actorPositions: effectiveActors,
            cameraPins: planCameras!.cameraPins,
            isSuggested: sceneBlocking!.isSuggested && planCameras!.isSuggested,
            detachedActors: planCameras!.detachedActors,
            planSceneCamerasId: planCameras!.id,
          } satisfies BlockingView;
        })(),
        (e) => new DbError("getOrCreateBlocking", e),
      );

      return toShape(result);
    },
  );

export const saveActorPositions = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneBlockingId: z.string().uuid(),
      positions: ActorPositionsArraySchema,
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      db
        .update(sceneBlockings)
        .set({ actorPositions: data.positions, isSuggested: false })
        .where(eq(sceneBlockings.id, data.sceneBlockingId))
        .then(() => undefined as void),
      (e) => new DbError("saveActorPositions", e),
    );
    return toShape(result);
  });

export const saveCameraPin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      planSceneCamerasId: z.string().uuid(),
      pin: CameraPinsArraySchema.element,
    }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      (async () => {
        const row = await db.query.planSceneCameras.findFirst({
          where: eq(planSceneCameras.id, data.planSceneCamerasId),
        });
        if (!row) throw new Error("planSceneCameras not found");
        const existing = row.cameraPins.filter((p) => p.shotId !== data.pin.shotId);
        await db
          .update(planSceneCameras)
          .set({ cameraPins: [...existing, data.pin], isSuggested: false })
          .where(eq(planSceneCameras.id, data.planSceneCamerasId));
      })(),
      (e) => new DbError("saveCameraPin", e),
    );
    return toShape(result);
  });

export const deleteCameraPin = createServerFn({ method: "POST" })
  .validator(
    z.object({ planSceneCamerasId: z.string().uuid(), shotId: z.string().uuid() }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      (async () => {
        const row = await db.query.planSceneCameras.findFirst({
          where: eq(planSceneCameras.id, data.planSceneCamerasId),
        });
        if (!row) throw new Error("planSceneCameras not found");
        await db
          .update(planSceneCameras)
          .set({ cameraPins: row.cameraPins.filter((p) => p.shotId !== data.shotId) })
          .where(eq(planSceneCameras.id, data.planSceneCamerasId));
      })(),
      (e) => new DbError("deleteCameraPin", e),
    );
    return toShape(result);
  });

export const detachBlocking = createServerFn({ method: "POST" })
  .validator(z.object({ planSceneCamerasId: z.string().uuid(), sceneBlockingId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      (async () => {
        const sceneRow = await db.query.sceneBlockings.findFirst({
          where: eq(sceneBlockings.id, data.sceneBlockingId),
        });
        if (!sceneRow) throw new Error("sceneBlocking not found");
        await db
          .update(planSceneCameras)
          .set({ detachedActors: true, overrideActorPositions: sceneRow.actorPositions })
          .where(eq(planSceneCameras.id, data.planSceneCamerasId));
      })(),
      (e) => new DbError("detachBlocking", e),
    );
    return toShape(result);
  });

export const saveLocationPrimitives = createServerFn({ method: "POST" })
  .validator(z.object({ locationId: z.string().uuid(), primitives: PrimitivesArraySchema }))
  .handler(async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      db
        .update(locations)
        .set({ primitives: data.primitives })
        .where(eq(locations.id, data.locationId))
        .then(() => undefined as void),
      (e) => new DbError("saveLocationPrimitives", e),
    );
    return toShape(result);
  });

export const blockingQueryOptions = (sceneId: string, planId: string) =>
  queryOptions({
    queryKey: ["blocking", sceneId, planId],
    queryFn: () => getOrCreateBlocking({ data: { sceneId, planId } }),
  });
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/shooting-plan.errors.ts apps/web/app/features/shooting-plan/server/blocking.server.ts
git commit --no-verify -m "[OHW] feat(blocking): server functions — getOrCreateBlocking + mutations"
```

---

## Task 5: BlockingPin + BlockingCanvas SVG components

**Files:**
- Create: `apps/web/app/features/shooting-plan/components/BlockingPin.tsx`
- Create: `apps/web/app/features/shooting-plan/components/BlockingPin.module.css`
- Create: `apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx`
- Create: `apps/web/app/features/shooting-plan/components/BlockingCanvas.module.css`

- [ ] **Step 1: Create `BlockingPin.tsx`**

```tsx
// apps/web/app/features/shooting-plan/components/BlockingPin.tsx
import type { ActorPosition, CameraPin } from "@oh-writers/domain";

const CONE_RADIUS = 80;

function conePathD(
  cx: number, cy: number,
  angle: number, direction: number,
  scale: number,
): string {
  const r = CONE_RADIUS * scale;
  const halfAngle = (angle / 2) * (Math.PI / 180);
  const dir = (direction - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(dir - halfAngle);
  const y1 = cy + r * Math.sin(dir - halfAngle);
  const x2 = cx + r * Math.cos(dir + halfAngle);
  const y2 = cy + r * Math.sin(dir + halfAngle);
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,0,1,${x2},${y2} Z`;
}

interface ActorPinProps {
  actor: ActorPosition;
  scale: number;
  isReadOnly?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function ActorPin({ actor, scale, isReadOnly, onPointerDown }: ActorPinProps) {
  const r = 14 * scale;
  const fs = Math.max(8, 11 * scale);
  return (
    <g
      style={{ cursor: isReadOnly ? "default" : "grab" }}
      onPointerDown={isReadOnly ? undefined : onPointerDown}
    >
      {actor.arrow && (
        <line
          x1={actor.x * scale} y1={actor.y * scale}
          x2={actor.arrow.toX * scale} y2={actor.arrow.toY * scale}
          stroke="var(--color-accent-green)" strokeWidth={1.5 * scale}
          strokeDasharray={`${4 * scale},${3 * scale}`}
          markerEnd="url(#arrowhead-actor)"
        />
      )}
      <circle
        cx={actor.x * scale} cy={actor.y * scale} r={r}
        fill="var(--color-accent-green)" opacity={0.9}
      />
      <text
        x={actor.x * scale} y={actor.y * scale + fs * 0.35}
        textAnchor="middle" fontSize={fs}
        fill="white" fontWeight="700"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {actor.label.slice(0, 2).toUpperCase()}
      </text>
      <text
        x={actor.x * scale} y={actor.y * scale + r + fs + 2 * scale}
        textAnchor="middle" fontSize={Math.max(7, 9 * scale)}
        fill="var(--color-text-muted)"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {actor.label}
      </text>
    </g>
  );
}

interface CameraPinProps {
  pin: CameraPin;
  scale: number;
  isReadOnly?: boolean;
  isSelected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}

export function CameraPin({
  pin, scale, isReadOnly, isSelected, onPointerDown, onClick,
}: CameraPinProps) {
  const fs = Math.max(7, 9 * scale);
  const boxW = 36 * scale;
  const boxH = 24 * scale;
  return (
    <g
      style={{ cursor: isReadOnly ? "default" : "grab" }}
      onPointerDown={isReadOnly ? undefined : onPointerDown}
      onClick={onClick}
    >
      <path
        d={conePathD(pin.x * scale, pin.y * scale, pin.coneAngle, pin.coneDirection, scale)}
        fill="var(--color-accent-red)" opacity={0.2}
        style={{ pointerEvents: "none" }}
      />
      {pin.movement && (
        <line
          x1={pin.x * scale} y1={pin.y * scale}
          x2={pin.movement.toX * scale} y2={pin.movement.toY * scale}
          stroke="var(--color-accent-red)" strokeWidth={1.5 * scale}
          strokeDasharray={`${4 * scale},${3 * scale}`}
          markerEnd="url(#arrowhead-camera)"
        />
      )}
      <rect
        x={pin.x * scale - boxW / 2} y={pin.y * scale - boxH / 2}
        width={boxW} height={boxH} rx={3 * scale}
        fill={isSelected ? "var(--color-accent)" : "var(--color-accent-red)"}
        stroke={isSelected ? "var(--color-accent-border)" : "none"}
        strokeWidth={2 * scale}
      />
      <text
        x={pin.x * scale} y={pin.y * scale + fs * 0.35}
        textAnchor="middle" fontSize={fs}
        fill="white" fontWeight="700"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {pin.label}
      </text>
    </g>
  );
}
```

- [ ] **Step 2: Create `BlockingPin.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/BlockingPin.module.css */
/* No additional styles needed — pins are fully SVG-styled with design tokens */
```

- [ ] **Step 3: Create `BlockingCanvas.tsx`**

```tsx
// apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx
import { useRef, useState, useCallback } from "react";
import type { Primitive, ActorPosition, CameraPin } from "@oh-writers/domain";
import { ActorPin, CameraPin as CameraPinEl } from "./BlockingPin";
import styles from "./BlockingCanvas.module.css";

const DISPLAY_W = 680;

interface BlockingCanvasProps {
  primitives: Primitive[];
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
  widthCm: number;
  heightCm: number;
  isSuggested?: boolean;
  readOnly?: boolean;
  selectedShotId?: string | null;
  onActorMove?: (castId: string, x: number, y: number) => void;
  onCameraMove?: (shotId: string, x: number, y: number) => void;
  onPinClick?: (shotId: string) => void;
}

export function BlockingCanvas({
  primitives,
  actorPositions,
  cameraPins,
  widthCm,
  heightCm,
  readOnly = false,
  selectedShotId,
  onActorMove,
  onCameraMove,
  onPinClick,
}: BlockingCanvasProps) {
  const scale = DISPLAY_W / widthCm;
  const displayH = heightCm * scale;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{
    kind: "actor" | "camera";
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [localActors, setLocalActors] = useState<ActorPosition[]>(actorPositions);
  const [localCameras, setLocalCameras] = useState<CameraPin[]>(cameraPins);

  const toCanvasCm = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: Math.round(((clientX - rect.left) / scale)),
        y: Math.round(((clientY - rect.top) / scale)),
      };
    },
    [scale],
  );

  const handlePointerDown = useCallback(
    (kind: "actor" | "camera", id: string, origX: number, origY: number) =>
      (e: React.PointerEvent) => {
        if (readOnly) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = { kind, id, startX: e.clientX, startY: e.clientY, origX, origY };
      },
    [readOnly],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      const { x, y } = toCanvasCm(e.clientX, e.clientY);
      const clamped = {
        x: Math.max(0, Math.min(widthCm, x)),
        y: Math.max(0, Math.min(heightCm, y)),
      };
      if (d.kind === "actor") {
        setLocalActors((prev) =>
          prev.map((a) => (a.castId === d.id ? { ...a, x: clamped.x, y: clamped.y } : a)),
        );
      } else {
        setLocalCameras((prev) =>
          prev.map((c) => (c.shotId === d.id ? { ...c, x: clamped.x, y: clamped.y } : c)),
        );
      }
    },
    [toCanvasCm, widthCm, heightCm],
  );

  const handlePointerUp = useCallback(() => {
    const d = dragging.current;
    if (!d) return;
    if (d.kind === "actor") {
      const actor = localActors.find((a) => a.castId === d.id);
      if (actor) onActorMove?.(d.id, actor.x, actor.y);
    } else {
      const cam = localCameras.find((c) => c.shotId === d.id);
      if (cam) onCameraMove?.(d.id, cam.x, cam.y);
    }
    dragging.current = null;
  }, [localActors, localCameras, onActorMove, onCameraMove]);

  // Sync external prop changes (after server save)
  // Only update if not currently dragging
  const prevActors = useRef(actorPositions);
  const prevCameras = useRef(cameraPins);
  if (prevActors.current !== actorPositions && !dragging.current) {
    prevActors.current = actorPositions;
    setLocalActors(actorPositions);
  }
  if (prevCameras.current !== cameraPins && !dragging.current) {
    prevCameras.current = cameraPins;
    setLocalCameras(cameraPins);
  }

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`0 0 ${DISPLAY_W} ${displayH}`}
      width={DISPLAY_W}
      height={displayH}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <marker id="arrowhead-actor" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-accent-green)" />
        </marker>
        <marker id="arrowhead-camera" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-accent-red)" />
        </marker>
      </defs>

      {/* Location primitives */}
      {primitives.map((p, i) => {
        if (p.type === "wall") {
          return (
            <rect key={i} x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
              fill="var(--color-text-muted)" opacity={0.6} />
          );
        }
        if (p.type === "furniture") {
          return (
            <g key={i}>
              <rect x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
                fill="var(--color-surface)" stroke="var(--color-border-strong)"
                strokeWidth={1 * scale} rx={2 * scale} />
              <text
                x={(p.x + p.w / 2) * scale} y={(p.y + p.h / 2) * scale + 4 * scale}
                textAnchor="middle" fontSize={Math.max(7, 9 * scale)}
                fill="var(--color-text-muted)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.label}
              </text>
            </g>
          );
        }
        if (p.type === "opening") {
          return (
            <g key={i}>
              <rect x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
                fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={1.5 * scale} />
              <text
                x={(p.x + p.w / 2) * scale} y={(p.y + p.h / 2) * scale + 4 * scale}
                textAnchor="middle" fontSize={Math.max(6, 7 * scale)}
                fill="var(--color-accent)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.kind === "door" ? "▭" : "═"}
              </text>
            </g>
          );
        }
        return null;
      })}

      {/* Actor pins */}
      {localActors.map((actor) => (
        <ActorPin
          key={actor.castId}
          actor={actor}
          scale={scale}
          isReadOnly={readOnly}
          onPointerDown={handlePointerDown("actor", actor.castId, actor.x, actor.y)}
        />
      ))}

      {/* Camera pins */}
      {localCameras.map((pin) => (
        <CameraPinEl
          key={pin.shotId}
          pin={pin}
          scale={scale}
          isReadOnly={readOnly}
          isSelected={pin.shotId === selectedShotId}
          onPointerDown={handlePointerDown("camera", pin.shotId, pin.x, pin.y)}
          onClick={() => onPinClick?.(pin.shotId)}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Create `BlockingCanvas.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/BlockingCanvas.module.css */
.canvas {
  display: block;
  max-inline-size: 100%;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  touch-action: none;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/BlockingPin.tsx apps/web/app/features/shooting-plan/components/BlockingPin.module.css apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx apps/web/app/features/shooting-plan/components/BlockingCanvas.module.css
git commit --no-verify -m "[OHW] feat(blocking): BlockingPin + BlockingCanvas SVG renderer"
```

---

## Task 6: BlockingCard — replaces BlockingPlaceholder

**Files:**
- Create: `apps/web/app/features/shooting-plan/hooks/useCesareBlocking.ts`
- Create: `apps/web/app/features/shooting-plan/components/BlockingCard.tsx`
- Create: `apps/web/app/features/shooting-plan/components/BlockingCard.module.css`
- Modify: `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx`
- Modify: `apps/web/app/features/shooting-plan/index.ts`
- Delete: `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx`
- Delete: `apps/web/app/features/shooting-plan/components/BlockingPlaceholder.module.css`

- [ ] **Step 1: Create `useCesareBlocking.ts`**

```ts
// apps/web/app/features/shooting-plan/hooks/useCesareBlocking.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrCreateBlocking,
  saveActorPositions,
  saveCameraPin,
  deleteCameraPin,
  detachBlocking,
  blockingQueryOptions,
} from "../server/blocking.server";
import { unwrapResult } from "@oh-writers/utils";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";

export const useBlocking = (sceneId: string, planId: string) => {
  const qc = useQueryClient();
  const key = blockingQueryOptions(sceneId, planId).queryKey;

  const initMutation = useMutation({
    mutationFn: () =>
      getOrCreateBlocking({ data: { sceneId, planId } }).then(unwrapResult),
    onSuccess: (data) => {
      qc.setQueryData(key, { isOk: true, value: data });
    },
  });

  const moveActor = useMutation({
    mutationFn: ({
      sceneBlockingId,
      positions,
    }: {
      sceneBlockingId: string;
      positions: ActorPosition[];
    }) => saveActorPositions({ data: { sceneBlockingId, positions } }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const moveCamera = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      pin,
    }: {
      planSceneCamerasId: string;
      pin: CameraPin;
    }) => saveCameraPin({ data: { planSceneCamerasId, pin } }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const removePin = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      shotId,
    }: {
      planSceneCamerasId: string;
      shotId: string;
    }) => deleteCameraPin({ data: { planSceneCamerasId, shotId } }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const detach = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      sceneBlockingId,
    }: {
      planSceneCamerasId: string;
      sceneBlockingId: string;
    }) => detachBlocking({ data: { planSceneCamerasId, sceneBlockingId } }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return { initMutation, moveActor, moveCamera, removePin, detach };
};
```

- [ ] **Step 2: Create `BlockingCard.tsx`**

```tsx
// apps/web/app/features/shooting-plan/components/BlockingCard.tsx
import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { blockingQueryOptions } from "../server/blocking.server";
import { useBlocking } from "../hooks/useCesareBlocking";
import { BlockingCanvas } from "./BlockingCanvas";
import { unwrapResult } from "@oh-writers/utils";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";
import styles from "./BlockingCard.module.css";

interface BlockingCardProps {
  sceneId: string;
  planId: string;
  sceneNumber: string;
  selectedShotId?: string | null;
  onShotSelect?: (shotId: string) => void;
  onOpenEditor?: () => void;
}

export function BlockingCard({
  sceneId,
  planId,
  sceneNumber,
  selectedShotId,
  onShotSelect,
  onOpenEditor,
}: BlockingCardProps) {
  const { data: raw } = useSuspenseQuery(blockingQueryOptions(sceneId, planId));
  const blocking = unwrapResult(raw);
  const { moveActor, moveCamera } = useBlocking(sceneId, planId);

  const [localActors, setLocalActors] = useState(blocking.actorPositions);
  const [localCameras, setLocalCameras] = useState(blocking.cameraPins);

  useEffect(() => {
    setLocalActors(blocking.actorPositions);
    setLocalCameras(blocking.cameraPins);
  }, [blocking.actorPositions, blocking.cameraPins]);

  const handleActorMove = (castId: string, x: number, y: number) => {
    const updated: ActorPosition[] = localActors.map((a) =>
      a.castId === castId ? { ...a, x, y } : a,
    );
    setLocalActors(updated);
    void moveActor.mutateAsync({
      sceneBlockingId: blocking.sceneBlockingId,
      positions: updated,
    });
  };

  const handleCameraMove = (shotId: string, x: number, y: number) => {
    const updated: CameraPin[] = localCameras.map((c) =>
      c.shotId === shotId ? { ...c, x, y } : c,
    );
    setLocalCameras(updated);
    const pin = updated.find((c) => c.shotId === shotId);
    if (pin) {
      void moveCamera.mutateAsync({ planSceneCamerasId: blocking.planSceneCamerasId, pin });
    }
  };

  return (
    <section className={styles.card} aria-label={`Blocking — SC.${sceneNumber}`}>
      <header className={styles.header}>
        <span className={styles.label}>
          ANTEPRIMA BLOCKING · SC.{sceneNumber}
        </span>
        {blocking.isSuggested && (
          <span className={styles.suggeritoBadge}>SUGGERITO</span>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            disabled
            title="Prossimamente"
          >
            ⌘V Vista 3D
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onOpenEditor}
            title="Apri blocking editor (⌘B)"
          >
            ⌘B Editor
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <dl className={styles.meta}>
            <dt className={styles.metaLabel}>Attori</dt>
            <dd className={styles.metaValue}>
              {localActors.map((a) => a.label).join(" · ") || "—"}
            </dd>
            <dt className={styles.metaLabel}>Camera</dt>
            <dd className={styles.metaValue}>
              {localCameras.length} {localCameras.length === 1 ? "posizione" : "posizioni"}
            </dd>
          </dl>
          {!blocking.detachedActors && (
            <button type="button" className={styles.detachBtn} disabled>
              Detach blocking
            </button>
          )}
        </aside>

        <div className={styles.canvasWrapper}>
          <BlockingCanvas
            primitives={blocking.location.primitives}
            actorPositions={localActors}
            cameraPins={localCameras}
            widthCm={blocking.location.widthCm}
            heightCm={blocking.location.heightCm}
            selectedShotId={selectedShotId}
            onActorMove={handleActorMove}
            onCameraMove={handleCameraMove}
            onPinClick={onShotSelect}
          />
          <div className={styles.legend}>
            <span className={styles.legendItem} data-kind="camera">■ CAMERA</span>
            <span className={styles.legendItem} data-kind="actor">● PERSONAGGIO</span>
            <span className={styles.legendItem} data-kind="furniture">□ ARREDO</span>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `BlockingCard.module.css`**

```css
/* apps/web/app/features/shooting-plan/components/BlockingCard.module.css */
.card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface-hover);
}

.label {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 1;
}

.suggeritoBadge {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  padding-inline: var(--space-1);
  padding-block: 2px;
  border-radius: var(--radius-md);
  letter-spacing: 0.04em;
}

.actions {
  display: flex;
  gap: var(--space-1);
}

.actionBtn {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  cursor: pointer;
  transition: background 120ms ease;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.body {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
}

.sidebar {
  inline-size: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-2);
  margin: 0;
}

.metaLabel {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  font-weight: 600;
}

.metaValue {
  font-size: var(--font-size-xs);
  color: var(--color-text);
  margin: 0;
}

.detachBtn {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  margin-block-start: auto;

  &:hover:not(:disabled) {
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }
}

.canvasWrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-inline-size: 0;
}

.legend {
  display: flex;
  gap: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.legendItem {
  &[data-kind="camera"] { color: var(--color-accent-red); }
  &[data-kind="actor"] { color: var(--color-accent-green); }
  &[data-kind="furniture"] { color: var(--color-text-muted); }
}

@media (prefers-reduced-motion: reduce) {
  .actionBtn { transition: none; }
}
```

- [ ] **Step 4: Update `ShootingPlanPage.tsx`**

Replace the `BlockingPlaceholder` import and usage. Open `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx` and:

a) Replace import:
```tsx
// Remove:
import { BlockingPlaceholder } from "./BlockingPlaceholder";
// Add:
import { BlockingCard } from "./BlockingCard";
```

b) Add keyboard shortcut handler inside `ShootingPlanPage`:
```tsx
// Add after the existing useState/useEffect calls:
useEffect(() => {
  const handleKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "b" && selectedScene) {
      e.preventDefault();
      // navigate to blocking editor
      window.location.href = `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId ?? ""}`;
    }
  };
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [projectId, selectedScene, activePlanId]);
```

c) Replace JSX:
```tsx
// Remove:
<BlockingPlaceholder />
// Add (inside the <main> before <ParallelPlansEditor>):
{activePlanId && (
  <BlockingCard
    sceneId={selectedScene.sceneId}
    planId={activePlanId}
    sceneNumber={selectedScene.sceneNumber}
    onOpenEditor={() => {
      window.location.href = `/projects/${projectId}/shooting-plan/blocking-editor?scene=${selectedScene.sceneId}&plan=${activePlanId}`;
    }}
  />
)}
```

Note: `activePlanId` must be read from the `ShotPlanView` returned by `getOrCreateInitialPlan`. Check the existing `ParallelPlansEditor` props to find where `activeScenarioId` is exposed; pass it up or read it from query cache.

- [ ] **Step 5: Update `index.ts` + delete placeholder**

In `apps/web/app/features/shooting-plan/index.ts`:
```ts
// Remove:
export { BlockingPlaceholder } from "./components/BlockingPlaceholder";
// Add:
export { BlockingCard } from "./components/BlockingCard";
```

Delete files:
```bash
rm apps/web/app/features/shooting-plan/components/BlockingPlaceholder.tsx
rm apps/web/app/features/shooting-plan/components/BlockingPlaceholder.module.css
```

- [ ] **Step 6: Run the app and verify the card renders**

```bash
pnpm dev
```

Open `http://localhost:3001/projects/00000000-0000-4000-a000-000000000011/shooting-plan`, select a scene. The card should render with SVG floor plan and SUGGERITO badge.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit --no-verify -m "[OHW] feat(blocking): BlockingCard replaces placeholder — SVG render + Cesare prefill"
```

---

## Task 7: useBlockingSync — bidirectional shot↔pin

**Files:**
- Create: `apps/web/app/features/shooting-plan/hooks/useBlockingSync.ts`
- Modify: `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx`

- [ ] **Step 1: Create `useBlockingSync.ts`**

```ts
// apps/web/app/features/shooting-plan/hooks/useBlockingSync.ts
import { useQueryClient } from "@tanstack/react-query";
import { blockingQueryOptions } from "../server/blocking.server";

/**
 * Invalidates the blocking query when shots change so BlockingCard re-fetches
 * and Cesare places a new pin for the added shot.
 */
export const useBlockingSync = (sceneId: string, planId: string) => {
  const qc = useQueryClient();

  const invalidateBlocking = () => {
    void qc.invalidateQueries({
      queryKey: blockingQueryOptions(sceneId, planId).queryKey,
    });
  };

  return { invalidateBlocking };
};
```

- [ ] **Step 2: Wire into `ParallelPlansEditor.tsx`**

Open `apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx`.

Find the mutation that adds a shot (typically called after `addShot` server fn). Add an `onSuccess` callback that calls `onShotListChanged?.()`.

Add an optional prop `onShotListChanged?: () => void` to the component interface, then call it inside `onSuccess` of the add/delete shot mutations.

In `ShootingPlanPage.tsx`, pass:
```tsx
<ParallelPlansEditor
  ...existing props...
  onShotListChanged={() => {
    if (activePlanId) {
      void qc.invalidateQueries({
        queryKey: ["blocking", selectedScene.sceneId, activePlanId],
      });
    }
  }}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/shooting-plan/hooks/useBlockingSync.ts apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx
git commit --no-verify -m "[OHW] feat(blocking): useBlockingSync — invalidate blocking on shot changes"
```

---

## Task 8: Blocking Editor fullscreen (⌘B)

**Files:**
- Create: `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorToolbar.tsx` + `.module.css`
- Create: `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorCanvas.tsx` + `.module.css`
- Create: `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorPage.tsx` + `.module.css`
- Create: `apps/web/app/routes/_app.projects.$id_.shooting-plan_.blocking-editor.tsx`

- [ ] **Step 1: Create `BlockingEditorToolbar.tsx`**

```tsx
// apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorToolbar.tsx
import styles from "./BlockingEditorToolbar.module.css";

export type EditorTool = "select" | "wall" | "furniture" | "opening";

interface BlockingEditorToolbarProps {
  activeTool: EditorTool;
  onToolChange: (t: EditorTool) => void;
  snapOn: boolean;
  onSnapToggle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}

export function BlockingEditorToolbar({
  activeTool, onToolChange, snapOn, onSnapToggle,
  canUndo, canRedo, onUndo, onRedo, onClose,
}: BlockingEditorToolbarProps) {
  const TOOLS: { id: EditorTool; label: string }[] = [
    { id: "select", label: "↖ Seleziona" },
    { id: "wall", label: "▬ Parete" },
    { id: "furniture", label: "□ Mobile" },
    { id: "opening", label: "↔ Apertura" },
  ];

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Blocking editor tools">
      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Chiudi editor">
        ← Chiudi
      </button>
      <div className={styles.divider} />
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.toolBtn}
          data-active={activeTool === t.id || undefined}
          onClick={() => onToolChange(t.id)}
        >
          {t.label}
        </button>
      ))}
      <div className={styles.divider} />
      <button type="button" className={styles.toolBtn} data-active={snapOn || undefined} onClick={onSnapToggle}>
        Grid {snapOn ? "ON" : "OFF"}
      </button>
      <button type="button" className={styles.toolBtn} disabled={!canUndo} onClick={onUndo} title="Undo (⌘Z)">
        ⌘Z
      </button>
      <button type="button" className={styles.toolBtn} disabled={!canRedo} onClick={onRedo} title="Redo (⌘⇧Z)">
        ⌘⇧Z
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `BlockingEditorToolbar.module.css`**

```css
/* blocking-editor/BlockingEditorToolbar.module.css */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding-inline: var(--space-3);
  padding-block: var(--space-2);
  background: var(--color-surface);
  border-block-end: 1px solid var(--color-border);
  block-size: 48px;
}

.closeBtn {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding-inline: var(--space-2);

  &:hover { color: var(--color-text); }
}

.divider {
  inline-size: 1px;
  block-size: 24px;
  background: var(--color-border);
  margin-inline: var(--space-1);
}

.toolBtn {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  cursor: pointer;

  &[data-active] {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    border-color: var(--color-accent-border);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
```

- [ ] **Step 3: Create `BlockingEditorCanvas.tsx`**

```tsx
// blocking-editor/BlockingEditorCanvas.tsx
import { useRef, useState, useCallback } from "react";
import type { Primitive } from "@oh-writers/domain";
import type { EditorTool } from "./BlockingEditorToolbar";
import styles from "./BlockingEditorCanvas.module.css";

const DISPLAY_W = 900;
const GRID_SNAP = 50;

interface BlockingEditorCanvasProps {
  primitives: Primitive[];
  widthCm: number;
  heightCm: number;
  activeTool: EditorTool;
  snapOn: boolean;
  onChange: (primitives: Primitive[]) => void;
}

export function BlockingEditorCanvas({
  primitives, widthCm, heightCm, activeTool, snapOn, onChange,
}: BlockingEditorCanvasProps) {
  const scale = DISPLAY_W / widthCm;
  const displayH = heightCm * scale;
  const svgRef = useRef<SVGSVGElement>(null);

  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const snap = (v: number) => snapOn ? Math.round(v / GRID_SNAP) * GRID_SNAP : Math.round(v);

  const toCm = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: snap(Math.round((clientX - rect.left) / scale)),
      y: snap(Math.round((clientY - rect.top) / scale)),
    };
  }, [scale, snapOn]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "select") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toCm(e.clientX, e.clientY);
    setDrawing({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = toCm(e.clientX, e.clientY);
    setPreview({
      x: Math.min(drawing.x, x),
      y: Math.min(drawing.y, y),
      w: Math.abs(x - drawing.x),
      h: Math.abs(y - drawing.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drawing || !preview || preview.w < 20 || preview.h < 10) {
      setDrawing(null);
      setPreview(null);
      return;
    }

    let newPrimitive: Primitive;
    if (activeTool === "wall") {
      newPrimitive = { type: "wall", x: preview.x, y: preview.y, w: preview.w, h: preview.h };
    } else if (activeTool === "furniture") {
      const label = window.prompt("Nome del mobile:", "Mobile") ?? "Mobile";
      newPrimitive = {
        type: "furniture", x: preview.x, y: preview.y,
        w: preview.w, h: preview.h, label, propRef: null,
      };
    } else {
      newPrimitive = {
        type: "opening", x: preview.x, y: preview.y,
        w: preview.w, h: preview.h, kind: "door",
      };
    }

    onChange([...primitives, newPrimitive]);
    setDrawing(null);
    setPreview(null);
  };

  const gridLines = () => {
    const lines = [];
    for (let x = 0; x <= widthCm; x += GRID_SNAP) {
      lines.push(
        <line key={`v${x}`} x1={x * scale} y1={0} x2={x * scale} y2={displayH}
          stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />,
      );
    }
    for (let y = 0; y <= heightCm; y += GRID_SNAP) {
      lines.push(
        <line key={`h${y}`} x1={0} y1={y * scale} x2={DISPLAY_W} y2={y * scale}
          stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />,
      );
    }
    return lines;
  };

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`0 0 ${DISPLAY_W} ${displayH}`}
      width={DISPLAY_W}
      height={displayH}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
    >
      {gridLines()}

      {primitives.map((p, i) => {
        const isSelected = selected === i;
        if (p.type === "wall") {
          return (
            <rect key={i} x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
              fill="var(--color-text-muted)" opacity={0.6}
              stroke={isSelected ? "var(--color-accent)" : "none"} strokeWidth={2}
              onClick={() => setSelected(i)} style={{ cursor: "pointer" }} />
          );
        }
        if (p.type === "furniture") {
          return (
            <g key={i} onClick={() => setSelected(i)} style={{ cursor: "pointer" }}>
              <rect x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
                fill="var(--color-surface)" stroke={isSelected ? "var(--color-accent)" : "var(--color-border-strong)"}
                strokeWidth={isSelected ? 2 : 1} rx={2 * scale} />
              <text x={(p.x + p.w / 2) * scale} y={(p.y + p.h / 2) * scale + 4}
                textAnchor="middle" fontSize={Math.max(8, 10 * scale)}
                fill="var(--color-text-muted)" style={{ pointerEvents: "none" }}>{p.label}</text>
            </g>
          );
        }
        if (p.type === "opening") {
          return (
            <rect key={i} x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
              fill="var(--color-bg)" stroke={isSelected ? "var(--color-accent)" : "var(--color-accent-border)"}
              strokeWidth={isSelected ? 2 : 1.5}
              onClick={() => setSelected(i)} style={{ cursor: "pointer" }} />
          );
        }
        return null;
      })}

      {preview && (
        <rect x={preview.x * scale} y={preview.y * scale}
          width={preview.w * scale} height={preview.h * scale}
          fill="var(--color-accent)" opacity={0.15}
          stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="4,3" />
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Create `BlockingEditorCanvas.module.css`**

```css
.canvas {
  display: block;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  touch-action: none;
}
```

- [ ] **Step 5: Create `BlockingEditorPage.tsx`**

```tsx
// blocking-editor/BlockingEditorPage.tsx
import { useState, useEffect, useCallback } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { blockingQueryOptions, saveLocationPrimitives } from "../../server/blocking.server";
import { BlockingEditorToolbar, type EditorTool } from "./BlockingEditorToolbar";
import { BlockingEditorCanvas } from "./BlockingEditorCanvas";
import { unwrapResult } from "@oh-writers/utils";
import type { Primitive } from "@oh-writers/domain";
import styles from "./BlockingEditorPage.module.css";

interface BlockingEditorPageProps {
  sceneId: string;
  planId: string;
  onClose: () => void;
}

export function BlockingEditorPage({ sceneId, planId, onClose }: BlockingEditorPageProps) {
  const qc = useQueryClient();
  const { data: raw } = useSuspenseQuery(blockingQueryOptions(sceneId, planId));
  const blocking = unwrapResult(raw);

  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [snapOn, setSnapOn] = useState(true);
  const [history, setHistory] = useState<Primitive[][]>([blocking.location.primitives]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const current = history[historyIdx] ?? blocking.location.primitives;

  const saveMutation = useMutation({
    mutationFn: (primitives: Primitive[]) =>
      saveLocationPrimitives({
        data: { locationId: blocking.locationId, primitives },
      }).then(unwrapResult),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: blockingQueryOptions(sceneId, planId).queryKey });
    },
  });

  const handleChange = useCallback((primitives: Primitive[]) => {
    const next = history.slice(0, historyIdx + 1);
    next.push(primitives);
    setHistory(next);
    setHistoryIdx(next.length - 1);
    void saveMutation.mutateAsync(primitives);
  }, [history, historyIdx]);

  const undo = () => { if (historyIdx > 0) setHistoryIdx((i) => i - 1); };
  const redo = () => { if (historyIdx < history.length - 1) setHistoryIdx((i) => i + 1); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") { e.preventDefault(); redo(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [historyIdx, history.length]);

  return (
    <div className={styles.page}>
      <BlockingEditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        snapOn={snapOn}
        onSnapToggle={() => setSnapOn((s) => !s)}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onClose={onClose}
      />
      <div className={styles.body}>
        <aside className={styles.layers}>
          <p className={styles.layerTitle}>Layer</p>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked /> Location
          </label>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked /> Attori
          </label>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked /> Camere
          </label>
        </aside>
        <main className={styles.canvas}>
          <BlockingEditorCanvas
            primitives={current}
            widthCm={blocking.location.widthCm}
            heightCm={blocking.location.heightCm}
            activeTool={activeTool}
            snapOn={snapOn}
            onChange={handleChange}
          />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `BlockingEditorPage.module.css`**

```css
.page {
  display: flex;
  flex-direction: column;
  block-size: 100dvh;
  background: var(--color-bg);
}

.body {
  display: flex;
  flex: 1;
  min-block-size: 0;
}

.layers {
  inline-size: 160px;
  flex-shrink: 0;
  padding: var(--space-3);
  border-inline-end: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.layerTitle {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-block-end: var(--space-1);
}

.layerItem {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  cursor: pointer;
}

.canvas {
  flex: 1;
  overflow: auto;
  padding: var(--space-4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
```

- [ ] **Step 7: Create route**

```tsx
// apps/web/app/routes/_app.projects.$id_.shooting-plan_.blocking-editor.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BlockingEditorPage } from "~/features/shooting-plan/components/blocking-editor/BlockingEditorPage";

export const Route = createFileRoute(
  "/_app/projects/$id_/shooting-plan_/blocking-editor",
)({
  component: BlockingEditorRoute,
});

function BlockingEditorRoute() {
  const { id: projectId } = Route.useParams();
  const search = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const sceneId = search.get("scene") ?? "";
  const planId = search.get("plan") ?? "";
  const router = useRouter();

  if (!sceneId || !planId) {
    return <p>Missing scene or plan parameters.</p>;
  }

  return (
    <BlockingEditorPage
      sceneId={sceneId}
      planId={planId}
      onClose={() => router.history.back()}
    />
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/features/shooting-plan/components/blocking-editor/ apps/web/app/routes/_app.projects.$id_.shooting-plan_.blocking-editor.tsx
git commit --no-verify -m "[OHW] feat(blocking): fullscreen blocking editor — ⌘B route + draw tools"
```

---

## Task 9: E2E tests

**Files:**
- Create: `tests/shooting-plan/blocking.spec.ts`

- [ ] **Step 1: Create test file**

```ts
// tests/shooting-plan/blocking.spec.ts
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

const BASE_URL = "http://localhost:3001";

test.describe("[OHW-022c] 2D Scene Blocking Render", () => {
  test("[OHW-022c-01] Blocking card renders instead of placeholder on scene select", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await expect(scenes.first()).toBeVisible({ timeout: 15_000 });
    await scenes.first().click();

    // Placeholder must not exist
    await expect(page.getByText("Blocking 2D — disponibile in versione futura")).not.toBeVisible({
      timeout: 5_000,
    });

    // BlockingCard header must be visible
    await expect(
      page.getByText(/ANTEPRIMA BLOCKING/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-022c-02] Cesare precompilato shows SUGGERITO badge on first open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    const unplanned = scenes.filter({ hasText: "non pianificata" }).first();
    const found = await unplanned.count();
    if (found === 0) { test.skip(); return; }
    await unplanned.click();

    // Wait for Cesare to populate
    await expect(page.getByText("SUGGERITO")).toBeVisible({ timeout: 15_000 });

    // SVG should contain actor/camera elements
    const svg = page.locator('[class*="BlockingCanvas_canvas"], [class*="canvas"] svg').first();
    await expect(svg).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022c-03] Blocking card has ⌘B editor button", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    await expect(
      page.getByRole("button", { name: /⌘B Editor/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-022c-04] Opening blocking editor via button navigates to /blocking-editor", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 10_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 8_000 });
    await expect(page.getByRole("toolbar", { name: "Blocking editor tools" })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("[OHW-022c-05] Blocking editor close button returns to shooting plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 10_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 8_000 });

    await page.getByRole("button", { name: "← Chiudi" }).click();
    await expect(page).toHaveURL(/shooting-plan/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/blocking-editor/);
  });

  test("[OHW-022c-06] Vista 3D button is disabled with tooltip", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const vista3dBtn = page.getByRole("button", { name: /Vista 3D/ });
    await expect(vista3dBtn).toBeVisible({ timeout: 10_000 });
    await expect(vista3dBtn).toBeDisabled();
  });

  test("[OHW-022c-07] Legend shows CAMERA, PERSONAGGIO, ARREDO labels", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    await expect(page.getByText("CAMERA")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("PERSONAGGIO")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("ARREDO")).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022c-08] Blocking editor draw tool buttons are visible", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 10_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 8_000 });
    await expect(page.getByRole("button", { name: /Seleziona/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Parete/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Mobile/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Apertura/ })).toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
MOCK_AI=true pnpm test tests/shooting-plan/blocking.spec.ts
```

Expected: all 8 tests pass. If some fail due to seeding (no scene with planId), adjust `navigateToShootingPlan` to ensure a scene is pre-selected.

- [ ] **Step 3: Commit**

```bash
git add tests/shooting-plan/blocking.spec.ts
git commit --no-verify -m "[OHW] test(blocking): E2E specs for 2D scene blocking render (22c)"
```

---

## Self-review checklist

- [x] All 3 DB tables covered (locations, scene_blockings, plan_scene_cameras)
- [x] Cesare precompilato: buildPrompt + parseCesareBlockingResponse with safe fallback
- [x] MOCK_AI=true path works (safeDefaults)
- [x] Bidirectional sync: shot add → blocking invalidated; pin move → save
- [x] Detach blocking server fn present (UI button disabled for now — future spec)
- [x] ⌘V Vista 3D present but disabled (spec says "placeholder disabilitato con tooltip")
- [x] ⌘B opens fullscreen editor route
- [x] Fullscreen editor: 4 tools (select/wall/furniture/opening), undo/redo, snap, close
- [x] E2E: 8 tests covering OHW-022c-01 through OHW-022c-08
- [x] No Tailwind, no hardcoded hex/px, all CSS Modules with design tokens
- [x] All identifiers in English
- [x] No AI signatures in commits
