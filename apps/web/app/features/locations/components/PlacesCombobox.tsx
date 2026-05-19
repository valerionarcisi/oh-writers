import { useEffect, useId, useRef, useState } from "react";
import { usePlacesAutocomplete } from "../hooks/usePlacesAutocomplete";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import styles from "./PlacesCombobox.module.css";

interface PlacesComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  locationBias?: string;
  placeholder?: string;
  inputClassName?: string;
  inputTestId?: string;
  autoFocus?: boolean;
}

const PLACE_TYPE_LABEL: Record<string, string> = {
  restaurant: "ristorante",
  bar: "bar",
  cafe: "caffè",
  park: "parco",
  bakery: "forno",
  lodging: "alloggio",
  hotel: "hotel",
  museum: "museo",
  store: "negozio",
  church: "chiesa",
  hospital: "ospedale",
  school: "scuola",
};

const isMeaningfulType = (type: string): boolean =>
  type.length > 0 &&
  type !== "point_of_interest" &&
  type !== "establishment" &&
  !type.startsWith("political") &&
  type !== "premise";

const pickTypeLabel = (types: string[]): string | null => {
  const meaningful = types.find(isMeaningfulType);
  if (!meaningful) return null;
  return PLACE_TYPE_LABEL[meaningful] ?? meaningful.replace(/_/g, " ");
};

export function PlacesCombobox({
  value,
  onChange,
  onSelect,
  locationBias,
  placeholder,
  inputClassName,
  inputTestId,
  autoFocus,
}: PlacesComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { suggestions, isLoading, hasQuery } = usePlacesAutocomplete(
    value,
    locationBias,
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  const showDropdown = isOpen && hasQuery;
  const activeOptionId =
    showDropdown && activeIndex >= 0 && activeIndex < suggestions.length
      ? `${optionIdPrefix}-${activeIndex}`
      : undefined;

  const handlePick = (suggestion: PlaceSuggestion) => {
    onSelect(suggestion);
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (suggestions.length === 0) return;
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (suggestions.length === 0) return;
      setActiveIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === "Enter") {
      if (showDropdown && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        handlePick(suggestions[activeIndex]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        className={inputClassName ?? styles.input}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        data-testid={inputTestId}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className={styles.listbox}
          data-testid="places-combobox-listbox"
        >
          {isLoading && suggestions.length === 0 && (
            <li className={styles.loading} aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              Cerco location reali…
            </li>
          )}
          {!isLoading && suggestions.length === 0 && hasQuery && (
            <li className={styles.empty} aria-live="polite">
              Nessun risultato
            </li>
          )}
          {suggestions.map((suggestion, index) => {
            const typeLabel = pickTypeLabel(suggestion.types);
            const thumb = suggestion.photos[0]?.thumbnailUrl ?? null;
            const isActive = index === activeIndex;
            return (
              <li
                key={suggestion.placeId || `${index}-${suggestion.name}`}
                id={`${optionIdPrefix}-${index}`}
                role="option"
                aria-selected={isActive}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                data-testid={`places-combobox-option-${index}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handlePick(suggestion);
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    width={32}
                    height={32}
                    className={styles.thumb}
                  />
                ) : (
                  <span className={styles.thumbPlaceholder} aria-hidden="true">
                    📍
                  </span>
                )}
                <div className={styles.optionBody}>
                  <span className={styles.optionName}>{suggestion.name}</span>
                  <span className={styles.optionAddress}>
                    {suggestion.address}
                  </span>
                  {typeLabel && (
                    <span className={styles.typeChip}>{typeLabel}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
