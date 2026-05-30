// apps/web/app/features/app-shell/components/CesareLiveDiff.tsx
//
// Spec 47d — the inline "Mostra modifiche" word highlight, painted INSIDE the
// real document prose (no floating overlay panel).
//
// When Cesare is the floating bottom-right drawer the edited document is visible
// behind it, so "Mostra modifiche" reveals a WORD-LEVEL coloured diff (green
// additions / struck-through removals) of what changed, rendered as an absolute
// layer that covers ONLY the document body it belongs to — the prose region,
// not the top-left of the page. The diff text is plain prose (the server strips
// block markup before diffing) so the user never sees raw HTML (`<p>`, `</p>`).
//
// One instance is mounted per document body (`documentType` prop). The shell's
// chat arms the live-diff store with one diff per touched document keyed by
// type; each instance picks its own from the store on mount AND on change, so
// "tutti = tutti": opening any touched doc while diff mode is armed shows that
// doc's green highlight even though it mounted after the toggle fired.
import { useSyncExternalStore } from "react";
import type { DocumentType } from "@oh-writers/domain";
import {
  getLiveDiffState,
  subscribeLiveDiff,
  type LiveDiffEntry,
} from "../cesare-live-diff-store";
import styles from "./CesareLiveDiff.module.css";

interface CesareLiveDiffProps {
  /** The document this highlight layer belongs to. Only the matching diff from
   *  the armed store is painted, so the highlight is keyed per document. */
  readonly documentType: DocumentType;
}

function usePayloadFor(documentType: DocumentType): LiveDiffEntry | null {
  const state = useSyncExternalStore(
    subscribeLiveDiff,
    getLiveDiffState,
    getLiveDiffState,
  );
  if (!state.showing) return null;
  return state.diffs[documentType] ?? null;
}

export function CesareLiveDiff({ documentType }: CesareLiveDiffProps) {
  const payload = usePayloadFor(documentType);
  if (!payload) return null;

  return (
    <div
      className={styles.layer}
      data-testid="cesare-live-diff-inline"
      data-document-type={documentType}
      role="region"
      aria-label="Modifiche di Cesare"
    >
      <p className={styles.body}>
        {payload.segments.map((seg, i) => {
          if (seg.op === "add") {
            return (
              <mark key={i} className={styles.added} data-diff-op="add">
                {seg.text}
              </mark>
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
