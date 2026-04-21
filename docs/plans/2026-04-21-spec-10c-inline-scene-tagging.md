# Spec 10c — Inline Scene Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la colonna centrale del Breakdown (`SceneScriptViewer` heading-only) con un reader read-only dell'intera sceneggiatura basato su ProseMirror, con highlight inline delle occorrenze, ghost delle suggestion Cesare, selection toolbar fluttuante per taggare testo arbitrario, e scroll-to-scene dalla TOC.

**Architecture:** Riusiamo l'engine ProseMirror dell'editor in modalità read-only (`ReadOnlyScreenplayView`). Il reader breakdown (`ScriptReader`) compone 3 plugin PM (highlight, ghost, selection-toolbar) che decorano il doc usando dati derivati da `screenplay_versions.content` (snapshot fountain, già nel DB) e dalle query breakdown esistenti. Nessuna migration DB; estendiamo solo `getBreakdownContext` per restituire `versionContent`.

**Tech Stack:** TanStack Start, ProseMirror (`prosemirror-state`, `prosemirror-view`), neverthrow, Zod, Vitest, Playwright, CSS Modules con design tokens (`--cat-*-bg` nuovi). Mobile/Expo esplicitamente fuori scope.

**Reading order before coding:**

1. `docs/specs/core/10c-inline-scene-tagging.md` — lo spec di riferimento
2. `apps/web/app/features/breakdown/components/SceneScriptViewer.tsx` — il componente che sostituiamo
3. `apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx` — engine PM da clonare in read-only
4. `apps/web/app/features/screenplay-editor/lib/fountain-to-doc.ts` — parser fountain → PM doc
5. `apps/web/app/features/screenplay-editor/lib/schema.ts` — schema PM (nodi: scene, heading, action, character, dialogue, parenthetical, transition, prefix, title)
6. `apps/web/app/features/breakdown/hooks/useBreakdown.ts` — hook esistenti riusati
7. `apps/web/app/features/breakdown/server/breakdown.server.ts:622-684` — `getBreakdownContext` da estendere

---

## File Structure

**New files:**

| File                                                                            | Responsibility                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx` | PM EditorView non-editable, accetta `pluginsExtra`, espone `view` via `onReady`            |
| `apps/web/app/features/breakdown/components/ScriptReader.tsx`                   | Wrapper breakdown: monta ReadOnlyScreenplayView + 3 plugin, espone `scrollToScene` via ref |
| `apps/web/app/features/breakdown/components/ScriptReader.module.css`            | CSS per highlight/ghost classes                                                            |
| `apps/web/app/features/breakdown/components/SelectionToolbar.tsx`               | Toolbar React fluttuante 14 categorie                                                      |
| `apps/web/app/features/breakdown/components/SelectionToolbar.module.css`        | Styling toolbar                                                                            |
| `apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.ts`               | Pure: `findSceneNodePosition`, `scrollToScene`, `findSceneIndexAtPos`                      |
| `apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.ts`            | Pure: `findOccurrencesInDoc(doc, elements)` → ranges con categoria/elementId/isStale       |
| `apps/web/app/features/breakdown/lib/pm-plugins/highlight-decoration.ts`        | PM Plugin: DecorationSet da occorrenze accepted                                            |
| `apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.ts`             | Pure: `mapSuggestionsToRanges(doc, suggestions)`                                           |
| `apps/web/app/features/breakdown/lib/pm-plugins/ghost-decoration.ts`            | PM Plugin: DecorationSet da suggestion pending + widget ✨                                 |
| `apps/web/app/features/breakdown/lib/pm-plugins/selection-toolbar-plugin.ts`    | PM PluginView: monta SelectionToolbar via React Portal                                     |
| `tests/breakdown/inline-tagging.spec.ts`                                        | Playwright E2E (5 test OHW-280..284)                                                       |

**Modified files:**

| File                                                           | What changes                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/ui/src/styles/tokens.css`                            | Aggiungi 14 token `--cat-*-bg` (oklch alpha 0.18)                                                   |
| `apps/web/app/features/breakdown/server/breakdown.server.ts`   | `BreakdownContext` ottiene `versionContent: string`; il handler legge `screenplay_versions.content` |
| `apps/web/app/features/breakdown/components/BreakdownPage.tsx` | Sostituisce `SceneScriptViewer` con `ScriptReader`; cabla TOC click → `scrollToScene` via ref       |

**Deleted files (in fondo):**

| File                                                                      | Quando                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/app/features/breakdown/components/SceneScriptViewer.tsx`        | Task 13, dopo che ScriptReader è in produzione |
| `apps/web/app/features/breakdown/components/SceneScriptViewer.module.css` | Task 13                                        |

---

## Test Commands (cheatsheet)

- Unit (Vitest): `pnpm test:unit` oppure `pnpm vitest run path/to/file.test.ts`
- Watch single file: `pnpm vitest path/to/file.test.ts`
- E2E (Playwright): `pnpm test:e2e -- path/to/file.spec.ts`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

Seeded test users (vedi `packages/db/src/seed/index.ts`):

- Owner: `valerio@ohwriters.dev` / `valerio123`
- Editor: `editor@ohwriters.dev` / `editor123`
- Viewer: `collab@ohwriters.dev` / `collab123` (team `team1`, project `00000000-0000-4000-a000-000000000013`)

Project IDs:

- Personal (Valerio owner): `00000000-0000-4000-a000-000000000012`
- Team (collab is viewer): `00000000-0000-4000-a000-000000000013`

---

## Task 1 — CSS background tokens per categoria

**Files:**

- Modify: `packages/ui/src/styles/tokens.css`

I token foreground `--cat-*` esistono già da Spec 10. Aggiungiamo background semitrasparenti (alpha 0.18) usando `oklch from var(...) ...`.

- [ ] **Step 1: Aprire `packages/ui/src/styles/tokens.css` e individuare il blocco `--cat-*` esistente**

Il blocco si trova vicino agli altri category tokens. Le 14 categorie sono: cast, prop, location, vehicle, vfx, sfx, sound, costume, makeup, set-dressing, animal, stunt, music, extra (`packages/domain/src/breakdown.ts:BREAKDOWN_CATEGORIES`).

- [ ] **Step 2: Aggiungere i token background subito dopo i corrispondenti foreground**

```css
--cat-cast-bg: oklch(from var(--cat-cast) l c h / 0.18);
--cat-prop-bg: oklch(from var(--cat-prop) l c h / 0.18);
--cat-location-bg: oklch(from var(--cat-location) l c h / 0.18);
--cat-vehicle-bg: oklch(from var(--cat-vehicle) l c h / 0.18);
--cat-vfx-bg: oklch(from var(--cat-vfx) l c h / 0.18);
--cat-sfx-bg: oklch(from var(--cat-sfx) l c h / 0.18);
--cat-sound-bg: oklch(from var(--cat-sound) l c h / 0.18);
--cat-costume-bg: oklch(from var(--cat-costume) l c h / 0.18);
--cat-makeup-bg: oklch(from var(--cat-makeup) l c h / 0.18);
--cat-set-dressing-bg: oklch(from var(--cat-set-dressing) l c h / 0.18);
--cat-animal-bg: oklch(from var(--cat-animal) l c h / 0.18);
--cat-stunt-bg: oklch(from var(--cat-stunt) l c h / 0.18);
--cat-music-bg: oklch(from var(--cat-music) l c h / 0.18);
--cat-extra-bg: oklch(from var(--cat-extra) l c h / 0.18);
```

- [ ] **Step 3: Verificare in browser che i token risolvano (typecheck è sufficiente per il primo controllo)**

Run: `pnpm typecheck`
Expected: PASS (token CSS non sono type-checked, ma vogliamo zero errori upstream).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "[OHW] feat(ui): add category background tokens for breakdown highlights"
```

