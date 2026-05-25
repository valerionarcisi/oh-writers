/**
 * Debounced Nominatim autocomplete hook for the map search overlay.
 *
 * Unlike `usePlacesAutocomplete` (which hits Google Places), this hook calls
 * Nominatim directly from the browser. It is intentionally client-only — no
 * server function required because Nominatim is a public API.
 */

import { useEffect, useRef, useState } from "react";
import { searchNominatim, type NominatimSuggestion } from "../lib/boundary";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

interface UseNominatimAutocompleteResult {
  suggestions: NominatimSuggestion[];
  isLoading: boolean;
  hasQuery: boolean;
}

export function useNominatimAutocomplete(
  query: string,
): UseNominatimAutocompleteResult {
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!hasQuery) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const results = await searchNominatim(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
        }
      } catch {
        // AbortError or network error — silently ignore
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmed, hasQuery]);

  return { suggestions, isLoading, hasQuery };
}
