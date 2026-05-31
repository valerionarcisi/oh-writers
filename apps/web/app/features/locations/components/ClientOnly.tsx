// apps/web/app/features/locations/components/ClientOnly.tsx
//
// Render children only after the first client commit. The Leaflet map subtree
// (markers, popups, overlay pills, draw controls) is inherently client-driven —
// it mutates `document.head`, injects third-party scripts, and lays out against
// real pixel dimensions — so its SSR output never matches the post-hydration DOM
// and React logs "a tree hydrated but some attributes … didn't match".
//
// Gating the map behind a mount flag removes the mismatch by construction: the
// server (and the very first client render) emit a stable placeholder, then the
// real map mounts client-side where Leaflet runs. A deliberate, narrow gate —
// not a blanket SSR opt-out.
import { useEffect, useState, type ReactNode } from "react";

interface ClientOnlyProps {
  readonly children: ReactNode;
  /** Rendered on the server and the first client paint, before mount. */
  readonly fallback?: ReactNode;
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return <>{mounted ? children : fallback}</>;
}