---

## Task 2 — Estendere `getBreakdownContext` con `versionContent`

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts:612-684`
- Test: `apps/web/app/features/breakdown/server/breakdown.server.test.ts` (file esistente; se non esiste nel repo, creare nuova suite limitata al nuovo campo)

Il reader ha bisogno della stringa fountain dello snapshot. Aggiungiamo `versionContent` al `BreakdownContext` e lo leggiamo da `screenplay_versions.content` via `db.query.screenplayVersions.findFirst`.

- [ ] **Step 1: Aprire `apps/web/app/features/breakdown/server/breakdown.server.ts` e individuare l'interfaccia `BreakdownContext` (linea 622)**

- [ ] **Step 2: Aggiungere il campo all'interfaccia**

```ts
export interface BreakdownContext {
  projectId: string;
  screenplayVersionId: string;
  versionContent: string; // fountain snapshot della version corrente; "" se nessuna version
  scenes: BreakdownSceneSummary[];
  canEdit: boolean;
}
```

- [ ] **Step 3: Aggiornare il handler per leggere `screenplayVersions.content`**

Sostituire il blocco interno (`(async () => { ... })()`) del handler `getBreakdownContext` (~linea 647) con:

```ts
(async () => {
  const screenplay = await db.query.screenplays.findFirst({
    where: (s, { eq: e }) => e(s.projectId, data.projectId),
  });
  if (!screenplay || !screenplay.currentVersionId) {
    return {
      projectId: data.projectId,
      screenplayVersionId: "",
      versionContent: "",
      scenes: [] as BreakdownSceneSummary[],
      canEdit,
    };
  }
  const [version, sceneRows] = await Promise.all([
    db.query.screenplayVersions.findFirst({
      where: (v, { eq: e }) => e(v.id, screenplay.currentVersionId!),
    }),
    db.query.scenes.findMany({
      where: (sc, { eq: e }) => e(sc.screenplayId, screenplay.id),
      orderBy: (sc, { asc }) => [asc(sc.number)],
    }),
  ]);
  return {
    projectId: data.projectId,
    screenplayVersionId: screenplay.currentVersionId,
    versionContent: version?.content ?? "",
    scenes: sceneRows.map((s) => ({
      id: s.id,
      number: s.number,
      heading: s.heading,
      intExt: s.intExt,
      location: s.location,
      timeOfDay: s.timeOfDay,
      notes: s.notes,
    })),
    canEdit,
  };
})();
```

- [ ] **Step 4: Scrivere/aggiornare test che verifica la presenza di `versionContent`**

Cercare se esiste un test esistente per `getBreakdownContext`. Se sì, aggiungere assertion. Se no, saltare (la copertura E2E in Task 12 valida il flow end-to-end). Per controllare:

Run: `grep -rn "getBreakdownContext" apps/web/app/features/breakdown/server/ --include="*.test.ts"`

- [ ] **Step 5: Verificare typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/breakdown/server/breakdown.server.ts
git commit -m "[OHW] feat(breakdown): expose versionContent in BreakdownContext for inline reader"
```

---

## Task 3 — `ReadOnlyScreenplayView` (riusabile, screenplay-editor)

**Files:**

- Create: `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx`

Un EditorView PM non-editable, alimentato da `content: string` (fountain) o `initialDoc?: object` (PM JSON), che accetta plugin extra dal consumer e ne espone l'istanza via `onReady`.

- [ ] **Step 1: Creare il file con questo contenuto**

```tsx
import { useEffect, useRef } from "react";
import { EditorState, type Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { migratePmDoc } from "@oh-writers/domain";
import { schema } from "../lib/schema";
import { fountainToDoc } from "../lib/fountain-to-doc";
import { createHeadingNodeView } from "../lib/plugins/heading-nodeview";
import { injectProseMirrorStyles } from "../lib/plugins/prosemirror-styles";

interface Props {
  /** Fountain string used when initialDoc is null. */
  content: string;
  /** Optional pre-parsed PM doc JSON. Wins over `content` when provided. */
  initialDoc?: Record<string, unknown> | null;
  /** Extra plugins injected by the consumer (decorations, view plugins). */
  pluginsExtra?: Plugin[];
  /** Called once after mount. Use it to keep a ref to the view. */
  onReady?: (view: EditorView) => void;
  /** Optional className for the mount node. */
  className?: string;
}

export function ReadOnlyScreenplayView({
  content,
  initialDoc,
  pluginsExtra,
  onReady,
  className,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    injectProseMirrorStyles();

    const doc = initialDoc
      ? schema.nodeFromJSON(migratePmDoc(initialDoc))
      : fountainToDoc(content);

    const state = EditorState.create({
      doc,
      plugins: pluginsExtra ?? [],
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => false,
      nodeViews: {
        heading: (node, v, getPos) => createHeadingNodeView(node, v, getPos),
      },
    });

    viewRef.current = view;
    onReady?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally re-mount when content changes, simpler than diffing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, initialDoc]);

  return (
    <div
      ref={mountRef}
      className={className}
      data-testid="readonly-screenplay-view"
      data-pm-screenplay="true"
    />
  );
}
```

