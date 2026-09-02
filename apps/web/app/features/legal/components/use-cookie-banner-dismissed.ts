import { useCallback, useEffect, useState } from "react";

/**
 * Spec 88 — dismissal for the cookie notice. Unlike
 * `useAiOffBannerDismissed`, this is NOT keyed per user: the notice must
 * render for anonymous visitors on /login and /register too, before any
 * session exists.
 */
const STORAGE_KEY = "ohw:cookie-banner-dismissed";

export function useCookieBannerDismissed(): [
  isDismissed: boolean,
  dismiss: () => void,
] {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setIsDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Privacy mode / quota errors: fall back to "not dismissed".
    }
  }, []);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Quota / privacy mode — the in-memory state still hides it this session.
    }
  }, []);

  return [isDismissed, dismiss];
}
