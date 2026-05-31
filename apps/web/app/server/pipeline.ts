import { ResultAsync } from "neverthrow";
import { getDb, type Db } from "~/server/db";
import {
  requireProjectAccess,
  requireProjectAccessWithHeaders,
  type AccessLevel,
  type ProjectAccess,
  type ProjectAccessError,
} from "~/server/access";

// Spec 23 — server pipeline refactor.
//
// `withProjectAccess` is the canonical entry point for authenticated server
// functions scoped to a single project: it bootstraps the Db handle, resolves
// the caller's `ProjectAccess` (user + project + role + permission gate), and
// runs `body` inside the same chain. Handlers never re-implement the
// `getDb()` + `requireUser()` + access-check + permission-gate boilerplate.
//
// Usage:
//
//   export const getBudget = createServerFn({ method: "GET" })
//     .validator(z.object({ projectId: z.string().uuid() }))
//     .handler(async ({ data }) =>
//       toShape(
//         await withProjectAccess(data.projectId, "view", ({ db, access }) =>
//           loadBudget(db, access.project.id),
//         ),
//       ),
//     );

export type WithProjectAccessCtx = {
  readonly db: Db;
  readonly access: ProjectAccess;
};

/**
 * Bootstrap Db, resolve project access at `level`, run `body`. Body returns a
 * `ResultAsync<T, E>`; the combined error union is `E | ProjectAccessError`.
 */
export const withProjectAccess = <T, E>(
  projectId: string,
  level: AccessLevel,
  body: (ctx: WithProjectAccessCtx) => ResultAsync<T, E>,
): ResultAsync<T, E | ProjectAccessError> =>
  ResultAsync.fromSafePromise(getDb()).andThen((db) =>
    requireProjectAccess(db, projectId, level).andThen((access) =>
      body({ db, access }),
    ),
  );

/**
 * Headers-explicit variant of {@link withProjectAccess} for API file routes
 * (e.g. `/api/cesare/stream`) that pass `request.headers` directly rather than
 * relying on the ambient `getWebRequest()`, which is not reliably populated in
 * an API route's POST handler.
 */
export const withProjectAccessHeaders = <T, E>(
  projectId: string,
  level: AccessLevel,
  headers: Headers,
  body: (ctx: WithProjectAccessCtx) => ResultAsync<T, E>,
): ResultAsync<T, E | ProjectAccessError> =>
  ResultAsync.fromSafePromise(getDb()).andThen((db) =>
    requireProjectAccessWithHeaders(db, projectId, level, headers).andThen(
      (access) => body({ db, access }),
    ),
  );
