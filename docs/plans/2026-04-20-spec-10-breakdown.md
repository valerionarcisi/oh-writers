# Spec 10 — Scene Breakdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Breakdown feature (Spec 10) — Movie Magic-style scene-by-scene element extraction with Cesare AI inline ghost suggestions, version-aware element registry, three-tier stale awareness, and PDF/CSV export.

**Architecture:** TanStack Start route `/projects/:id/breakdown` with split-pane UI (TOC + selection-only script viewer + element panel). Element registry is per-project; occurrences are per `(element, screenplay_version, scene)` (Hybrid C versioning). Cesare runs Haiku 4.5 via `createServerFn` with `MOCK_AI=true` in dev/test, prompt caching in prod. Tag-from-script via context menu on text selection. PDF via PDFKit (server), CSV via Papa-Parse-like manual emission.

**Tech Stack:** TanStack Start + Router · TanStack Query · Drizzle + Postgres · Better Auth · Zod · neverthrow · Anthropic SDK + Haiku 4.5 · PDFKit · Playwright (E2E) · Vitest (unit). CSS Modules with `--cat-*` tokens.

**Spec reference:** `docs/specs/core/10-breakdown.md`

---

## File Structure (lock decomposition)

### New files

| Path                                                                           | Responsibility                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `packages/ui/src/styles/tokens.css` (extend)                                   | Add 14 `--cat-*` color tokens                                |
| `packages/ui/src/components/Tag.tsx` + `.module.css`                           | Color+icon chip, variants `solid`/`ghost`, dismissable       |
| `packages/ui/src/components/Banner.tsx` + `.module.css`                        | Inline persistent banner, variants `info`/`cesare`/`warning` |
| `packages/ui/src/components/ContextMenu.tsx` + `.module.css`                   | Anchored context menu (selection coords)                     |
| `packages/ui/src/components/DataTable.tsx` + `.module.css`                     | Sortable + filterable table, no virtualization v1            |
| `packages/ui/src/components/Badge.tsx` (extend)                                | Add `variant: count \| stale` props                          |
| `packages/db/src/schema/breakdown.ts`                                          | Drizzle schema: 3 tables                                     |
| `packages/db/migrations/NNNN_breakdown.sql`                                    | Auto-gen via `pnpm db:migrate:create`                        |
| `packages/domain/src/breakdown/categories.ts`                                  | `BREAKDOWN_CATEGORIES` const + helpers                       |
| `packages/domain/src/breakdown/schemas.ts`                                     | Zod schemas                                                  |
| `packages/domain/src/breakdown/index.ts`                                       | Re-exports                                                   |
| `apps/web/app/features/breakdown/server/breakdown.server.ts`                   | Read fns + element CRUD                                      |
| `apps/web/app/features/breakdown/server/cesare-suggest.server.ts`              | Cesare integration server fn                                 |
| `apps/web/app/features/breakdown/server/clone-version.server.ts`               | `cloneBreakdownToVersion`                                    |
| `apps/web/app/features/breakdown/server/export.server.ts`                      | PDF + CSV export                                             |
| `apps/web/app/features/breakdown/lib/re-match.ts`                              | Pure: re-anchor `element.name` in scene text                 |
| `apps/web/app/features/breakdown/lib/hash-scene.ts`                            | Pure: normalize + sha256 scene text                          |
| `apps/web/app/features/breakdown/lib/permissions.ts`                           | `canEditBreakdown` (delegates to screenplay perms)           |
| `apps/web/app/features/breakdown/lib/export-pdf.ts`                            | PDFKit composition (MM-style table)                          |
| `apps/web/app/features/breakdown/lib/export-csv.ts`                            | RFC 4180 CSV emission                                        |
| `apps/web/app/features/breakdown/lib/cesare-prompt.ts`                         | System prompt + few-shot + tool schema                       |
| `apps/web/app/features/breakdown/lib/rate-limit.ts`                            | Per-project rate-limit (DB-backed table)                     |
| `apps/web/app/features/breakdown/hooks/useBreakdown.ts`                        | Query hooks                                                  |
| `apps/web/app/features/breakdown/hooks/useCesareSuggest.ts`                    | Mutation hook                                                |
| `apps/web/app/features/breakdown/hooks/useExportBreakdown.ts`                  | Mutation hook (preview tab)                                  |
| `apps/web/app/features/breakdown/components/BreakdownPanel.tsx` + css          | Per-scene element list panel                                 |
| `apps/web/app/features/breakdown/components/SceneScriptViewer.tsx` + css       | Selection-only readonly script                               |
| `apps/web/app/features/breakdown/components/SceneTOC.tsx` + css                | Scene navigator + filters                                    |
| `apps/web/app/features/breakdown/components/CesareGhostTag.tsx` + css          | Ghost variant Tag composition                                |
| `apps/web/app/features/breakdown/components/CesareSuggestionBanner.tsx` + css  | Banner with accept-all/ignore CTAs                           |
| `apps/web/app/features/breakdown/components/ProjectBreakdownTable.tsx` + css   | Consolidated tab DataTable composition                       |
| `apps/web/app/features/breakdown/components/AddElementModal.tsx` + css         | Manual add form                                              |
| `apps/web/app/features/breakdown/components/ExportBreakdownModal.tsx` + css    | Mirrors `ExportPdfModal` pattern                             |
| `apps/web/app/features/breakdown/components/VersionImportBanner.tsx` + css     | L3 banner                                                    |
| `apps/web/app/features/breakdown/index.ts`                                     | Public API                                                   |
| `apps/web/app/routes/projects.$id.breakdown.tsx`                               | TanStack route                                               |
| `apps/web/app/features/screenplay-editor/components/SceneStaleBadge.tsx` + css | L2 inline badge                                              |
| `mocks/ai-responses.ts` (extend)                                               | `mockCesareBreakdownForScene`                                |
| `tests/breakdown/breakdown-cesare.spec.ts`                                     | Cesare E2E (OHW-240,241,242,243,257,258,259)                 |
| `tests/breakdown/breakdown-manual.spec.ts`                                     | Manual + tag-from-script (OHW-244,245)                       |
| `tests/breakdown/breakdown-project-view.spec.ts`                               | Per-progetto + rename (OHW-246,247,248)                      |
| `tests/breakdown/breakdown-export.spec.ts`                                     | Export PDF/CSV (OHW-249,250)                                 |
| `tests/breakdown/breakdown-stale.spec.ts`                                      | Stale awareness L1+L2+L3 (OHW-251,252,253)                   |
| `tests/breakdown/breakdown-permissions.spec.ts`                                | Viewer/non-member (OHW-254,255,256)                          |
| `tests/breakdown/breakdown-versioning.spec.ts`                                 | Clone (OHW-260,261)                                          |
| `tests/breakdown/helpers.ts`                                                   | Test helpers (seed elements, navigate to breakdown)          |
| `packages/db/src/seed/fixtures/breakdown-fixtures.ts`                          | Deterministic breakdown fixture for "non-fa-ridere"          |

### Modified files

| Path                                                                               | Why                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `packages/ui/src/index.ts`                                                         | Re-export new components                        |
| `packages/db/src/schema/index.ts`                                                  | Re-export breakdown tables                      |
| `packages/db/src/seed/index.ts`                                                    | Seed breakdown fixtures                         |
| `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`          | Render `SceneStaleBadge` per scene heading      |
| `apps/web/app/features/screenplay-editor/server/screenplay.server.ts` (or similar) | Add `getStaleScenes` if not in breakdown server |

---

## Phase A — Design System atoms (TDD via Vitest component-style + visual)

### Task A1: Add category color tokens

**Files:**

- Modify: `packages/ui/src/styles/tokens.css`

- [ ] **Step 1:** Add this block at the bottom of `:root` in `packages/ui/src/styles/tokens.css`:

```css
/* Breakdown category palette (Movie Magic standard, OKLCH for perceptual uniformity) */
--cat-cast: oklch(0.85 0.16 90); /* yellow */
--cat-extras: oklch(0.78 0.16 145); /* green */
--cat-stunts: oklch(0.75 0.18 50); /* orange */
--cat-props: oklch(0.65 0.18 305); /* purple */
--cat-vehicles: oklch(0.78 0.15 350); /* pink */
--cat-wardrobe: oklch(0.82 0.12 200); /* cyan */
--cat-makeup: oklch(0.86 0.1 350); /* light pink */
--cat-sfx: oklch(0.65 0.18 250); /* blue */
--cat-vfx: oklch(0.78 0.13 230); /* light blue */
--cat-sound: oklch(0.65 0.2 25); /* red */
--cat-animals: oklch(0.7 0.2 330); /* magenta */
--cat-set-dress: oklch(0.72 0.13 180); /* teal */
--cat-equipment: oklch(0.55 0.1 60); /* brown */
--cat-locations: oklch(0.7 0.05 250); /* neutral grey-blue */
```

- [ ] **Step 2:** Commit:

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "[OHW] feat(ui): add breakdown category color tokens (Spec 10)"
```

### Task A2: Tag component (color + icon, solid + ghost variants)

**Files:**

- Create: `packages/ui/src/components/Tag.tsx`
- Create: `packages/ui/src/components/Tag.module.css`
- Test: `packages/ui/src/components/Tag.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Failing test** — `packages/ui/src/components/Tag.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders name + icon prefix + count", () => {
    render(
      <Tag colorToken="--cat-props" icon="P" name="Bloody knife" count={2} />,
    );
    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.getByText("Bloody knife")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("applies ghost variant class when variant=ghost", () => {
    const { container } = render(
      <Tag colorToken="--cat-props" icon="P" name="X" variant="ghost" />,
    );
    expect(container.firstChild).toHaveClass(/ghost/);
  });

  it("calls onDismiss when dismiss button clicked", async () => {
    const onDismiss = vi.fn();
    render(
      <Tag colorToken="--cat-props" icon="P" name="X" onDismiss={onDismiss} />,
    );
    await userEvent.click(screen.getByLabelText("Rimuovi"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL:**

```bash
pnpm --filter @oh-writers/ui vitest run src/components/Tag.test.tsx
```

Expected: `Cannot find module './Tag'`

- [ ] **Step 3: Implement** — `packages/ui/src/components/Tag.tsx`:

```tsx
import { clsx } from "clsx";
import styles from "./Tag.module.css";

export type TagVariant = "solid" | "ghost";

export interface TagProps {
  colorToken: string; // e.g. "--cat-props"
  icon: string; // e.g. "P"
  name: string;
  count?: number;
  variant?: TagVariant;
  onClick?: () => void;
  onDismiss?: () => void;
  "data-testid"?: string;
}

export const Tag = ({
  colorToken,
  icon,
  name,
  count,
  variant = "solid",
  onClick,
  onDismiss,
  ...rest
}: TagProps): JSX.Element => (
  <span
    className={clsx(styles.tag, variant === "ghost" && styles.ghost)}
    style={{ "--tag-color": `var(${colorToken})` } as React.CSSProperties}
    onClick={onClick}
    role={onClick ? "button" : undefined}
    data-testid={rest["data-testid"]}
  >
    <span className={styles.icon}>{icon}</span>
    <span className={styles.name}>{name}</span>
    {count !== undefined && count > 1 && (
      <span className={styles.count}>×{count}</span>
    )}
    {onDismiss && (
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Rimuovi"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        ×
      </button>
    )}
  </span>
);
```

- [ ] **Step 4: Implement CSS** — `packages/ui/src/components/Tag.module.css`:

```css
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding-inline: var(--space-2);
  padding-block: var(--space-1);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--tag-color) 20%, transparent);
  border: 1px solid var(--tag-color);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
  cursor: default;

  &[role="button"] {
    cursor: pointer;
    &:hover {
      background: color-mix(in oklch, var(--tag-color) 30%, transparent);
    }
  }
}

.ghost {
  background: transparent;
  border-style: dashed;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5em;
  padding-inline: var(--space-1);
  background: var(--tag-color);
  color: var(--color-text-inverse);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 700;
}

