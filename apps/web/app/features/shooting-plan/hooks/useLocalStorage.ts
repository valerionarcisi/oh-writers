import { useEffect, useState, useCallback } from "react";

/**
 * SSR-safe localStorage state hook.
 * Returns [value, setValue, isHydrated].
 * Before hydration, returns the defaultValue and the setter is a no-op for storage
 * (state still updates locally so the consumer remains controlled).
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValueState(JSON.parse(raw) as T);
      }
    } catch {
      // ignore corrupted value
    }
    setIsHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // quota / privacy mode — silent fail
      }
    },
    [key],
  );

  return [value, setValue, isHydrated];
}
