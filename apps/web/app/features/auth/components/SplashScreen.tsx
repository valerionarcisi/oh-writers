// apps/web/app/features/app-shell/components/SplashScreen.tsx
//
// #136 — brand splash on cold app load: the clay cursor blinks, `oh-`
// composes in, `writers` types in (typewriter effect), a rotating quote from
// a director/screenwriter fades in below, then the whole thing dissolves
// into the app (~4.2s total). Pure CSS — no JS timers, no Lottie. Disabled
// entirely under `prefers-reduced-motion` (CSS media query hides the overlay
// before first paint, so no flash and no motion).
import { useEffect, useState, type CSSProperties } from "react";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./SplashScreen.module.css";

const WRITERS = Array.from("writers");

// Each pair is a real translation key, checked by the compiler — no
// string-interpolated key can silently drift out of sync with the
// catalogue (a renamed `splash.quote.N` key fails to typecheck here).
const QUOTES: ReadonlyArray<{ body: TranslationKey; author: TranslationKey }> =
  [
    { body: "splash.quote.0", author: "splash.quoteAuthor.0" },
    { body: "splash.quote.1", author: "splash.quoteAuthor.1" },
    { body: "splash.quote.2", author: "splash.quoteAuthor.2" },
    { body: "splash.quote.3", author: "splash.quoteAuthor.3" },
    { body: "splash.quote.4", author: "splash.quoteAuthor.4" },
  ];

export function SplashScreen() {
  const { t } = useTranslation();
  // Picked client-side only (after mount): SSR always renders quote 0, so
  // server and first client render match — no hydration mismatch — then
  // this swaps in a random pick for the rest of the splash's 4.2s life.
  const [quoteIndex, setQuoteIndex] = useState(0);
  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * QUOTES.length));
  }, []);
  const quote = t(QUOTES[quoteIndex]!.body);
  const author = t(QUOTES[quoteIndex]!.author);

  return (
    <div
      className={styles.splash}
      data-testid="app-splash"
      role="img"
      aria-label="Oh Writers"
    >
      <div className={styles.stack} aria-hidden="true">
        <div className={styles.lockup}>
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
        <p className={styles.quote}>
          {quote}
          <span className={styles.quoteAuthor}>— {author}</span>
        </p>
      </div>
    </div>
  );
}
