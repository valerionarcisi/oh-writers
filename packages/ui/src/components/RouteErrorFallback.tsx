import { useState, type ReactNode } from "react";
import styles from "./RouteErrorFallback.module.css";

export interface RouteErrorFallbackLabels {
  readonly title: string;
  readonly body: string;
  readonly retry: string;
  readonly home: string;
  readonly showDetails: string;
  readonly hideDetails: string;
}

export interface RouteErrorFallbackProps {
  /** The thrown error. Only `message`/`stack` are read for the details panel. */
  readonly error: { readonly message?: string; readonly stack?: string };
  /** Re-run the failed route (e.g. `router.invalidate()`). */
  readonly onRetry: () => void;
  /** Rendered as the "back home" affordance — the app supplies the link node so
   *  packages/ui stays framework-agnostic (no router import here). */
  readonly homeLink: ReactNode;
  readonly labels: RouteErrorFallbackLabels;
  readonly "data-testid"?: string;
}

/**
 * Branded fallback for a route render throw. Presentational only — the app binds
 * `onRetry`/`homeLink`/`labels`. Replaces the framework's bare unstyled error
 * page: the document chrome stays, the user gets a way back, and the stack is
 * available (collapsed) to copy when reporting. See Spec 60.
 */
export function RouteErrorFallback({
  error,
  onRetry,
  homeLink,
  labels,
  ...rest
}: RouteErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);
  const details = error.stack ?? error.message ?? "";

  return (
    <div
      className={styles.wrap}
      role="alert"
      data-testid={rest["data-testid"] ?? "route-error-fallback"}
    >
      <div className={styles.card}>
        <span className={styles.glyph} aria-hidden>
          ⚠
        </span>
        <h1 className={styles.title} data-testid="route-error-title">
          {labels.title}
        </h1>
        <p className={styles.body}>{labels.body}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retry}
            onClick={onRetry}
            data-testid="route-error-retry"
          >
            {labels.retry}
          </button>
          <span className={styles.home}>{homeLink}</span>
        </div>

        {details && (
          <div className={styles.detailsBlock}>
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={showDetails}
              onClick={() => setShowDetails((v) => !v)}
              data-testid="route-error-details-toggle"
            >
              {showDetails ? labels.hideDetails : labels.showDetails}
            </button>
            {showDetails && (
              <pre
                className={styles.detailsPre}
                data-testid="route-error-stack"
              >
                {details}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
