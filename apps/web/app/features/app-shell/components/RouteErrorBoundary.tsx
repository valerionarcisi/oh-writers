import { useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { RouteErrorFallback } from "@oh-writers/ui";
import { translate, type TranslationKey } from "@oh-writers/domain";
import { useOptionalTranslation } from "~/features/i18n";

// App-wide route error boundary (Spec 60). Wired as the router's
// `defaultErrorComponent`, so ANY render throw on a routed surface lands here
// instead of the framework's bare unstyled page. It logs the real stack and
// gives the user a branded fallback with a way back.
//
// This boundary ALSO catches throws in the root route (loader/component), where
// it renders ABOVE `LocaleProvider` — so it must never depend on that provider.
// It reads the locale defensively via `useOptionalTranslation` and falls back to
// the default-locale `translate()` (a pure, provider-free domain function) when
// the context is absent. `useRouter`/`Link` are always available because the
// router itself renders this component.

export function RouteErrorBoundary({ error }: { error: Error }) {
  const router = useRouter();
  const ctx = useOptionalTranslation();
  const t = (key: TranslationKey): string =>
    ctx ? ctx.t(key) : translate("en", key);

  // Surface the real error + stack to the client console as a structured event
  // (the bare default page only printed `message`; the stack was being lost).
  // Server-side throws are already logged by the framework on the server.
  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "route.error.boundary",
        message: error.message,
        stack: error.stack,
      }),
    );
  }, [error]);

  return (
    <RouteErrorFallback
      error={error}
      onRetry={() => void router.invalidate()}
      homeLink={<Link to="/dashboard">{t("errorBoundary.home")}</Link>}
      labels={{
        title: t("errorBoundary.title"),
        body: t("errorBoundary.body"),
        retry: t("errorBoundary.retry"),
        home: t("errorBoundary.home"),
        showDetails: t("errorBoundary.showDetails"),
        hideDetails: t("errorBoundary.hideDetails"),
      }}
    />
  );
}
