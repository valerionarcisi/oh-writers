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
//
// `?compare=<versionA>,<versionB>` — optional companion (Spec 49 W3): switches
// the surface from the default "vs current" mode to a 2-version side-by-side
// compare. The value is a comma-separated pair of DISTINCT version UUIDs. Shape
// is validated here (two well-formed, distinct ids); the same-DOCUMENT guard is
// enforced client-side against the loaded version list (an id that is not one of
// the document's versions is dropped, falling back to "vs current") — the param
// carries no document segment, so it cannot guard cross-document here, exactly
// as `?versions=` cannot guard cross-project. Fail closed: any malformed pair is
// ignored and the surface stays in "vs current".

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

/**
 * Validated `?compare=` pair (Spec 49 W3): two DISTINCT version ids to render
 * side-by-side. `a` is the left/old column, `b` is the right/new column.
 */
export interface VersionsCompare {
  readonly a: string;
  readonly b: string;
}

/** Why a raw `?compare=` param was rejected. Tagged for ts-pattern. */
export class InvalidVersionsCompareError {
  readonly _tag = "InvalidVersionsCompareError" as const;
  readonly message: string;
  constructor(
    readonly reason: "empty" | "not-a-pair" | "not-a-uuid" | "same-version",
  ) {
    this.message = `Invalid compare param: ${reason}`;
  }
}

// ─── Search-param schema ───────────────────────────────────────────────────────

/**
 * Schema for the routed Versions surface across every host route. Both params
 * are optional strings; content (uuid shape, same-document, etc.) is validated
 * in {@link parseVersionsPeek}, which FAILS CLOSED on an empty/invalid value
 * ("render host alone"). We must NOT use `.min(1)` here: this schema is merged
 * into the `_app` layout route's `validateSearch`, and a `.min(1)` failure on a
 * bare `?versions=` (empty string) throws on the layout route, so its `user`
 * loader never resolves and the whole shell crashes ("Cannot destructure
 * 'user'"). Keep shape validation permissive so the empty value survives router
 * validation and the parser's documented fail-closed path runs.
 */
export const versionsSearchSchema = z.object({
  versions: z.string().optional(),
  vstate: z.enum(VERSIONS_SURFACE_STATES).optional(),
  vcur: z.string().optional(),
  compare: z.string().optional(),
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

/**
 * Parse + validate the raw `?compare=<a>,<b>` companion (Spec 49 W3). Returns a
 * typed `Result`:
 *   - `ok(VersionsCompare)` when the value is exactly two well-formed, DISTINCT
 *     version UUIDs.
 *   - `err(InvalidVersionsCompareError)` otherwise. Callers fail closed: any
 *     error means the surface stays in "vs current" (the compare is dropped),
 *     never an open compare on junk.
 *
 * The same-DOCUMENT guard is intentionally NOT applied here: the param carries
 * no document segment. A pair of shape-valid ids that belong to a different
 * document is dropped client-side (an id absent from the loaded version list
 * cannot resolve to content), so cross-document compare never leaks — exactly
 * how `parseVersionsPeek` defers the cross-project guard to the data layer.
 */
export function parseVersionsCompare(
  rawCompare: string | null | undefined,
): Result<VersionsCompare, InvalidVersionsCompareError> {
  if (rawCompare == null || rawCompare.trim().length === 0) {
    return err(new InvalidVersionsCompareError("empty"));
  }

  const parts = rawCompare
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length !== 2) {
    return err(new InvalidVersionsCompareError("not-a-pair"));
  }

  const [a, b] = parts as [string, string];
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) {
    return err(new InvalidVersionsCompareError("not-a-uuid"));
  }
  if (a === b) {
    return err(new InvalidVersionsCompareError("same-version"));
  }
  return ok({ a, b });
}

/** Serialize a `?compare=` pair back to its `<a>,<b>` string form. */
export const serializeVersionsCompare = (pair: VersionsCompare): string =>
  `${pair.a},${pair.b}`;
