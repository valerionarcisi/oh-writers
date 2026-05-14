import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Viewbar,
  ViewbarSep,
  ToggleChip,
  FloatingDock,
  MarginNote,
  Icon,
  Popover,
} from "@oh-writers/ui";
import styles from "./ScreenplayEditorShell.module.css";

// ─── Static demo data (UI-only shell) ───────────────────────────────────────
// The Viewbar/TOC/MarginNotes are currently visual scaffolding around the
// existing editor. Wiring them to live screenplay state happens in a follow-up
// spec — the toggles, scene index and Cesare notes are intentionally local.

type OverlayKey = "cesare" | "comments" | "sceneNumbers" | "revisions";

const OVERLAY_CHIPS: ReadonlyArray<{
  key: OverlayKey;
  label: string;
  hotkey?: string;
  color?: string;
  defaultOn: boolean;
}> = [
  {
    key: "cesare",
    label: "Cesare",
    hotkey: "⌥C",
    color: "#5a6b3c",
    defaultOn: true,
  },
  { key: "comments", label: "Commenti", hotkey: "⌥M", defaultOn: false },
  { key: "sceneNumbers", label: "Numeri scena", defaultOn: true },
  { key: "revisions", label: "Revisioni", defaultOn: false },
];

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
  {
    name: "Atto I",
    scenes: [
      { number: "1.", title: "Aperture" },
      { number: "2.", title: "Caffè con Marco" },
      {
        number: "3.",
        title: "Int. Pizzeria Sottoscala",
        isCurrent: true,
      },
      { number: "4.", title: "Ext. Vicolo — Notte" },
    ],
  },
  {
    name: "Atto II",
    scenes: [
      { number: "5.", title: "Int. Cucina — Mattina" },
      { number: "6.", title: "Int. Sala — Mattina" },
      { number: "7.", title: "Ext. Piazza — Pomeriggio" },
    ],
  },
  {
    name: "Atto III",
    scenes: [
      { number: "8.", title: "Int. Pizzeria — Sera" },
      { number: "9.", title: "Ext. Strada — Notte" },
    ],
  },
];

type ToggleState<K extends string> = Record<K, boolean>;

const initialState = <K extends string>(
  chips: ReadonlyArray<{ key: K; defaultOn: boolean }>,
): ToggleState<K> =>
  chips.reduce<ToggleState<K>>(
    (acc, c) => ({ ...acc, [c.key]: c.defaultOn }),
    {} as ToggleState<K>,
  );

export type ScreenplayEditorShellProps = {
  title: string;
  /** Project id — used by dock actions to navigate to versions */
  projectId: string;
  /** The Monaco/ProseMirror editor — rendered untouched in the center column */
  children: ReactNode;
  /** Optional override for the TOC content; falls back to demo data */
  acts?: ActEntry[];
  /** Optional eyebrow override, e.g. "SC. 3 · ATTO I · PAG. 4 / 28" */
  eyebrow?: string;
  /** Optional version label shown in the viewbar right side */
  versionLabel?: string;
  /** Cesare note count for the dock pill */
  cesareNoteCount?: number;
};

export function ScreenplayEditorShell({
  title,
  projectId,
  children,
  acts,
  eyebrow,
  versionLabel,
  cesareNoteCount = 4,
}: ScreenplayEditorShellProps) {
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState<ToggleState<OverlayKey>>(() =>
    initialState(OVERLAY_CHIPS),
  );
  const [cesareCollapsed, setCesareCollapsed] = useState(false);
  const [isIndiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const eyebrowText = eyebrow ?? "Sc. 3 · Atto I · pag. 4 / 28";
  const versionText = versionLabel ?? "v3 · 14 mag 2026 ▾";

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

  const toggleOverlay = (key: OverlayKey) =>
    setOverlay((s) => ({ ...s, [key]: !s[key] }));

  const goToVersions = () =>
    navigate({
      to: "/projects/$id/screenplay/versions",
      params: { id: projectId },
    });

  const layoutClass = [
    styles.layout,
    cesareCollapsed ? styles.layoutCesareCollapsed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.shell}>
      <Viewbar>
        <span className={styles.viewbarLabel}>Overlay:</span>
        {OVERLAY_CHIPS.map((chip) => (
          <ToggleChip
            key={chip.key}
            label={chip.label}
            isOn={overlay[chip.key]}
            onToggle={() => toggleOverlay(chip.key)}
            categoryColor={chip.color}
            hotkey={chip.hotkey}
            aria-label={`Overlay ${chip.label}`}
          />
        ))}

        <ViewbarSep />

        <div className={styles.indiceWrap}>
          <button
            type="button"
            className={styles.indiceButton}
            onClick={() => setIndiceOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={isIndiceOpen}
            aria-label="Apri indice scene"
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

        <button
          type="button"
          className={styles.versionPick}
          aria-label="Seleziona versione"
          title="Versione corrente — click per cambiare"
        >
          {versionText}
        </button>
      </Viewbar>

      <div className={layoutClass}>
        <div className={styles.editorial}>
          <header className={styles.chapter}>
            <div className={styles.eyebrow}>{eyebrowText}</div>
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.stats} aria-label="Statistiche scena">
              <span>Battute 4</span>
              <span>Personaggi 3</span>
              <span>Tempo lettura ~2&apos;40&quot;</span>
            </div>
          </header>

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

              {overlay.cesare && (
                <>
                  <MarginNote
                    kind="dramaturg"
                    text="La scena chiude in 38 secondi con quattro battute. La transizione 'È bravo, eh? Ma non ride nessuno.' potrebbe portare più tensione: provo a estendere con una micro-azione di Francesco?"
                    onAccept={() => {}}
                    onIgnore={() => {}}
                  />
                  <MarginNote
                    kind="producer"
                    text="'Pizza fumante' e 'luce calda' non sono ancora nel breakdown. Vuoi che li aggiunga come props / VFX?"
                    onAccept={() => {}}
                    onIgnore={() => {}}
                  />
                </>
              )}
            </>
          )}
        </aside>
      </div>

      <FloatingDock
        label="SCREENPLAY"
        primaryAction={{
          label: "Esporta PDF",
          hotkey: "⌘E",
          onClick: () => {
            // TODO: trigger real PDF export (handled elsewhere)
            console.log("export pdf");
          },
        }}
        secondaryActions={[
          { label: "Versione", onClick: goToVersions },
          { label: "Confronta", onClick: goToVersions },
        ]}
        cesareNoteCount={cesareNoteCount}
        onCesareClick={() => setCesareCollapsed(false)}
      />
    </div>
  );
}
