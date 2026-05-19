import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { LocationRequirement } from "@oh-writers/domain";
import {
  searchPlacesInArea,
  type PlaceSuggestion,
} from "../server/places-autocomplete.server";
import type { DrawnCircle } from "../lib/area-search";
import styles from "./AreaSearchPanel.module.css";

interface AreaSearchPanelProps {
  circle: DrawnCircle;
  requirements: ReadonlyArray<LocationRequirement>;
  defaultRequirementId?: string | null;
  onClose: () => void;
  onAddCandidate: (requirementId: string, suggestion: PlaceSuggestion) => void;
}

const formatRadius = (radius_m: number): string =>
  radius_m >= 1000
    ? `${(radius_m / 1000).toFixed(1)} km`
    : `${Math.round(radius_m)} m`;

export function AreaSearchPanel({
  circle,
  requirements,
  defaultRequirementId,
  onClose,
  onAddCandidate,
}: AreaSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetRequirementId, setTargetRequirementId] = useState<string | null>(
    defaultRequirementId ?? requirements[0]?.id ?? null,
  );

  const searchMutation = useMutation({
    mutationFn: async (): Promise<PlaceSuggestion[]> => {
      const response = await searchPlacesInArea({
        data: {
          lat: circle.lat,
          lng: circle.lng,
          radius_m: circle.radius_m,
          query: query.trim() || undefined,
        },
      });
      return unwrapResult(response);
    },
    onSuccess: (data) => {
      setResults(data);
      setError(null);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Errore di ricerca");
    },
  });

  const handleSearch = () => {
    setResults(null);
    searchMutation.mutate();
  };

  const canAdd = targetRequirementId !== null;

  return (
    <div className={styles.panel} data-testid="area-search-panel">
      <header className={styles.head}>
        <div>
          <div className={styles.title}>Cerca in questa area</div>
          <div className={styles.coords}>
            {circle.lat.toFixed(4)}, {circle.lng.toFixed(4)} · raggio{" "}
            {formatRadius(circle.radius_m)}
          </div>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Chiudi ricerca area"
          data-testid="area-search-close-btn"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.queryRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="Es. pizzeria, ristorante, bar… (vuoto = qualsiasi)"
          value={query}
          data-testid="area-search-query-input"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
        />
        <button
          type="button"
          className={styles.btnPrimary}
          data-testid="area-search-go-btn"
          onClick={handleSearch}
          disabled={searchMutation.isPending}
        >
          {searchMutation.isPending ? "Cerco…" : "Cerca"}
        </button>
      </div>

      {requirements.length > 1 ? (
        <div className={styles.requirementRow}>
          <label className={styles.smallLabel} htmlFor="area-search-req">
            Aggiungi a:
          </label>
          <select
            id="area-search-req"
            className={styles.select}
            value={targetRequirementId ?? ""}
            data-testid="area-search-req-select"
            onChange={(e) => setTargetRequirementId(e.target.value || null)}
          >
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {results !== null ? (
        <div className={styles.results} data-testid="area-search-results">
          {results.length === 0 ? (
            <div className={styles.empty}>Nessun risultato in questa area.</div>
          ) : (
            results.map((suggestion) => (
              <div
                key={suggestion.placeId}
                className={styles.resultRow}
                data-testid={`area-search-result-${suggestion.placeId}`}
              >
                {suggestion.photos[0]?.thumbnailUrl ? (
                  <img
                    src={suggestion.photos[0].thumbnailUrl}
                    alt=""
                    className={styles.thumb}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.thumbPlaceholder} aria-hidden>
                    📍
                  </div>
                )}
                <div className={styles.resultBody}>
                  <div className={styles.resultName}>{suggestion.name}</div>
                  <div className={styles.resultAddress}>
                    {suggestion.address}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.btnAdd}
                  disabled={!canAdd}
                  data-testid={`area-search-add-${suggestion.placeId}`}
                  onClick={() => {
                    if (targetRequirementId) {
                      onAddCandidate(targetRequirementId, suggestion);
                    }
                  }}
                >
                  + Aggiungi
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