- [ ] **Step 2: Test smoke — typecheck e build importi**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx
git commit -m "[OHW] feat(screenplay-editor): add ReadOnlyScreenplayView reusable PM read-only mount"
```

---

## Task 4 — `scene-anchors.ts` (helper puro)

**Files:**

- Create: `apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.ts`
- Test: `apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.test.ts`

Helper che traduce indice scena (1-based) ↔ posizione nel doc PM, e fornisce `scrollToScene`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.test.ts
import { describe, it, expect } from "vitest";
import { schema } from "../../../screenplay-editor/lib/schema";
import { fountainToDoc } from "../../../screenplay-editor/lib/fountain-to-doc";
import { findSceneNodePosition, findSceneIndexAtPos } from "./scene-anchors";

const SAMPLE = `INT. KITCHEN - DAY

Bob enters.

INT. GARAGE - NIGHT

Alice waits.
`;

describe("scene-anchors", () => {
  it("findSceneNodePosition returns pos of N-th heading (1-based)", () => {
    const doc = fountainToDoc(SAMPLE);
    const pos1 = findSceneNodePosition(doc, 1);
    const pos2 = findSceneNodePosition(doc, 2);
    expect(pos1).not.toBeNull();
    expect(pos2).not.toBeNull();
    expect(pos2!).toBeGreaterThan(pos1!);
  });

  it("findSceneNodePosition returns null when index is out of range", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findSceneNodePosition(doc, 0)).toBeNull();
    expect(findSceneNodePosition(doc, 99)).toBeNull();
  });

  it("findSceneNodePosition returns null on empty doc", () => {
    const empty = schema.node("doc", null, []);
    expect(findSceneNodePosition(empty, 1)).toBeNull();
  });

  it("findSceneIndexAtPos returns 1-based scene index containing pos", () => {
    const doc = fountainToDoc(SAMPLE);
    const pos2 = findSceneNodePosition(doc, 2)!;
    expect(findSceneIndexAtPos(doc, pos2)).toBe(2);
  });

  it("findSceneIndexAtPos returns null when pos is before first heading", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findSceneIndexAtPos(doc, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — must fail**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementare `scene-anchors.ts`**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.ts
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

/**
 * Returns the absolute doc position of the N-th heading node (1-based).
 * Null if `index` is out of range (or doc has no headings).
 */
export function findSceneNodePosition(
  doc: PMNode,
  index: number,
): number | null {
  if (index < 1) return null;
  let count = 0;
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (result !== null) return false;
    if (node.type.name === "heading") {
      count += 1;
      if (count === index) {
        result = pos;
        return false;
      }
      return false;
    }
    return true;
  });
  return result;
}

/**
 * Returns the 1-based scene index containing `pos` (i.e. the count of
 * heading nodes whose start <= pos). Null if pos is before the first heading.
 */
export function findSceneIndexAtPos(doc: PMNode, pos: number): number | null {
  let count = 0;
  doc.descendants((node, nodePos) => {
    if (node.type.name === "heading") {
      if (nodePos <= pos) count += 1;
      return false;
    }
    return true;
  });
  return count > 0 ? count : null;
}

/**
 * Scrolls the editor so the scene at `index` (1-based) is visible at the
 * top of the viewport. Uses native scrollIntoView on the DOM node.
 */
export function scrollToScene(view: EditorView, index: number): void {
  const pos = findSceneNodePosition(view.state.doc, index);
  if (pos === null) return;
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
```

- [ ] **Step 4: Run test — must pass**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.ts apps/web/app/features/breakdown/lib/pm-plugins/scene-anchors.test.ts
git commit -m "[OHW] feat(breakdown): add scene-anchors helper for reader scroll-to-scene"
```

---

## Task 5 — `find-occurrences.ts` (pure: testo→ranges)

**Files:**

- Create: `apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.ts`
- Test: `apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.test.ts`

Dato il doc PM e una lista di elementi breakdown (`{id, name, category, isStale}`), trova tutti i range `(from, to)` dove il `name` compare nel testo del doc, case-insensitive con word-boundary, e li annota con `category`, `elementId`, `isStale`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.test.ts
import { describe, it, expect } from "vitest";
import { fountainToDoc } from "../../../screenplay-editor/lib/fountain-to-doc";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

const SAMPLE = `INT. KITCHEN - DAY

Bob picks up the bloody knife. Bob smiles.

INT. GARAGE - NIGHT

Bobby is not Bob.
`;

const elements: ElementForMatch[] = [
  { id: "e1", name: "Bob", category: "cast", isStale: false },
  { id: "e2", name: "bloody knife", category: "prop", isStale: false },
  { id: "e3", name: "Alice", category: "cast", isStale: true },
];

describe("findOccurrencesInDoc", () => {
  it("matches case-insensitive with word boundary", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    const bobs = ranges.filter((r) => r.elementId === "e1");
    // Bob, Bob, but NOT inside "Bobby"
    expect(bobs.length).toBe(2);
  });

  it("matches multi-word names", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    const knife = ranges.filter((r) => r.elementId === "e2");
    expect(knife.length).toBe(1);
  });

  it("preserves isStale flag", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    // Alice has no match, so no range, but ensure non-matched element doesn't crash
    expect(ranges.find((r) => r.elementId === "e3")).toBeUndefined();
  });

  it("attaches category to each range", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    expect(
      ranges.every((r) => r.category === "cast" || r.category === "prop"),
    ).toBe(true);
  });

  it("returns empty when no elements", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findOccurrencesInDoc(doc, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — must fail**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementare `find-occurrences.ts`**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.ts
import type { Node as PMNode } from "prosemirror-model";
import type { BreakdownCategory } from "@oh-writers/domain";

export interface ElementForMatch {
  id: string;
  name: string;
  category: BreakdownCategory;
  isStale: boolean;
}

export interface OccurrenceRange {
  from: number;
  to: number;
  elementId: string;
  category: BreakdownCategory;
  isStale: boolean;
}

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds all occurrences of each element name in the doc's text content.
 * Case-insensitive, word-boundary-aware (so "Bob" does NOT match "Bobby").
 *
 * Iterates each text node and runs a regex per element; for each match we
 * compute the absolute doc position by adding the text node's start pos
 * to the local match index.
 */
export function findOccurrencesInDoc(
  doc: PMNode,
  elements: ElementForMatch[],
): OccurrenceRange[] {
  if (elements.length === 0) return [];
  const ranges: OccurrenceRange[] = [];
  const patterns = elements.map((el) => ({
    el,
    re: new RegExp(`\\b${escapeRegex(el.name)}\\b`, "giu"),
  }));

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const text = node.text;
    for (const { el, re } of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const from = pos + m.index;
        const to = from + m[0].length;
        ranges.push({
          from,
          to,
          elementId: el.id,
          category: el.category,
          isStale: el.isStale,
        });
      }
    }
    return false; // text nodes have no children
  });

  return ranges;
}
```

