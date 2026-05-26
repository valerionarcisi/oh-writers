import { useEffect, useState } from "react";

let loaded = false;
let loading = false;
const callbacks: Array<() => void> = [];

const loadLeaflet = (): Promise<void> => {
  if (loaded) return Promise.resolve();
  if (loading) {
    return new Promise((resolve) => callbacks.push(resolve));
  }

  loading = true;

  return new Promise((resolve, reject) => {
    // CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const drawCss = document.createElement("link");
    drawCss.rel = "stylesheet";
    drawCss.href = "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css";
    document.head.appendChild(drawCss);

    // MarkerCluster CSS (default + theme) — groups dense discovery pins so the
    // map stays readable on feature-length projects (spec 37 Phase 3).
    for (const href of [
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
    ]) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }

    const finish = () => {
      loaded = true;
      loading = false;
      callbacks.forEach((cb) => cb());
      callbacks.length = 0;
      resolve();
    };

    // Load a plugin script, then call `next` whether it succeeds or not — a
    // missing plugin must not block the map (Leaflet itself is enough to render).
    const loadPlugin = (src: string, next: () => void) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = next;
      script.onerror = next;
      document.head.appendChild(script);
    };

    // Leaflet JS first; plugins (draw, markercluster) depend on it.
    const leafletScript = document.createElement("script");
    leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    leafletScript.onload = () => {
      loadPlugin(
        "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js",
        () =>
          loadPlugin(
            "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
            finish,
          ),
      );
    };
    leafletScript.onerror = reject;
    document.head.appendChild(leafletScript);
  });
};

export const useLeaflet = (): boolean => {
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    if (loaded) {
      setReady(true);
      return;
    }
    loadLeaflet()
      .then(() => setReady(true))
      .catch(() => {});
  }, []);

  return ready;
};
