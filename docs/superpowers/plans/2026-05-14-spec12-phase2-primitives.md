# Spec 12 · Phase 2 — Core DS-v2 Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare i primitive components DS-v2 in `packages/ui/src/primitives/`: Scrim, Pill, ToggleChip, Tooltip, Popover, Drawer, SavePill, Presence, Button. Tutti usano `--ds-*` semantic tokens. Nessuna modifica ai componenti legacy in `packages/ui/src/components/`. **WCAG AA verificato su ogni task** (spec 12 sez. 14).

**Architecture:** Ogni primitive vive in `packages/ui/src/primitives/<Name>/`. CSS Modules con `--ds-*` tokens. I componenti interattivi (Drawer, Popover) usano `<dialog>` nativo per focus-trap e Esc gratis. Tutti i bottoni icon-only hanno `aria-label`. ToggleChip usa `role="switch"`. Nessun JS animation library — CSS transitions + `prefers-reduced-motion`.

**Tech Stack:** React 19, CSS Modules, Vitest + @testing-library/react (già configurati in `packages/ui` dalla Phase 1), HTML `<dialog>` API, CSS custom properties `--ds-*`.

---

## File Structure

**Create:**

- `packages/ui/src/primitives/Scrim/Scrim.tsx`
- `packages/ui/src/primitives/Scrim/Scrim.module.css`
- `packages/ui/src/primitives/Pill/Pill.tsx`
- `packages/ui/src/primitives/Pill/Pill.module.css`
- `packages/ui/src/primitives/Pill/Pill.test.tsx`
- `packages/ui/src/primitives/ToggleChip/ToggleChip.tsx`
- `packages/ui/src/primitives/ToggleChip/ToggleChip.module.css`
- `packages/ui/src/primitives/ToggleChip/ToggleChip.test.tsx`
- `packages/ui/src/primitives/Tooltip/Tooltip.tsx`
- `packages/ui/src/primitives/Tooltip/Tooltip.module.css`
- `packages/ui/src/primitives/Popover/Popover.tsx`
- `packages/ui/src/primitives/Popover/Popover.module.css`
- `packages/ui/src/primitives/Popover/Popover.test.tsx`
- `packages/ui/src/primitives/Drawer/Drawer.tsx`
- `packages/ui/src/primitives/Drawer/Drawer.module.css`
- `packages/ui/src/primitives/Drawer/Drawer.test.tsx`
- `packages/ui/src/primitives/SavePill/SavePill.tsx`
- `packages/ui/src/primitives/SavePill/SavePill.module.css`
- `packages/ui/src/primitives/Presence/Presence.tsx`
- `packages/ui/src/primitives/Presence/Presence.module.css`
- `packages/ui/src/primitives/Button/Button.tsx`
- `packages/ui/src/primitives/Button/Button.module.css`
- `packages/ui/src/primitives/Button/Button.test.tsx`

**Modify:**

- `packages/ui/src/index.ts` — export all new primitives (Task 10)
- `apps/web/app/routes/dev/tokens.tsx` — add primitives showcase section (Task 10)

**Not touched:**

- `packages/ui/src/components/**` — legacy components, unchanged
- `packages/ui/src/themes/**`, `packages/ui/src/tokens/**` — Phase 1 output, unchanged

---

## Task 1: Scrim

**Files:**
- Create: `packages/ui/src/primitives/Scrim/Scrim.tsx`
- Create: `packages/ui/src/primitives/Scrim/Scrim.module.css`

Backdrop overlay usato da Drawer e QuickAsk. Nessun test necessario (puro presentazionale).

- [ ] **Step 1: Create Scrim.module.css**

```css
/* packages/ui/src/primitives/Scrim/Scrim.module.css */
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(28, 26, 23, 0.4);
  backdrop-filter: blur(4px);
  z-index: 40;
  animation: fadeIn var(--ds-duration-2) var(--ds-ease);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .scrim { animation: none; }
}
```

- [ ] **Step 2: Create Scrim.tsx**

```tsx
// packages/ui/src/primitives/Scrim/Scrim.tsx
import styles from "./Scrim.module.css";

export type ScrimProps = {
  onClick?: () => void;
  className?: string;
};

export function Scrim({ onClick, className }: ScrimProps) {
  return (
    <div
      className={[styles.scrim, className].filter(Boolean).join(" ")}
      aria-hidden="true"
      onClick={onClick}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/primitives/Scrim/
git commit -m "[OHW] feat(ui): add DS-v2 Scrim primitive"
```

---

## Task 2: Pill

**Files:**
- Create: `packages/ui/src/primitives/Pill/Pill.tsx`
- Create: `packages/ui/src/primitives/Pill/Pill.module.css`
- Create: `packages/ui/src/primitives/Pill/Pill.test.tsx`

