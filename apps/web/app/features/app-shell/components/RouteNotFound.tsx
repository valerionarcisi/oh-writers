import { Link, useRouter } from "@tanstack/react-router";
import { RouteErrorFallback } from "@oh-writers/ui";
import { translate, type TranslationKey } from "@oh-writers/domain";
import { useOptionalTranslation } from "~/features/i18n";

// App-wide not-found boundary (issue #62). Wired as the router's
// `defaultNotFoundComponent`, so a `notFound()` thrown anywhere (e.g. an invalid
// project `$id` param — see `assertValidProjectId`) renders the branded fallback
// instead of the framework's bare unstyled not-found page. A `notFound()` marks
// the ROOT route, so this renders full-page (NOT inside the `_app` AppShell) —
// the shell chrome around a non-existent project would be misleading. Reuses
// `RouteErrorFallback` with not-found copy and no stack (there is no error to
// leak). Like `RouteErrorBoundary`, it can render above `LocaleProvider`, so it
// reads the locale defensively.
//
// The "retry" action re-runs route matching (`router.invalidate()`) — a real
// retry for a transient/just-corrected URL — and is distinct from the home link
// (go to dashboard); the two controls are not aliases.
export function RouteNotFound() {
  const router = useRouter();
  const ctx = useOptionalTranslation();
  const t = (key: TranslationKey): string =>
    ctx ? ctx.t(key) : translate("en", key);

  return (
    <RouteErrorFallback
      data-testid="route-not-found"
      error={{}}
      onRetry={() => void router.invalidate()}
      homeLink={<Link to="/dashboard">{t("errorBoundary.home")}</Link>}
      labels={{
        title: t("notFound.title"),
        body: t("notFound.body"),
        retry: t("errorBoundary.retry"),
        home: t("errorBoundary.home"),
        showDetails: t("errorBoundary.showDetails"),
        hideDetails: t("errorBoundary.hideDetails"),
      }}
    />
  );
}
