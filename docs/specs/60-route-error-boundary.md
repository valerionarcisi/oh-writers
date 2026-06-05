# Spec 60 — App-wide route error boundary

Status: APPROVED (user-requested 2026-06-05). Bug: **N-30** (`Cannot use 'in'
operator to search for 'IP_DIFF' in null` rendered as a bare, unstyled
full-page crash on a session/event detail surface during the Narrative Walk).

## Problem

A render-time throw on any routed surface (a session detail, a version/event
drawer, …) escapes to **TanStack Router's default error component** — an
unstyled `<div>` with Times-New-Roman "Something went wrong! / Hide Error" and a
raw message. Two failures compound:

1. **The whole app disappears.** There is no shell, no navigation, no way back —
   the user is stranded on a bare page and must reload.
2. **The real stack is lost.** The default page prints only `error.message`; the
   stack that would localise the bug (the `IP_DIFF in null` site was never found
   statically because the string is runtime-constructed) is not surfaced or
   logged.

The specific `IP_DIFF in null` throw was **not reproducible on current `main`**
(all session/conversation/edit/diff/version/event-detail paths verified live with
real AI — see the session below). It was likely fixed by a merge landing after
the walk screenshot, or is a rare data/timing condition. Either way the lesson is
the same: **a single render throw must never blank the app**, and when one
happens we must capture the stack to fix it.

## Decision

Add ONE app-wide `defaultErrorComponent` to the router (`router.tsx`). It is the
single boundary that catches every route render throw — a deep module, not a
per-surface patch. Behaviour:

- Renders a **branded, token-styled fallback** (no raw Times-New-Roman page):
  title + short reassurance + **"Riprova"** (calls `router.invalidate()` to
  re-run the failed match) + **"Torna alla dashboard"** link.
- A collapsible **"Mostra dettagli"** reveals `error.message` + `error.stack`
  (monospace, scrollable) for the user to copy when reporting — replacing the
  bare default while keeping the diagnostic.
- **Logs the real error + stack** via the existing client logger on mount, so a
  recurrence is captured in observability instead of vanishing. (Per
  [Observability](../conventions/observability.md) — Pino on server, structured
  console on client.)

No `try/catch` is introduced (that rule is for expected failures); this is a
React error boundary for _unexpected_ render throws, which is exactly what
`errorComponent` is for.

### Why router-level, not a wrapper per drawer

The crash blanked the **whole document** — it escaped past the shell. A boundary
mounted inside a feature (e.g. only around `CesareConversation`) would not have
caught a throw in the route component or its loader-driven children above that
point. The router's `defaultErrorComponent` is the outermost app-owned boundary
that still renders _our_ HTML. For a **leaf** throw the boundary renders at the
matched route's `<Outlet/>` position — inside `LocaleProvider`/the shell, so the
rail + main region survive and only the route subtree is replaced. One boundary,
every surface.

### Provider-resilience (the boundary also catches root throws)

`defaultErrorComponent` is ALSO invoked when the **root route** itself throws
(its loader `resolveLocale`, or `RootLayout` render) — and there it renders
ABOVE `LocaleProvider`/`QueryClientProvider`. So the binding must NOT depend on
those providers, or it would crash _itself_ and fall back to the bare page it set
out to replace. It reads the locale via `useOptionalTranslation()` (non-throwing,
returns `null` with no provider) and falls back to the pure, provider-free
`translate("en", key)` domain function. `useRouter`/`<Link>` are always safe —
the router renders this component, so the router context is always present.

## Files

- `packages/ui/src/components/RouteErrorFallback.{tsx,module.css}` — the
  presentational fallback (props: `error`, `onRetry`, `homeLink` node, and
  `labels` passed by the app, per the framework-agnostic packages/ui rule).
  Token-based CSS module.
- `apps/web/app/features/app-shell/components/RouteErrorBoundary.tsx` — the app
  binding: `useRouter()` for `invalidate`, `useOptionalTranslation()` + a
  default-locale fallback for copy, logs the stack in a client effect, renders
  `RouteErrorFallback`.
- `apps/web/app/features/i18n/locale-context.tsx` — adds `useOptionalTranslation`
  (non-throwing locale context read).
- `apps/web/app/router.tsx` — `defaultErrorComponent: RouteErrorBoundary`.
- `apps/web/app/routes/_app.crash-test.tsx` — dev/test-only route that throws in
  any non-production build (gated by `import.meta.env.MODE`); used by the E2E.
- i18n: `errorBoundary.*` keys in `packages/domain/src/i18n/keys/appShell.ts`
  (title, body, retry, home, showDetails, hideDetails), both locales.

## Tests

- Unit (`packages/ui/.../RouteErrorFallback.test.tsx`): renders title/body/retry;
  toggling details reveals the stack; `onRetry` fires; no details affordance when
  the error has no message/stack.
- E2E (`tests/route-error-boundary.spec.ts`): navigating to the dev/test-only
  `/crash-test` route (it throws on render outside production) renders the branded
  fallback — asserts the title testid present and the bare TanStack default
  ("Something went wrong!") **absent** — that the **shell chrome survives**
  (`left-rail` + `#main-content` stay), that "Mostra dettagli" reveals the stack
  (containing `IP_DIFF`), and that navigating away to a healthy route clears the
  boundary.

## Out of scope

- Hunting the original `IP_DIFF` site (not reproducible; this spec makes any such
  throw non-fatal and self-reporting instead).
- Per-route custom error components (production pages) — the default covers all.
