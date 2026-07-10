import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ToastProvider,
  ConfirmDialogProvider,
  SpriteLoader,
} from "@oh-writers/ui";
import type { Locale } from "@oh-writers/domain";
import { LocaleProvider } from "~/features/i18n";
import { FeatureProvider } from "~/features/feature-flags";
import "../styles/global.css";

export const Route = createRootRoute({
  // Default document title for every route. Leaf routes override `title` via
  // their own `head` (TanStack merges matched-route meta, last wins) so the tab
  // is never blank — the pre-main audit found `document.title` empty everywhere.
  head: () => ({
    meta: [{ title: "Oh Writers" }],
  }),
  // Resolve the UI locale server-side (user.locale → Accept-Language → 'en')
  // so `<html lang>`, the first paint, and feature/route gates are correct and
  // the client never has to re-detect (which would flip lang on hydration).
  loader: async (): Promise<{
    locale: Locale;
    isDevEnvironment: boolean;
    isAiEnabled: boolean;
  }> => {
    // resolveLocale is a createServerFn: on client-side navigation TanStack
    // re-runs this loader, and the server fn is invoked via RPC instead of
    // calling getWebRequest() directly (which throws off-server). See ALTO-1.
    const { resolveLocale } =
      await import("~/features/i18n/resolve-locale.server");
    // Spec 84 §5: AI-enabled state is resolved the same way — server-side, in
    // this loader, threaded down as a concrete prop (never re-derived on the
    // client). Resolve it via a createServerFn too, for the same ALTO-1
    // reason resolveLocale is one (getWebRequest() is unreliable on
    // client-side re-navigation loaders).
    const { resolveAiEnabledForCurrentUser } =
      await import("~/features/feature-flags/resolve-ai-enabled-for-current-user.server");
    // Feature flags convention: resolve server-side, never on the client.
    // Vite inlines import.meta.env.DEV at build time — reading it here (not
    // inside FeatureProvider's render) keeps it on the same loader-resolution
    // contract as locale/market.
    return {
      locale: await resolveLocale(),
      isDevEnvironment: import.meta.env.DEV,
      isAiEnabled: await resolveAiEnabledForCurrentUser(),
    };
  },
  component: RootLayout,
});

function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const { locale, isDevEnvironment, isAiEnabled } = Route.useLoaderData();

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <HeadContent />
      </head>
      <body>
        <SpriteLoader />
        <LocaleProvider locale={locale}>
          <FeatureProvider
            locale={locale}
            isDevEnvironment={isDevEnvironment}
            isAiEnabled={isAiEnabled}
          >
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <ConfirmDialogProvider>
                  <Outlet />
                </ConfirmDialogProvider>
              </ToastProvider>
            </QueryClientProvider>
          </FeatureProvider>
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}
