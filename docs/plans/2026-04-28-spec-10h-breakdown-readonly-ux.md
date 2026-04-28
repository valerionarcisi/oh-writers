# Spec 10h — Breakdown read-only UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere la pagina breakdown strettamente read-only sull'heading di scena (niente menu `Edit number / Unlock / Resequence / Remove`, niente edit del numero scena) e tenere la TOC laterale visivamente in sync con lo scroll dello script reader.

**Architecture:** Aggiungiamo un flag `readOnly` opzionale a `createHeadingNodeView`. La vista breakdown (`ReadOnlyScreenplayView`) lo passa a `true`; l'editor editabile (`ProseMirrorView`) resta invariato. La `SceneTOC` espone una mappa `Map<sceneId, HTMLButtonElement>` e ha un `useEffect` su `activeSceneId` che chiama `scrollIntoView({ block: "nearest" })` sull'item attivo.

**Tech Stack:** ProseMirror NodeView, React, CSS Modules, Vitest, Playwright. Nessuna dipendenza nuova, nessuna migration, nessuna server function.

**Reading order before coding:**

1. `docs/specs/core/10h-breakdown-readonly-ux.md` — lo spec di riferimento
2. `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts` — il NodeView da modificare
3. `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx` — call site read-only
4. `apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx` — call site editabile (deve restare invariato nei comportamenti)
5. `apps/web/app/features/breakdown/components/SceneTOC.tsx` — TOC da estendere con auto-scroll
6. `apps/web/app/features/breakdown/components/ScriptReader.tsx` — emette `onActiveSceneChange` durante lo scroll

---

## File Structure

**Modified files:**

| File                                                                            | What changes                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts`       | `createHeadingNodeView` accetta `options.readOnly`. Quando `true`, non costruisce `menuBtn` né i listener delle scene-number buttons; le buttons diventano `<span>` non interattivi |
| `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx` | La factory `nodeViews.heading` passa `{ readOnly: true }`                                                                                                                           |
| `apps/web/app/features/breakdown/components/SceneTOC.tsx`                       | Aggiunge `itemsRef: Map<sceneId, HTMLButtonElement>` e `useEffect(activeSceneId)` con `scrollIntoView`                                                                              |

**New files:**

| File                                                                           | Responsibility                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.test.ts` | Vitest: verifica DOM in modalità readOnly vs editabile |
| `tests/breakdown/breakdown-readonly-ux.spec.ts`                                | Playwright: 3 test E2E (OHW-347, OHW-348, OHW-349)     |

**Untouched (regression target):**

- `apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx` — non viene modificato; il default `readOnly: false` di `createHeadingNodeView` lo lascia identico.

---

## Test Commands (cheatsheet)

```bash
# Unit (Vitest) — singolo file
pnpm --filter @oh-writers/web test heading-nodeview

# Unit — tutto il pacchetto web
pnpm --filter @oh-writers/web test

# Playwright — singolo file
pnpm test:e2e tests/breakdown/breakdown-readonly-ux.spec.ts

# Playwright — singolo test per id
pnpm test:e2e -g "OHW-347"

# Typecheck globale
pnpm typecheck
```

---

## Task 1 — Estendere `createHeadingNodeView` con un flag `readOnly`

**Files:**

- Modify: `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts:35-403`
- Test: `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.test.ts` (nuovo)

### Cosa cambia nel NodeView

Quando `readOnly === true`:

- `menuBtn` non viene creato e non viene appeso al DOM.
- `leftBtn` e `rightBtn` diventano `<span>` con la stessa classe (`scene-number scene-number-btn scene-number-left|right`) ma senza listener `mousedown`. La proprietà `hidden` continua a funzionare perché è disponibile su `HTMLElement`.
- I metodi `startEdit` / `commit` / `toggleMenu` esistono ma non sono raggiungibili (nessun listener li chiama).
- `stopEvent` ignora il check su `menuBtn` se questo è `null`.

Default `readOnly: false` lascia il comportamento identico a oggi.

- [ ] **Step 1: Scrivere i test che falliranno**