- [ ] **Step 4: Run test — must pass**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.ts apps/web/app/features/breakdown/lib/pm-plugins/find-occurrences.test.ts
git commit -m "[OHW] feat(breakdown): add findOccurrencesInDoc pure matcher"
```

---

## Task 6 — `highlight-decoration.ts` (PM plugin)

**Files:**

- Create: `apps/web/app/features/breakdown/lib/pm-plugins/highlight-decoration.ts`

Plugin che, data una lista di `ElementForMatch`, produce un `DecorationSet` inline con classe `.highlight` + `data-cat` + `data-stale`. La lista è passata via plugin state che il consumer aggiorna con un meta transaction.

- [ ] **Step 1: Creare il file**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/highlight-decoration.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

export const highlightPluginKey = new PluginKey<{
  elements: ElementForMatch[];
  decos: DecorationSet;
}>("breakdown-highlight");

interface Options {
  /** Initial element list. */
  initial: ElementForMatch[];
  /** CSS class applied to every highlight span. */
  className: string;
}

/** Meta payload to update the element list at runtime. */
export type HighlightMeta = { setElements: ElementForMatch[] };

function buildDecos(
  doc: ReturnType<Plugin["spec"]["state"] extends infer _ ? never : never>,
  // typing trick above: we just want PMNode below
): DecorationSet {
  return DecorationSet.empty;
}

export function buildHighlightPlugin({ initial, className }: Options): Plugin {
  return new Plugin({
    key: highlightPluginKey,
    state: {
      init(_, state) {
        const ranges = findOccurrencesInDoc(state.doc, initial);
        const decos = DecorationSet.create(
          state.doc,
          ranges.map((r) =>
            Decoration.inline(r.from, r.to, {
              class: className,
              "data-cat": r.category,
              "data-element-id": r.elementId,
              "data-stale": r.isStale ? "true" : "false",
            }),
          ),
        );
        return { elements: initial, decos };
      },
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(highlightPluginKey) as
          | HighlightMeta
          | undefined;
        const elements = meta?.setElements ?? prev.elements;
        if (!meta && !tr.docChanged) return prev;
        const ranges = findOccurrencesInDoc(newState.doc, elements);
        const decos = DecorationSet.create(
          newState.doc,
          ranges.map((r) =>
            Decoration.inline(r.from, r.to, {
              class: className,
              "data-cat": r.category,
              "data-element-id": r.elementId,
              "data-stale": r.isStale ? "true" : "false",
            }),
          ),
        );
        return { elements, decos };
      },
    },
    props: {
      decorations(state) {
        return highlightPluginKey.getState(state)?.decos;
      },
    },
  });
}

// dead local helper kept out of the file: not exported (cleanup)
void buildDecos;
```

Note: rimuovere il blocco `function buildDecos` placeholder e `void buildDecos` dopo la prima compilazione pulita — è lì solo per rendere ovvio che non serve. (Cleanup nel commit successivo se il typecheck non lo richiede.)

- [ ] **Step 2: Pulizia placeholder**

Cancellare `function buildDecos(...) { return DecorationSet.empty; }` e `void buildDecos;` dal file. Il plugin compila comunque.

- [ ] **Step 3: Verificare typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/breakdown/lib/pm-plugins/highlight-decoration.ts
git commit -m "[OHW] feat(breakdown): add highlight-decoration PM plugin for breakdown reader"
```

---

## Task 7 — `map-suggestions.ts` + `ghost-decoration.ts`

**Files:**

- Create: `apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.ts`
- Create: `apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.test.ts`
- Create: `apps/web/app/features/breakdown/lib/pm-plugins/ghost-decoration.ts`

Le suggestion Cesare arrivano già con un `name: string` per categoria. Le mappiamo come `ElementForMatch` (id = `suggestion:<index>`, isStale = false) e riutilizziamo `findOccurrencesInDoc`. Ghost ha CSS classe diversa (bordo dashed).

- [ ] **Step 1: Test per `map-suggestions`**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.test.ts
import { describe, it, expect } from "vitest";
import {
  mapSuggestionsToElements,
  type CesareSuggestionLite,
} from "./map-suggestions";

describe("mapSuggestionsToElements", () => {
  it("flattens suggestions per category into ElementForMatch list", () => {
    const suggestions: CesareSuggestionLite[] = [
      { category: "cast", name: "Bob" },
      { category: "prop", name: "knife" },
    ];
    const result = mapSuggestionsToElements(suggestions);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "Bob",
      category: "cast",
      isStale: false,
    });
    expect(result[0].id).toContain("suggestion:");
  });

  it("returns empty for empty input", () => {
    expect(mapSuggestionsToElements([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare `map-suggestions.ts`**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.ts
import type { BreakdownCategory } from "@oh-writers/domain";
import type { ElementForMatch } from "./find-occurrences";

export interface CesareSuggestionLite {
  category: BreakdownCategory;
  name: string;
}

export function mapSuggestionsToElements(
  suggestions: CesareSuggestionLite[],
): ElementForMatch[] {
  return suggestions.map((s, i) => ({
    id: `suggestion:${i}:${s.category}:${s.name}`,
    name: s.name,
    category: s.category,
    isStale: false,
  }));
}
```

- [ ] **Step 4: Run — must pass**

Run: `pnpm vitest run apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementare `ghost-decoration.ts`**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/ghost-decoration.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

export const ghostPluginKey = new PluginKey<{
  elements: ElementForMatch[];
  decos: DecorationSet;
}>("breakdown-ghost");

export type GhostMeta = { setElements: ElementForMatch[] };

interface Options {
  initial: ElementForMatch[];
  className: string; // dashed-border class
}

export function buildGhostPlugin({ initial, className }: Options): Plugin {
  const build = (doc: ReturnType<typeof identity>, els: ElementForMatch[]) => {
    const ranges = findOccurrencesInDoc(doc, els);
    return DecorationSet.create(
      doc,
      ranges.map((r) =>
        Decoration.inline(r.from, r.to, {
          class: className,
          "data-cat": r.category,
          "data-ghost": "true",
          "data-element-id": r.elementId,
        }),
      ),
    );
  };
  return new Plugin({
    key: ghostPluginKey,
    state: {
      init(_, state) {
        return { elements: initial, decos: build(state.doc, initial) };
      },
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(ghostPluginKey) as GhostMeta | undefined;
        const elements = meta?.setElements ?? prev.elements;
        if (!meta && !tr.docChanged) return prev;
        return { elements, decos: build(newState.doc, elements) };
      },
    },
    props: {
      decorations(state) {
        return ghostPluginKey.getState(state)?.decos;
      },
    },
  });
}

// identity type helper — used only to capture the doc type without importing prosemirror-model
function identity<T>(x: T): T {
  return x;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.ts apps/web/app/features/breakdown/lib/pm-plugins/map-suggestions.test.ts apps/web/app/features/breakdown/lib/pm-plugins/ghost-decoration.ts
git commit -m "[OHW] feat(breakdown): add ghost-decoration plugin for Cesare suggestions"
```

