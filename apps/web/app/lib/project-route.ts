import { notFound } from "@tanstack/react-router";
import { z } from "zod";

// Trust boundary for the `$id` project param (issue #62). A non-uuid id used to
// reach the project-scoped server functions, whose `z.string().uuid()`
// validators threw — surfacing as a retried HTTP 500 storm whose body leaked the
// server stack trace + absolute filesystem paths, behind a silently broken empty
// shell. Validating the param here fails fast at the route boundary: an invalid
// id never fires a query, and the router renders the branded
// `defaultErrorComponent` (Spec 60) instead.
// ponytail: a crafted direct POST to a project-scoped server fn with a non-uuid
// id still trips its `z.string().uuid()` validator; in prod (NODE_ENV=production)
// the framework returns a generic 500 with no stack/paths, so the leak is the
// dev-only verbose error page. If we ever surface raw server-fn errors to end
// users (custom error handler), strip the stack there too.
const projectIdSchema = z.string().uuid();

// Reject an invalid `$id` in `beforeLoad` (not `params.parse`): a `notFound()`
// thrown from `beforeLoad` short-circuits the route's loaders/component and
// renders the router's `defaultNotFoundComponent`. A throw from `params.parse`
// does NOT short-circuit in this router version — the route still mounts and
// fires its queries (the very 500 storm we are preventing).
export const assertValidProjectId = (params: { id: string }): void => {
  if (!projectIdSchema.safeParse(params.id).success) throw notFound();
};