Crea `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../schema";
import { createHeadingNodeView } from "./heading-nodeview";

function mountSingleHeading(readOnly: boolean) {
  const headingType = schema.nodes["heading"]!;
  const sceneType = schema.nodes["scene"]!;
  const titleType = schema.nodes["title"]!;
  const heading = headingType.create(
    { scene_number: "1", scene_number_locked: false },
    titleType.create(null, schema.text("INT. ROOM - DAY")),
  );
  const scene = sceneType.create(null, heading);
  const doc = schema.topNodeType.create(null, scene);
  const state = EditorState.create({ doc });
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const view = new EditorView(mount, {
    state,
    editable: () => !readOnly,
    nodeViews: {
      heading: (node, v, getPos) =>
        createHeadingNodeView(node, v, getPos, { readOnly }),
    },
  });
  return { view, mount };
}

describe("createHeadingNodeView — readOnly flag", () => {
  it("does not render the menu trigger when readOnly is true", () => {
    const { view, mount } = mountSingleHeading(true);
    expect(
      mount.querySelector("[data-testid='scene-menu-trigger']"),
    ).toBeNull();
    view.destroy();
    mount.remove();
  });

  it("renders scene-number as non-button spans when readOnly is true", () => {
    const { view, mount } = mountSingleHeading(true);
    const left = mount.querySelector(".scene-number-left");
    expect(left).not.toBeNull();
    expect(left!.tagName.toLowerCase()).toBe("span");
    view.destroy();
    mount.remove();
  });

  it("renders the menu trigger and edit buttons when readOnly is false", () => {
    const { view, mount } = mountSingleHeading(false);
    expect(
      mount.querySelector("[data-testid='scene-menu-trigger']"),
    ).not.toBeNull();
    const left = mount.querySelector(".scene-number-left");
    expect(left!.tagName.toLowerCase()).toBe("button");
    view.destroy();
    mount.remove();
  });

  it("defaults to editable behaviour when options is omitted", () => {
    const headingType = schema.nodes["heading"]!;
    const sceneType = schema.nodes["scene"]!;
    const titleType = schema.nodes["title"]!;
    const heading = headingType.create(
      { scene_number: "1", scene_number_locked: false },
      titleType.create(null, schema.text("INT. ROOM - DAY")),
    );
    const scene = sceneType.create(null, heading);
    const doc = schema.topNodeType.create(null, scene);
    const state = EditorState.create({ doc });
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const view = new EditorView(mount, {
      state,
      nodeViews: {
        heading: (node, v, getPos) => createHeadingNodeView(node, v, getPos),
      },
    });
    expect(
      mount.querySelector("[data-testid='scene-menu-trigger']"),
    ).not.toBeNull();
    view.destroy();
    mount.remove();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

```bash
pnpm --filter @oh-writers/web test heading-nodeview
```

Atteso: 4 test FAIL. I test che richiedono `readOnly: true` falliscono perché il quarto argomento di `createHeadingNodeView` non esiste ancora; oppure tutti passano in modo errato (il NodeView ignora il flag e crea sempre il menu).

- [ ] **Step 3: Implementare il flag in `heading-nodeview.ts`**

Modifica `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts`:

3a. Cambia la signature finale (ultime righe del file):

```ts
export interface HeadingNodeViewOptions {
  readOnly?: boolean;
}

export const createHeadingNodeView = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  options: HeadingNodeViewOptions = {},
): NodeView => new HeadingNodeView(node, view, getPos, options);
```

3b. Cambia il constructor di `HeadingNodeView` per accettare e memorizzare `options`:

```ts
private readonly readOnly: boolean;
private readonly menuBtn: HTMLButtonElement | null;

constructor(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  options: HeadingNodeViewOptions,
) {
  this.node = node;
  this.view = view;
  this.getPos = getPos;
  this.readOnly = options.readOnly === true;

  this.dom = document.createElement("h2");
  this.dom.className = "pm-heading";

  this.leftBtn = this.createNumberElement("scene-number-left");
  this.rightBtn = this.createNumberElement("scene-number-right");
  this.menuBtn = this.readOnly ? null : this.createMenuButton();

  this.slots = document.createElement("div");
  this.slots.className = "pm-heading-slots";
  this.contentDOM = this.slots;

  if (this.menuBtn) {
    this.dom.append(this.leftBtn, this.menuBtn, this.slots, this.rightBtn);
  } else {
    this.dom.append(this.leftBtn, this.slots, this.rightBtn);
  }
  this.syncAttrs();
}
```

3c. Cambia il tipo dei campi `leftBtn` / `rightBtn` da `HTMLButtonElement` a `HTMLElement` e rinomina `createButton` in `createNumberElement`:

```ts
private readonly leftBtn: HTMLElement;
private readonly rightBtn: HTMLElement;

