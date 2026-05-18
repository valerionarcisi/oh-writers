import type { AffectedEntity } from "./cesare-notification-context";

/**
 * Briefly highlight affected entities in the DOM by toggling
 * `data-cesare-pulse="true"`. CSS handles the actual animation.
 *
 * Pages render entity cards with `data-entity-id="..."` (the same value
 * as `affectedEntities[].id`). The function is a best-effort: missing
 * nodes are skipped silently.
 */
export const pulseAffectedEntities = (entities: AffectedEntity[]): void => {
  if (typeof document === "undefined") return;
  if (entities.length === 0) return;

  const matched: HTMLElement[] = [];
  for (const entity of entities) {
    // Match by [data-entity-id] (preferred) or feature-specific test ids.
    const node =
      document.querySelector<HTMLElement>(`[data-entity-id="${entity.id}"]`) ??
      document.querySelector<HTMLElement>(
        `[data-testid="candidate-card-${entity.id}"]`,
      );
    if (node) matched.push(node);
  }

  for (const node of matched) {
    node.setAttribute("data-cesare-pulse", "true");
  }

  // Clear after the animation duration so a second event can re-trigger.
  window.setTimeout(() => {
    for (const node of matched) {
      node.removeAttribute("data-cesare-pulse");
    }
  }, 2100);
};