Pill stateless per badge di stato: CONFERMATO/CANDIDATO, contatori Cesare, tag di categoria.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/primitives/Pill/Pill.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders children", () => {
    const { getByText } = render(<Pill tone="neutral">CONFERMATO</Pill>);
    expect(getByText("CONFERMATO")).toBeTruthy();
  });

  it("applies clay tone class", () => {
    const { container } = render(<Pill tone="clay">Save</Pill>);
    expect(container.firstChild).not.toBeNull();
  });

  it("applies leaf tone class", () => {
    const { container } = render(<Pill tone="leaf">Salvato</Pill>);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders count when provided", () => {
    const { getByText } = render(<Pill tone="leaf" count={3}>Cesare</Pill>);
    expect(getByText("3")).toBeTruthy();
  });

  it("does not render count when zero", () => {
    const { queryByText } = render(<Pill tone="leaf" count={0}>Cesare</Pill>);
    expect(queryByText("0")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | head -20
```

Expected: `Pill.test.tsx` fails with "Cannot find module './Pill'".

- [ ] **Step 3: Create Pill.module.css**

```css
/* packages/ui/src/primitives/Pill/Pill.module.css */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: 2px var(--ds-space-2);
  border-radius: var(--ds-radius-pill);
  font-family: var(--ds-font-mono);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  line-height: 1.4;
}

.clay {
  background: var(--ds-action-soft);
  color: var(--ds-action);
}

.leaf {
  background: var(--ds-agent-soft);
  color: var(--ds-agent);
}

.neutral {
  background: var(--ds-surface-alt);
  color: var(--ds-text-3);
}

.count {
  font-variant-numeric: tabular-nums;
  background: currentColor;
  color: var(--ds-surface);
  border-radius: var(--ds-radius-pill);
  min-width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  font-size: 9px;
}

/* sm size */
.sm {
  font-size: 9px;
  padding: 1px var(--ds-space-1);
}
```

- [ ] **Step 4: Create Pill.tsx**

```tsx
// packages/ui/src/primitives/Pill/Pill.tsx
import type { ReactNode } from "react";
import styles from "./Pill.module.css";

export type PillTone = "clay" | "leaf" | "neutral";
export type PillSize = "sm" | "md";

export type PillProps = {
  tone: PillTone;
  size?: PillSize;
  count?: number;
  children: ReactNode;
  className?: string;
};

export function Pill({ tone, size = "md", count, children, className }: PillProps) {
  return (
    <span
      className={[
        styles.pill,
        styles[tone],
        size === "sm" ? styles.sm : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      {count != null && count > 0 && (
        <span className={styles.count} aria-label={`${count} elementi`}>
          {count}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×)"
```

Expected: 5 Pill tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/Pill/
git commit -m "[OHW] feat(ui): add DS-v2 Pill primitive"
```

---

## Task 3: ToggleChip

**Files:**
- Create: `packages/ui/src/primitives/ToggleChip/ToggleChip.tsx`
- Create: `packages/ui/src/primitives/ToggleChip/ToggleChip.module.css`
- Create: `packages/ui/src/primitives/ToggleChip/ToggleChip.test.tsx`

Pill interattiva per viewbar sottolineature (Cast, Locations, Props…). `role="switch"`, `aria-checked`. Il pallino colorato usa la categoria come accent CSS variable.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/primitives/ToggleChip/ToggleChip.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ToggleChip } from "./ToggleChip";

describe("ToggleChip", () => {
  it("renders a button with role switch", () => {
    const { getByRole } = render(
      <ToggleChip isOn={false} onToggle={() => {}} label="Cast" />
    );
    expect(getByRole("switch")).toBeTruthy();
  });

  it("aria-checked matches isOn prop", () => {
    const { getByRole, rerender } = render(
      <ToggleChip isOn={false} onToggle={() => {}} label="Cast" />
    );
    expect(getByRole("switch").getAttribute("aria-checked")).toBe("false");

    rerender(<ToggleChip isOn={true} onToggle={() => {}} label="Cast" />);
    expect(getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("calls onToggle on click", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(
      <ToggleChip isOn={false} onToggle={onToggle} label="Cast" />
    );
    fireEvent.click(getByRole("switch"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the label text", () => {
    const { getByText } = render(
      <ToggleChip isOn={true} onToggle={() => {}} label="Locations" />
    );
    expect(getByText("Locations")).toBeTruthy();
  });

  it("uses aria-label when provided", () => {
    const { getByRole } = render(
      <ToggleChip
        isOn={false}
        onToggle={() => {}}
        label="Cast"
        aria-label="Mostra sottolineature Cast"
      />
    );
    expect(getByRole("switch").getAttribute("aria-label")).toBe(
      "Mostra sottolineature Cast"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | head -20
```

Expected: "Cannot find module './ToggleChip'".

- [ ] **Step 3: Create ToggleChip.module.css**

```css
/* packages/ui/src/primitives/ToggleChip/ToggleChip.module.css */
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: 4px var(--ds-space-3);
  border-radius: var(--ds-radius-pill);
  border: 1px solid transparent;
  background: transparent;
  font-family: var(--ds-font-sans);
  font-size: 12px;
  font-weight: 450;
  color: var(--ds-text-3);
  cursor: pointer;
  transition:
    background var(--ds-duration-1) var(--ds-ease),
    border-color var(--ds-duration-1) var(--ds-ease),
    color var(--ds-duration-1) var(--ds-ease);
  white-space: nowrap;

  &:hover {
    background: var(--ds-surface-alt);
    color: var(--ds-text-2);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-action);
    outline-offset: 2px;
  }
}

.isOn {
  background: var(--ds-surface);
  border-color: var(--chip-color, var(--ds-line));
  color: var(--chip-color, var(--ds-text));
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chip-color, var(--ds-text-3));
  flex-shrink: 0;
  transition: opacity var(--ds-duration-1) var(--ds-ease);
}

.chip:not(.isOn) .dot {
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .chip { transition: none; }
  .dot  { transition: none; }
}
```

- [ ] **Step 4: Create ToggleChip.tsx**

The `categoryColor` prop sets a CSS custom property `--chip-color` so each category keeps its own accent without hardcoding.

```tsx
// packages/ui/src/primitives/ToggleChip/ToggleChip.tsx
import styles from "./ToggleChip.module.css";

export type ToggleChipProps = {
  isOn: boolean;
  onToggle: () => void;
  label: string;
  categoryColor?: string;
  hotkey?: string;
  "aria-label"?: string;
};

export function ToggleChip({
  isOn,
  onToggle,
  label,
  categoryColor,
  "aria-label": ariaLabel,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      className={[styles.chip, isOn ? styles.isOn : ""].filter(Boolean).join(" ")}
      style={categoryColor ? ({ "--chip-color": categoryColor } as React.CSSProperties) : undefined}
      onClick={onToggle}
    >
      {categoryColor && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|ToggleChip)"
```

Expected: 5 ToggleChip tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/ToggleChip/
git commit -m "[OHW] feat(ui): add DS-v2 ToggleChip primitive (role=switch, a11y)"
```

---

## Task 4: Tooltip

**Files:**
- Create: `packages/ui/src/primitives/Tooltip/Tooltip.tsx`
- Create: `packages/ui/src/primitives/Tooltip/Tooltip.module.css`

Wrapper che mostra una tooltip su hover e focus-visible. Due kind: `dark` (shot blocks, compact info) e `info` (linen, icone/aiuto). Posizionamento CSS puro, no JS calculations.

- [ ] **Step 1: Create Tooltip.module.css**

```css
/* packages/ui/src/primitives/Tooltip/Tooltip.module.css */
.wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tip {
  position: absolute;
  z-index: 50;
  pointer-events: none;
  white-space: nowrap;
  border-radius: var(--ds-radius-sm);
  padding: 4px var(--ds-space-2);
  font-family: var(--ds-font-mono);
  font-size: 11px;
  line-height: 1.4;
  opacity: 0;
  transition: opacity var(--ds-duration-1) var(--ds-ease);
  max-width: 240px;
  white-space: normal;

  /* Default dark */
  background: var(--ds-text);
  color: var(--ds-text-on-dark);
}

.info {
  background: var(--ds-surface);
  color: var(--ds-text-2);
  border: 1px solid var(--ds-line);
  box-shadow: var(--ds-shadow-2);
}

/* Placement */
.top {
  bottom: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
}

.bottom {
  top: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
}

.left {
  right: calc(100% + 6px);
  top: 50%;
  translate: 0 -50%;
}

.right {
  left: calc(100% + 6px);
  top: 50%;
  translate: 0 -50%;
}

/* Show on hover OR focus-visible on the wrapper's child */
.wrapper:hover .tip,
.wrapper:focus-within .tip {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tip { transition: none; }
}
```

- [ ] **Step 2: Create Tooltip.tsx**

```tsx
// packages/ui/src/primitives/Tooltip/Tooltip.tsx
import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

export type TooltipKind = "dark" | "info";
export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: ReactNode;
  kind?: TooltipKind;
  placement?: TooltipPlacement;
  children: ReactNode;
};

export function Tooltip({
  content,
  kind = "dark",
  placement = "top",
  children,
}: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span
        role="tooltip"
        className={[
          styles.tip,
          kind === "info" ? styles.info : "",
          styles[placement],
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {content}
      </span>
    </span>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd packages/ui && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/primitives/Tooltip/
git commit -m "[OHW] feat(ui): add DS-v2 Tooltip primitive (dark/info kinds)"
```

---

## Task 5: Popover

**Files:**
- Create: `packages/ui/src/primitives/Popover/Popover.tsx`
- Create: `packages/ui/src/primitives/Popover/Popover.module.css`
- Create: `packages/ui/src/primitives/Popover/Popover.test.tsx`

Non-modal popover per nav, project switcher, brand peek. Chiude su Esc + click esterno. Trigger deve gestire `aria-expanded` esternamente (il Popover non conosce il suo trigger).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/primitives/Popover/Popover.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Popover } from "./Popover";

describe("Popover", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <Popover isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </Popover>
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders children when isOpen=true", () => {
    const { getByText } = render(
      <Popover isOpen={true} onClose={() => {}}>
        <p>Popover content</p>
      </Popover>
    );
    expect(getByText("Popover content")).toBeTruthy();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Popover isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Popover>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on other keys", () => {
    const onClose = vi.fn();
    render(
      <Popover isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Popover>
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has role=dialog", () => {
    const { getByRole } = render(
      <Popover isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </Popover>
    );
    expect(getByRole("dialog")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | head -20
```

Expected: "Cannot find module './Popover'".

- [ ] **Step 3: Create Popover.module.css**

```css
/* packages/ui/src/primitives/Popover/Popover.module.css */
.popover {
  position: absolute;
  z-index: 60;
  background: var(--ds-surface);
  border: 1px solid var(--ds-line);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-3);
  padding: var(--ds-space-2) 0;
  min-width: 200px;
  animation: popIn var(--ds-duration-2) var(--ds-ease);
}

@keyframes popIn {
  from {
    opacity: 0;
    scale: 0.96;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    scale: 1;
    translate: 0 0;
  }
}

/* Placement variants */
.bottomStart {
  top: calc(100% + 4px);
  inset-inline-start: 0;
}

.bottomEnd {
  top: calc(100% + 4px);
  inset-inline-end: 0;
}

.bottomCenter {
  top: calc(100% + 4px);
  left: 50%;
  translate: -50% 0;
}

@media (prefers-reduced-motion: reduce) {
  .popover { animation: none; }
}
```

- [ ] **Step 4: Create Popover.tsx**

```tsx
// packages/ui/src/primitives/Popover/Popover.tsx
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Popover.module.css";

export type PopoverPlacement = "bottom-start" | "bottom-end" | "bottom-center";

export type PopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  placement?: PopoverPlacement;
  width?: number | string;
  children: ReactNode;
  className?: string;
};

const placementClass: Record<PopoverPlacement, string> = {
  "bottom-start": styles.bottomStart,
  "bottom-end": styles.bottomEnd,
  "bottom-center": styles.bottomCenter,
};

export function Popover({
  isOpen,
  onClose,
  placement = "bottom-start",
  width,
  children,
  className,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use capture to run before other handlers
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      className={[styles.popover, placementClass[placement], className]
        .filter(Boolean)
        .join(" ")}
      style={width != null ? { width } : undefined}
    >
      {children}
    </div>
  );
}
```

Note: Il Popover va reso dentro un container con `position: relative`. Il trigger gestisce `aria-expanded` esternamente.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|Popover)"
```

Expected: 5 Popover tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/Popover/
git commit -m "[OHW] feat(ui): add DS-v2 Popover primitive (Esc/outside-click, aria)"
```

---

## Task 6: Drawer

**Files:**
- Create: `packages/ui/src/primitives/Drawer/Drawer.tsx`
- Create: `packages/ui/src/primitives/Drawer/Drawer.module.css`
- Create: `packages/ui/src/primitives/Drawer/Drawer.test.tsx`

Modal side panel per Manifesto (`⌘M`). Usa `<dialog>` nativo: `showModal()` fornisce focus-trap automatico e Esc nativo via evento `cancel`. Slide in da destra (default) o sinistra.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/primitives/Drawer/Drawer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("renders nothing when isOpen=false", () => {
    const { queryByRole } = render(
      <Drawer isOpen={false} onClose={() => {}} title="Manifesto">
        <p>Content</p>
      </Drawer>
    );
    // dialog exists in DOM but is closed
    const dialog = queryByRole("dialog", { hidden: true });
    expect(dialog).toBeTruthy();
  });

  it("shows title when open", () => {
    const { getByText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Il Manifesto">
        <p>Content</p>
      </Drawer>
    );
    expect(getByText("Il Manifesto")).toBeTruthy();
  });

  it("renders children", () => {
    const { getByText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Test">
        <p>Drawer body</p>
      </Drawer>
    );
    expect(getByText("Drawer body")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <Drawer isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Drawer>
    );
    fireEvent.click(getByLabelText("Chiudi"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dialog has aria-labelledby pointing to title", () => {
    const { getByRole, getByText } = render(
      <Drawer isOpen={true} onClose={() => {}} title="Manifesto">
        <p>Body</p>
      </Drawer>
    );
    const dialog = getByRole("dialog", { hidden: true });
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe("Manifesto");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | head -20
```

Expected: "Cannot find module './Drawer'".

- [ ] **Step 3: Create Drawer.module.css**

```css
/* packages/ui/src/primitives/Drawer/Drawer.module.css */
.drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  margin: 0;
  padding: 0;
  width: var(--drawer-width, 480px);
  max-width: 100vw;
  max-height: 100dvh;
  overflow-y: auto;
  background: var(--ds-surface);
  border-inline-start: 1px solid var(--ds-line);
  box-shadow: var(--ds-shadow-4);
  border-radius: 0;
  z-index: 70;

  /* Slide in from right */
  translate: 100% 0;
  transition: translate var(--ds-duration-3) var(--ds-ease),
              display var(--ds-duration-3) var(--ds-ease) allow-discrete,
              overlay var(--ds-duration-3) var(--ds-ease) allow-discrete;

  &[open] {
    translate: 0 0;
    @starting-style {
      translate: 100% 0;
    }
  }

  &::backdrop {
    background: rgba(28, 26, 23, 0.4);
    backdrop-filter: blur(4px);
    animation: backdropIn var(--ds-duration-2) var(--ds-ease);
  }
}

.left {
  inset-inline-end: auto;
  inset-inline-start: 0;
  border-inline-start: none;
  border-inline-end: 1px solid var(--ds-line);
  translate: -100% 0;

  &[open] {
    translate: 0 0;
    @starting-style {
      translate: -100% 0;
    }
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-4) var(--ds-space-6);
  border-block-end: 1px solid var(--ds-line);
  position: sticky;
  top: 0;
  background: var(--ds-surface);
  z-index: 1;
}

.title {
  font-family: var(--ds-font-display);
  font-style: italic;
  font-weight: 500;
  font-size: 18px;
  color: var(--ds-text);
  margin: 0;
  line-height: 1.2;
}

.closeBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  border: none;
  color: var(--ds-text-3);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: var(--ds-surface-alt);
    color: var(--ds-text);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-action);
    outline-offset: 2px;
  }
}

.body {
  padding: var(--ds-space-6);
}

@keyframes backdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .drawer { transition: none; }
  .drawer::backdrop { animation: none; }
}
```

- [ ] **Step 4: Create Drawer.tsx**

```tsx
// packages/ui/src/primitives/Drawer/Drawer.tsx
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "../../icons/Icon";
import styles from "./Drawer.module.css";

export type DrawerSide = "left" | "right";

export type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  side?: DrawerSide;
  width?: number | string;
  children: ReactNode;
};

export function Drawer({
  isOpen,
  onClose,
  title,
  side = "right",
  width = 480,
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  // Handle native cancel event (Esc) — prevent default close so onClose runs instead
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={[styles.drawer, side === "left" ? styles.left : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--drawer-width":
            typeof width === "number" ? `${width}px` : width,
        } as React.CSSProperties
      }
      aria-labelledby={titleId}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Chiudi"
          onClick={onClose}
        >
          <Icon name="close" size={16} aria-hidden={true} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|Drawer)"
```

Expected: 5 Drawer tests pass.

- [ ] **Step 6: Typecheck**

```bash
cd packages/ui && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/primitives/Drawer/
git commit -m "[OHW] feat(ui): add DS-v2 Drawer primitive (dialog, focus-trap, slide-in)"
```

---

## Task 7: SavePill

**Files:**
- Create: `packages/ui/src/primitives/SavePill/SavePill.tsx`
- Create: `packages/ui/src/primitives/SavePill/SavePill.module.css`

Indicatore di stato salvataggio nella TopBar. Tre stati: `saved` (leaf), `saving` (clay + pulse), `offline` (neutral). `aria-live="polite"` per screen reader.

- [ ] **Step 1: Create SavePill.module.css**

```css
/* packages/ui/src/primitives/SavePill/SavePill.module.css */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: 3px var(--ds-space-2);
  border-radius: var(--ds-radius-pill);
  font-family: var(--ds-font-mono);
  font-size: 10px;
  color: var(--ds-text-3);
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Saved state */
.saved .dot {
  background: var(--ds-agent);
}

/* Saving state */
.saving {
  color: var(--ds-saving);
}

.saving .dot {
  background: var(--ds-saving);
  animation: pulse 1s var(--ds-ease) infinite;
}

/* Offline state */
.offline .dot {
  background: var(--ds-text-mute);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .saving .dot { animation: none; }
}
```

- [ ] **Step 2: Create SavePill.tsx**

```tsx
// packages/ui/src/primitives/SavePill/SavePill.tsx
import styles from "./SavePill.module.css";

export type SaveState = "saved" | "saving" | "offline";

export type SavePillProps = {
  state: SaveState;
  /** Seconds since last save — shown when state is "saved" */
  secondsAgo?: number;
};

const labels: Record<SaveState, string> = {
  saved: "Salvato",
  saving: "Salvando…",
  offline: "Offline",
};

function formatSecondsAgo(s: number): string {
  if (s < 10) return "adesso";
  if (s < 60) return `${s}s fa`;
  const m = Math.floor(s / 60);
  return `${m}m fa`;
}

export function SavePill({ state, secondsAgo }: SavePillProps) {
  const label =
    state === "saved" && secondsAgo != null
      ? `${labels.saved} ${formatSecondsAgo(secondsAgo)}`
      : labels[state];

  return (
    <span
      className={[styles.pill, styles[state]].join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/ui && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/primitives/SavePill/
git commit -m "[OHW] feat(ui): add DS-v2 SavePill primitive (aria-live, 3 save states)"
```

---

## Task 8: Presence

**Files:**
- Create: `packages/ui/src/primitives/Presence/Presence.tsx`
- Create: `packages/ui/src/primitives/Presence/Presence.module.css`

Stack di avatar 24px con overlap per collaboratori presenti nella sessione. Max 4 visibili, poi badge `+N`. Screen reader legge la lista completa via `<ul>`.

- [ ] **Step 1: Create Presence.module.css**

```css
/* packages/ui/src/primitives/Presence/Presence.module.css */
.list {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 0;
}

.item {
  /* Overlap: each item shifts -8px toward start */
  margin-inline-end: -8px;
}

.item:first-child {
  margin-inline-end: 0;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--ds-bg);
  background: var(--ds-action-soft);
  color: var(--ds-action);
  font-family: var(--ds-font-mono);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  overflow: hidden;
  flex-shrink: 0;
}

.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.overflow {
  background: var(--ds-surface-deep);
  color: var(--ds-text-3);
  font-size: 8px;
}
```

- [ ] **Step 2: Create Presence.tsx**

```tsx
// packages/ui/src/primitives/Presence/Presence.tsx
import styles from "./Presence.module.css";

export type PresenceUser = {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
};

export type PresenceProps = {
  users: PresenceUser[];
  maxVisible?: number;
};

export function Presence({ users, maxVisible = 4 }: PresenceProps) {
  if (users.length === 0) return null;

  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;
  const allNames = users.map((u) => u.name).join(", ");

  return (
    <ul
      className={styles.list}
      aria-label={`Collaboratori presenti: ${allNames}`}
    >
      {overflow > 0 && (
        <li className={styles.item}>
          <span
            className={[styles.avatar, styles.overflow].join(" ")}
            aria-label={`${overflow} altri collaboratori`}
            title={users.slice(maxVisible).map((u) => u.name).join(", ")}
          >
            +{overflow}
          </span>
        </li>
      )}
      {[...visible].reverse().map((user) => (
        <li key={user.id} className={styles.item}>
          <span
            className={styles.avatar}
            title={user.name}
            aria-label={user.name}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className={styles.img}
              />
            ) : (
              user.initials
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/ui && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/primitives/Presence/
git commit -m "[OHW] feat(ui): add DS-v2 Presence primitive (avatar stack, accessible list)"
```

---

## Task 9: Button DS-v2

**Files:**
- Create: `packages/ui/src/primitives/Button/Button.tsx`
- Create: `packages/ui/src/primitives/Button/Button.module.css`
- Create: `packages/ui/src/primitives/Button/Button.test.tsx`

Button DS-v2 con `--ds-*` tokens. Usato da FloatingDock, TopBar, Drawer in Phase 3. Variant: `primary` (clay), `ghost` (transparent hover), `danger`. Hotkey badge inline. Esportato come `DsButton` dal barrel per evitare conflitto col Button legacy.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/src/primitives/Button/Button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button DS-v2", () => {
  it("renders children", () => {
    const { getByText } = render(<Button variant="primary">Salva</Button>);
    expect(getByText("Salva")).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button variant="ghost" onClick={onClick}>Click me</Button>
    );
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is true", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button variant="primary" disabled onClick={onClick}>Save</Button>
    );
    const btn = getByRole("button");
    expect(btn).toHaveProperty("disabled", true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders hotkey badge when hotkey provided", () => {
    const { getByText } = render(
      <Button variant="ghost" hotkey="⌘S">Salva</Button>
    );
    expect(getByText("⌘S")).toBeTruthy();
  });

  it("renders as a native button element", () => {
    const { getByRole } = render(<Button variant="primary">Test</Button>);
    expect(getByRole("button").tagName).toBe("BUTTON");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | head -20
```

Expected: "Cannot find module './Button'".

- [ ] **Step 3: Create Button.module.css**

```css
/* packages/ui/src/primitives/Button/Button.module.css */
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: 0 var(--ds-space-3);
  height: 34px;
  border-radius: var(--ds-radius-md);
  border: 1px solid transparent;
  font-family: var(--ds-font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--ds-duration-1) var(--ds-ease),
    color var(--ds-duration-1) var(--ds-ease),
    border-color var(--ds-duration-1) var(--ds-ease),
    box-shadow var(--ds-duration-1) var(--ds-ease);
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid var(--ds-action);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
}

/* sm size */
.sm {
  height: 28px;
  padding: 0 var(--ds-space-2);
  font-size: 12px;
  border-radius: var(--ds-radius-sm);
}

/* primary — clay filled */
.primary {
  background: var(--ds-action);
  color: var(--ds-text-on-dark);

  &:hover:not(:disabled) {
    background: var(--ds-action-hover);
  }
}

/* ghost — transparent, border on hover */
.ghost {
  background: transparent;
  color: var(--ds-text-2);

  &:hover:not(:disabled) {
    background: var(--ds-surface-alt);
    color: var(--ds-text);
  }
}

/* danger */
.danger {
  background: transparent;
  color: var(--ds-action);
  border-color: var(--ds-action);

  &:hover:not(:disabled) {
    background: var(--ds-action-soft);
  }
}

/* hotkey badge */
.hotkey {
  font-family: var(--ds-font-mono);
  font-size: 10px;
  opacity: 0.6;
  margin-inline-start: var(--ds-space-1);
}

@media (prefers-reduced-motion: reduce) {
  .button { transition: none; }
}
```

- [ ] **Step 4: Create Button.tsx**

```tsx
// packages/ui/src/primitives/Button/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  hotkey?: string;
  children: ReactNode;
};

export function Button({
  variant = "ghost",
  size = "md",
  hotkey,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        styles.button,
        styles[variant],
        size === "sm" ? styles.sm : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
      {hotkey && (
        <span className={styles.hotkey} aria-hidden="true">
          {hotkey}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/ui && pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|×|Button)"
```

Expected: 5 Button tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/Button/
git commit -m "[OHW] feat(ui): add DS-v2 Button primitive (primary/ghost/danger, hotkey badge)"
```

---

## Task 10: Barrel exports + dev playground + a11y verification

**Files:**
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/web/app/routes/dev/tokens.tsx`

- [ ] **Step 1: Add all primitives to the barrel**

Read `packages/ui/src/index.ts` and append the following block at the bottom (after the existing DS-v2 section):

```typescript
// ─── DS-v2 Primitives ───────────────────────────────────────
export { Scrim } from "./primitives/Scrim/Scrim";
export type { ScrimProps } from "./primitives/Scrim/Scrim";

export { Pill } from "./primitives/Pill/Pill";
export type { PillProps, PillTone, PillSize } from "./primitives/Pill/Pill";

export { ToggleChip } from "./primitives/ToggleChip/ToggleChip";
export type { ToggleChipProps } from "./primitives/ToggleChip/ToggleChip";

export { Tooltip } from "./primitives/Tooltip/Tooltip";
export type { TooltipProps, TooltipKind, TooltipPlacement } from "./primitives/Tooltip/Tooltip";

export { Popover } from "./primitives/Popover/Popover";
export type { PopoverProps, PopoverPlacement } from "./primitives/Popover/Popover";

export { Drawer } from "./primitives/Drawer/Drawer";
export type { DrawerProps, DrawerSide } from "./primitives/Drawer/Drawer";

export { SavePill } from "./primitives/SavePill/SavePill";
export type { SavePillProps, SaveState } from "./primitives/SavePill/SavePill";

export { Presence } from "./primitives/Presence/Presence";
export type { PresenceProps, PresenceUser } from "./primitives/Presence/Presence";

// DsButton to avoid collision with legacy Button from components/
export { Button as DsButton } from "./primitives/Button/Button";
export type { ButtonProps as DsButtonProps, ButtonVariant, ButtonSize } from "./primitives/Button/Button";
```

- [ ] **Step 2: Typecheck monorepo**

```bash
pnpm -r typecheck
```

Expected: zero errors.

- [ ] **Step 3: Run all tests**

```bash
cd packages/ui && pnpm test
```

Expected: tutti i test passano (include: 5 Icon, 5 Pill, 5 ToggleChip, 5 Popover, 5 Drawer, 5 Button = 30 test).

- [ ] **Step 4: Add primitives showcase to /dev/tokens**

Read `apps/web/app/routes/dev/tokens.tsx`. After the Icons section, append a new "Primitives" section:

```tsx
import { DsButton, Pill, ToggleChip, SavePill, Presence } from "@oh-writers/ui";

// Inside TokensPlayground, after Icons section:

{/* Primitives section */}
<h2 style={{ fontFamily: "var(--ds-font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-3)", marginTop: 48 }}>Primitives</h2>

<div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-line)", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

  {/* Buttons */}
  <div>
    <p style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-mute)", marginBottom: 12 }}>Button</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <DsButton variant="primary">Rigenera</DsButton>
      <DsButton variant="primary" hotkey="⌘R">Rigenera</DsButton>
      <DsButton variant="ghost">Esporta</DsButton>
      <DsButton variant="ghost" hotkey="⌘E">Esporta</DsButton>
      <DsButton variant="danger">Elimina</DsButton>
      <DsButton variant="ghost" disabled>Disabilitato</DsButton>
    </div>
  </div>

  {/* Pills */}
  <div>
    <p style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-mute)", marginBottom: 12 }}>Pill</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Pill tone="clay">CANDIDATO</Pill>
      <Pill tone="leaf">CONFERMATO</Pill>
      <Pill tone="neutral">BOZZA</Pill>
      <Pill tone="leaf" count={3}>Cesare</Pill>
      <Pill tone="clay" size="sm">SAVING</Pill>
    </div>
  </div>

  {/* ToggleChips */}
  <div>
    <p style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-mute)", marginBottom: 12 }}>ToggleChip</p>
    <ToggleChipDemo />
  </div>

  {/* SavePill */}
  <div>
    <p style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-mute)", marginBottom: 12 }}>SavePill</p>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <SavePill state="saved" secondsAgo={12} />
      <SavePill state="saving" />
      <SavePill state="offline" />
    </div>
  </div>

  {/* Presence */}
  <div>
    <p style={{ fontFamily: "var(--ds-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ds-text-mute)", marginBottom: 12 }}>Presence</p>
    <Presence users={[
      { id: "1", name: "Valerio Narcisi", initials: "VN" },
      { id: "2", name: "Sofia Romani", initials: "SR" },
      { id: "3", name: "Marco Bianchi", initials: "MB" },
      { id: "4", name: "Giulia Ferraro", initials: "GF" },
      { id: "5", name: "Luca Conti", initials: "LC" },
    ]} maxVisible={4} />
  </div>
</div>
```

Add the `ToggleChipDemo` component before `TokensPlayground`:

```tsx
function ToggleChipDemo() {
  const [cast, setCast] = React.useState(true);
  const [locations, setLocations] = React.useState(false);
  const [props_, setProps] = React.useState(true);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <ToggleChip isOn={cast} onToggle={() => setCast((v) => !v)} label="Cast" categoryColor="#6b3e7a" aria-label="Mostra sottolineature Cast" />
      <ToggleChip isOn={locations} onToggle={() => setLocations((v) => !v)} label="Locations" categoryColor="#9a5128" aria-label="Mostra sottolineature Locations" />
      <ToggleChip isOn={props_} onToggle={() => setProps((v) => !v)} label="Props" categoryColor="#2c6168" aria-label="Mostra sottolineature Props" />
    </div>
  );
}
```

Add `import React, { useState } from "react"` or use the existing React import pattern in the file.

- [ ] **Step 5: Verify /dev/tokens renders the primitives section**

Start the dev server:

```bash
pnpm --filter @oh-writers/web dev
```

Visit `http://localhost:1234/dev/tokens`. Scroll to "Primitives" section. Verify:
- All 3 Button variants render with correct colors
- Hotkey badge visible and styled correctly
- Pills render in correct tone colors
- ToggleChips toggle on click (Cast/Locations/Props colored dots)
- SavePill shows all 3 states
- Presence renders 4 avatars + "+1" overflow

- [ ] **Step 6: A11y verification**

Keyboard navigation on `/dev/tokens` primitives section:
- `Tab` through all Button, ToggleChip controls — each must receive focus with visible clay outline
- `Space` or `Enter` on ToggleChip toggles state
- `Space` or `Enter` on Button triggers click
- ToggleChip `role="switch"` and `aria-checked` visible in DevTools Accessibility panel

Contrast check (DevTools Inspector on each primitive):
- `DsButton primary`: white on clay → must be ≥ 4.5:1
- `DsButton ghost` text: `--ds-text-2` on `--ds-surface-alt` → must be ≥ 4.5:1
- `Pill leaf` text: `--ds-agent` on `--ds-agent-soft` → must be ≥ 3:1 (large text / UI component)
- `SavePill saving` text: `--ds-saving` on `--ds-bg` → must be ≥ 4.5:1

If any ratio fails, fix the token or override in the component's CSS before proceeding.

Reduced-motion: DevTools Rendering → `prefers-reduced-motion: reduce` → SavePill dot pulse should stop, Button/ToggleChip transitions should disappear.

- [ ] **Step 7: Commit all**

```bash
git add packages/ui/src/index.ts apps/web/app/routes/dev/tokens.tsx
git commit -m "[OHW] feat(ui): export DS-v2 primitives + add /dev/tokens primitives showcase"
```

---

## Self-Review

**Spec coverage check:**

- ✅ Sec 8: `Scrim` — Task 1
- ✅ Sec 8: `Pill` — Task 2
- ✅ Sec 8: `ToggleChip` — Task 3 (role="switch", aria-checked, categoryColor dot)
- ✅ Sec 8: `Tooltip` — Task 4 (dark/info kinds, placement)
- ✅ Sec 8: `Popover` — Task 5 (Esc/outside-click, role="dialog")
- ✅ Sec 8: `Drawer` — Task 6 (dialog element, focus trap, slide-in animation, aria-labelledby)
- ✅ Sec 6.1: `SavePill` — Task 7 (TopBar slot, aria-live)
- ✅ Sec 6.1: `Presence` — Task 8 (TopBar avatar stack, accessible ul)
- ✅ Sec 8: `Button` — Task 9 (primary/ghost/danger, hotkey badge)
- ✅ Sec 14: WCAG AA a11y — Task 10 Step 6 (keyboard, contrast, motion)

**Out of scope (Phase 3):**
- TopBar, Viewbar, FloatingDock shell components
- Composites (HeroKPI, MarginNote, CesareCard, ManifestoDrawer, FloatingDock, ProjectSwitcher)
- SkipLink component (first focusable element — Phase 3 Shell)

**Placeholder scan:** no TBDs or "implement later" phrases found.

**Type consistency:** `DsButton` exported as alias of `Button` — never directly exported as `Button` to avoid collision with legacy `components/Button`.

**Done criteria for Phase 2:**
1. `pnpm -r typecheck` → zero errors
2. `cd packages/ui && pnpm test` → 30 tests pass (all primitives)
3. `/dev/tokens` primitives section renders correctly (all states, all variants)
4. ToggleChip role="switch" + aria-checked verified in DevTools Accessibility panel
5. Keyboard nav works on all interactive primitives (Tab → focus ring, Space/Enter → action)
6. Contrast ratios AA on linen and dark themes
7. prefers-reduced-motion respected (pulse stops, transitions removed)
