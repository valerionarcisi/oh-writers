import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  placesAutocompleteQueryOptions,
  type PlaceSuggestion,
} from "../server/places-autocomplete.server";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

interface UsePlacesAutocompleteResult {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  hasQuery: boolean;
}

export function usePlacesAutocomplete(
  query: string,
  locationBias?: string,
): UsePlacesAutocompleteResult {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH;

  const queryResult = useQuery({
    ...placesAutocompleteQueryOptions(trimmed, locationBias),
    enabled: hasQuery,
  });

  const suggestions: PlaceSuggestion[] =
    hasQuery && queryResult.data?.isOk ? queryResult.data.value : [];

  return {
    suggestions,
    isLoading: hasQuery && queryResult.isFetching,
    hasQuery,
  };
}
