import { Context, Effect, Layer } from "effect";
import {
  requireProjectAccess,
  requireProjectAccessWithHeaders,
  type AccessLevel,
  type ProjectAccess,
  type ProjectAccessError,
} from "~/server/access";
import { DbService } from "./db.layer";
import { fromResultAsync } from "./interop";

// ─── Access service ────────────────────────────────────────────────────────────
//
// The Effect-side facade over the existing access prelude
// (`requireProjectAccess` / `requireProjectAccessWithHeaders`). Auth semantics
// are UNCHANGED — this is a thin adapter: the headers-explicit variant still
// resolves the Better Auth session from the request `Headers` (the stream-route
// fix), and the ambient variant still resolves it from `getWebRequest()`.
//
// Both methods take the `Db` from `DbService` so AI Effects never thread `db`
// into the access call by hand. Errors stay the existing `ProjectAccessError`
// union (ProjectNotFound / Forbidden / Db), now carried on Effect's E channel.

export interface AccessService {
  readonly resolveProjectAccess: (
    projectId: string,
    level: AccessLevel,
  ) => Effect.Effect<ProjectAccess, ProjectAccessError>;
  readonly resolveProjectAccessFromHeaders: (
    projectId: string,
    level: AccessLevel,
    headers: Headers,
  ) => Effect.Effect<ProjectAccess, ProjectAccessError>;
}

export const AccessService =
  Context.GenericTag<AccessService>("ai/AccessService");

export const AccessLayer = Layer.effect(
  AccessService,
  Effect.map(
    DbService,
    ({ db }): AccessService => ({
      resolveProjectAccess: (projectId, level) =>
        fromResultAsync(requireProjectAccess(db, projectId, level)),
      resolveProjectAccessFromHeaders: (projectId, level, headers) =>
        fromResultAsync(
          requireProjectAccessWithHeaders(db, projectId, level, headers),
        ),
    }),
  ),
);
