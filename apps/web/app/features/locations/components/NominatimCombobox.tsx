/**
 * Autocomplete combobox backed by Nominatim (OpenStreetMap).
 * Used in the map search overlay — results carry OSM IDs needed for
 * boundary polygon lookups.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useNominatimAutocomplete } from "../hooks/useNominatimAutocomplete";
import type { NominatimSuggestion } from "../lib/boundary";
import styles from "./NominatimCombobox.module.css";

interface NominatimComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: NominatimSuggestion) => void;
  placeholder?: string;
  inputTestId?: string;
}

export function NominatimCombobox({
  value,
  onChange,
  onSelect,
  placeholder,
  inputTestId,
}: NominatimComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { suggestions, isLoading, hasQuery } = useNominatimAutocomplete(value);

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

  const handlePick = (suggestion: NominatimSuggestion) => {
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
        className={styles.input}
        value={value}
        placeholder={placeholder}
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
          data-testid="nominatim-combobox-listbox"
        >
          {isLoading && suggestions.length === 0 && (
            <li className={styles.loading} aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              Cerco luoghi…
            </li>
          )}
          {!isLoading && suggestions.length === 0 && hasQuery && (
            <li className={styles.empty} aria-live="polite">
              Nessun risultato
            </li>
          )}
          {suggestions.map((suggestion, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                key={suggestion.placeId}
                id={`${optionIdPrefix}-${index}`}
                role="option"
                aria-selected={isActive}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                data-testid={`nominatim-combobox-option-${index}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handlePick(suggestion);
                }}
              >
                <span
                  className={styles.icon}
                  aria-hidden="true"
                  title={
                    suggestion.isAdministrative
                      ? "Area amministrativa"
                      : "Luogo"
                  }
                >
                  {suggestion.isAdministrative ? "🏛" : "📍"}
                </span>
                <div className={styles.optionBody}>
                  <span className={styles.optionName}>{suggestion.name}</span>
                  <span className={styles.optionAddress}>
                    {suggestion.displayName}
                  </span>
                </div>
                {suggestion.isAdministrative && (
                  <span className={styles.adminChip}>area</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
