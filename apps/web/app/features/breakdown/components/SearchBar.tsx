import { useEffect, useRef } from "react";
import { useTranslation } from "~/features/i18n";
import styles from "./SearchBar.module.css";

interface Props {
  query: string;
  currentIndex: number;
  total: number;
  onChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function SearchBar({
  query,
  currentIndex,
  total,
  onChange,
  onNext,
  onPrev,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      e.shiftKey ? onPrev() : onNext();
    }
  };

  const label =
    total === 0
      ? query.length > 0
        ? t("breakdown.search.noResult")
        : ""
      : `${currentIndex + 1} / ${total}`;

  return (
    <div className={styles.bar} role="search" data-testid="script-search-bar">
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={t("breakdown.search.placeholder")}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={t("breakdown.search.aria")}
      />
      {label && (
        <span className={styles.count} aria-live="polite">
          {label}
        </span>
      )}
      <div className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={styles.nav}
        onClick={onPrev}
        disabled={total === 0}
        aria-label={t("breakdown.search.prevAria")}
        title={t("breakdown.search.prevTitle")}
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.nav}
        onClick={onNext}
        disabled={total === 0}
        aria-label={t("breakdown.search.nextAria")}
        title={t("breakdown.search.nextTitle")}
      >
        ↓
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label={t("breakdown.search.closeAria")}
        title={t("breakdown.search.closeTitle")}
      >
        ✕
      </button>
    </div>
  );
}