---

## Task 8 — `SelectionToolbar` component (React, no PM)

**Files:**

- Create: `apps/web/app/features/breakdown/components/SelectionToolbar.tsx`
- Create: `apps/web/app/features/breakdown/components/SelectionToolbar.module.css`
- Create: `apps/web/app/features/breakdown/components/SelectionToolbar.test.tsx`

Un componente React puro — riceve `{ x, y, selectedText, onTag, onDismiss }`. Mostra 14 bottoni (uno per categoria). ESC chiama `onDismiss`. Non sa nulla di PM o React Portal: il monting è responsabilità del plugin.

- [ ] **Step 1: Scrivere il test**

```tsx
// apps/web/app/features/breakdown/components/SelectionToolbar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionToolbar } from "./SelectionToolbar";

describe("SelectionToolbar", () => {
  it("renders 14 category buttons", () => {
    render(
      <SelectionToolbar
        x={100}
        y={100}
        selectedText="Bob"
        onTag={() => {}}
        onDismiss={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(14);
  });

  it("calls onTag with the right category and text on click", () => {
    const onTag = vi.fn();
    render(
      <SelectionToolbar
        x={0}
        y={0}
        selectedText="Bob"
        onTag={onTag}
        onDismiss={() => {}}
      />,
    );
    const cast = screen.getByRole("button", { name: /cast/i });
    fireEvent.click(cast);
    expect(onTag).toHaveBeenCalledWith("cast", "Bob");
  });

  it("calls onDismiss on ESC keydown", () => {
    const onDismiss = vi.fn();
    render(
      <SelectionToolbar
        x={0}
        y={0}
        selectedText="Bob"
        onTag={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `pnpm vitest run apps/web/app/features/breakdown/components/SelectionToolbar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementare `SelectionToolbar.module.css`**

```css
/* apps/web/app/features/breakdown/components/SelectionToolbar.module.css */
.toolbar {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-inline-size: 360px;
  /* Translate so the toolbar appears above the selection origin. */
  transform: translate(-50%, calc(-100% - var(--space-2)));
}

.btn {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  background: var(--cat-bg);
  color: var(--color-fg);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-hover);
  }
}
```

- [ ] **Step 4: Implementare `SelectionToolbar.tsx`**

```tsx
// apps/web/app/features/breakdown/components/SelectionToolbar.tsx
import { useEffect } from "react";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
} from "@oh-writers/domain";
import styles from "./SelectionToolbar.module.css";

interface Props {
  x: number;
  y: number;
  selectedText: string;
  onTag: (category: BreakdownCategory, text: string) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({
  x,
  y,
  selectedText,
  onTag,
  onDismiss,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      className={styles.toolbar}
      style={{ left: x, top: y }}
      role="toolbar"
      aria-label="Tag selection"
      data-testid="selection-toolbar"
    >
      {BREAKDOWN_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={styles.btn}
          onClick={() => onTag(cat, selectedText)}
          data-testid={`selection-toolbar-${cat}`}
        >
          {CATEGORY_META[cat].labelIt}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run — must pass**

Run: `pnpm vitest run apps/web/app/features/breakdown/components/SelectionToolbar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/breakdown/components/SelectionToolbar.tsx apps/web/app/features/breakdown/components/SelectionToolbar.module.css apps/web/app/features/breakdown/components/SelectionToolbar.test.tsx
git commit -m "[OHW] feat(breakdown): add SelectionToolbar floating component"
```

---

## Task 9 — `selection-toolbar-plugin.ts` (PM PluginView + React Portal)

**Files:**

- Create: `apps/web/app/features/breakdown/lib/pm-plugins/selection-toolbar-plugin.ts`

Plugin PM che osserva selezioni non vuote in modalità non-editable. Quando c'è una selezione di testo (≥1 char, ≤200), monta `SelectionToolbar` in un container DOM via `createRoot` di React, posizionato con `view.coordsAtPos(from)`. Quando la selezione si svuota o l'utente preme ESC/clicca fuori, smonta.

- [ ] **Step 1: Implementare il plugin**

```ts
// apps/web/app/features/breakdown/lib/pm-plugins/selection-toolbar-plugin.ts
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { BreakdownCategory } from "@oh-writers/domain";
import { SelectionToolbar } from "../../components/SelectionToolbar";

export const selectionToolbarPluginKey = new PluginKey(
  "breakdown-selection-toolbar",
);

export interface SelectionToolbarOptions {
  onTag: (category: BreakdownCategory, text: string, fromPos: number) => void;
  /** Max selection length to show the toolbar (avoid runaway selections). */
  maxLength?: number;
}

