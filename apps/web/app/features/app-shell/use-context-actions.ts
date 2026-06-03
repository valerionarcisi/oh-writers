// apps/web/app/features/app-shell/use-context-actions.ts
//
// `useContextActions` — the web binding for the declarative context-action
// registry (Spec 55 backbone, `@oh-writers/domain` → `resolveContextActions`).
//
// This is the narrow interface every page/feature uses to render its actions in
// the TopBar action zone. The page passes the route `segment` (e.g. "soggetto")
// plus a handler table keyed by `ContextActionId`; the hook:
//   1. resolves the registry's ordered descriptors for that segment,
//   2. feature-gates them through the already-resolved `useFeatures()` set
//      (Spec 54 — no inline locale/market checks),
//   3. translates each label key via the i18n layer (no hardcoded copy),
//   4. drops any descriptor the page did not wire a handler for (so a page
//      surfaces only the actions it actually supports),
// and returns a `DropdownMenuItem[]` ready for the TopBar `ActionsMenu`.
//
// Downstream lanes (screenplay, production pages) consume this same hook —
// register descriptors in the domain registry, wire handlers here — instead of
// hand-rolling their own TopBar placement.

import { useMemo } from "react";
import {
  resolveContextActions,
  type ContextActionId,
} from "@oh-writers/domain";
import type { DropdownMenuItem } from "@oh-writers/ui";
import { useFeatures } from "~/features/feature-flags";
import { useTranslation } from "~/features/i18n";

/**
 * Per-action runtime binding supplied by the page. `onSelect` runs the action;
 * `disabled` greys it out (e.g. export disabled until the doc has content);
 * `labelOverride` swaps the registry label for a transient one (e.g. an
 * "Exporting…" pending state) without leaving the registry's i18n key behind.
 */
export interface ContextActionHandler {
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly labelOverride?: string;
  readonly testId?: string;
}

export type ContextActionHandlers = Partial<
  Record<ContextActionId, ContextActionHandler>
>;

/**
 * Resolve the TopBar context-action menu items for a route segment. The result
 * is memoised on `[segment, features, handlers, t]`, so a page can feed it
 * straight into a memoised `ActionsMenu` slot without re-publishing each render.
 */
export function useContextActions(
  segment: string,
  handlers: ContextActionHandlers,
): DropdownMenuItem[] {
  const { t } = useTranslation();
  const features = useFeatures();

  return useMemo(() => {
    return resolveContextActions(segment, features)
      .map((descriptor): DropdownMenuItem | null => {
        const handler = handlers[descriptor.id];
        if (!handler) return null;
        return {
          label: handler.labelOverride ?? t(descriptor.labelKey),
          onClick: handler.onSelect,
          disabled: handler.disabled,
          testId: handler.testId,
        };
      })
      .filter((item): item is DropdownMenuItem => item !== null);
  }, [segment, features, handlers, t]);
}
