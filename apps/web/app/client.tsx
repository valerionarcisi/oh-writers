import { hydrateRoot } from "react-dom/client";
// Import from the client-only entry, NOT the "@tanstack/start" barrel: the
// barrel re-exports the server half too, which pulls in h3 (Nitro's HTTP
// layer). h3 is a transitive dep and unreachable from apps/web under pnpm's
// strict layout, so the browser bundle ended up with a bare, unresolvable
// `import "h3"` that threw while this entry initialised — leaving every page
// stuck on its loading skeleton with no request ever sent (issue #98).
import { StartClient } from "@tanstack/start/client";
import { createRouter } from "./router";

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
