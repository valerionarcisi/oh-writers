// packages/ui/src/composites/CollapsibleNote/CollapsibleNote.tsx
//
// Shared collapsible note primitive (Spec 44). Powers both per-page margin
// notes (Soggetto / Sinossi / Trattamento) and Cesare Step Blocks rendered
// inline in chat. The header is always visible; the body and actions are
// hidden until the user clicks the header.
//
// When `body` is undefined the note is "one-line": the header is the entire
// visible surface and the toggle button still works (no-op disclosed area).
// This keeps the shape stable so callers can switch between collapsed and
// expanded notes without re-rendering wrappers.
import { useId, useRef, useState, type ReactNode } from "react";
import { useButton } from "react-aria";
import styles from "./CollapsibleNote.module.css";

export type CollapsibleNoteKind = "cesare" | "user";

export interface CollapsibleNoteProps {
  /** Visual treatment: 'cesare' gets a leaf left-border + leaf eyebrow tint. */
  readonly kind: CollapsibleNoteKind;
  /** Bold display title rendered on the header row. */
  readonly title: string;
  /** Eyebrow label, defaults to a kind-derived prefix (e.g. "Cesare"). */
  readonly eyebrow?: string;
  /** Hidden by default; revealed when the header is clicked. */
  readonly body?: ReactNode;
  /** Optional action row rendered after the body when the note is open. */
  readonly actions?: ReactNode;
  /** Optional control rendered on the header row, revealed on hover/focus of the
   *  note (always present in the DOM, visually hidden until hover). Used for a
   *  quick "start a session on this note" affordance. */
  readonly headerAction?: ReactNode;
  /** Start in the expanded state. Defaults to false. */
  readonly defaultOpen?: boolean;
  /** Optional extra className passed to the outer element. */
  readonly className?: string;
  /** Hook used by E2E tests. */
  readonly testId?: string;
}

const DEFAULT_EYEBROW: Record<CollapsibleNoteKind, string> = {
  cesare: "Cesare",
  user: "Tu",
};

export function CollapsibleNote({
  kind,
  title,
  eyebrow,
  body,
  actions,
  headerAction,
  defaultOpen = false,
  className,
  testId,
}: CollapsibleNoteProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const headerRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();

  const hasDisclosedContent = body !== undefined || actions !== undefined;

  const { buttonProps } = useButton(
    {
      onPress: () => {
        if (hasDisclosedContent) setIsOpen((prev) => !prev);
      },
      isDisabled: !hasDisclosedContent,
      "aria-expanded": hasDisclosedContent ? isOpen : undefined,
      "aria-controls": hasDisclosedContent ? bodyId : undefined,
      elementType: "button",
    },
    headerRef,
  );

  const classes = [
    styles.note,
    kind === "cesare" ? styles.kindCesare : styles.kindUser,
    isOpen ? styles.isOpen : "",
    hasDisclosedContent ? styles.hasBody : styles.oneLine,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const eyebrowText = eyebrow ?? DEFAULT_EYEBROW[kind];

  return (
    <article
      className={classes}
      data-kind={kind}
      data-open={isOpen ? "true" : undefined}
      data-testid={testId}
    >
      <button
        {...buttonProps}
        ref={headerRef}
        type="button"
        className={styles.header}
      >
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowKind}>{eyebrowText}</span>
          {hasDisclosedContent && (
            <span aria-hidden="true" className={styles.chev}>
              ▾
            </span>
          )}
        </span>
        <span className={styles.title}>{title}</span>
      </button>
      {headerAction !== undefined && (
        <div className={styles.headerAction}>{headerAction}</div>
      )}
      {hasDisclosedContent && isOpen && (
        <div id={bodyId} className={styles.disclosed}>
          {body !== undefined && <div className={styles.body}>{body}</div>}
          {actions !== undefined && (
            <div className={styles.actions}>{actions}</div>
          )}
        </div>
      )}
    </article>
  );
}
