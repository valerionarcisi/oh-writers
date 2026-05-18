import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Viewbar,
  ViewbarSep,
  Icon,
  Popover,
  VersionTrigger,
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
  /** Optional slot rendered centered in the Viewbar — same position the
   *  Breakdown V2 page uses for its 'Sottolinea' chips. The screenplay route
   *  fills it with the element conversion chips (Scene/Action/Character/...). */
  viewbarCenter?: ReactNode;
  /** Opens the Versions drawer. When provided, a `VersionTrigger` pill is
   *  rendered in the Viewbar right slot. */
  onOpenVersions?: () => void;
  /** Optional label shown inside the version pill (e.g. "v3 · 14 mag 2026"). */
  versionLabel?: string;
  /** Optional list of versions to surface in the version-trigger dropdown.
   *  When provided, the menu shows the version history + the "Apri Versioni"
   *  action. When empty, only the "Apri" action is shown. */
  versions?: ReadonlyArray<{ id: string; label: string; isCurrent: boolean }>;
  /** Optional Cesare panel rendered in the right margin column. When provided
   *  a ✦ toggle button appears in the Viewbar right. */
  cesarePanel?: ReactNode;
  /** Whether the Cesare panel is expanded. Controlled by parent. */
  isCesarePanelOpen?: boolean;
  /** Called when the user clicks the ✦ toggle button. */
  onToggleCesarePanel?: () => void;
};

export function ScreenplayEditorShell({
  title: _title,
  projectId,
  children,
  acts,
  viewbarCenter,
  onOpenVersions,
  versionLabel,
  versions,
  cesarePanel,
  isCesarePanelOpen = false,
  onToggleCesarePanel,
}: ScreenplayEditorShellProps) {
  const [isIndiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");
  const [isScrolled, setScrolled] = useState(false);
  const viewbarWrapRef = useRef<HTMLDivElement>(null);

  // Toggle the data-scrolled flag on the viewbar so its CSS can shrink the
  // chip strip once the user has moved past the top of the page. The actual
  // scrolling happens on either AppShell's #main-content (when it has
  // overflow:auto and is shorter than its content) or the window itself
  // (when main expands to fit). Listen on both to cover both cases.
  useEffect(() => {
    const main = document.getElementById("main-content");
    const onScroll = () => {
      const top = (main?.scrollTop ?? 0) + window.scrollY;
      setScrolled(top > 4);
    };
    onScroll();
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const hasRealToc = acts !== undefined && acts.length > 0;
  void _title; // currently unused — kept for future TOC-driven indices

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

  return (
    <div className={styles.shell}>
      <div
        ref={viewbarWrapRef}
        className={styles.viewbarWrap}
        data-scrolled={isScrolled || undefined}
      >
        <Viewbar>
        <div className={styles.viewbarGrid}>
          <div className={styles.viewbarCenter}>{viewbarCenter}</div>

          <div className={styles.viewbarRight}>
            {cesarePanel && onToggleCesarePanel && (
              <button
                type="button"
                className={[
                  styles.cesareToggle,
                  isCesarePanelOpen ? styles.cesareToggleActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={onToggleCesarePanel}
                aria-pressed={isCesarePanelOpen}
                aria-label={isCesarePanelOpen ? "Chiudi pannello Cesare" : "Apri pannello Cesare"}
                title={isCesarePanelOpen ? "Chiudi pannello Cesare" : "Apri pannello Cesare"}
                data-testid="cesare-panel-toggle"
              >
                ✦
              </button>
            )}
            {/* TODO(audit-2026-05-15): restore Indice popover once scene
                buttons get a working onClick (scrollIntoView on
                [data-scene-number="N"]). Hidden for consistency with the
                Breakdown Indice — same logic, same gap. */}
            {false && hasRealToc && (
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
            {onOpenVersions && (
              <VersionTrigger
                variant="pill"
                versionLabel={versionLabel}
                menuItems={[
                  ...(versions && versions.length > 0
                    ? versions.map((v) => ({
                        id: `version-${v.id}`,
                        label: v.isCurrent ? `● ${v.label}` : v.label,
                        onSelect: onOpenVersions,
                        tone: v.isCurrent
                          ? ("default" as const)
                          : ("muted" as const),
                      }))
                    : []),
                  {
                    id: "open-drawer",
                    label: "Apri Versioni →",
                    onSelect: onOpenVersions,
                  },
                ]}
              />
            )}
          </div>
        </div>
        </Viewbar>
      </div>


      <div
        className={
          isCesarePanelOpen && cesarePanel
            ? styles.layoutWithPanel
            : styles.layoutNoMargin
        }
      >
        <div className={styles.editorial}>
          <div className={styles.editorSlot}>{children}</div>
        </div>
        {isCesarePanelOpen && cesarePanel && (
          <aside className={styles.cesarePanelColumn}>{cesarePanel}</aside>
        )}
      </div>
    </div>
  );
}
