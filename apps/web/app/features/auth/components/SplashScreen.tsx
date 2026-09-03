// apps/web/app/features/app-shell/components/SplashScreen.tsx
//
// #136 — brand splash on cold app load: the clay cursor blinks, `oh-`
// composes in, `writers` types in (typewriter effect), then the whole thing
// dissolves into the app (~3.2s total,. Pure CSS — no JS timers, no
// Lottie. Disabled entirely under `prefers-reduced-motion` (CSS media query
// hides the overlay before first paint, so no flash and no motion).
import type { CSSProperties } from "react";
import styles from "./SplashScreen.module.css";

const WRITERS = Array.from("writers");

export function SplashScreen() {
  return (
    <div
      className={styles.splash}
      data-testid="app-splash"
      role="img"
      aria-label="Oh Writers"
    >
      <div className={styles.lockup} aria-hidden="true">
        <span className={styles.oh}>oh-</span>
        <span className={styles.cursor} />
        <span className={styles.writers}>
          {WRITERS.map((letter, i) => (
            <span
              key={i}
              className={styles.letter}
              style={{ "--i": i } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
