// apps/web/app/features/app-shell/components/CesareLiveDiff.tsx
//
// Spec 47b FIX 4 — the floating "Mostra modifiche" inline coloured diff.
//
// When Cesare is the floating bottom-right drawer the edited document is visible
// behind it, so "Mostra modifiche" reveals a WORD-LEVEL coloured diff (green
// additions / red removals) of what changed — NOT a generic highlight ring.
//
// The chat surface broadcasts the precomputed word-diff segments on the
// `ohw:cesare:live-diff` event; this overlay (mounted inside the shell's main
// lane) renders them. `body[data-cesare-diff="on"]` is still flipped by the
// chat so existing wiring/tests keep working, but the visible diff is this
// overlay, not the `<main>` ring.
import { useEffect, useState } from "react";
import styles from "./CesareLiveDiff.module.css";

interface DiffSegment {
  readonly op: "eq" | "add" | "del";
  readonly text: string;
}

interface LiveDiffPayload {
  readonly label: string;
  readonly segments: ReadonlyArray<DiffSegment>;
}

interface LiveDiffEventDetail {
  readonly showing: boolean;
  readonly diff: LiveDiffPayload | null;
}

export function CesareLiveDiff() {
  const [payload, setPayload] = useState<LiveDiffPayload | null>(null);

  useEffect(() => {
    const onLiveDiff = (event: Event) => {
      const detail = (event as CustomEvent<LiveDiffEventDetail>).detail;
      if (!detail || !detail.showing || !detail.diff) {
        setPayload(null);
        return;
      }
      setPayload(detail.diff);
    };
    window.addEventListener("ohw:cesare:live-diff", onLiveDiff);
    return () => window.removeEventListener("ohw:cesare:live-diff", onLiveDiff);
  }, []);

  if (!payload) return null;

  return (
    <div
      className={styles.overlay}
      data-testid="cesare-live-diff-overlay"
      role="region"
      aria-label="Modifiche di Cesare"
    >
      <header className={styles.header}>
        <span className={styles.glyph} aria-hidden="true">
          ✦
        </span>
        <span className={styles.title}>
          Modifiche{payload.label ? ` · ${payload.label}` : ""}
        </span>
      </header>
      <p className={styles.body}>
        {payload.segments.map((seg, i) => {
          if (seg.op === "add") {
            return (
              <span key={i} className={styles.added} data-diff-op="add">
                {seg.text}
              </span>
            );
          }
          if (seg.op === "del") {
            return (
              <del key={i} className={styles.removed} data-diff-op="del">
                {seg.text}
              </del>
            );
          }
          return (
            <span key={i} className={styles.equal} data-diff-op="eq">
              {seg.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
