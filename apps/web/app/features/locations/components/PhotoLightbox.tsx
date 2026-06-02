import { useEffect, useId, useRef, useState } from "react";
import {
  FocusScope,
  useDialog,
  useOverlay,
  usePreventScroll,
} from "react-aria";
import { useTranslation } from "~/features/i18n";
import styles from "./PhotoLightbox.module.css";

export interface LightboxPhoto {
  readonly url: string;
  readonly caption?: string | null;
}

interface PhotoLightboxProps {
  photos: ReadonlyArray<LightboxPhoto>;
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full-screen, react-aria-driven lightbox for browsing candidate photos.
 *
 * Why react-aria over a bespoke implementation: ESC dismiss, click-outside,
 * focus trapping, and `aria-modal` semantics all come for free, while the
 * keyboard arrows are scoped here because they are domain-specific (gallery
 * navigation, not generic dialog behaviour).
 */
export function PhotoLightbox({
  photos,
  initialIndex,
  isOpen,
  onClose,
}: PhotoLightboxProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (isOpen) setIndex(initialIndex);
  }, [isOpen, initialIndex]);

  usePreventScroll({ isDisabled: !isOpen });

  const { overlayProps } = useOverlay(
    {
      isOpen,
      onClose,
      isDismissable: true,
      isKeyboardDismissDisabled: false,
    },
    contentRef,
  );
  const { dialogProps } = useDialog({ "aria-labelledby": titleId }, contentRef);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture-phase ESC: close the lightbox before any underlying
        // dialog (e.g. LocationDetailModal) can react to the same key.
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (photos.length <= 1) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % photos.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + photos.length) % photos.length);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, photos.length, onClose]);

  if (!isOpen || photos.length === 0) return null;

  const current = photos[index] ?? photos[0]!;
  const hasMultiple = photos.length > 1;
  const handlePrev = () =>
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  const handleNext = () => setIndex((i) => (i + 1) % photos.length);

  return (
    <div
      className={styles.scrim}
      data-testid="photo-lightbox"
      onMouseDown={(event) => {
        // Only close when the click started on the scrim itself, not when the
        // user mouse-down'd on the image and dragged onto the scrim.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <FocusScope contain restoreFocus autoFocus>
        <div
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          className={styles.content}
          {...overlayProps}
          {...dialogProps}
        >
          <h2 id={titleId} className={styles.srOnly}>
            {current.caption ?? t("locations.lightbox.fallbackCaption")}
          </h2>

          <button
            type="button"
            className={styles.closeBtn}
            aria-label={t("locations.lightbox.closeAria")}
            data-testid="photo-lightbox-close"
            onClick={onClose}
          >
            ×
          </button>

          {hasMultiple ? (
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navPrev}`}
              aria-label={t("locations.lightbox.prevAria")}
              data-testid="photo-lightbox-prev"
              onClick={handlePrev}
            >
              ‹
            </button>
          ) : null}

          <img
            src={current.url}
            alt={current.caption ?? t("locations.lightbox.fallbackCaption")}
            className={styles.image}
            draggable={false}
          />

          {hasMultiple ? (
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navNext}`}
              aria-label={t("locations.lightbox.nextAria")}
              data-testid="photo-lightbox-next"
              onClick={handleNext}
            >
              ›
            </button>
          ) : null}

          {hasMultiple ? (
            <div className={styles.counter} aria-live="polite">
              {index + 1} / {photos.length}
            </div>
          ) : null}

          {current.caption ? (
            <div className={styles.caption}>{current.caption}</div>
          ) : null}
        </div>
      </FocusScope>
    </div>
  );
}