.name {
  white-space: nowrap;
}
.count {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.dismiss {
  background: none;
  border: 0;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0 var(--space-1);
  font-size: var(--text-base);
  line-height: 1;
  &:hover {
    color: var(--color-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ghost {
    transition: none;
  }
}
```

- [ ] **Step 5: Add export** — append to `packages/ui/src/index.ts`:

```typescript
export { Tag } from "./components/Tag";
export type { TagProps, TagVariant } from "./components/Tag";
```

- [ ] **Step 6: Run test, expect PASS:**

```bash
pnpm --filter @oh-writers/ui vitest run src/components/Tag.test.tsx
```

Expected: 3 passed

- [ ] **Step 7: Commit:**

```bash
git add packages/ui/src/components/Tag.tsx packages/ui/src/components/Tag.module.css packages/ui/src/components/Tag.test.tsx packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): add Tag component with solid/ghost variants (Spec 10)"
```

### Task A3: Banner component (info/cesare/warning, dismissable, persistent)

**Files:**

- Create: `packages/ui/src/components/Banner.tsx`
- Create: `packages/ui/src/components/Banner.module.css`
- Test: `packages/ui/src/components/Banner.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Failing test:**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("renders message + actions", () => {
    render(
      <Banner
        variant="cesare"
        message="Cesare ha proposto 8 elementi"
        actions={[
          { label: "Accetta tutti", onClick: vi.fn(), variant: "primary" },
        ]}
      />,
    );
    expect(screen.getByText(/Cesare ha proposto/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accetta tutti" }),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when X clicked", async () => {
    const onDismiss = vi.fn();
    render(<Banner variant="info" message="hi" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByLabelText("Chiudi"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module './Banner'`):

```bash
pnpm --filter @oh-writers/ui vitest run src/components/Banner.test.tsx
```

- [ ] **Step 3: Implement Banner.tsx:**

```tsx
import { clsx } from "clsx";
import styles from "./Banner.module.css";

export type BannerVariant = "info" | "cesare" | "warning";

export interface BannerAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface BannerProps {
  variant: BannerVariant;
  message: string;
  actions?: BannerAction[];
  onDismiss?: () => void;
  "data-testid"?: string;
}

const ICONS: Record<BannerVariant, string> = {
  info: "ℹ",
  cesare: "✨",
  warning: "⚠",
};

export const Banner = ({
  variant,
  message,
  actions,
  onDismiss,
  ...rest
}: BannerProps): JSX.Element => (
  <div
    className={clsx(styles.banner, styles[variant])}
    data-testid={rest["data-testid"]}
  >
    <span className={styles.icon} aria-hidden>
      {ICONS[variant]}
    </span>
    <span className={styles.message}>{message}</span>
    <div className={styles.actions}>
      {actions?.map((a) => (
        <button
          key={a.label}
          type="button"
          className={clsx(
            styles.action,
            a.variant === "primary" && styles.primary,
          )}
          onClick={a.onClick}
        >
          {a.label}
        </button>
      ))}
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Chiudi"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  </div>
);
```

- [ ] **Step 4: Implement Banner.module.css:**

```css
.banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--banner-border, var(--color-border));
  background: var(--banner-bg, var(--color-surface));
  color: var(--color-text);
}

.info {
  --banner-border: var(--color-accent);
  --banner-bg: color-mix(
    in oklch,
    var(--color-accent) 8%,
    var(--color-surface)
  );
}
.cesare {
  --banner-border: var(--color-cesare, oklch(0.75 0.18 290));
  --banner-bg: color-mix(
    in oklch,
    var(--color-cesare, oklch(0.75 0.18 290)) 8%,
    var(--color-surface)
  );
}
.warning {
  --banner-border: oklch(0.75 0.16 60);
  --banner-bg: color-mix(
    in oklch,
    oklch(0.75 0.16 60) 12%,
    var(--color-surface)
  );
}

.icon {
  font-size: var(--text-lg);
}
.message {
  flex: 1;
  font-size: var(--text-sm);
}
.actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.action {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  font-size: var(--text-sm);
  &:hover {
    background: var(--color-surface-hover);
  }
}
.primary {
  background: var(--banner-border);
  color: var(--color-text-inverse);
  border-color: transparent;
}

.dismiss {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0 var(--space-1);
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  &:hover {
    color: var(--color-text);
  }
}
```

- [ ] **Step 5: Add export to `packages/ui/src/index.ts`:**

```typescript
export { Banner } from "./components/Banner";
export type {
  BannerProps,
  BannerVariant,
  BannerAction,
} from "./components/Banner";
```

- [ ] **Step 6: Run, expect PASS:**

```bash
pnpm --filter @oh-writers/ui vitest run src/components/Banner.test.tsx
```

- [ ] **Step 7: Commit:**

```bash
git add packages/ui/src/components/Banner.tsx packages/ui/src/components/Banner.module.css packages/ui/src/components/Banner.test.tsx packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): add Banner component (info/cesare/warning) (Spec 10)"
```

### Task A4: ContextMenu component (anchored to selection)

**Files:**

- Create: `packages/ui/src/components/ContextMenu.tsx`
- Create: `packages/ui/src/components/ContextMenu.module.css`
- Test: `packages/ui/src/components/ContextMenu.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Failing test:**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("renders items at given anchor when open", () => {
    render(
      <ContextMenu
        open
        anchor={{ x: 100, y: 200 }}
        items={[
          { label: "Cast", onClick: vi.fn() },
          { label: "Props", onClick: vi.fn() },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Cast")).toBeInTheDocument();
    expect(screen.getByText("Props")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <ContextMenu
        open={false}
        anchor={{ x: 0, y: 0 }}
        items={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onClose when item clicked, and the item's own onClick", async () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        open
        anchor={{ x: 0, y: 0 }}
        items={[{ label: "Cast", onClick }]}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByText("Cast"));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        open
        anchor={{ x: 0, y: 0 }}
        items={[{ label: "X", onClick: vi.fn() }]}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement ContextMenu.tsx:**

```tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu = ({
  open,
  anchor,
  items,
  onClose,
}: ContextMenuProps): JSX.Element | null => {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <ul
      ref={ref}
      role="menu"
      className={styles.menu}
      style={{ top: anchor.y, left: anchor.x }}
    >
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
};
```

- [ ] **Step 4: Implement ContextMenu.module.css:**

```css
.menu {
  position: fixed;
  z-index: 9999;
  list-style: none;
  margin: 0;
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 12rem;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: 0;
  cursor: pointer;
  text-align: start;
  font-size: var(--text-sm);
  color: var(--color-text);
  border-radius: var(--radius-sm);

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25em;
  font-weight: 700;
}
```

- [ ] **Step 5: Export from index.ts:**

```typescript
export { ContextMenu } from "./components/ContextMenu";
export type {
  ContextMenuProps,
  ContextMenuItem,
} from "./components/ContextMenu";
```

- [ ] **Step 6: Run, expect PASS.**

```bash
pnpm --filter @oh-writers/ui vitest run src/components/ContextMenu.test.tsx
```

- [ ] **Step 7: Commit:**

```bash
git add packages/ui/src/components/ContextMenu.tsx packages/ui/src/components/ContextMenu.module.css packages/ui/src/components/ContextMenu.test.tsx packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): add ContextMenu component (Spec 10)"
```

### Task A5: DataTable (sortable + filterable, no virtualization v1)

**Files:**

- Create: `packages/ui/src/components/DataTable.tsx`
- Create: `packages/ui/src/components/DataTable.module.css`
- Test: `packages/ui/src/components/DataTable.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Failing test:**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { DataTable } from "./DataTable";

const data = [
  { id: "1", name: "Bob", age: 30 },
  { id: "2", name: "Alice", age: 25 },
];

describe("DataTable", () => {
  const cols = [
    { key: "name" as const, header: "Name", sortable: true },
    { key: "age" as const, header: "Age", sortable: true },
  ];

  it("renders rows", () => {
    render(<DataTable data={data} columns={cols} rowKey={(r) => r.id} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("sorts ascending then descending on header click", async () => {
    render(<DataTable data={data} columns={cols} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByText("Name"));
    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
    expect(rows[0]).toContain("Alice");
    await userEvent.click(screen.getByText("Name"));
    const rows2 = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
    expect(rows2[0]).toContain("Bob");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement DataTable.tsx:**

```tsx
import { useState, useMemo, type ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  key: keyof T;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  "data-testid"?: string;
}

type SortState<T> = { key: keyof T; dir: "asc" | "desc" } | null;

export const DataTable = <T,>({
  data,
  columns,
  rowKey,
  onRowClick,
  ...rest
}: DataTableProps<T>): JSX.Element => {
  const [sort, setSort] = useState<SortState<T>>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sort]);

  const onHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "asc" },
    );
  };

  return (
    <table className={styles.table} data-testid={rest["data-testid"]}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={String(c.key)}
              style={{ width: c.width }}
              onClick={() => onHeaderClick(c)}
              className={c.sortable ? styles.sortable : undefined}
              aria-sort={
                sort?.key === c.key
                  ? sort.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
            >
              {c.header}
              {sort?.key === c.key && (
                <span> {sort.dir === "asc" ? "▲" : "▼"}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={onRowClick ? styles.clickable : undefined}
          >
            {columns.map((c) => (
              <td key={String(c.key)}>
                {c.render ? c.render(row) : String(row[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
```

- [ ] **Step 4: CSS:**

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);

  th,
  td {
    text-align: start;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  thead th {
    background: var(--color-surface-muted);
    font-weight: 600;
    color: var(--color-text-muted);
    user-select: none;
  }

  tbody tr:hover {
    background: var(--color-surface-hover);
  }
}

.sortable {
  cursor: pointer;
}
.clickable {
  cursor: pointer;
}
```

- [ ] **Step 5: Export + run + commit:**

Add to `packages/ui/src/index.ts`:

```typescript
export { DataTable } from "./components/DataTable";
export type { DataTableProps, Column } from "./components/DataTable";
```

```bash
pnpm --filter @oh-writers/ui vitest run src/components/DataTable.test.tsx
git add packages/ui/src/components/DataTable.tsx packages/ui/src/components/DataTable.module.css packages/ui/src/components/DataTable.test.tsx packages/ui/src/index.ts
git commit -m "[OHW] feat(ui): add DataTable component (Spec 10)"
```

### Task A6: Extend Badge with `count` and `stale` variants

**Files:**

- Modify: `packages/ui/src/components/Badge.tsx`
- Modify: `packages/ui/src/components/Badge.module.css`
- Modify: `packages/ui/src/components/Badge.test.tsx` (or create if absent)

- [ ] **Step 1: Read current Badge.tsx and Badge.module.css** to understand existing API.

```bash
cat packages/ui/src/components/Badge.tsx packages/ui/src/components/Badge.module.css
```

- [ ] **Step 2: Add failing test for new variants:**

```tsx
it("renders count variant with number", () => {
  render(<Badge variant="count">12</Badge>);
  expect(screen.getByText("12")).toBeInTheDocument();
  // ... assert color class
});
it("renders stale variant with warning style", () => {
  render(<Badge variant="stale">⚠ stale</Badge>);
  // ... assert .stale class on element
});
```

- [ ] **Step 3: Add `count` + `stale` to Badge variant union and corresponding CSS classes:**

```tsx
// in Badge.tsx, extend BadgeVariant type
export type BadgeVariant = "default" | "success" | "danger" | "count" | "stale";
```

```css
/* in Badge.module.css */
.count {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 1.5em;
  text-align: center;
}
.stale {
  background: oklch(0.85 0.1 60 / 0.2);
  color: oklch(0.55 0.18 60);
  border: 1px solid oklch(0.65 0.16 60);
}
```

- [ ] **Step 4: Run + commit:**

```bash
pnpm --filter @oh-writers/ui vitest run src/components/Badge.test.tsx
git add packages/ui/src/components/Badge.tsx packages/ui/src/components/Badge.module.css packages/ui/src/components/Badge.test.tsx
git commit -m "[OHW] feat(ui): extend Badge with count and stale variants (Spec 10)"
```

---

## Phase B — Database + Domain schemas

### Task B1: Drizzle schema for breakdown tables

**Files:**

- Create: `packages/db/src/schema/breakdown.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `packages/db/src/schema/breakdown.ts`:**

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { scenes } from "./scenes";

export const BREAKDOWN_CATEGORIES = [
  "cast",
  "extras",
  "stunts",
  "props",
  "vehicles",
  "wardrobe",
  "makeup",
  "sfx",
  "vfx",
  "sound",
  "animals",
  "set_dress",
  "equipment",
  "locations",
] as const;

export type BreakdownCategoryDb = (typeof BREAKDOWN_CATEGORIES)[number];

export const breakdownElements = pgTable(
  "breakdown_elements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category", { enum: BREAKDOWN_CATEGORIES }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_elements_project_category_name_uq").on(
      t.projectId,
      t.category,
      t.name,
    ),
  ],
);

export const breakdownOccurrences = pgTable(
  "breakdown_occurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    elementId: uuid("element_id")
      .notNull()
      .references(() => breakdownElements.id, { onDelete: "cascade" }),
    screenplayVersionId: uuid("screenplay_version_id").notNull(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    note: text("note"),
    cesareStatus: text("cesare_status", {
      enum: ["pending", "accepted", "ignored"],
    })
      .notNull()
      .default("accepted"),
    isStale: boolean("is_stale").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_occurrences_element_version_scene_uq").on(
      t.elementId,
      t.screenplayVersionId,
      t.sceneId,
    ),
  ],
);

export const breakdownSceneState = pgTable(
  "breakdown_scene_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    screenplayVersionId: uuid("screenplay_version_id").notNull(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    textHash: text("text_hash").notNull(),
    lastCesareRunAt: timestamp("last_cesare_run_at"),
    pageEighths: integer("page_eighths"),
  },
  (t) => [
    unique("breakdown_scene_state_version_scene_uq").on(
      t.screenplayVersionId,
      t.sceneId,
    ),
  ],
);

export const breakdownRateLimits = pgTable(
  "breakdown_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // e.g. "suggest_all_script"
    lastInvokedAt: timestamp("last_invoked_at").notNull().defaultNow(),
  },
  (t) => [
    unique("breakdown_rate_limits_project_action_uq").on(t.projectId, t.action),
  ],
);
```

- [ ] **Step 2: Re-export in `packages/db/src/schema/index.ts`** — append:

```typescript
export * from "./breakdown";
```

- [ ] **Step 3: Generate migration:**

```bash
pnpm --filter @oh-writers/db db:migrate:create -- --name breakdown
```

Expected: new file `packages/db/migrations/NNNN_breakdown.sql` created.

- [ ] **Step 4: Apply migration to test DB:**

```bash
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test pnpm --filter @oh-writers/db db:migrate
```

Expected: migration applied without errors.

- [ ] **Step 5: Apply to dev DB:**

```bash
pnpm --filter @oh-writers/db db:migrate
```

- [ ] **Step 6: Commit:**

```bash
git add packages/db/src/schema/breakdown.ts packages/db/src/schema/index.ts packages/db/migrations/
git commit -m "[OHW] feat(db): add breakdown_elements/occurrences/scene_state/rate_limits tables (Spec 10)"
```

### Task B2: Domain Zod schemas + categories

**Files:**

- Create: `packages/domain/src/breakdown/categories.ts`
- Create: `packages/domain/src/breakdown/schemas.ts`
- Create: `packages/domain/src/breakdown/index.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/breakdown/schemas.test.ts`

- [ ] **Step 1: Create `categories.ts`:**

```typescript
export const BREAKDOWN_CATEGORIES = [
  "cast",
  "extras",
  "stunts",
  "props",
  "vehicles",
  "wardrobe",
  "makeup",
  "sfx",
  "vfx",
  "sound",
  "animals",
  "set_dress",
  "equipment",
  "locations",
] as const;

export type BreakdownCategory = (typeof BREAKDOWN_CATEGORIES)[number];

export interface CategoryMeta {
  id: BreakdownCategory;
  labelIt: string;
  labelEn: string;
  colorToken: string;
  icon: string;
}

export const CATEGORY_META: Record<BreakdownCategory, CategoryMeta> = {
  cast: {
    id: "cast",
    labelIt: "Cast",
    labelEn: "Cast",
    colorToken: "--cat-cast",
    icon: "C",
  },
  extras: {
    id: "extras",
    labelIt: "Comparse",
    labelEn: "Extras",
    colorToken: "--cat-extras",
    icon: "E",
  },
  stunts: {
    id: "stunts",
    labelIt: "Stunt",
    labelEn: "Stunts",
    colorToken: "--cat-stunts",
    icon: "ST",
  },
  props: {
    id: "props",
    labelIt: "Oggetti",
    labelEn: "Props",
    colorToken: "--cat-props",
    icon: "P",
  },
  vehicles: {
    id: "vehicles",
    labelIt: "Veicoli",
    labelEn: "Vehicles",
    colorToken: "--cat-vehicles",
    icon: "V",
  },
  wardrobe: {
    id: "wardrobe",
    labelIt: "Costumi",
    labelEn: "Wardrobe",
    colorToken: "--cat-wardrobe",
    icon: "W",
  },
  makeup: {
    id: "makeup",
    labelIt: "Trucco",
    labelEn: "Makeup/Hair",
    colorToken: "--cat-makeup",
    icon: "M",
  },
  sfx: {
    id: "sfx",
    labelIt: "Effetti spec.",
    labelEn: "SFX",
    colorToken: "--cat-sfx",
    icon: "SFX",
  },
  vfx: {
    id: "vfx",
    labelIt: "VFX",
    labelEn: "VFX",
    colorToken: "--cat-vfx",
    icon: "VFX",
  },
  sound: {
    id: "sound",
    labelIt: "Suono",
    labelEn: "Sound FX",
    colorToken: "--cat-sound",
    icon: "SND",
  },
  animals: {
    id: "animals",
    labelIt: "Animali",
    labelEn: "Animals",
    colorToken: "--cat-animals",
    icon: "A",
  },
  set_dress: {
    id: "set_dress",
    labelIt: "Scenografia",
    labelEn: "Set Dressing",
    colorToken: "--cat-set-dress",
    icon: "SD",
  },
  equipment: {
    id: "equipment",
    labelIt: "Attrezzatura",
    labelEn: "Sp. Equip.",
    colorToken: "--cat-equipment",
    icon: "EQ",
  },
  locations: {
    id: "locations",
    labelIt: "Location",
    labelEn: "Locations",
    colorToken: "--cat-locations",
    icon: "L",
  },
};
```

- [ ] **Step 2: Create `schemas.ts`:**

```typescript
import { z } from "zod";
import { BREAKDOWN_CATEGORIES } from "./categories";

export const BreakdownCategorySchema = z.enum(BREAKDOWN_CATEGORIES);
export const CesareStatusSchema = z.enum(["pending", "accepted", "ignored"]);

export const BreakdownElementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownElement = z.infer<typeof BreakdownElementSchema>;

export const BreakdownOccurrenceSchema = z.object({
  id: z.string().uuid(),
  elementId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
  sceneId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  note: z.string().nullable(),
  cesareStatus: CesareStatusSchema,
  isStale: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownOccurrence = z.infer<typeof BreakdownOccurrenceSchema>;

export const CesareSuggestionSchema = z.object({
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive().default(1),
  description: z.string().nullable(),
  rationale: z.string().nullable(),
});
export const SuggestionListSchema = z.object({
  suggestions: z.array(CesareSuggestionSchema),
});
export type CesareSuggestion = z.infer<typeof CesareSuggestionSchema>;
```

- [ ] **Step 3: Create `index.ts`:**

```typescript
export * from "./categories";
export * from "./schemas";
```

- [ ] **Step 4: Re-export in `packages/domain/src/index.ts`** (append):

```typescript
export * from "./breakdown";
```

- [ ] **Step 5: Failing test `schemas.test.ts`:**

```typescript
import { describe, it, expect } from "vitest";
import {
  BreakdownElementSchema,
  CesareSuggestionSchema,
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
} from "./index";

describe("breakdown schemas", () => {
  it("has 14 categories", () => {
    expect(BREAKDOWN_CATEGORIES).toHaveLength(14);
  });

  it("CATEGORY_META has entry for each category", () => {
    for (const c of BREAKDOWN_CATEGORIES) {
      expect(CATEGORY_META[c]).toBeDefined();
      expect(CATEGORY_META[c].colorToken).toMatch(/^--cat-/);
    }
  });

  it("rejects element with empty name", () => {
    const result = BreakdownElementSchema.safeParse({
      id: "00000000-0000-4000-a000-000000000001",
      projectId: "00000000-0000-4000-a000-000000000002",
      category: "props",
      name: "",
      description: null,
      archivedAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("CesareSuggestionSchema accepts minimal valid", () => {
    const r = CesareSuggestionSchema.safeParse({
      category: "props",
      name: "Knife",
      quantity: 1,
      description: null,
      rationale: null,
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 6: Run + commit:**

```bash
pnpm --filter @oh-writers/domain vitest run src/breakdown/schemas.test.ts
git add packages/domain/src/breakdown/ packages/domain/src/index.ts
git commit -m "[OHW] feat(domain): breakdown categories + Zod schemas (Spec 10)"
```

### Task B3: Pure helpers — hash-scene + re-match

**Files:**

- Create: `apps/web/app/features/breakdown/lib/hash-scene.ts`
- Create: `apps/web/app/features/breakdown/lib/re-match.ts`
- Create: `apps/web/app/features/breakdown/lib/hash-scene.test.ts`
- Create: `apps/web/app/features/breakdown/lib/re-match.test.ts`

- [ ] **Step 1: Failing tests:**

`hash-scene.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hashSceneText } from "./hash-scene";

describe("hashSceneText", () => {
  it("normalizes whitespace and lowercase before hashing", () => {
    expect(hashSceneText("Hello World")).toBe(hashSceneText("hello   world"));
    expect(hashSceneText("a\nb")).toBe(hashSceneText("a b"));
  });

  it("returns 64-char hex (sha256)", () => {
    expect(hashSceneText("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differentiates content changes", () => {
    expect(hashSceneText("hello")).not.toBe(hashSceneText("hello world"));
  });
});
```

`re-match.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { findElementInText } from "./re-match";

describe("findElementInText", () => {
  it("finds case-insensitive word match", () => {
    expect(
      findElementInText("Bloody knife", "Rick draws his BLOODY KNIFE."),
    ).toBe(true);
  });

  it("requires word boundary (no partial match)", () => {
    expect(findElementInText("knife", "his pocketknife is small")).toBe(false);
  });

  it("returns false when not found", () => {
    expect(findElementInText("gun", "no weapon here")).toBe(false);
  });

  it("escapes regex special chars in element name", () => {
    expect(findElementInText(".44 Magnum", "He pulled a .44 Magnum.")).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `hash-scene.ts`:**

```typescript
import { createHash } from "node:crypto";

export const normalizeSceneText = (raw: string): string =>
  raw.toLowerCase().replace(/\s+/g, " ").trim();

export const hashSceneText = (raw: string): string =>
  createHash("sha256").update(normalizeSceneText(raw)).digest("hex");
```

- [ ] **Step 4: Implement `re-match.ts`:**

```typescript
const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const findElementInText = (
  elementName: string,
  sceneText: string,
): boolean => {
  const escaped = escapeRegex(elementName);
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(sceneText);
};
```

- [ ] **Step 5: Run + commit:**

```bash
pnpm --filter @oh-writers/web vitest run app/features/breakdown/lib/
git add apps/web/app/features/breakdown/lib/
git commit -m "[OHW] feat(breakdown): pure helpers hash-scene + re-match (Spec 10)"
```

---

## Phase C — Server functions

> **Pattern reference:** see `apps/web/app/features/documents/server/documents.server.ts` and `apps/web/app/features/screenplay-editor/server/screenplay-export.server.ts` for createServerFn + ResultAsync + toShape + permission patterns.

### Task C1: Permission helper

**Files:**

- Create: `apps/web/app/features/breakdown/lib/permissions.ts`
- Test: `apps/web/app/features/breakdown/lib/permissions.test.ts`

- [ ] **Step 1: Test:**

```typescript
import { describe, it, expect } from "vitest";
import { canEditBreakdown } from "./permissions";

describe("canEditBreakdown", () => {
  it("owner can edit", () => {
    expect(canEditBreakdown({ isPersonalOwner: true, teamRole: null })).toBe(
      true,
    );
  });
  it("editor can edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "editor" }),
    ).toBe(true);
  });
  it("team owner can edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "owner" }),
    ).toBe(true);
  });
  it("viewer cannot edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "viewer" }),
    ).toBe(false);
  });
  it("non-member cannot edit", () => {
    expect(canEditBreakdown({ isPersonalOwner: false, teamRole: null })).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Implement:**

```typescript
import type { TeamRole } from "@oh-writers/domain";

export interface BreakdownPermissionContext {
  isPersonalOwner: boolean;
  teamRole: TeamRole | null;
}

export const canEditBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole === "owner" || ctx.teamRole === "editor";

export const canViewBreakdown = (ctx: BreakdownPermissionContext): boolean =>
  ctx.isPersonalOwner || ctx.teamRole !== null;
```

- [ ] **Step 3: Run + commit:**

```bash
pnpm --filter @oh-writers/web vitest run app/features/breakdown/lib/permissions.test.ts
git add apps/web/app/features/breakdown/lib/permissions.ts apps/web/app/features/breakdown/lib/permissions.test.ts
git commit -m "[OHW] feat(breakdown): permission helper (Spec 10)"
```

### Task C2: `getBreakdownForScene` server fn (with re-match L1)

**Files:**

- Create: `apps/web/app/features/breakdown/server/breakdown.server.ts`

- [ ] **Step 1: Implement (no test yet — covered by E2E in Phase D):**

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
} from "@oh-writers/db/schema";
import {
  BreakdownElementSchema,
  BreakdownOccurrenceSchema,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { ForbiddenError, DbError } from "@oh-writers/utils/errors";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { canViewBreakdown, canEditBreakdown } from "../lib/permissions";
import { hashSceneText } from "../lib/hash-scene";
import { findElementInText } from "../lib/re-match";
import { resolveProjectAccess } from "~/server/project-access"; // existing helper

const InputSchema = z.object({
  sceneId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
});

export interface SceneOccurrenceWithElement {
  occurrence: z.infer<typeof BreakdownOccurrenceSchema>;
  element: z.infer<typeof BreakdownElementSchema>;
}

export const getBreakdownForScene = createServerFn({ method: "GET" })
  .validator(InputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<SceneOccurrenceWithElement[], ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db
          .select({ scene: scenes })
          .from(scenes)
          .where(eq(scenes.id, data.sceneId))
          .then((r) => r[0]),
        (e) => new DbError("getBreakdownForScene/loadScene", e),
      )
        .andThen((row) =>
          row
            ? resolveProjectAccess(user.id, row.scene.screenplayId).map(
                (access) => ({ scene: row.scene, access }),
              )
            : err(new DbError("getBreakdownForScene", "scene not found")),
        )
        .andThen(({ scene, access }) =>
          canViewBreakdown(access)
            ? ok({ scene, access })
            : err(new ForbiddenError("view breakdown")),
        )
        .andThen(({ scene }) =>
          ResultAsync.fromPromise(
            db
              .select({ occ: breakdownOccurrences, el: breakdownElements })
              .from(breakdownOccurrences)
              .innerJoin(
                breakdownElements,
                eq(breakdownOccurrences.elementId, breakdownElements.id),
              )
              .where(
                and(
                  eq(breakdownOccurrences.sceneId, scene.id),
                  eq(
                    breakdownOccurrences.screenplayVersionId,
                    data.screenplayVersionId,
                  ),
                  isNull(breakdownElements.archivedAt),
                ),
              ),
            (e) => new DbError("getBreakdownForScene/loadOccs", e),
          ).map((rows) => ({ scene, rows })),
        )
        .andThen(({ scene, rows }) => {
          const currentHash = hashSceneText(
            scene.heading + "\n" + (scene.notes ?? ""),
          );
          return ResultAsync.fromPromise(
            db
              .select()
              .from(breakdownSceneState)
              .where(
                and(
                  eq(breakdownSceneState.sceneId, scene.id),
                  eq(
                    breakdownSceneState.screenplayVersionId,
                    data.screenplayVersionId,
                  ),
                ),
              )
              .then((r) => r[0]),
            (e) => new DbError("getBreakdownForScene/loadState", e),
          ).map((state) => ({ scene, rows, currentHash, state }));
        })
        .andThen(({ scene, rows, currentHash, state }) => {
          const needsRematch = !state || state.textHash !== currentHash;
          if (!needsRematch) return ok(rows);
          // Re-match: for each occurrence, check if element.name still in text
          const sceneText = scene.heading + "\n" + (scene.notes ?? "");
          const updates = rows.map((r) => ({
            id: r.occ.id,
            isStale: !findElementInText(r.el.name, sceneText),
          }));
          return ResultAsync.fromPromise(
            (async () => {
              for (const u of updates) {
                await db
                  .update(breakdownOccurrences)
                  .set({ isStale: u.isStale, updatedAt: new Date() })
                  .where(eq(breakdownOccurrences.id, u.id));
              }
              await db
                .insert(breakdownSceneState)
                .values({
                  sceneId: scene.id,
                  screenplayVersionId: data.screenplayVersionId,
                  textHash: currentHash,
                })
                .onConflictDoUpdate({
                  target: [
                    breakdownSceneState.sceneId,
                    breakdownSceneState.screenplayVersionId,
                  ],
                  set: { textHash: currentHash },
                });
              return rows.map((r, i) => ({
                ...r,
                occ: { ...r.occ, isStale: updates[i].isStale },
              }));
            })(),
            (e) => new DbError("getBreakdownForScene/rematchUpdate", e),
          );
        })
        .map((rows) =>
          rows.map((r) => ({
            occurrence: BreakdownOccurrenceSchema.parse({
              ...r.occ,
              createdAt: r.occ.createdAt.toISOString(),
              updatedAt: r.occ.updatedAt.toISOString(),
            }),
            element: BreakdownElementSchema.parse({
              ...r.el,
              archivedAt: r.el.archivedAt?.toISOString() ?? null,
              createdAt: r.el.createdAt.toISOString(),
              updatedAt: r.el.updatedAt.toISOString(),
            }),
          })),
        );

      return toShape(result);
    },
  );
```

> NB: `resolveProjectAccess` may need to be created if it doesn't exist — see `screenplay-editor/server/screenplay-export.server.ts` for an existing access-check pattern. If absent, inline the access check using `personalOwnerId` + `teamMembers` queries.

- [ ] **Step 2: Commit:**

```bash
git add apps/web/app/features/breakdown/server/breakdown.server.ts
git commit -m "[OHW] feat(breakdown): server fn getBreakdownForScene with L1 rematch (Spec 10)"
```

### Task C3: `getProjectBreakdown` (consolidated view)

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts` (append)

- [ ] **Step 1: Append:**

```typescript
export interface ProjectBreakdownRow {
  element: z.infer<typeof BreakdownElementSchema>;
  totalQuantity: number;
  scenesPresent: { sceneId: string; sceneNumber: number }[];
  hasStale: boolean;
}

export const getProjectBreakdown = createServerFn({ method: "GET" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<ProjectBreakdownRow[], ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      // Auth check via project access
      const access = await resolveProjectAccessByProjectId(
        user.id,
        data.projectId,
      );
      if (!canViewBreakdown(access))
        return toShape(err(new ForbiddenError("view breakdown")));

      const result = await ResultAsync.fromPromise(
        db
          .select({
            el: breakdownElements,
            occ: breakdownOccurrences,
            scene: scenes,
          })
          .from(breakdownElements)
          .leftJoin(
            breakdownOccurrences,
            and(
              eq(breakdownOccurrences.elementId, breakdownElements.id),
              eq(
                breakdownOccurrences.screenplayVersionId,
                data.screenplayVersionId,
              ),
            ),
          )
          .leftJoin(scenes, eq(scenes.id, breakdownOccurrences.sceneId))
          .where(
            and(
              eq(breakdownElements.projectId, data.projectId),
              isNull(breakdownElements.archivedAt),
            ),
          ),
        (e) => new DbError("getProjectBreakdown", e),
      ).map((rows) => {
        // Group by element id
        const byElement = new Map<string, ProjectBreakdownRow>();
        for (const r of rows) {
          const key = r.el.id;
          const existing = byElement.get(key);
          const elementParsed = BreakdownElementSchema.parse({
            ...r.el,
            archivedAt: r.el.archivedAt?.toISOString() ?? null,
            createdAt: r.el.createdAt.toISOString(),
            updatedAt: r.el.updatedAt.toISOString(),
          });
          if (!existing) {
            byElement.set(key, {
              element: elementParsed,
              totalQuantity: r.occ?.quantity ?? 0,
              scenesPresent:
                r.occ && r.scene
                  ? [{ sceneId: r.scene.id, sceneNumber: r.scene.number }]
                  : [],
              hasStale: r.occ?.isStale ?? false,
            });
          } else if (r.occ && r.scene) {
            existing.totalQuantity += r.occ.quantity;
            existing.scenesPresent.push({
              sceneId: r.scene.id,
              sceneNumber: r.scene.number,
            });
            if (r.occ.isStale) existing.hasStale = true;
          }
        }
        return [...byElement.values()];
      });

      return toShape(result);
    },
  );
```

- [ ] **Step 2: Commit:**

```bash
git add apps/web/app/features/breakdown/server/breakdown.server.ts
git commit -m "[OHW] feat(breakdown): server fn getProjectBreakdown (consolidated view) (Spec 10)"
```

### Task C4: `getStaleScenes` (for L2 editor badge)

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts` (append)

- [ ] **Step 1: Append:**

```typescript
export const getStaleScenes = createServerFn({ method: "GET" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<string[], DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      db
        .selectDistinct({ sceneId: breakdownOccurrences.sceneId })
        .from(breakdownOccurrences)
        .where(
          and(
            eq(
              breakdownOccurrences.screenplayVersionId,
              data.screenplayVersionId,
            ),
            eq(breakdownOccurrences.isStale, true),
          ),
        ),
      (e) => new DbError("getStaleScenes", e),
    ).map((rows) => rows.map((r) => r.sceneId));
    return toShape(result);
  });
```

- [ ] **Step 2: Commit:**

```bash
git commit -am "[OHW] feat(breakdown): server fn getStaleScenes for L2 editor badge (Spec 10)"
```

### Task C5: `addBreakdownElement` + `addOccurrence` (manual)

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts` (append)

- [ ] **Step 1: Append:**

```typescript
const AddElementInputSchema = z.object({
  projectId: z.string().uuid(),
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  occurrence: z
    .object({
      sceneId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
      quantity: z.number().int().positive().default(1),
      note: z.string().nullable().optional(),
    })
    .optional(),
});

export const addBreakdownElement = createServerFn({ method: "POST" })
  .validator(AddElementInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { elementId: string; occurrenceId: string | null },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      const access = await resolveProjectAccessByProjectId(
        user.id,
        data.projectId,
      );
      if (!canEditBreakdown(access))
        return toShape(err(new ForbiddenError("add element")));

      const result = await ResultAsync.fromPromise(
        db
          .insert(breakdownElements)
          .values({
            projectId: data.projectId,
            category: data.category,
            name: data.name,
            description: data.description ?? null,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: { updatedAt: new Date(), archivedAt: null },
          })
          .returning(),
        (e) => new DbError("addBreakdownElement/upsert", e),
      ).andThen(([elRow]) => {
        if (!data.occurrence)
          return ok({
            elementId: elRow.id,
            occurrenceId: null as string | null,
          });
        return ResultAsync.fromPromise(
          db
            .insert(breakdownOccurrences)
            .values({
              elementId: elRow.id,
              sceneId: data.occurrence!.sceneId,
              screenplayVersionId: data.occurrence!.screenplayVersionId,
              quantity: data.occurrence!.quantity,
              note: data.occurrence!.note ?? null,
              cesareStatus: "accepted",
            })
            .onConflictDoUpdate({
              target: [
                breakdownOccurrences.elementId,
                breakdownOccurrences.screenplayVersionId,
                breakdownOccurrences.sceneId,
              ],
              set: {
                quantity: data.occurrence!.quantity,
                note: data.occurrence!.note ?? null,
                updatedAt: new Date(),
              },
            })
            .returning(),
          (e) => new DbError("addBreakdownElement/insertOcc", e),
        ).map(([occRow]) => ({ elementId: elRow.id, occurrenceId: occRow.id }));
      });

      return toShape(result);
    },
  );
```

- [ ] **Step 2: Commit:**

```bash
git commit -am "[OHW] feat(breakdown): server fn addBreakdownElement (manual add + upsert) (Spec 10)"
```

### Task C6: `updateElement` (rename cascade) + `archiveElement` (soft delete)

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts` (append)

- [ ] **Step 1: Append:**

```typescript
export const updateBreakdownElement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      elementId: z.string().uuid(),
      patch: z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<BreakdownElement, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();
      // Permission: load element, check project access
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(breakdownElements)
          .where(eq(breakdownElements.id, data.elementId))
          .then((r) => r[0]),
        (e) => new DbError("updateBreakdownElement/load", e),
      )
        .andThen((el) =>
          el ? ok(el) : err(new DbError("updateBreakdownElement", "not found")),
        )
        .andThen((el) =>
          resolveProjectAccessByProjectId(user.id, el.projectId).map(
            (access) => ({ el, access }),
          ),
        )
        .andThen(({ el, access }) =>
          canEditBreakdown(access)
            ? ok(el)
            : err(new ForbiddenError("update element")),
        )
        .andThen((el) =>
          ResultAsync.fromPromise(
            db
              .update(breakdownElements)
              .set({
                ...(data.patch.name && { name: data.patch.name }),
                ...(data.patch.description !== undefined && {
                  description: data.patch.description,
                }),
                updatedAt: new Date(),
              })
              .where(eq(breakdownElements.id, el.id))
              .returning(),
            (e) => new DbError("updateBreakdownElement/update", e),
          ),
        )
        .map(([row]) =>
          BreakdownElementSchema.parse({
            ...row,
            archivedAt: row.archivedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }),
        );
      return toShape(result);
    },
  );

export const archiveBreakdownElement = createServerFn({ method: "POST" })
  .validator(z.object({ elementId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ ok: true }, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .select()
          .from(breakdownElements)
          .where(eq(breakdownElements.id, data.elementId))
          .then((r) => r[0]),
        (e) => new DbError("archiveBreakdownElement/load", e),
      )
        .andThen((el) =>
          el
            ? ok(el)
            : err(new DbError("archiveBreakdownElement", "not found")),
        )
        .andThen((el) =>
          resolveProjectAccessByProjectId(user.id, el.projectId).map(
            (access) => ({ el, access }),
          ),
        )
        .andThen(({ el, access }) =>
          canEditBreakdown(access)
            ? ok(el)
            : err(new ForbiddenError("archive element")),
        )
        .andThen((el) =>
          ResultAsync.fromPromise(
            db
              .update(breakdownElements)
              .set({ archivedAt: new Date() })
              .where(eq(breakdownElements.id, el.id)),
            (e) => new DbError("archiveBreakdownElement/update", e),
          ),
        )
        .map(() => ({ ok: true as const }));
      return toShape(result);
    },
  );
```

- [ ] **Step 2: Commit:**

```bash
git commit -am "[OHW] feat(breakdown): server fns updateBreakdownElement + archiveBreakdownElement (Spec 10)"
```

### Task C7: `acceptOccurrence` + `ignoreOccurrence` (single + bulk)

**Files:**

- Modify: `apps/web/app/features/breakdown/server/breakdown.server.ts` (append)

- [ ] **Step 1: Append:**

```typescript
import { inArray } from "drizzle-orm";

const SetStatusInputSchema = z.object({
  occurrenceIds: z.array(z.string().uuid()).min(1),
  status: CesareStatusSchema,
});

export const setOccurrenceStatus = createServerFn({ method: "POST" })
  .validator(SetStatusInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ updated: number }, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();
      // Permission: load all occurrences → projectIds via element → check access
      const result = await ResultAsync.fromPromise(
        db
          .select({
            projectId: breakdownElements.projectId,
            occId: breakdownOccurrences.id,
          })
          .from(breakdownOccurrences)
          .innerJoin(
            breakdownElements,
            eq(breakdownOccurrences.elementId, breakdownElements.id),
          )
          .where(inArray(breakdownOccurrences.id, data.occurrenceIds)),
        (e) => new DbError("setOccurrenceStatus/load", e),
      )
        .andThen((rows) => {
          if (rows.length === 0) return ok([] as typeof rows);
          const projectIds = [...new Set(rows.map((r) => r.projectId))];
          // Check access for all distinct projects
          return ResultAsync.combine(
            projectIds.map((pid) =>
              resolveProjectAccessByProjectId(user.id, pid).andThen((access) =>
                canEditBreakdown(access)
                  ? ok(true)
                  : err(new ForbiddenError("update status")),
              ),
            ),
          ).map(() => rows);
        })
        .andThen((rows) =>
          ResultAsync.fromPromise(
            db
              .update(breakdownOccurrences)
              .set({ cesareStatus: data.status, updatedAt: new Date() })
              .where(
                inArray(
                  breakdownOccurrences.id,
                  rows.map((r) => r.occId),
                ),
              ),
            (e) => new DbError("setOccurrenceStatus/update", e),
          ).map(() => ({ updated: rows.length })),
        );
      return toShape(result);
    },
  );
```

- [ ] **Step 2: Commit:**

```bash
git commit -am "[OHW] feat(breakdown): server fn setOccurrenceStatus single+bulk (Spec 10)"
```

### Task C8: Cesare prompt + tool schema (lib only, server fn next)

**Files:**

- Create: `apps/web/app/features/breakdown/lib/cesare-prompt.ts`

- [ ] **Step 1: Implement:**

```typescript
import { CATEGORY_META, BREAKDOWN_CATEGORIES } from "@oh-writers/domain";

export const CESARE_SYSTEM_PROMPT = `
Sei Cesare, l'aiuto regia AI di Oh Writers. Il tuo compito: estrarre gli **elementi di produzione** da una scena di sceneggiatura in formato Fountain.

Categorie consentite (esattamente queste 14):
${BREAKDOWN_CATEGORIES.map((c) => `- ${c} (${CATEGORY_META[c].labelIt} / ${CATEGORY_META[c].labelEn})`).join("\n")}

Regole:
1. Estrai SOLO elementi esplicitamente presenti o fortemente impliciti nel testo.
2. Mai inventare elementi non supportati dalla scena.
3. Per personaggi: includili in 'cast' SOLO se nominati come characters (CAPS in fountain) — non includere "qualcuno", "una donna", ecc.
4. Per oggetti generici (sedia, tavolo) NON includerli a meno che non siano essenziali alla scena.
5. La quantità di default è 1; usa numeri esplicitamente menzionati ("three cars" → quantity 3).
6. Restituisci una breve "rationale" per ciascun elemento (max 80 caratteri).
7. Se la scena è vuota o troppo astratta, ritorna suggestions: [].
`.trim();

export const FEW_SHOT_EXAMPLES = [
  {
    sceneText:
      "INT. WAREHOUSE - NIGHT\n\nRICK enters carrying a BLOODY KNIFE. Three POLICE CARS block the exit. A DOG barks. 50 EXTRAS in riot gear storm in.\n\nRICK\n  Get back!",
    suggestions: [
      {
        category: "cast",
        name: "Rick",
        quantity: 1,
        description: null,
        rationale: "Personaggio con dialogo",
      },
      {
        category: "props",
        name: "Bloody knife",
        quantity: 1,
        description: "Coltello insanguinato",
        rationale: "Oggetto portato da Rick",
      },
      {
        category: "vehicles",
        name: "Police car",
        quantity: 3,
        description: null,
        rationale: "Three police cars menzionate",
      },
      {
        category: "animals",
        name: "Dog",
        quantity: 1,
        description: null,
        rationale: "A dog barks",
      },
      {
        category: "extras",
        name: "Riot squad",
        quantity: 50,
        description: "Comparse in tenuta antisommossa",
        rationale: "50 EXTRAS in riot gear",
      },
    ],
  },
];

export const CESARE_TOOL_DEFINITION = {
  name: "submit_breakdown_suggestions",
  description: "Restituisce gli elementi di produzione estratti dalla scena.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: BREAKDOWN_CATEGORIES },
            name: { type: "string", maxLength: 200 },
            quantity: { type: "integer", minimum: 1 },
            description: { type: ["string", "null"] },
            rationale: { type: ["string", "null"] },
          },
          required: ["category", "name", "quantity"],
        },
      },
    },
    required: ["suggestions"],
  },
};
```

- [ ] **Step 2: Commit:**

```bash
git add apps/web/app/features/breakdown/lib/cesare-prompt.ts
git commit -m "[OHW] feat(breakdown): Cesare system prompt + few-shot + tool schema (Spec 10)"
```

### Task C9: Mock for `MOCK_AI=true`

**Files:**

- Modify: `mocks/ai-responses.ts` (or create if absent — find with `find . -name "ai-responses.ts"`)

- [ ] **Step 1: Append/extend:**

```typescript
import type { CesareSuggestion } from "@oh-writers/domain";

export const mockCesareBreakdownForScene = (
  sceneText: string,
): CesareSuggestion[] => {
  const text = sceneText.toLowerCase();
  // Deterministic "warehouse" fixture
  if (text.includes("warehouse") && text.includes("rick")) {
    return [
      {
        category: "cast",
        name: "Rick",
        quantity: 1,
        description: null,
        rationale: "Personaggio con dialogo",
      },
      {
        category: "props",
        name: "Bloody knife",
        quantity: 1,
        description: null,
        rationale: "Oggetto portato",
      },
      {
        category: "vehicles",
        name: "Police car",
        quantity: 3,
        description: null,
        rationale: "Three police cars",
      },
      {
        category: "animals",
        name: "Dog",
        quantity: 1,
        description: null,
        rationale: "A dog barks",
      },
      {
        category: "extras",
        name: "Riot squad",
        quantity: 50,
        description: null,
        rationale: "50 EXTRAS in riot gear",
      },
    ];
  }
  // Fallback: regex CAPS for character candidates
  const caps = [
    ...new Set([...sceneText.matchAll(/\b[A-Z]{3,}\b/g)].map((m) => m[0])),
  ];
  return caps.slice(0, 3).map((name) => ({
    category: "cast" as const,
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    quantity: 1,
    description: null,
    rationale: "CAPS heuristic",
  }));
};
```

- [ ] **Step 2: Commit:**

```bash
git add mocks/ai-responses.ts
git commit -m "[OHW] feat(breakdown): mockCesareBreakdownForScene (Spec 10)"
```

### Task C10: `suggestBreakdownForScene` server fn

**Files:**

- Create: `apps/web/app/features/breakdown/server/cesare-suggest.server.ts`
- Create: `apps/web/app/features/breakdown/lib/rate-limit.ts`

- [ ] **Step 1: Implement rate-limit lib:**

```typescript
// rate-limit.ts
import { eq, and, gt } from "drizzle-orm";
import { breakdownRateLimits } from "@oh-writers/db/schema";
import { ResultAsync, ok, err } from "neverthrow";
import { DbError } from "@oh-writers/utils/errors";
import type { Db } from "~/server/db";

export class RateLimitedError {
  readonly _tag = "RateLimitedError" as const;
  readonly message: string;
  constructor(readonly retryAfterMs: number) {
    this.message = `Rate limited; retry in ${Math.ceil(retryAfterMs / 1000)}s`;
  }
}

export const checkAndStampRateLimit = (
  db: Db,
  projectId: string,
  action: string,
  cooldownMs: number,
): ResultAsync<void, RateLimitedError | DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(breakdownRateLimits)
      .where(
        and(
          eq(breakdownRateLimits.projectId, projectId),
          eq(breakdownRateLimits.action, action),
        ),
      )
      .then((r) => r[0]),
    (e) => new DbError("checkRateLimit/load", e),
  ).andThen((row) => {
    const now = Date.now();
    if (row && now - row.lastInvokedAt.getTime() < cooldownMs) {
      const retryAfterMs = cooldownMs - (now - row.lastInvokedAt.getTime());
      return err(new RateLimitedError(retryAfterMs));
    }
    return ResultAsync.fromPromise(
      db
        .insert(breakdownRateLimits)
        .values({ projectId, action, lastInvokedAt: new Date(now) })
        .onConflictDoUpdate({
          target: [breakdownRateLimits.projectId, breakdownRateLimits.action],
          set: { lastInvokedAt: new Date(now) },
        }),
      (e) => new DbError("checkRateLimit/stamp", e),
    ).map(() => undefined);
  });
```

- [ ] **Step 2: Implement `cesare-suggest.server.ts`:**

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import Anthropic from "@anthropic-ai/sdk";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
} from "@oh-writers/db/schema";
import {
  SuggestionListSchema,
  type CesareSuggestion,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { ForbiddenError, DbError } from "@oh-writers/utils/errors";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { canEditBreakdown } from "../lib/permissions";
import { hashSceneText } from "../lib/hash-scene";
import {
  CESARE_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  CESARE_TOOL_DEFINITION,
} from "../lib/cesare-prompt";
import { mockCesareBreakdownForScene } from "../../../../mocks/ai-responses";
import { resolveProjectAccess } from "~/server/project-access";

export interface SuggestResult {
  newPending: number;
  totalSuggested: number;
}

export const suggestBreakdownForScene = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<SuggestResult, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db
          .select({ scene: scenes })
          .from(scenes)
          .where(eq(scenes.id, data.sceneId))
          .then((r) => r[0]),
        (e) => new DbError("suggest/loadScene", e),
      )
        .andThen((row) =>
          row ? ok(row.scene) : err(new DbError("suggest", "scene not found")),
        )
        .andThen((scene) =>
          resolveProjectAccess(user.id, scene.screenplayId).map((access) => ({
            scene,
            access,
          })),
        )
        .andThen(({ scene, access }) =>
          canEditBreakdown(access)
            ? ok({ scene, projectId: access.projectId })
            : err(new ForbiddenError("run cesare")),
        )
        .andThen(({ scene, projectId }) => {
          const sceneText = scene.heading + "\n" + (scene.notes ?? "");
          const suggestions: CesareSuggestion[] =
            process.env["MOCK_AI"] === "true"
              ? mockCesareBreakdownForScene(sceneText)
              : []; // real Anthropic path implemented below if MOCK_AI != true
          return process.env["MOCK_AI"] === "true"
            ? okAsync({ scene, projectId, suggestions, sceneText })
            : ResultAsync.fromPromise(
                callCesare(sceneText),
                (e) => new DbError("suggest/anthropic", e),
              ).map((s) => ({ scene, projectId, suggestions: s, sceneText }));
        })
        .andThen(({ scene, projectId, suggestions, sceneText }) =>
          persistSuggestions(db, {
            sceneId: scene.id,
            projectId,
            screenplayVersionId: data.screenplayVersionId,
            suggestions,
            sceneText,
          }),
        );

      return toShape(result);
    },
  );

const callCesare = async (sceneText: string): Promise<CesareSuggestion[]> => {
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"]! });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CESARE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: JSON.stringify(FEW_SHOT_EXAMPLES),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CESARE_TOOL_DEFINITION as any],
    tool_choice: { type: "tool", name: "submit_breakdown_suggestions" },
    messages: [{ role: "user", content: sceneText }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const parsed = SuggestionListSchema.safeParse(toolUse.input);
  return parsed.success ? parsed.data.suggestions : [];
};

const persistSuggestions = (
  db: any,
  params: {
    sceneId: string;
    projectId: string;
    screenplayVersionId: string;
    suggestions: CesareSuggestion[];
    sceneText: string;
  },
) =>
  ResultAsync.fromPromise(
    (async () => {
      let newPending = 0;
      for (const s of params.suggestions) {
        // upsert element
        const [el] = await db
          .insert(breakdownElements)
          .values({
            projectId: params.projectId,
            category: s.category,
            name: s.name,
            description: s.description ?? null,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: { updatedAt: new Date(), archivedAt: null },
          })
          .returning();
        // check existing occurrence
        const existing = await db
          .select()
          .from(breakdownOccurrences)
          .where(
            and(
              eq(breakdownOccurrences.elementId, el.id),
              eq(
                breakdownOccurrences.screenplayVersionId,
                params.screenplayVersionId,
              ),
              eq(breakdownOccurrences.sceneId, params.sceneId),
            ),
          )
          .then((r: any[]) => r[0]);
        if (existing) {
          // skip if accepted or ignored — only re-add if not present
          continue;
        }
        await db.insert(breakdownOccurrences).values({
          elementId: el.id,
          screenplayVersionId: params.screenplayVersionId,
          sceneId: params.sceneId,
          quantity: s.quantity,
          cesareStatus: "pending",
        });
        newPending++;
      }
      // update hash + last cesare run
      await db
        .insert(breakdownSceneState)
        .values({
          sceneId: params.sceneId,
          screenplayVersionId: params.screenplayVersionId,
          textHash: hashSceneText(params.sceneText),
          lastCesareRunAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            breakdownSceneState.sceneId,
            breakdownSceneState.screenplayVersionId,
          ],
          set: {
            textHash: hashSceneText(params.sceneText),
            lastCesareRunAt: new Date(),
          },
        });
      return { newPending, totalSuggested: params.suggestions.length };
    })(),
    (e) => new DbError("suggest/persist", e),
  );

import { okAsync } from "neverthrow";
```

- [ ] **Step 3: Commit:**

```bash
git add apps/web/app/features/breakdown/server/cesare-suggest.server.ts apps/web/app/features/breakdown/lib/rate-limit.ts
git commit -m "[OHW] feat(breakdown): suggestBreakdownForScene Cesare server fn + rate-limit lib (Spec 10)"
```

### Task C11: `cloneBreakdownToVersion` (L3 trigger on new version)

**Files:**

- Create: `apps/web/app/features/breakdown/server/clone-version.server.ts`

- [ ] **Step 1: Implement:**

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  breakdownOccurrences,
  breakdownSceneState,
  breakdownElements,
  scenes,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { ForbiddenError, DbError } from "@oh-writers/utils/errors";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { canEditBreakdown } from "../lib/permissions";
import { hashSceneText } from "../lib/hash-scene";
import { findElementInText } from "../lib/re-match";
import { resolveProjectAccessByScreenplayVersion } from "~/server/project-access"; // helper to add if missing

export const cloneBreakdownToVersion = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fromVersionId: z.string().uuid(),
      toVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { cloned: number; staleCount: number },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveProjectAccessByScreenplayVersion(
        user.id,
        data.toVersionId,
      );
      if (!canEditBreakdown(access))
        return toShape(err(new ForbiddenError("clone breakdown")));

      const result = await ResultAsync.fromPromise(
        (async () => {
          // 1. load all occurrences of fromVersion with their element + scene text
          const sourceRows = await db
            .select({
              occ: breakdownOccurrences,
              el: breakdownElements,
              scene: scenes,
            })
            .from(breakdownOccurrences)
            .innerJoin(
              breakdownElements,
              eq(breakdownOccurrences.elementId, breakdownElements.id),
            )
            .innerJoin(scenes, eq(scenes.id, breakdownOccurrences.sceneId))
            .where(
              eq(breakdownOccurrences.screenplayVersionId, data.fromVersionId),
            );

          let cloned = 0;
          let staleCount = 0;
          const sceneHashes = new Map<string, string>();

          for (const r of sourceRows) {
            const sceneText = r.scene.heading + "\n" + (r.scene.notes ?? "");
            const isStale = !findElementInText(r.el.name, sceneText);
            if (isStale) staleCount++;

            await db
              .insert(breakdownOccurrences)
              .values({
                elementId: r.el.id,
                screenplayVersionId: data.toVersionId,
                sceneId: r.scene.id,
                quantity: r.occ.quantity,
                note: r.occ.note,
                cesareStatus: r.occ.cesareStatus,
                isStale,
              })
              .onConflictDoNothing();
            cloned++;

            if (!sceneHashes.has(r.scene.id)) {
              sceneHashes.set(r.scene.id, hashSceneText(sceneText));
            }
          }

          for (const [sceneId, hash] of sceneHashes) {
            await db
              .insert(breakdownSceneState)
              .values({
                sceneId,
                screenplayVersionId: data.toVersionId,
                textHash: hash,
              })
              .onConflictDoUpdate({
                target: [
                  breakdownSceneState.sceneId,
                  breakdownSceneState.screenplayVersionId,
                ],
                set: { textHash: hash },
              });
          }

          return { cloned, staleCount };
        })(),
        (e) => new DbError("cloneBreakdownToVersion", e),
      );

      return toShape(result);
    },
  );
```

- [ ] **Step 2: Commit:**

```bash
git add apps/web/app/features/breakdown/server/clone-version.server.ts
git commit -m "[OHW] feat(breakdown): cloneBreakdownToVersion server fn (Spec 10 L3)"
```

### Task C12: Export PDF + CSV server fns

**Files:**

- Create: `apps/web/app/features/breakdown/lib/export-csv.ts`
- Create: `apps/web/app/features/breakdown/lib/export-pdf.ts`
- Create: `apps/web/app/features/breakdown/server/export.server.ts`

- [ ] **Step 1: CSV emitter:**

```typescript
// export-csv.ts
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

interface ExportRow {
  category: BreakdownCategory;
  name: string;
  description: string | null;
  totalQuantity: number;
  scenes: number[];
}

const escapeCsv = (s: string): string =>
  /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

export const breakdownToCsv = (rows: ExportRow[]): string => {
  const header = ["Category", "Name", "Description", "Total", "Scenes"].join(
    ",",
  );
  const lines = rows.map((r) =>
    [
      escapeCsv(CATEGORY_META[r.category].labelEn),
      escapeCsv(r.name),
      escapeCsv(r.description ?? ""),
      String(r.totalQuantity),
      escapeCsv(r.scenes.join(", ")),
    ].join(","),
  );
  return [header, ...lines].join("\n");
};
```

- [ ] **Step 2: PDF builder (PDFKit):**

```typescript
// export-pdf.ts
import PDFDocument from "pdfkit";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

interface PdfRow {
  category: BreakdownCategory;
  name: string;
  totalQuantity: number;
  scenes: number[];
}

export const buildBreakdownPdf = (
  projectTitle: string,
  rows: PdfRow[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .font("Courier-Bold")
      .fontSize(14)
      .text(`${projectTitle} — Breakdown`, { align: "center" });
    doc.moveDown();

    // Group by category
    const byCat = new Map<BreakdownCategory, PdfRow[]>();
    for (const r of rows) {
      const list = byCat.get(r.category) ?? [];
      list.push(r);
      byCat.set(r.category, list);
    }

    for (const [cat, items] of byCat) {
      doc
        .font("Courier-Bold")
        .fontSize(11)
        .text(`${CATEGORY_META[cat].labelEn} (${items.length})`);
      doc.font("Courier").fontSize(9);
      for (const it of items) {
        const scenes =
          it.scenes.length > 6
            ? `${it.scenes.slice(0, 6).join(", ")}…`
            : it.scenes.join(", ");
        doc.text(`  • ${it.name}  ×${it.totalQuantity}  → scenes ${scenes}`);
      }
      doc.moveDown(0.5);
    }
    doc.end();
  });
```

- [ ] **Step 3: Server fn:**

```typescript
// export.server.ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, ok, err } from "neverthrow";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { ForbiddenError, DbError } from "@oh-writers/utils/errors";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { canViewBreakdown } from "../lib/permissions";
import { resolveProjectAccessByProjectId } from "~/server/project-access";
import { breakdownToCsv } from "../lib/export-csv";
import { buildBreakdownPdf } from "../lib/export-pdf";
import { getProjectBreakdownRows } from "./breakdown.server"; // refactor: extract pure data fn

export const exportBreakdownPdf = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      const access = await resolveProjectAccessByProjectId(
        user.id,
        data.projectId,
      );
      if (!canViewBreakdown(access))
        return toShape(err(new ForbiddenError("export breakdown")));

      const result = await getProjectBreakdownRows(
        db,
        data.projectId,
        data.screenplayVersionId,
      )
        .andThen((rows) =>
          ResultAsync.fromPromise(
            buildBreakdownPdf(
              access.projectTitle,
              rows.map((r) => ({
                category: r.element.category,
                name: r.element.name,
                totalQuantity: r.totalQuantity,
                scenes: r.scenesPresent
                  .map((s) => s.sceneNumber)
                  .sort((a, b) => a - b),
              })),
            ),
            (e) => new DbError("export/pdf", e),
          ),
        )
        .map((buf) => ({
          pdfBase64: buf.toString("base64"),
          filename: `breakdown-${access.projectSlug}-${new Date().toISOString().slice(0, 10)}.pdf`,
        }));
      return toShape(result);
    },
  );

export const exportBreakdownCsv = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ csv: string; filename: string }, ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();
      const access = await resolveProjectAccessByProjectId(
        user.id,
        data.projectId,
      );
      if (!canViewBreakdown(access))
        return toShape(err(new ForbiddenError("export breakdown")));

      const result = await getProjectBreakdownRows(
        db,
        data.projectId,
        data.screenplayVersionId,
      ).map((rows) => ({
        csv: breakdownToCsv(
          rows.map((r) => ({
            category: r.element.category,
            name: r.element.name,
            description: r.element.description,
            totalQuantity: r.totalQuantity,
            scenes: r.scenesPresent
              .map((s) => s.sceneNumber)
              .sort((a, b) => a - b),
          })),
        ),
        filename: `breakdown-${access.projectSlug}-${new Date().toISOString().slice(0, 10)}.csv`,
      }));
      return toShape(result);
    },
  );
```

> **Refactor note:** extract `getProjectBreakdownRows(db, projectId, versionId)` as a pure ResultAsync helper from the existing server fn; the createServerFn wrapper just calls it + does auth.

- [ ] **Step 4: Commit:**

```bash
git add apps/web/app/features/breakdown/lib/export-csv.ts apps/web/app/features/breakdown/lib/export-pdf.ts apps/web/app/features/breakdown/server/export.server.ts
git commit -m "[OHW] feat(breakdown): export PDF + CSV server fns (Spec 10)"
```

---

## Phase D — UI composition (TDD via Playwright E2E)

> **Pattern reference:**
>
> - Modal + preview-tab pattern: `apps/web/app/features/documents/lib/pdf-preview.ts`, `ExportPdfModal.tsx`, `useExportNarrativePdf.ts`
> - createServerFn → useMutation hook: `useExportNarrativePdf.ts`
> - Test fixture pattern: `tests/fixtures.ts` (authenticatedPage, authenticatedViewerPage)

### Task D1: Test helpers + breakdown fixtures

**Files:**

- Create: `tests/breakdown/helpers.ts`
- Create: `packages/db/src/seed/fixtures/breakdown-fixtures.ts`
- Modify: `packages/db/src/seed/index.ts`

- [ ] **Step 1: Seed fixture (deterministic):**

```typescript
// breakdown-fixtures.ts
export const TEST_BREAKDOWN_ELEMENT_ID = "00000000-0000-4000-a000-000000010001";
export const TEST_BREAKDOWN_OCCURRENCE_ID =
  "00000000-0000-4000-a000-000000010002";
// Used by tests that need a pre-existing element to assert "already breakdown-ed" cases
```

Seed (in `packages/db/src/seed/index.ts`, after scenes seed):

```typescript
import { breakdownElements, breakdownOccurrences } from "../schema/breakdown";
// ... after seeding scenes, optionally pre-seed a couple elements per the fixture file
```

- [ ] **Step 2: Test helpers `tests/breakdown/helpers.ts`:**

```typescript
import { type Page, expect } from "@playwright/test";

export const navigateToBreakdown = async (page: Page, projectId: string) => {
  await page.goto(`/projects/${projectId}/breakdown`);
  await expect(page.getByTestId("breakdown-page")).toBeVisible({
    timeout: 10_000,
  });
};

export const openSceneInBreakdown = async (page: Page, sceneNumber: number) => {
  await page.getByTestId(`scene-toc-item-${sceneNumber}`).click();
  await expect(page.getByTestId(`scene-${sceneNumber}-heading`)).toBeVisible();
};

export const acceptGhostTag = async (page: Page, elementName: string) => {
  const tag = page.getByTestId(`ghost-tag-${elementName}`);
  await tag.click();
  await expect(page.getByTestId(`accepted-tag-${elementName}`)).toBeVisible();
};
```

- [ ] **Step 3: Commit:**

```bash
git add tests/breakdown/helpers.ts packages/db/src/seed/fixtures/breakdown-fixtures.ts packages/db/src/seed/index.ts
git commit -m "[OHW] test(breakdown): seed fixture + helpers (Spec 10)"
```

### Task D2: Route + base layout

**Files:**

- Create: `apps/web/app/routes/projects.$id.breakdown.tsx`
- Create: `apps/web/app/features/breakdown/components/BreakdownPage.tsx` + css

- [ ] **Step 1: E2E test (failing) `tests/breakdown/breakdown-cesare.spec.ts`:**

```typescript
import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { navigateToBreakdown } from "./helpers";

test.use({ storageState: undefined });
test.beforeAll(({}, testInfo) => {
  process.env["MOCK_AI"] = "true";
});

test("[OHW-240] opens /breakdown, sees 3-pane layout with TOC + script + panel", async ({
  authenticatedPage,
}) => {
  await navigateToBreakdown(
    authenticatedPage,
    "00000000-0000-4000-a000-000000000011",
  );
  await expect(authenticatedPage.getByTestId("breakdown-toc")).toBeVisible();
  await expect(authenticatedPage.getByTestId("breakdown-script")).toBeVisible();
  await expect(authenticatedPage.getByTestId("breakdown-panel")).toBeVisible();
  await expect(
    authenticatedPage.getByRole("tab", { name: /Per scena/i }),
  ).toHaveAttribute("aria-selected", "true");
});
```

- [ ] **Step 2: Run, expect FAIL** (`breakdown-page` testid not found):

```bash
pnpm test:e2e tests/breakdown/breakdown-cesare.spec.ts -g "OHW-240"
```

- [ ] **Step 3: Implement route file:**

```tsx
// apps/web/app/routes/projects.$id.breakdown.tsx
import { createFileRoute } from "@tanstack/react-router";
import { BreakdownPage } from "~/features/breakdown/components/BreakdownPage";

export const Route = createFileRoute("/projects/$id/breakdown")({
  component: () => {
    const { id } = Route.useParams();
    return <BreakdownPage projectId={id} />;
  },
});
```

- [ ] **Step 4: Implement BreakdownPage.tsx (skeleton):**

```tsx
import { useState } from "react";
import { Tabs } from "@oh-writers/ui";
import { SceneTOC } from "./SceneTOC";
import { SceneScriptViewer } from "./SceneScriptViewer";
import { BreakdownPanel } from "./BreakdownPanel";
import { ProjectBreakdownTable } from "./ProjectBreakdownTable";
import { ExportBreakdownModal } from "./ExportBreakdownModal";
import styles from "./BreakdownPage.module.css";

export const BreakdownPage = ({ projectId }: { projectId: string }) => {
  const [activeTab, setActiveTab] = useState<"per-scene" | "per-project">(
    "per-scene",
  );
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  return (
    <main className={styles.page} data-testid="breakdown-page">
      <header className={styles.header}>
        <Tabs
          tabs={[
            { id: "per-scene", label: "Per scena" },
            { id: "per-project", label: "Per progetto" },
          ]}
          activeTab={activeTab}
          onTabChange={(t) => setActiveTab(t as typeof activeTab)}
        />
        <ExportBreakdownModalTrigger projectId={projectId} />
      </header>

      {activeTab === "per-scene" ? (
        <div className={styles.split}>
          <aside className={styles.toc} data-testid="breakdown-toc">
            <SceneTOC
              projectId={projectId}
              activeSceneId={activeSceneId}
              onSceneSelect={setActiveSceneId}
            />
          </aside>
          <section className={styles.script} data-testid="breakdown-script">
            <SceneScriptViewer sceneId={activeSceneId} />
          </section>
          <aside className={styles.panel} data-testid="breakdown-panel">
            <BreakdownPanel sceneId={activeSceneId} projectId={projectId} />
          </aside>
        </div>
      ) : (
        <ProjectBreakdownTable projectId={projectId} />
      )}
    </main>
  );
};

const ExportBreakdownModalTrigger = ({ projectId }: { projectId: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        data-testid="breakdown-export-trigger"
        onClick={() => setOpen(true)}
      >
        Export
      </button>
      <ExportBreakdownModal
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
```

- [ ] **Step 5: CSS skeleton:**

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3);
  border-block-end: 1px solid var(--color-border);
}
.split {
  display: grid;
  grid-template-columns: 240px 1fr 360px;
  flex: 1;
  overflow: hidden;
}
.toc,
.panel {
  overflow-y: auto;
  padding: var(--space-3);
  border-inline: 1px solid var(--color-border);
}
.script {
  overflow-y: auto;
  padding: var(--space-4);
}
```

- [ ] **Step 6: Stub the child components** (BreakdownPanel, SceneTOC, SceneScriptViewer, ProjectBreakdownTable, ExportBreakdownModal) with minimal returns (just enough to render the testids):

```tsx
// SceneTOC.tsx (stub)
export const SceneTOC = (_props: any) => <div>TOC</div>;
// etc.
```

- [ ] **Step 7: Run test, expect PASS:**

```bash
pnpm test:e2e tests/breakdown/breakdown-cesare.spec.ts -g "OHW-240"
```

- [ ] **Step 8: Commit:**

```bash
git add apps/web/app/routes/projects.\$id.breakdown.tsx apps/web/app/features/breakdown/components/
git commit -m "[OHW] feat(breakdown): /breakdown route + 3-pane layout shell (Spec 10 OHW-240)"
```

### Task D3: SceneTOC with scene list + filters

**Files:**

- Update: `apps/web/app/features/breakdown/components/SceneTOC.tsx` + css
- Create: `apps/web/app/features/breakdown/hooks/useBreakdown.ts`

- [ ] **Step 1: Implement `useBreakdown.ts`:**

```typescript
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  getBreakdownForScene,
  getProjectBreakdown,
  getStaleScenes,
} from "../server/breakdown.server";

export const breakdownForSceneOptions = (sceneId: string, versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "scene", sceneId, versionId],
    queryFn: async () =>
      unwrapResult(
        await getBreakdownForScene({
          data: { sceneId, screenplayVersionId: versionId },
        }),
      ),
  });

export const projectBreakdownOptions = (projectId: string, versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "project", projectId, versionId],
    queryFn: async () =>
      unwrapResult(
        await getProjectBreakdown({
          data: { projectId, screenplayVersionId: versionId },
        }),
      ),
  });

export const staleScenesOptions = (versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "stale", versionId],
    queryFn: async () =>
      unwrapResult(
        await getStaleScenes({ data: { screenplayVersionId: versionId } }),
      ),
  });
```

- [ ] **Step 2: Implement `SceneTOC.tsx`** with scene list (load scenes via existing screenplay server fn) + stale badge per scene + category filter checkboxes. Skip detailed code — see spec section "Scene Breakdown" diagram. Use `data-testid="scene-toc-item-{number}"`.

- [ ] **Step 3: Run + commit:**

```bash
git add apps/web/app/features/breakdown/components/SceneTOC.tsx apps/web/app/features/breakdown/components/SceneTOC.module.css apps/web/app/features/breakdown/hooks/useBreakdown.ts
git commit -m "[OHW] feat(breakdown): SceneTOC with stale badges + category filters (Spec 10)"
```

### Task D4: SceneScriptViewer (selection-only + ContextMenu)

**Files:**

- Update: `apps/web/app/features/breakdown/components/SceneScriptViewer.tsx` + css

- [ ] **Step 1: Failing test (OHW-245):**

```typescript
test("[OHW-245] selecting text in script + context menu tags as Props", async ({
  authenticatedPage,
}) => {
  await navigateToBreakdown(
    authenticatedPage,
    "00000000-0000-4000-a000-000000000011",
  );
  await openSceneInBreakdown(authenticatedPage, 1);

  // Triple-click to select a word
  const text = authenticatedPage
    .getByTestId("breakdown-script")
    .locator("p")
    .first();
  await text.click({ clickCount: 3 });

  // Expect context menu trigger; right-click or use the visible inline button
  await text.click({ button: "right" });
  await authenticatedPage.getByRole("menuitem", { name: /Oggetti/i }).click();

  // Element appears in panel
  await expect(
    authenticatedPage.getByTestId("breakdown-panel").getByText(/PROPS/),
  ).toBeVisible();
});
```

- [ ] **Step 2: Implement viewer with selection capture, contextmenu open, item click → call `addBreakdownElement`:**

(See spec for layout. Selection text via `window.getSelection()`, anchor coords from `getBoundingClientRect()`. Pass to `<ContextMenu>` from DS.)

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-manual.spec.ts -g "OHW-245"
git add apps/web/app/features/breakdown/components/SceneScriptViewer.tsx apps/web/app/features/breakdown/components/SceneScriptViewer.module.css
git commit -m "[OHW] feat(breakdown): SceneScriptViewer selection-only + tag-from-script (Spec 10 OHW-245)"
```

### Task D5: BreakdownPanel + CesareGhostTag + CesareSuggestionBanner

**Files:**

- Update: `apps/web/app/features/breakdown/components/BreakdownPanel.tsx` + css
- Create: `apps/web/app/features/breakdown/components/CesareGhostTag.tsx`
- Create: `apps/web/app/features/breakdown/components/CesareSuggestionBanner.tsx`
- Create: `apps/web/app/features/breakdown/hooks/useCesareSuggest.ts`

- [ ] **Step 1: Failing tests (OHW-241/242/243):**

```typescript
test("[OHW-241] click ghost tag accepts it (pending → accepted)", async ({
  authenticatedPage,
}) => {
  await navigateToBreakdown(
    authenticatedPage,
    "00000000-0000-4000-a000-000000000011",
  );
  await openSceneInBreakdown(authenticatedPage, 1);
  await authenticatedPage.getByTestId("cesare-suggest-scene").click();
  await expect(
    authenticatedPage.getByTestId(/^ghost-tag-/).first(),
  ).toBeVisible();
  const ghost = authenticatedPage.getByTestId(/^ghost-tag-/).first();
  const name = await ghost.getAttribute("data-element-name");
  await ghost.click();
  await expect(
    authenticatedPage.getByTestId(`accepted-tag-${name}`),
  ).toBeVisible();
});

test("[OHW-242] accept all bulk", async ({ authenticatedPage }) => {
  // ... similar setup
  await authenticatedPage.getByTestId("cesare-banner-accept-all").click();
  await expect(
    authenticatedPage.locator("[data-testid^='ghost-tag-']"),
  ).toHaveCount(0);
});

test("[OHW-243] ignore single ghost", async ({ authenticatedPage }) => {
  // ... click X on ghost tag
});
```

- [ ] **Step 2: Implement hook:**

```typescript
// useCesareSuggest.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { suggestBreakdownForScene } from "../server/cesare-suggest.server";
import { setOccurrenceStatus } from "../server/breakdown.server";

export const useCesareSuggest = (sceneId: string, versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(
        await suggestBreakdownForScene({
          data: { sceneId, screenplayVersionId: versionId },
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["breakdown", "scene", sceneId, versionId],
      }),
  });
};

export const useSetOccurrenceStatus = (sceneId: string, versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      occurrenceIds: string[];
      status: "accepted" | "ignored" | "pending";
    }) => unwrapResult(await setOccurrenceStatus({ data: input })),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["breakdown", "scene", sceneId, versionId],
      }),
  });
};
```

- [ ] **Step 3: Implement BreakdownPanel + CesareGhostTag + CesareSuggestionBanner** — render occurrences grouped by category; ghost variants for `cesareStatus === "pending"`; banner shown when at least one pending exists with actions accept-all/ignore. Use Tag, Banner from DS.

- [ ] **Step 4: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-cesare.spec.ts -g "OHW-24[123]"
git add apps/web/app/features/breakdown/components/BreakdownPanel.tsx apps/web/app/features/breakdown/components/CesareGhostTag.tsx apps/web/app/features/breakdown/components/CesareSuggestionBanner.tsx apps/web/app/features/breakdown/components/*.module.css apps/web/app/features/breakdown/hooks/useCesareSuggest.ts
git commit -m "[OHW] feat(breakdown): BreakdownPanel + Cesare ghost tags + banner (Spec 10 OHW-241-243)"
```

### Task D6: AddElementModal (manual add)

**Files:**

- Update: `apps/web/app/features/breakdown/components/AddElementModal.tsx` + css

- [ ] **Step 1: Failing test (OHW-244):**

```typescript
test("[OHW-244] add element manually via modal", async ({
  authenticatedPage,
}) => {
  await navigateToBreakdown(authenticatedPage, "...");
  await openSceneInBreakdown(authenticatedPage, 1);
  await authenticatedPage.getByTestId("add-element-trigger").click();
  await authenticatedPage.getByTestId("add-element-name").fill("Helmet");
  await authenticatedPage
    .getByTestId("add-element-category")
    .selectOption("props");
  await authenticatedPage.getByTestId("add-element-quantity").fill("2");
  await authenticatedPage.getByTestId("add-element-submit").click();
  await expect(
    authenticatedPage.getByTestId("accepted-tag-Helmet"),
  ).toBeVisible();
});
```

- [ ] **Step 2: Implement using Dialog from DS** with form fields. Mutation hook calls `addBreakdownElement`.

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-manual.spec.ts -g "OHW-244"
git commit -am "[OHW] feat(breakdown): AddElementModal (Spec 10 OHW-244)"
```

### Task D7: ProjectBreakdownTable (consolidata)

**Files:**

- Update: `apps/web/app/features/breakdown/components/ProjectBreakdownTable.tsx` + css

- [ ] **Step 1: Failing tests (OHW-246/247/248):**

```typescript
test("[OHW-246] Per progetto tab shows consolidated table", async ({
  authenticatedPage,
}) => {
  await navigateToBreakdown(authenticatedPage, "...");
  await authenticatedPage.getByRole("tab", { name: "Per progetto" }).click();
  await expect(
    authenticatedPage.getByTestId("project-breakdown-table"),
  ).toBeVisible();
  // assert at least one row + sortable headers
});

test("[OHW-247] rename element cascades", async ({ authenticatedPage }) => {
  // navigate, find row, click context menu rename, fill new name, submit
  // navigate back to per-scene, assert renamed
});

test("[OHW-248] archive element hides it", async ({ authenticatedPage }) => {
  // similar
});
```

- [ ] **Step 2: Implement table using DataTable from DS, with row context menu (rename, archive, view occurrences).**

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-project-view.spec.ts
git commit -am "[OHW] feat(breakdown): ProjectBreakdownTable + rename + archive (Spec 10 OHW-246-248)"
```

### Task D8: ExportBreakdownModal + useExportBreakdown hook

**Files:**

- Update: `apps/web/app/features/breakdown/components/ExportBreakdownModal.tsx` + css
- Create: `apps/web/app/features/breakdown/hooks/useExportBreakdown.ts`

- [ ] **Step 1: Failing tests (OHW-249/250):**

```typescript
test("[OHW-249] export PDF opens preview tab", async ({
  authenticatedPage,
  context,
}) => {
  await navigateToBreakdown(authenticatedPage, "...");
  await authenticatedPage.getByTestId("breakdown-export-trigger").click();
  await authenticatedPage
    .getByTestId("breakdown-export-format")
    .selectOption("pdf");
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    authenticatedPage.getByTestId("breakdown-export-generate").click(),
  ]);
  expect(popup).toBeTruthy();
});

test("[OHW-250] export CSV downloads file", async ({ authenticatedPage }) => {
  await navigateToBreakdown(authenticatedPage, "...");
  await authenticatedPage.getByTestId("breakdown-export-trigger").click();
  await authenticatedPage
    .getByTestId("breakdown-export-format")
    .selectOption("csv");
  const [download] = await Promise.all([
    authenticatedPage.waitForEvent("download"),
    authenticatedPage.getByTestId("breakdown-export-generate").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^breakdown-.+\.csv$/);
});
```

- [ ] **Step 2: Implement modal + hook (mirror `useExportNarrativePdf` pattern):**

For PDF: reuse `openPdfPreview` from `apps/web/app/features/documents/lib/pdf-preview.ts`.
For CSV: trigger `<a href="data:text/csv;...">` download.

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-export.spec.ts
git commit -am "[OHW] feat(breakdown): ExportBreakdownModal PDF+CSV (Spec 10 OHW-249-250)"
```

### Task D9: SceneStaleBadge in ScreenplayEditor (L2)

**Files:**

- Create: `apps/web/app/features/screenplay-editor/components/SceneStaleBadge.tsx` + css
- Modify: `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`

- [ ] **Step 1: Failing test (OHW-251):**

```typescript
test("[OHW-251] stale scene shows badge in editor heading; click navigates", async ({
  authenticatedPage,
}) => {
  // 1. seed: scene 1 has breakdown, then change scene text → mark stale via direct DB or via flow
  // 2. open editor
  // 3. assert badge visible on scene 1 heading only
  // 4. click → URL should include /breakdown?scene=...
});
```

- [ ] **Step 2: Implement badge + integrate in `ScreenplayEditor`** — call `staleScenesOptions(versionId)` once on mount, render badge next to each scene heading whose id is in the array.

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-stale.spec.ts -g "OHW-251"
git commit -am "[OHW] feat(breakdown): SceneStaleBadge in ScreenplayEditor (Spec 10 L2 OHW-251)"
```

### Task D10: VersionImportBanner (L3)

**Files:**

- Update: `apps/web/app/features/breakdown/components/VersionImportBanner.tsx` + css
- Hook into version creation flow (Spec 06)

- [ ] **Step 1: Failing test (OHW-252):**

```typescript
test("[OHW-252] new version → banner with stale count", async ({
  authenticatedPage,
}) => {
  // create new screenplay version after editing scene 1
  // open breakdown of new version
  // assert banner visible with "X elementi…"
});
```

- [ ] **Step 2: Implement banner:** uses Banner from DS; shown if `breakdownSceneState` for new version was created via `cloneBreakdownToVersion` and any occurrence has `isStale=true`. Persists in localStorage `breakdown-banner-dismissed-{versionId}` until dismissed.

- [ ] **Step 3: Hook trigger:** in version creation flow (existing Spec 06 server fn `createScreenplayVersion`), call `cloneBreakdownToVersion(prevVersionId, newVersionId)` if previous version had any breakdown occurrences. UI: confirm modal "Importa breakdown da v{prev}? [Si] [No]" before triggering.

- [ ] **Step 4: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-stale.spec.ts -g "OHW-252"
git commit -am "[OHW] feat(breakdown): VersionImportBanner + clone hook (Spec 10 L3 OHW-252)"
```

### Task D11: L1 stale runtime test

- [ ] **Step 1: Failing test (OHW-253):**

```typescript
test("[OHW-253] modify scene text → open breakdown → stale occurrences appear dimmed/barred", async ({
  authenticatedPage,
}) => {
  // 1. seed scene with breakdown element "Bloody knife"
  // 2. edit scene text via DB or via editor to remove "Bloody knife" mention
  // 3. open breakdown for that scene
  // 4. assert "Bloody knife" tag has class isStale (data-stale="true")
});
```

- [ ] **Step 2: Add stale styling to `BreakdownPanel`** — when `occurrence.isStale === true`, apply `aria-disabled` + dimmed style + tooltip "Non più trovato nel testo".

- [ ] **Step 3: Run + commit:**

```bash
pnpm test:e2e tests/breakdown/breakdown-stale.spec.ts -g "OHW-253"
git commit -am "[OHW] feat(breakdown): L1 stale visual treatment (Spec 10 OHW-253)"
```

---

## Phase E — Permissions, versioning, Cesare extras

### Task E1: Permission tests (OHW-254/255/256)

**Files:**

- Create: `tests/breakdown/breakdown-permissions.spec.ts`

- [ ] **Step 1:**

```typescript
test("[OHW-254] viewer sees read-only breakdown — no add, no Cesare, no context menu", async ({
  authenticatedViewerPage,
}) => {
  await navigateToBreakdown(
    authenticatedViewerPage,
    "00000000-0000-4000-a000-000000000011",
  );
  await expect(
    authenticatedViewerPage.getByTestId("add-element-trigger"),
  ).toBeHidden();
  await expect(
    authenticatedViewerPage.getByTestId("cesare-suggest-scene"),
  ).toBeHidden();
});

test("[OHW-256] non-member gets 403", async ({ browser }) => {
  // sign in as a third user with no membership; try /breakdown of team project
  // assert 403 page or empty state with appropriate message
});
```

- [ ] **Step 2: Add `viewerOnly` boolean prop in `BreakdownPage` + hide write controls. Server fns already enforce; this is UI.**

- [ ] **Step 3: Run + commit.**

```bash
pnpm test:e2e tests/breakdown/breakdown-permissions.spec.ts
git commit -am "[OHW] feat(breakdown): viewer read-only UI + permission tests (Spec 10 OHW-254-256)"
```

### Task E2: Cesare rate-limit + manual re-run (OHW-258/259)

**Files:**

- Update: `cesare-suggest.server.ts` to call `checkAndStampRateLimit` for "all script" path
- Add UI button "Suggerisci tutto lo script"

- [ ] **Step 1: Failing tests:**

```typescript
test("[OHW-258] re-run Cesare on already-breakdown scene: new candidates pending; existing accepted/ignored unchanged", async ({
  authenticatedPage,
}) => {
  // ... seed accepted + ignored states, run "suggest scene", assert
});

test("[OHW-259] suggest-all rate limit: second click within 5min shows toast", async ({
  authenticatedPage,
}) => {
  // ... click suggest-all, click again, assert toast "Riprova tra X"
});
```

- [ ] **Step 2: Add `suggestBreakdownForAllScenes` server fn that wraps `suggestBreakdownForScene` for each scene + uses `checkAndStampRateLimit` with action="suggest_all_script", cooldownMs=300_000.**

- [ ] **Step 3: Run + commit.**

```bash
pnpm test:e2e tests/breakdown/breakdown-cesare.spec.ts -g "OHW-25[89]"
git commit -am "[OHW] feat(breakdown): suggest-all + rate-limit (Spec 10 OHW-258-259)"
```

### Task E3: Versioning import (OHW-260/261)

**Files:**

- Test: `tests/breakdown/breakdown-versioning.spec.ts`

- [ ] **Step 1: Failing tests:**

```typescript
test("[OHW-260] new version + import: occurrences cloned, stale recomputed", async ({
  authenticatedPage,
}) => {
  // 1. project with breakdown on v1
  // 2. create v2 (modifying scene 1 to remove a tagged element)
  // 3. confirm "Importa breakdown" modal
  // 4. open breakdown of v2
  // 5. assert: most occurrences cloned, the removed one is marked stale
});

test("[OHW-261] new version + reject import: v2 has empty breakdown; v1 retains", async ({
  authenticatedPage,
}) => {
  // similar, click "No" on import modal
});
```

- [ ] **Step 2: Wire the import modal in version creation flow** (Spec 06 hook).

- [ ] **Step 3: Run + commit.**

```bash
pnpm test:e2e tests/breakdown/breakdown-versioning.spec.ts
git commit -am "[OHW] feat(breakdown): version import flow + tests (Spec 10 OHW-260-261)"
```

### Task E4: MOCK_AI fixture test (OHW-257)

**Files:**

- Test: `tests/breakdown/breakdown-cesare.spec.ts` (append)

- [ ] **Step 1:**

```typescript
test("[OHW-257] MOCK_AI returns deterministic 5 suggestions for warehouse fixture", async ({
  authenticatedPage,
}) => {
  process.env["MOCK_AI"] = "true";
  await navigateToBreakdown(authenticatedPage, "...");
  await openSceneInBreakdown(
    authenticatedPage,
    /* warehouse scene number */ 12,
  );
  await authenticatedPage.getByTestId("cesare-suggest-scene").click();
  // Wait for ghost tags
  const ghosts = authenticatedPage.locator("[data-testid^='ghost-tag-']");
  await expect(ghosts).toHaveCount(5);
});
```

- [ ] **Step 2: Make sure seed includes a "warehouse" scene matching the mock heuristic. Add one to `non-fa-ridere.fountain.ts` or use a separate fixture screenplay.**

- [ ] **Step 3: Run + commit.**

```bash
pnpm test:e2e tests/breakdown/breakdown-cesare.spec.ts -g "OHW-257"
git commit -am "[OHW] test(breakdown): MOCK_AI deterministic Cesare fixture (Spec 10 OHW-257)"
```

### Task E5: README + docs update

**Files:**

- Modify: `README.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Add to README "Done" section** (per memory `feedback-end-of-task-ritual.md`):

```markdown
- `core/10 — Scene Breakdown` (cast/props/locations/etc per scene + per project, Cesare ghost suggestions, PDF/CSV export, version-aware with 3-tier stale awareness)
```

- [ ] **Step 2: Update `docs/data-model.md` — add 4 new tables (breakdown_elements, breakdown_occurrences, breakdown_scene_state, breakdown_rate_limits) with field descriptions.**

- [ ] **Step 3: Commit:**

```bash
git add README.md docs/data-model.md
git commit -m "[OHW] docs: mark Spec 10 Breakdown done + update data model"
```

### Task E6: Final regression sweep

- [ ] **Step 1: Run full unit suite:**

```bash
pnpm test:unit
```

Expected: all green.

- [ ] **Step 2: Run full E2E:**

```bash
pnpm test:e2e
```

Expected: all green (including pre-existing tests untouched).

- [ ] **Step 3: Suggest user run regression on staging environment** (per CLAUDE.md memory rule).

---

## Self-review checklist (run before declaring complete)

- [ ] All 22 OHW IDs (240-261) have at least one Playwright assertion
- [ ] All 14 categories renderable + colored in Tag component
- [ ] Permission denied → no ghost tags, no add button, no context menu
- [ ] Stale awareness: L1 visible in panel, L2 visible in editor, L3 banner on new version
- [ ] PDF + CSV export download with correct filename pattern
- [ ] MOCK_AI=true used in all CI tests; no ANTHROPIC_API_KEY required for `pnpm test:e2e`
- [ ] No `try/catch` in business logic; all errors via ResultAsync
- [ ] No tRPC; all server calls via createServerFn
- [ ] No hardcoded colors; all categories via `--cat-*` tokens
- [ ] No new components added directly in `features/breakdown/components/` without going through `packages/ui` first (per memory `feedback-design-system-driven`)
- [ ] Cesare integration follows ghost-inline pattern; no chat textbox anywhere (per memory `feedback-cesare-controller-pattern`)
- [ ] All commits start with `[OHW]`, no AI signatures