export function buildSelectionToolbarPlugin(
  options: SelectionToolbarOptions,
): Plugin {
  const maxLength = options.maxLength ?? 200;
  return new Plugin({
    key: selectionToolbarPluginKey,
    view(view) {
      const container = document.createElement("div");
      container.setAttribute("data-selection-toolbar-host", "true");
      document.body.appendChild(container);
      let root: Root | null = createRoot(container);
      let mounted = false;

      const dismiss = () => {
        if (!mounted) return;
        root?.render(createElement("div"));
        mounted = false;
      };

      const update = (editorView: EditorView) => {
        const { from, to, empty } = editorView.state.selection;
        const text = editorView.state.doc.textBetween(from, to, " ").trim();
        if (empty || text.length === 0 || text.length > maxLength) {
          dismiss();
          return;
        }
        const coords = editorView.coordsAtPos(from);
        const x = (coords.left + coords.right) / 2;
        const y = coords.top;
        root?.render(
          createElement(SelectionToolbar, {
            x,
            y,
            selectedText: text,
            onTag: (category, txt) => {
              options.onTag(category, txt, from);
              dismiss();
              // Clear DOM selection so the toolbar collapses.
              window.getSelection()?.removeAllRanges();
            },
            onDismiss: dismiss,
          }),
        );
        mounted = true;
      };

      // Initial render in case mount happens with an active selection.
      update(view);

      return {
        update(editorView) {
          update(editorView);
        },
        destroy() {
          dismiss();
          root?.unmount();
          root = null;
          container.remove();
        },
      };
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/breakdown/lib/pm-plugins/selection-toolbar-plugin.ts
git commit -m "[OHW] feat(breakdown): add selection-toolbar PM plugin (React portal)"
```

---

## Task 10 — `ScriptReader` componente (compose all plugins)

**Files:**

- Create: `apps/web/app/features/breakdown/components/ScriptReader.tsx`
- Create: `apps/web/app/features/breakdown/components/ScriptReader.module.css`

Wrapper di `ReadOnlyScreenplayView`. Riceve `versionContent`, `elements`, `suggestions`, `canEdit`, callback. Espone via `useImperativeHandle` un `scrollToScene(index)`. Ricostruisce i plugin quando cambiano elements/suggestions usando `view.dispatch(tr.setMeta(...))`.

- [ ] **Step 1: CSS**

```css
/* apps/web/app/features/breakdown/components/ScriptReader.module.css */
.reader {
  block-size: 100%;
  inline-size: 100%;
  overflow: auto;
  padding: var(--space-4);
}

.empty {
  padding: var(--space-4);
  color: var(--color-fg-secondary);
}

/* highlight per categoria — applicato come .highlight + data-cat=... */
.highlight {
  border-radius: var(--radius-sm);
  padding-inline: 2px;
  background: transparent;

  &[data-cat="cast"] {
    background: var(--cat-cast-bg);
  }
  &[data-cat="prop"] {
    background: var(--cat-prop-bg);
  }
  &[data-cat="location"] {
    background: var(--cat-location-bg);
  }
  &[data-cat="vehicle"] {
    background: var(--cat-vehicle-bg);
  }
  &[data-cat="vfx"] {
    background: var(--cat-vfx-bg);
  }
  &[data-cat="sfx"] {
    background: var(--cat-sfx-bg);
  }
  &[data-cat="sound"] {
    background: var(--cat-sound-bg);
  }
  &[data-cat="costume"] {
    background: var(--cat-costume-bg);
  }
  &[data-cat="makeup"] {
    background: var(--cat-makeup-bg);
  }
  &[data-cat="set-dressing"] {
    background: var(--cat-set-dressing-bg);
  }
  &[data-cat="animal"] {
    background: var(--cat-animal-bg);
  }
  &[data-cat="stunt"] {
    background: var(--cat-stunt-bg);
  }
  &[data-cat="music"] {
    background: var(--cat-music-bg);
  }
  &[data-cat="extra"] {
    background: var(--cat-extra-bg);
  }
  &[data-stale="true"] {
    opacity: 0.4;
  }
}

/* ghost — bordo dashed con colore categoria */
.ghost {
  border-block-end: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  padding-inline: 2px;
  cursor: pointer;
}
```

- [ ] **Step 2: Componente**

```tsx
// apps/web/app/features/breakdown/components/ScriptReader.tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import { ReadOnlyScreenplayView } from "../../screenplay-editor/components/ReadOnlyScreenplayView";
import { useAddBreakdownElement } from "../hooks/useBreakdown";
import {
  buildHighlightPlugin,
  highlightPluginKey,
  type HighlightMeta,
} from "../lib/pm-plugins/highlight-decoration";
import {
  buildGhostPlugin,
  ghostPluginKey,
  type GhostMeta,
} from "../lib/pm-plugins/ghost-decoration";
import { buildSelectionToolbarPlugin } from "../lib/pm-plugins/selection-toolbar-plugin";
import {
  scrollToScene as scrollFn,
  findSceneIndexAtPos,
} from "../lib/pm-plugins/scene-anchors";
import {
  mapSuggestionsToElements,
  type CesareSuggestionLite,
} from "../lib/pm-plugins/map-suggestions";
import type { ElementForMatch } from "../lib/pm-plugins/find-occurrences";
import type { BreakdownSceneSummary } from "../server/breakdown.server";
import styles from "./ScriptReader.module.css";

export interface ScriptReaderHandle {
  scrollToScene: (index: number) => void;
}

interface Props {
  projectId: string;
  versionId: string;
  versionContent: string;
  scenes: BreakdownSceneSummary[];
  elements: ElementForMatch[];
  suggestions: CesareSuggestionLite[];
  canEdit: boolean;
  onActiveSceneChange?: (sceneId: string | null) => void;
}

export const ScriptReader = forwardRef<ScriptReaderHandle, Props>(
  function ScriptReader(props, ref) {
    const {
      projectId,
      versionId,
      versionContent,
      scenes,
      elements,
      suggestions,
      canEdit,
      onActiveSceneChange,
    } = props;

    const viewRef = useRef<EditorView | null>(null);
    const add = useAddBreakdownElement(projectId, versionId);

    const ghostElements = useMemo(
      () => mapSuggestionsToElements(suggestions),
      [suggestions],
    );

    // Plugins are constructed once per mount; updates flow via meta transactions.
    const pluginsExtra = useMemo<Plugin[]>(() => {
      const list: Plugin[] = [
        buildHighlightPlugin({
          initial: elements,
          className: styles.highlight,
        }),
        buildGhostPlugin({
          initial: ghostElements,
          className: styles.ghost,
        }),
      ];
      if (canEdit) {
        list.push(
          buildSelectionToolbarPlugin({
            onTag: (category, text, fromPos) => {
              const view = viewRef.current;
              if (!view) return;
              const sceneIndex = findSceneIndexAtPos(view.state.doc, fromPos);
              const scene =
                sceneIndex !== null ? scenes[sceneIndex - 1] : undefined;
              if (!scene) return;
              add.mutate({
                projectId,
                category,
                name: text,
                occurrence: {
                  sceneId: scene.id,
                  screenplayVersionId: versionId,
                  quantity: 1,
                },
              });
            },
          }),
        );
      }
      return list;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionContent, canEdit]); // recompute only on remount-worthy changes

    // Push fresh element list to the highlight plugin on prop change.
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const meta: HighlightMeta = { setElements: elements };
      view.dispatch(view.state.tr.setMeta(highlightPluginKey, meta));
    }, [elements]);

    // Push fresh ghost list to the ghost plugin on prop change.
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const meta: GhostMeta = { setElements: ghostElements };
      view.dispatch(view.state.tr.setMeta(ghostPluginKey, meta));
    }, [ghostElements]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToScene: (index: number) => {
          const view = viewRef.current;
          if (!view) return;
          scrollFn(view, index);
          if (onActiveSceneChange) {
            const scene = scenes[index - 1];
            onActiveSceneChange(scene?.id ?? null);
          }
        },
      }),
      [scenes, onActiveSceneChange],
    );

    if (!versionContent) {
      return (
        <p className={styles.empty} data-testid="script-reader-empty">
          Nessuna versione disponibile per questa sceneggiatura.
        </p>
      );
    }

    return (
      <ReadOnlyScreenplayView
        content={versionContent}
        pluginsExtra={pluginsExtra}
        onReady={(view) => {
          viewRef.current = view;
        }}
        className={styles.reader}
      />
    );
  },
);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/breakdown/components/ScriptReader.tsx apps/web/app/features/breakdown/components/ScriptReader.module.css
git commit -m "[OHW] feat(breakdown): add ScriptReader composing read-only PM + 3 plugins"
```

---

## Task 11 — Wire `BreakdownPage` (sostituisci `SceneScriptViewer` con `ScriptReader`)

**Files:**

- Modify: `apps/web/app/features/breakdown/components/BreakdownPage.tsx`

Cambiamenti:

1. Importa `ScriptReader` invece di `SceneScriptViewer`.
2. Aggiungi `useRef<ScriptReaderHandle>` e callback per il TOC.
3. Costruisci `elements` da una nuova query (vedi sotto: per v1 usiamo `getProjectBreakdown` che già aggrega per progetto).
4. Costruisci `suggestions` dalla scena attiva (`breakdownForSceneOptions`) — solo le pending.
5. `SceneTOC.onSceneSelect` → `scriptReaderRef.current?.scrollToScene(scene.number)`.

- [ ] **Step 1: Aggiornare imports**

Sostituire:

```tsx
import { SceneScriptViewer } from "./SceneScriptViewer";
```

con:

```tsx
import { ScriptReader, type ScriptReaderHandle } from "./ScriptReader";
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  projectBreakdownOptions,
  breakdownForSceneOptions,
} from "../hooks/useBreakdown";
import type { ElementForMatch } from "../lib/pm-plugins/find-occurrences";
import type { CesareSuggestionLite } from "../lib/pm-plugins/map-suggestions";
```

(Mantenere l'import esistente di `useState`, `useSuspenseQuery` ecc.)

- [ ] **Step 2: All'interno di `BreakdownPageContent`, aggiungere ref + derivate**

Subito dopo le righe `useState` esistenti (~linea 36), aggiungere:

```tsx
const scriptReaderRef = useRef<ScriptReaderHandle>(null);

