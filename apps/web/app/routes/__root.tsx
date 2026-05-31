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
import "../styles/global.css";

export const Route = createRootRoute({
  // Default document title for every route. Leaf routes override `title` via
  // their own `head` (TanStack merges matched-route meta, last wins) so the tab
  // is never blank — the pre-main audit found `document.title` empty everywhere.
  head: () => ({
    meta: [{ title: "Oh Writers" }],
  }),
  component: RootLayout,
});

function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <html lang="en">
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
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ConfirmDialogProvider>
              <Outlet />
            </ConfirmDialogProvider>
          </ToastProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
