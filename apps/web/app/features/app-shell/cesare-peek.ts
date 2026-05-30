// apps/web/app/features/app-shell/cesare-peek.ts
//
// Peek-param validation for the Notion-style split drawer (Spec 46 `?peek=`
// model, Spec 47 task A4).
//
// The host route stays mounted and the peek is a single search param on it.
// When set, the shell mounts Cesare as a dedicated right column that COLLAPSES
// the page (the main lane reflows narrower) — NOT a floating overlay.
//
// This module is the deep, framework-agnostic core: it parses the raw search
// param into a validated `CesarePeek` and fails CLOSED on anything it cannot
// trust (cross-project path, cross-origin URL, junk). The host renders the
// page alone whenever parsing yields an error.
//
// Two peek targets are supported today:
//   - `"cesare"` — open the floating Cesare chat as a split column.
//   - a same-project in-app path under `/projects/:id/...` — render that page
//     beside the host (the generic side-peek; reused by "Mostra modifiche").
//
// Anything else is rejected. No open redirect, no cross-project peek.

import { z } from "zod";
import { ok, err, type Result } from "neverthrow";

// ─── Public types ────────────────────────────────────────────────────────────

/** The literal token that opens the Cesare chat as a split column. */
export const CESARE_PEEK_TOKEN = "cesare" as const;

/**
 * Validated peek target. A discriminated union so callers branch exhaustively:
 *   - `cesare` → mount the Cesare chat in the split lane.
 *   - `page`   → mount the in-app page at `path` (same project) in the lane.
 */
export type CesarePeek =
  | { readonly kind: "cesare" }
  | { readonly kind: "page"; readonly path: string };

/** Why a raw peek param was rejected. Tagged for ts-pattern discrimination. */
export class InvalidPeekError {
  readonly _tag = "InvalidPeekError" as const;
  readonly message: string;
  constructor(
    readonly reason:
      | "empty"
      | "cross-origin"
      | "not-app-path"
      | "cross-project"
      | "malformed",
  ) {
    this.message = `Invalid peek param: ${reason}`;
  }
}

// ─── Search-param schema ───────────────────────────────────────────────────────

/**
 * Schema for the `peek` search param across every host route. The param is
 * optional; when present it is a non-empty string. We do NOT validate the
 * content here (that needs the current project id) — only the shape. Content
 * validation lives in {@link parseCesarePeek} so the schema stays project-
 * agnostic and reusable across routes.
 */
export const peekSearchSchema = z.object({
  peek: z.string().min(1).optional(),
});

export type PeekSearch = z.infer<typeof peekSearchSchema>;

// ─── Parsing / validation ──────────────────────────────────────────────────────

/**
 * Decode a raw `peek` param once. The param is URL-encoded by the router; we
 * tolerate already-decoded values too (decode is idempotent for our tokens).
 */
function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — keep the raw value; the path guard below
    // rejects it anyway.
    return raw;
  }
}

/**
 * Parse + validate a raw `peek` search param against the current project.
 * Returns a typed `Result`:
 *   - `ok(CesarePeek)` when the param is the Cesare token or a trusted
 *     same-project in-app path.
 *   - `err(InvalidPeekError)` otherwise. Callers fail closed (render host
 *     alone) on any error.
 *
 * `currentProjectId` scopes the same-project guard: a peek path must live under
 * `/projects/<currentProjectId>/...`. A path for another project is rejected so
 * the peek can never leak a foreign project's page.
 */
export function parseCesarePeek(
  raw: string | null | undefined,
  currentProjectId: string | null | undefined,
): Result<CesarePeek, InvalidPeekError> {
  if (raw == null || raw.trim().length === 0) {
    return err(new InvalidPeekError("empty"));
  }

  const decoded = safeDecode(raw.trim());

  if (decoded === CESARE_PEEK_TOKEN) {
    return ok({ kind: "cesare" });
  }

  // From here the param must be a same-origin, in-app, same-project path.
  // Reject anything that smells like an absolute/protocol-relative URL: those
  // could be an open redirect. We never accept a scheme or a leading `//`.
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith("//")) {
    return err(new InvalidPeekError("cross-origin"));
  }

  // In-app paths are absolute root-relative paths (`/projects/...`). A hash
  // anchor is allowed (`#scene-3`); query strings on the peek target are not
  // (a nested peek is out of scope — single peek only).
  if (!decoded.startsWith("/projects/")) {
    return err(new InvalidPeekError("not-app-path"));
  }
  if (decoded.includes("?")) {
    return err(new InvalidPeekError("malformed"));
  }

  // Same-project guard. The path must be exactly under the current project.
  if (currentProjectId == null || currentProjectId.length === 0) {
    return err(new InvalidPeekError("cross-project"));
  }
  const expectedPrefix = `/projects/${currentProjectId}/`;
  const exactProjectHome = `/projects/${currentProjectId}`;
  if (decoded !== exactProjectHome && !decoded.startsWith(expectedPrefix)) {
    return err(new InvalidPeekError("cross-project"));
  }

  return ok({ kind: "page", path: decoded });
}

/**
 * Convenience for the common shell question: "is the peek the Cesare split
 * column for this project?". Returns `true` only when the param parses to the
 * Cesare token. Fails closed on every error.
 */
export function isCesarePeek(
  raw: string | null | undefined,
  currentProjectId: string | null | undefined,
): boolean {
  const result = parseCesarePeek(raw, currentProjectId);
  return result.isOk() && result.value.kind === "cesare";
}
