// apps/web/app/lib/document-title.ts
//
// Central helper for per-route document titles. The pre-main audit found
// `document.title` empty on every page; each route declares its title through
// TanStack Router's `head` meta, and this builder keeps the suffix and format
// in ONE place so the tab text stays consistent ("<Page> · Oh Writers").
//
// Pure, no I/O — safe to call from a route `head` function.

const APP_NAME = "Oh Writers";

/**
 * Build a `head` meta `title` entry for a route.
 *
 * @param page Human-readable page label (IT UI copy), e.g. "Soggetto".
 *             Omit for the bare app name (used as the root default).
 */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

/** Convenience: the `head` object a route returns to set its title. The `meta`
 *  array is mutable to satisfy TanStack Router's `head` return type. */
export function titleHead(page?: string): { meta: Array<{ title: string }> } {
  return { meta: [{ title: pageTitle(page) }] };
}
