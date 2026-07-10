import { useCallback, useEffect, useState } from "react";

/**
 * Spec 84 §5 — dismissal for the AI-off banner, persisted per user.
 *
 * localStorage keyed by user id is acceptable for this wave (single-device,
 * client-only). The upgrade path is a `users.aiOffBannerDismissed` column (or
 * a generic per-user UI-prefs table) resolved server-side alongside
 * `resolveAiEnabled`, so the dismissal follows the user across devices and
 * survives a cleared browser — tracked for Wave 2+, not built now because
 * nothing else in the product persists UI dismissals server-side yet.
 */
const storageKey = (userId: string): string =>
  `ohw:ai-off-banner-dismissed:${userId}`;

export function useAiOffBannerDismissed(
  userId: string,
): [isDismissed: boolean, dismiss: () => void] {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setIsDismissed(window.localStorage.getItem(storageKey(userId)) === "1");
    } catch {
      // Privacy mode / quota errors: fall back to "not dismissed".
    }
  }, [userId]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(userId), "1");
    } catch {
      // Quota / privacy mode — the in-memory state still hides it this session.
    }
  }, [userId]);

  return [isDismissed, dismiss];
}
