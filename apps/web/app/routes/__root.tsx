import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../styles/global.css";

export const Route = createRootRoute({
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
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
