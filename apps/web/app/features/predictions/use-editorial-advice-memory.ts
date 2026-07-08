import {
  adviceFingerprint,
  type EditorialAdviceStatus,
} from "@oh-writers/domain";
import { useCallback, useEffect, useState } from "react";

type PersistedState = {
  contentFingerprint: string;
  statuses: Record<string, EditorialAdviceStatus>;
};

const STORAGE_PREFIX = "ohw-editorial-advice";
export const EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS = 1000;

const safeParse = (raw: string | null): PersistedState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      typeof parsed.contentFingerprint === "string" &&
      parsed.statuses &&
      typeof parsed.statuses === "object"
    ) {
      return parsed;
    }
  } catch {}
  return null;
};

export const buildAdviceContentFingerprint = (content: string): string =>
  `${content.length}:${content.slice(0, 120)}:${content.slice(-80)}`;

export function useDebouncedValue<T>(
  value: T,
  delayMs = EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS,
) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedValue(value),
      delayMs,
    );
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export const useEditorialAdviceMemory = (
  storageKey: string,
  contentFingerprint: string,
) => {
  const [statuses, setStatuses] = useState<
    Record<string, EditorialAdviceStatus>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${STORAGE_PREFIX}:${storageKey}`;
    const persisted = safeParse(window.localStorage.getItem(key));
    if (!persisted || persisted.contentFingerprint !== contentFingerprint) {
      const resetState: PersistedState = {
        contentFingerprint,
        statuses: {},
      };
      window.localStorage.setItem(key, JSON.stringify(resetState));
      setStatuses({});
      return;
    }
    setStatuses(persisted.statuses);
  }, [contentFingerprint, storageKey]);

  const setAdviceStatus = useCallback(
    (
      advice: { area: string; type: string; title: string; body: string },
      status: EditorialAdviceStatus,
    ) => {
      if (typeof window === "undefined") return;
      const key = `${STORAGE_PREFIX}:${storageKey}`;
      setStatuses((previous) => {
        const next = {
          ...previous,
          [adviceFingerprint(advice as never)]: status,
        };
        const persisted: PersistedState = {
          contentFingerprint,
          statuses: next,
        };
        window.localStorage.setItem(key, JSON.stringify(persisted));
        return next;
      });
    },
    [contentFingerprint, storageKey],
  );

  return { statuses, setAdviceStatus };
};