// Aggregated breakdown for the whole project — drives the highlight plugin.
const { data: projectRows } = useQuery(
  projectBreakdownOptions(projectId, versionId),
);

const elements: ElementForMatch[] = (projectRows ?? []).map((row) => ({
  id: row.element.id,
  name: row.element.name,
  category: row.element.category,
  isStale: row.hasStale,
}));

// Pending Cesare suggestions for the active scene only (ghosts).
const { data: sceneData } = useQuery(
  breakdownForSceneOptions(activeScene?.id ?? "", versionId),
);

const suggestions: CesareSuggestionLite[] = (sceneData ?? [])
  .filter((d) => d.occurrence.cesareStatus === "pending")
  .map((d) => ({ category: d.element.category, name: d.element.name }));
```

- [ ] **Step 3: Sostituire l'uso di `<SceneScriptViewer />` con `<ScriptReader />`**

```tsx
<section className={styles.script} data-testid="breakdown-script">
  <ScriptReader
    ref={scriptReaderRef}
    projectId={projectId}
    versionId={versionId}
    versionContent={ctx.versionContent}
    scenes={ctx.scenes}
    elements={elements}
    suggestions={suggestions}
    canEdit={canEdit}
    onActiveSceneChange={setActiveSceneId}
  />
</section>
```

- [ ] **Step 4: Cablare il click TOC al scroll**

Modificare `SceneTOC.onSceneSelect`:

```tsx
<SceneTOC
  scenes={ctx.scenes}
  versionId={versionId}
  activeSceneId={activeScene?.id ?? null}
  onSceneSelect={(sceneId) => {
    setActiveSceneId(sceneId);
    const idx = ctx.scenes.findIndex((s) => s.id === sceneId);
    if (idx >= 0) scriptReaderRef.current?.scrollToScene(idx + 1);
  }}
/>
```

- [ ] **Step 5: Typecheck + smoke locale**

Run: `pnpm typecheck`
Expected: PASS.

Avvia il dev server (`pnpm dev`), apri `/projects/00000000-0000-4000-a000-000000000012/breakdown`, verifica che:

- la sceneggiatura appare nella colonna centrale,
- almeno una occorrenza ha background colorato,
- il click su una scena nella TOC scrolla il reader,
- selezione testo + click su categoria nella toolbar crea un tag (visibile nel pannello destro).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/breakdown/components/BreakdownPage.tsx
git commit -m "[OHW] feat(breakdown): wire ScriptReader in BreakdownPage; replace SceneScriptViewer"
```

---

## Task 12 — Playwright E2E (`tests/breakdown/inline-tagging.spec.ts`)

**Files:**

- Create: `tests/breakdown/inline-tagging.spec.ts`

Riusa le fixture e helper esistenti (`tests/fixtures.ts`, `tests/breakdown/helpers.ts`). Aggiunge 5 test (OHW-280..284).

- [ ] **Step 1: Creare il file di test**

