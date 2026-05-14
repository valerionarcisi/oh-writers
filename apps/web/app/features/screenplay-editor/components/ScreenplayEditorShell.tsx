import { useMemo, useState, type ReactNode } from "react";
import {
  Viewbar,
  ViewbarSep,
  Icon,
  Popover,
} from "@oh-writers/ui";
import { DraftMetaBadge } from "~/features/projects";
import styles from "./ScreenplayEditorShell.module.css";

// ─── Editor shell ──────────────────────────────────────────────────────────
// Pure layout around the screenplay editor. Mirrors the Breakdown V2 ambient
// shape: sticky Viewbar (centered chips + right Indice/version), a thin
// sceneBar with eyebrow + stats, and a 1fr / 280px grid below. The editor
// itself slots into the center column as a flat white surface — no black
// canvas, no big "chapter" header. Page-level actions live in the editor's
// FloatingDock; this shell stays pure layout.

type SceneEntry = {
  number: string;
  title: string;
  isCurrent?: boolean;
};

type ActEntry = {
  name: string;
  scenes: SceneEntry[];
};

const FALLBACK_ACTS: ActEntry[] = [
  { name: "Atto I", scenes: [{ number: "1.", title: "—", isCurrent: true }] },
];

export type ScreenplayEditorShellProps = {
  title: string;
  /** Project id — drives the DraftMetaBadge in the viewbar right. */
  projectId: string;
  /** The Monaco/ProseMirror editor — rendered untouched in the center column */
  children: ReactNode;
  /** Optional override for the TOC content; falls back to a single-scene stub */
  acts?: ActEntry[];
  /** Cesare note count — shown on the collapsed margin badge. The toggle and
   *  count for Cesare also live in the floating dock owned by the editor. */
  cesareNoteCount?: number;
  /** Render-prop for the Cesare margin column. Provided by the editor when it
   *  has live suggestions; falls back to a quiet empty state when omitted. */
  cesareMargin?: ReactNode;
  /** Whether the Cesare overlay is currently on. Drives both the dock pill
   *  (in the editor) and the margin column visibility here. */
  isCesareOn?: boolean;
};

export function ScreenplayEditorShell({
  title: _title,
  projectId,
  children,
  acts,
  cesareNoteCount = 0,
  cesareMargin,
  isCesareOn = true,
}: ScreenplayEditorShellProps) {
  const [isIndiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const hasRealToc = acts !== undefined && acts.length > 0;

  const { currentSceneIdx, totalScenes } = useMemo(() => {
    let total = 0;
    let current = 1;
    tocActs.forEach((act) => {
      act.scenes.forEach((scene) => {
        total += 1;
        if (scene.isCurrent) current = total;
      });
    });
    return { currentSceneIdx: current, totalScenes: total };
  }, [tocActs]);

  const filteredActs = useMemo(() => {
    const q = indiceQuery.trim().toLowerCase();
    if (!q) return tocActs;
    return tocActs
      .map((act) => ({
        ...act,
        scenes: act.scenes.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.number.toLowerCase().includes(q),
        ),
      }))
      .filter((act) => act.scenes.length > 0);
  }, [tocActs, indiceQuery]);

  const layoutClass = styles.layout;

  return (
    <div className={styles.shell}>
      <div className={styles.viewbarWrap}>
        <Viewbar>
          <div className={styles.viewbarCenter} />

          <div className={styles.viewbarRight}>
            {hasRealToc && (
            <div className={styles.indiceWrap}>
              <button
                type="button"
                className={styles.indiceButton}
                onClick={() => setIndiceOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={isIndiceOpen}
                aria-label="Apri indice scene"
                data-testid="screenplay-indice-trigger"
              >
                <Icon name="book" size={14} aria-hidden />
                <span>Indice</span>
                <span className={styles.indiceBadge} data-num>
                  {currentSceneIdx}/{totalScenes}
                </span>
                <span className={styles.indiceCaret} aria-hidden>
                  ▾
                </span>
              </button>

              <Popover
                isOpen={isIndiceOpen}
                onClose={() => setIndiceOpen(false)}
                placement="bottom-end"
                width={320}
                className={styles.indicePopover}
              >
                <div className={styles.popSearch}>
                  <Icon name="search" size={14} aria-hidden />
                  <input
                    type="text"
                    value={indiceQuery}
                    onChange={(e) => setIndiceQuery(e.target.value)}
                    placeholder="Cerca scena o luogo…"
                    aria-label="Cerca scena o luogo"
                    className={styles.popSearchInput}
                    autoFocus
                  />
                  <kbd className={styles.popKbd}>⌘K</kbd>
                </div>

                <div className={styles.popList}>
                  {filteredActs.length === 0 ? (
                    <p className={styles.popEmpty}>Nessuna scena trovata</p>
                  ) : (
                    filteredActs.map((act) => (
                      <div key={act.name}>
                        <p className={styles.popAct}>{act.name}</p>
                        {act.scenes.map((scene) => (
                          <button
                            type="button"
                            key={`${act.name}-${scene.number}`}
                            className={[
                              styles.popItem,
                              scene.isCurrent ? styles.popItemCurrent : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-current={scene.isCurrent ? "true" : undefined}
                          >
                            <span className={styles.popItemNum}>
                              SC.{scene.number.replace(".", "")}
                            </span>
                            <span className={styles.popItemLabel}>
                              {scene.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </Popover>
            </div>
            )}

            <DraftMetaBadge projectId={projectId} />
          </div>
        </Viewbar>
      </div>

      {/* Scene eyebrow — minimal; main project/section info already lives in
          the TopBar. Only render when there's status to communicate. */}
      {cesareNoteCount > 0 && (
        <section className={styles.sceneBar} aria-label="Stato scena">
          <span />
          <p className={styles.metaPending} data-num>
            {cesareNoteCount} note di Cesare
          </p>
        </section>
      )}

      <div className={isCesareOn ? layoutClass : styles.layoutNoMargin}>
        <div className={styles.editorial}>
          <div className={styles.editorSlot}>{children}</div>
        </div>

        {isCesareOn && (
          <aside className={styles.margin} aria-label="Note di Cesare">
            <header className={styles.marginHeader}>
              <span className={styles.marginLabel}>
                Note di Cesare · {cesareNoteCount}
              </span>
            </header>

            {cesareMargin ?? (
              <p className={styles.marginEmpty}>
                Nessuna nota aperta su questa scena.
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
