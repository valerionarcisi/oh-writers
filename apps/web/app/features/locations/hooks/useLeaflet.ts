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

    // Leaflet JS
    const leafletScript = document.createElement("script");
    leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    leafletScript.onload = () => {
      // Leaflet.draw JS (depends on Leaflet being loaded first)
      const drawScript = document.createElement("script");
      drawScript.src = "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js";
      drawScript.onload = () => {
        loaded = true;
        loading = false;
        callbacks.forEach((cb) => cb());
        callbacks.length = 0;
        resolve();
      };
      drawScript.onerror = () => {
        // Draw failed but Leaflet loaded — still usable
        loaded = true;
        loading = false;
        callbacks.forEach((cb) => cb());
        callbacks.length = 0;
        resolve();
      };
      document.head.appendChild(drawScript);
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
