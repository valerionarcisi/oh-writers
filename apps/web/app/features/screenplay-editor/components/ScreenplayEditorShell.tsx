import { useMemo, useState, type ReactNode } from "react";
import {
  Viewbar,
  ViewbarSep,
  ToggleChip,
  Icon,
  Popover,
} from "@oh-writers/ui";
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
  /** Project id — still passed so the editor route can build links if needed */
  projectId: string;
  /** The Monaco/ProseMirror editor — rendered untouched in the center column */
  children: ReactNode;
  /** Optional override for the TOC content; falls back to a single-scene stub */
  acts?: ActEntry[];
  /** Optional eyebrow override, e.g. "SC. 3 · ATTO I · PAG. 4 / 28" */
  eyebrow?: string;
  /** Optional version label shown in the viewbar version trigger */
  versionLabel?: string;
  /** Cesare note count for the dock pill / collapsed margin */
  cesareNoteCount?: number;
  /** Render-prop for the Cesare margin column. Provided by the editor when it
   *  has live suggestions; falls back to a quiet empty state when omitted. */
  cesareMargin?: ReactNode;
  /** Whether the Cesare overlay is currently on. Controls the toggle chip. */
  isCesareOn?: boolean;
  onToggleCesare?: (next: boolean) => void;
  /** Click handler for the version trigger. When omitted the trigger is
   *  rendered as a quiet, non-interactive label. */
  onOpenVersions?: () => void;
};

export function ScreenplayEditorShell({
  title,
  children,
  acts,
  eyebrow,
  versionLabel,
  cesareNoteCount = 0,
  cesareMargin,
  isCesareOn = true,
  onToggleCesare,
  onOpenVersions,
}: ScreenplayEditorShellProps) {
  const [cesareCollapsed, setCesareCollapsed] = useState(false);
  const [localCesareOn, setLocalCesareOn] = useState(isCesareOn);
  const cesareOn = onToggleCesare ? isCesareOn : localCesareOn;
  const handleToggleCesare = (next: boolean) => {
    if (onToggleCesare) {
      onToggleCesare(next);
    } else {
      setLocalCesareOn(next);
    }
  };
  const [isIndiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const hasRealToc = acts !== undefined && acts.length > 0;
  const eyebrowText = eyebrow ?? `${title.toUpperCase()} · BOZZA CORRENTE`;

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

  const layoutClass = [
    styles.layout,
    cesareCollapsed ? styles.layoutCesareCollapsed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.shell}>
      <div className={styles.viewbarWrap}>
        <Viewbar>
          <div className={styles.viewbarCenter}>
            <ToggleChip
              label="Cesare"
              isOn={cesareOn}
              onToggle={() => handleToggleCesare(!cesareOn)}
              categoryColor="#5a6b3c"
              hotkey="⌥C"
              aria-label="Overlay Cesare"
            />
          </div>

          <ViewbarSep />

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

            <button
              type="button"
              className={styles.versionPick}
              aria-label={
                onOpenVersions
                  ? "Apri pannello versioni"
                  : "Versione corrente"
              }
              title={
                onOpenVersions ? "Apri pannello versioni" : "Versione corrente"
              }
              onClick={onOpenVersions}
              disabled={!onOpenVersions}
              data-testid="screenplay-versions-trigger"
            >
              {versionLabel ?? "Bozza"}
              {onOpenVersions && (
                <span aria-hidden="true" className={styles.versionCaret}>
                  ▾
                </span>
              )}
            </button>
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

      <div className={layoutClass}>
        <div className={styles.editorial}>
          <div className={styles.editorSlot}>{children}</div>
        </div>

        <aside
          className={[
            styles.margin,
            cesareCollapsed ? styles.marginCollapsed : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Note di Cesare"
        >
          {cesareCollapsed ? (
            <button
              type="button"
              className={styles.cesareExpand}
              onClick={() => setCesareCollapsed(false)}
              aria-label="Espandi note di Cesare"
              title="Espandi note di Cesare"
            >
              <Icon name="comment" size={14} />
              <span className={styles.cesareCount}>{cesareNoteCount}</span>
            </button>
          ) : (
            <>
              <header className={styles.marginHeader}>
                <span className={styles.marginLabel}>
                  Note di Cesare · {cesareNoteCount}
                </span>
                <button
                  type="button"
                  className={styles.cesareCollapse}
                  onClick={() => setCesareCollapsed(true)}
                  aria-label="Collassa note di Cesare"
                  title="Collassa"
                >
                  <Icon name="close" size={14} />
                </button>
              </header>

              {cesareOn && cesareMargin ? (
                cesareMargin
              ) : (
                <p className={styles.marginEmpty}>
                  {cesareOn
                    ? "Nessuna nota aperta su questa scena."
                    : "Overlay Cesare disattivato."}
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