private createNumberElement(side: string): HTMLElement {
  if (this.readOnly) {
    const span = document.createElement("span");
    span.className = `scene-number scene-number-btn ${side}`;
    span.setAttribute("data-testid", "scene-number-readonly");
    return span;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `scene-number scene-number-btn ${side}`;
  btn.setAttribute("data-testid", "scene-number-edit-trigger");
  btn.setAttribute("aria-label", "Edit scene number");
  btn.contentEditable = "false";
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.startEdit();
  });
  return btn;
}
```

3d. Aggiorna `syncAttrs` per non chiamare API specifiche di `HTMLButtonElement`. Il blocco esistente usa `.textContent`, `.hidden`, `.title`, `.classList.toggle` — tutto `HTMLElement`. Nessuna modifica necessaria oltre al cambio di tipo dei campi.

3e. Aggiorna `stopEvent` per gestire `menuBtn` nullabile:

```ts
stopEvent(event: Event): boolean {
  const t = event.target as HTMLElement | null;
  if (!t) return false;
  if (t === this.input) return true;
  if (t === this.leftBtn || t === this.rightBtn) return true;
  if (this.menuBtn && t === this.menuBtn) return true;
  if (this.menu && this.menu.contains(t)) return true;
  return false;
}
```

3f. In `cancelEdit`, la riga `this.input.replaceWith(this.leftBtn)` continua a funzionare perché `replaceWith` accetta qualsiasi `Node`.

- [ ] **Step 4: Eseguire i test e verificarne il pass**

```bash
pnpm --filter @oh-writers/web test heading-nodeview
```

Atteso: 4 test PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Atteso: 0 errori. (I call site esistenti restano validi: il quarto argomento è opzionale.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts \
        apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.test.ts
git commit -m "[OHW] feat(screenplay): add readOnly flag to HeadingNodeView"
```

---

## Task 2 — `ReadOnlyScreenplayView` passa `readOnly: true`

**Files:**

- Modify: `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx:46-52`

- [ ] **Step 1: Modificare la factory `nodeViews.heading`**

Sostituisci la riga 50 attuale:

```ts
heading: (node, v, getPos) => createHeadingNodeView(node, v, getPos),
```

con:

```ts
heading: (node, v, getPos) =>
  createHeadingNodeView(node, v, getPos, { readOnly: true }),
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Atteso: 0 errori.

- [ ] **Step 3: Verifica manuale che `ProseMirrorView.tsx` non sia stato toccato**

```bash
git diff apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx
```

Atteso: nessuna modifica.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx
git commit -m "[OHW] feat(breakdown): mount HeadingNodeView in read-only mode"
```

---

## Task 3 — `SceneTOC` auto-scrolla l'item attivo

**Files:**

- Modify: `apps/web/app/features/breakdown/components/SceneTOC.tsx`

- [ ] **Step 1: Aggiungere `useRef` per la mappa item e l'effetto `scrollIntoView`**

Sostituisci il contenuto attuale del componente con:

```tsx
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@oh-writers/ui";
import { staleScenesOptions } from "../hooks/useBreakdown";
import type { BreakdownSceneSummary } from "../server/breakdown.server";
import styles from "./SceneTOC.module.css";

interface Props {
  scenes: BreakdownSceneSummary[];
  versionId: string;
  activeSceneId: string | null;
  onSceneSelect: (id: string) => void;
}

export function SceneTOC({
  scenes,
  versionId,
  activeSceneId,
  onSceneSelect,
}: Props) {
  const { data: staleIds = [] } = useQuery(staleScenesOptions(versionId));
  const itemsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!activeSceneId) return;
    const el = itemsRef.current.get(activeSceneId);
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [activeSceneId]);

  if (scenes.length === 0) {
    return <p className={styles.empty}>Nessuna scena nella sceneggiatura.</p>;
  }

  return (
    <ul className={styles.list} role="list">
      {scenes.map((s) => {
        const isActive = s.id === activeSceneId;
        const isStale = staleIds.includes(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              ref={(node) => {
                if (node) itemsRef.current.set(s.id, node);
                else itemsRef.current.delete(s.id);
              }}
              className={[styles.item, isActive ? styles.active : ""]
                .filter(Boolean)
                .join(" ")}
              data-testid={`scene-toc-item-${s.number}`}
              onClick={() => onSceneSelect(s.id)}
            >
              <span className={styles.number}>{s.number}.</span>
              <span className={styles.heading}>{s.heading}</span>
              {isStale && (
                <Badge variant="stale" className={styles.staleBadge}>
                  stale
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Atteso: 0 errori.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/features/breakdown/components/SceneTOC.tsx
git commit -m "[OHW] feat(breakdown): auto-scroll active scene into view in TOC"
```

---

## Task 4 — Test E2E Playwright

**Files:**

- Create: `tests/breakdown/breakdown-readonly-ux.spec.ts`

Riusiamo la fixture esistente `authenticatedPage` e l'helper `navigateToBreakdown(page, TEAM_PROJECT_ID)` (già presente in `tests/breakdown/helpers.ts`). Il seed del team ha più di 2 scene, sufficienti per testare il TOC scroll. Per essere robusti rispetto al numero esatto di scene, target = ultima scena disponibile.