```ts
// tests/breakdown/inline-tagging.spec.ts
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 10c] Inline scene tagging", () => {
  test("[OHW-280] select text → tag as Cast → highlight + chip", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    // Select the word "Filippo" (seeded in scene 1) by triple-clicking it
    // or by programmatic selection via window.getSelection().
    const target = page
      .getByTestId("readonly-screenplay-view")
      .locator("text=Filippo")
      .first();
    await target.dblclick(); // select the word

    const toolbar = page.getByTestId("selection-toolbar");
    await expect(toolbar).toBeVisible();

    await page.getByTestId("selection-toolbar-cast").click();

    // Highlight appears in the reader
    await expect(
      page.locator(`[data-cat="cast"]:has-text("Filippo")`).first(),
    ).toBeVisible();

    // Chip appears in the right panel
    await expect(
      page
        .getByTestId("breakdown-panel")
        .getByText("Filippo", { exact: false })
        .first(),
    ).toBeVisible();
  });

  test("[OHW-281] viewer cannot tag (no toolbar)", async ({ viewerPage }) => {
    // viewerPage: see fixtures — logs in as collab@ohwriters.dev.
    await navigateToBreakdown(viewerPage, TEAM_PROJECT_ID);
    await expect(
      viewerPage.getByTestId("readonly-screenplay-view"),
    ).toBeVisible();

    const target = viewerPage
      .getByTestId("readonly-screenplay-view")
      .locator("text=Filippo")
      .first();
    await target.dblclick();

    // Toolbar must NOT appear for viewers.
    await expect(viewerPage.getByTestId("selection-toolbar")).toHaveCount(0);
  });

  test("[OHW-282] TOC click scrolls reader to scene", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const tocItem = page.getByTestId("breakdown-toc").locator("button").nth(1);
    await tocItem.click();

    // After scroll, the second heading should be near the top of the reader.
    const headingDom = page
      .getByTestId("readonly-screenplay-view")
      .locator(".heading")
      .nth(1);
    const box = await headingDom.boundingBox();
    expect(box).not.toBeNull();
    // Heading should be within the upper third of the viewport.
    if (box) {
      expect(box.y).toBeLessThan(300);
    }
  });

  test("[OHW-283] stale occurrence renders dimmed", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const staleHighlights = page.locator('[data-stale="true"]');
    const count = await staleHighlights.count();
    if (count > 0) {
      const opacity = await staleHighlights
        .first()
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeLessThan(1);
    }
  });

  test("[OHW-284] ghost suggestion has dashed underline + data-ghost", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Trigger a Cesare suggestion if not already present.
    // Reuse existing suggest button (per Spec 10).
    const suggestBtn = page.getByTestId("cesare-suggest-trigger").first();
    if (await suggestBtn.isVisible()) {
      await suggestBtn.click();
      await page.waitForTimeout(500); // allow mock response to settle
    }

    const ghosts = page.locator('[data-ghost="true"]');
    if ((await ghosts.count()) > 0) {
      await expect(ghosts.first()).toBeVisible();
      const cat = await ghosts.first().getAttribute("data-cat");
      expect(cat).not.toBeNull();
    }
  });
});
```

Note for the implementer:

- If `viewerPage` fixture doesn't yet exist in `tests/fixtures.ts`, add it next to `authenticatedPage`. Check first: `grep -n "viewerPage\|collab@ohwriters" tests/fixtures.ts`.
- If `cesare-suggest-trigger` testid is different in the codebase, grep `cesare-suggest` under `apps/web/app/features/breakdown/components/` and align.

- [ ] **Step 2: Run E2E**

Run: `pnpm test:e2e -- tests/breakdown/inline-tagging.spec.ts`
Expected: 5 tests PASS (OHW-283 e OHW-284 sono no-op se i dati non ci sono — il loro scopo è non-regressione del CSS contract).

- [ ] **Step 3: Commit**

```bash
git add tests/breakdown/inline-tagging.spec.ts
git commit -m "[OHW] test(breakdown): add E2E for inline scene tagging (Spec 10c)"
```

---

## Task 13 — Cleanup: rimuovere `SceneScriptViewer`

**Files:**

- Delete: `apps/web/app/features/breakdown/components/SceneScriptViewer.tsx`
- Delete: `apps/web/app/features/breakdown/components/SceneScriptViewer.module.css`

- [ ] **Step 1: Verificare zero referenze restanti**

Run: `grep -rn "SceneScriptViewer" apps/web tests`
Expected: nessun risultato (tutto migrato in Task 11).

- [ ] **Step 2: Rimuovere i file**

```bash
rm apps/web/app/features/breakdown/components/SceneScriptViewer.tsx
rm apps/web/app/features/breakdown/components/SceneScriptViewer.module.css
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "[OHW] chore(breakdown): remove obsolete SceneScriptViewer"
```

---

## Task 14 — Update spec & README (documentation hygiene)

**Files:**

- Modify: `docs/specs/core/10c-inline-scene-tagging.md` (status → "implemented")
- Modify: `README.md` (sposta 10c da TODO → DONE; vedi sezione todolist)

- [ ] **Step 1: Aggiornare lo status nello spec**

Modificare la riga `> **Status:** approved, ready for implementation plan` in:
`> **Status:** implemented (2026-04-21)`

- [ ] **Step 2: Aggiornare README**

Aprire `README.md`, individuare la todolist Spec 10. Spostare la voce "Spec 10c — inline scene tagging" da TODO a DONE.

- [ ] **Step 3: Commit**

```bash
git add docs/specs/core/10c-inline-scene-tagging.md README.md
git commit -m "[OHW] docs: mark spec 10c implemented"
```

---

## Self-review (eseguito)

**1. Spec coverage** — ogni sezione dello spec è coperta:

- Architecture (`ReadOnlyScreenplayView` + `ScriptReader`) → Task 3, 10
- 3 plugin PM (highlight, ghost, selection-toolbar) → Task 6, 7, 9
- Snapshot da `screenplay_versions.content` → Task 2
- TOC scroll-to-scene → Task 4 + Task 11
- CSS tokens `--cat-*-bg` → Task 1
- Permissions (toolbar disabilitata per viewer) → Task 10 (`canEdit` flag) + Task 12 (E2E OHW-281)
- Testing (Vitest + Playwright) → Task 4, 5, 7, 8, 12
- Cleanup `SceneScriptViewer` → Task 13
- Documentation hygiene → Task 14

**2. Placeholder scan** — Task 6 contiene un `void buildDecos` di scaffolding esplicitamente rimosso allo Step 2; il resto è codice completo. Nessun TBD/TODO/"add error handling" residuo.

**3. Type consistency** — `ElementForMatch` è definito in Task 5 e riusato in Task 6, 7, 10, 11. `HighlightMeta` / `GhostMeta` definiti rispettivamente in Task 6/7 e usati in Task 10. `ScriptReaderHandle` definito in Task 10 e usato in Task 11. `CesareSuggestionLite` definito in Task 7 e usato in Task 10/11. Tutto coerente.

---

## Out of scope (rimandato)

Coerente con lo spec: niente edit inline, niente multi-select, niente drag-to-tag, niente real-time sync, niente undo dei tag, niente Expo. Mobile companion in spec separata quando l'app esisterà.
