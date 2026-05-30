// apps/web/app/features/app-shell/versions-peek.ts
//
// Routed-surface validation for the Versions SplitDrawer (Spec 49 `?versions=`
// model, Wave A / W1).
//
// The host route stays mounted and the Versions surface is a single search
// param on it. When set, the shell mounts the `VersionsSplitDrawer` as a real
// grid column that COMPRESSES the page (the main lane reflows narrower) — the
// Notion side-peek model, NOT a floating overlay. This mirrors `cesare-peek.ts`
// but the carried value is a versioned entity reference, not an in-app path.
//
// `?versions=<documentId>` — the entity whose versions are listed. The document
// id is a UUID; the same-project guard cannot live here (the param carries no
// project segment), so it is enforced fail-closed at the data layer: the
// versions server fn is read-gated and a foreign / non-existent document yields
// not-found, never leaked content. Here we validate the SHAPE (a UUID) and fail
// closed on junk so the host renders alone.
//
// `?vstate=full` — optional companion: promotes the open Versions surface from
// the compressed split to a full-screen route (the `↗` expand). Absent → the
// default split. It is only meaningful while `?versions=` is set.

import { z } from "zod";
import { ok, err, type Result } from "neverthrow";

// ─── Public types ────────────────────────────────────────────────────────────

/** The two layout states a routed Versions surface can be in. */
export const VERSIONS_SURFACE_STATES = ["split", "full"] as const;
export type VersionsSurfaceState = (typeof VERSIONS_SURFACE_STATES)[number];

/**
 * Validated Versions surface target. `documentId` is the versioned entity; the
 * `state` reflects the optional `?vstate=` companion (default `split`).
 * `currentVersionId` is the optional `?vcur=` companion — the "vs current"
 * baseline carried so the surface stays deep-linkable without a second fetch.
 * When absent or malformed it falls back to the most recent version client-side.
 */
export interface VersionsPeek {
  readonly documentId: string;
  readonly state: VersionsSurfaceState;
  readonly currentVersionId: string | null;
}

/** Why a raw `?versions=` param was rejected. Tagged for ts-pattern. */
export class InvalidVersionsPeekError {
  readonly _tag = "InvalidVersionsPeekError" as const;
  readonly message: string;
  constructor(readonly reason: "empty" | "not-a-uuid") {
    this.message = `Invalid versions param: ${reason}`;
  }
}

// ─── Search-param schema ───────────────────────────────────────────────────────

/**
 * Schema for the routed Versions surface across every host route. Both params
 * are optional; `versions` is a non-empty string (content validated in
 * {@link parseVersionsPeek}), `vstate` is the tagged state union. We keep shape
 * validation here so the param survives navigation, and content validation in
 * the parser so the schema stays project-agnostic.
 */
export const versionsSearchSchema = z.object({
  versions: z.string().min(1).optional(),
  vstate: z.enum(VERSIONS_SURFACE_STATES).optional(),
  vcur: z.string().min(1).optional(),
});

export type VersionsSearch = z.infer<typeof versionsSearchSchema>;

// ─── Parsing / validation ──────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Parse + validate the raw `?versions=` + `?vstate=` params. Returns a typed
 * `Result`:
 *   - `ok(VersionsPeek)` when `versions` is a well-formed document UUID.
 *   - `err(InvalidVersionsPeekError)` otherwise. Callers fail closed (render
 *     host alone) on any error.
 *
 * The same-project guard is intentionally NOT applied here: the param carries
 * no project segment, and the versions server fn already read-gates the
 * document by project membership. A foreign document id therefore parses as a
 * shape-valid UUID but resolves to not-found at fetch time — no leak.
 */
export function parseVersionsPeek(
  rawDocumentId: string | null | undefined,
  rawState: string | null | undefined,
  rawCurrentVersionId?: string | null | undefined,
): Result<VersionsPeek, InvalidVersionsPeekError> {
  if (rawDocumentId == null || rawDocumentId.trim().length === 0) {
    return err(new InvalidVersionsPeekError("empty"));
  }

  const documentId = rawDocumentId.trim();
  if (!UUID_RE.test(documentId)) {
    return err(new InvalidVersionsPeekError("not-a-uuid"));
  }

  const state: VersionsSurfaceState = rawState === "full" ? "full" : "split";
  // The baseline is advisory: a malformed `vcur` is ignored (fall back to the
  // most recent version client-side), never a hard reject — it only changes
  // which diff renders, not whether the surface is trusted.
  const currentVersionId =
    rawCurrentVersionId != null && UUID_RE.test(rawCurrentVersionId.trim())
      ? rawCurrentVersionId.trim()
      : null;
  return ok({ documentId, state, currentVersionId });
}