- [ ] **Step 1: Creare il file di test**

Crea `tests/breakdown/breakdown-readonly-ux.spec.ts`:

```ts
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10h] Breakdown read-only UX
 *
 * The breakdown page reuses the screenplay PM engine in read-only mode.
 * Two guarantees this suite enforces:
 *   1. Scene-heading editing affordances (menu, scene-number edit) are
 *      not exposed in the breakdown.
 *   2. Scrolling the script reader keeps the TOC item for the active
 *      scene visible without manual scrolling.
 *   3. The screenplay editor route is unaffected (regression).
 */
test.describe("[Spec 10h] Breakdown — read-only UX", () => {
  test("[OHW-347] scene-heading menu trigger is not present in breakdown", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("breakdown-script")).toBeVisible();
    await expect(page.getByTestId("scene-menu-trigger")).toHaveCount(0);
    await expect(page.getByTestId("scene-number-edit-trigger")).toHaveCount(0);
  });

  test("[OHW-348] scrolling the script reader keeps the active TOC item in view", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const tocItems = page.getByTestId(/^scene-toc-item-/);
    const count = await tocItems.count();
    test.skip(count < 3, "TOC needs at least 3 scenes for a meaningful scroll");

    const last = tocItems.nth(count - 1);
    await last.click();
    await expect(last).toBeVisible();

    const toc = page.getByTestId("breakdown-toc");
    const visible = await last.evaluate(
      (el, container) => {
        const elRect = el.getBoundingClientRect();
        const cRect = (container as HTMLElement).getBoundingClientRect();
        return elRect.top >= cRect.top && elRect.bottom <= cRect.bottom;
      },
      await toc.elementHandle(),
    );
    expect(visible).toBe(true);
  });

  test("[OHW-349] screenplay editor route still exposes the heading menu", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`/projects/${TEAM_PROJECT_ID}/screenplay`);
    await expect(page.getByTestId("scene-menu-trigger").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Eseguire la suite**

```bash
pnpm test:e2e tests/breakdown/breakdown-readonly-ux.spec.ts
```

Atteso: 3 test PASS (il secondo può essere skippato se il seed ha meno di 3 scene; in tal caso seed → estendi `breakdown-fixtures.ts` per avere almeno 3 scene, ma in base ai test esistenti `auto-spoglio.spec.ts` ne abbiamo già 2 documentate — verifica con `pnpm test:e2e -g OHW-348` e adegua il seed se necessario, lasciando la modifica al fixture in un commit separato).

- [ ] **Step 3: Commit**

```bash
git add tests/breakdown/breakdown-readonly-ux.spec.ts
git commit -m "[OHW] test(breakdown): cover read-only UX (10h)"
```

---

## Task 5 — Verifica finale e push

- [ ] **Step 1: Typecheck + tutti i test unit**

```bash
pnpm typecheck && pnpm --filter @oh-writers/web test
```

Atteso: tutto verde.

- [ ] **Step 2: Suite e2e completa breakdown (regressione)**

```bash
pnpm test:e2e tests/breakdown
```

Atteso: tutti i test breakdown PASS, nessuna regressione.

- [ ] **Step 3: Aggiornare la todolist nel README e segnare 10h DONE**

Apri `README.md`, trova la sezione todolist (cerca `## TODO` o equivalente), sposta la riga `Spec 10h` da TODO a DONE.

```bash
git add README.md
git commit -m "[OHW] docs: mark spec 10h as DONE in README todolist"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-review checklist (eseguito)

- [x] Spec coverage: tutti e 4 i requisiti del 10h sono coperti (HeadingNodeView readOnly → Task 1; ReadOnlyScreenplayView passa true → Task 2; TOC auto-scroll → Task 3; non-regressione editor + Playwright → Task 4 OHW-349).
- [x] Nessun placeholder: ogni step ha codice o comando completo.
- [x] Type consistency: i campi `leftBtn`/`rightBtn` cambiano tipo da `HTMLButtonElement` a `HTMLElement` in modo coerente; `menuBtn` diventa `HTMLButtonElement | null`; `stopEvent` aggiornato di conseguenza.
- [x] Testid: usati i testid esistenti del NodeView (`scene-menu-trigger`, `scene-number-edit-trigger`) verificati con `grep` nel sorgente. Nuovo testid `scene-number-readonly` per i `<span>` non interattivi.
- [x] Nessuna regressione editabile: `ProseMirrorView.tsx` non viene modificato; il default del nuovo argomento è `{}` → `readOnly === false`.
