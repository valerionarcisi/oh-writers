import { useMemo, useState, type ReactNode } from "react";
import {
  Viewbar,
  ViewbarSep,
  ToggleChip,
  FloatingDock,
  MarginNote,
} from "@oh-writers/ui";
import styles from "./ScreenplayEditorShell.module.css";

// ─── Static demo data (UI-only shell) ───────────────────────────────────────
// The Viewbar/TOC/MarginNotes are currently visual scaffolding around the
// existing editor. Wiring them to live screenplay state happens in a follow-up
// spec — the toggles, scene index and Cesare notes are intentionally local.

type UnderlineKey =
  | "cast"
  | "locations"
  | "props"
  | "costumes"
  | "photography"
  | "sound";

type OverlayKey = "cesare" | "comments" | "sceneNumbers" | "revisions";

const UNDERLINE_CHIPS: ReadonlyArray<{
  key: UnderlineKey;
  label: string;
  color: string;
  defaultOn: boolean;
}> = [
  { key: "cast", label: "Cast", color: "#6b3e7a", defaultOn: true },
  { key: "locations", label: "Locations", color: "#9a5128", defaultOn: true },
  { key: "props", label: "Props", color: "#8a5a1f", defaultOn: true },
  { key: "costumes", label: "Costumi", color: "#8b3565", defaultOn: false },
  {
    key: "photography",
    label: "Fotografia",
    color: "#34487a",
    defaultOn: false,
  },
  { key: "sound", label: "Suono", color: "#5a6b25", defaultOn: false },
];

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
  children,
  acts,
  eyebrow,
  versionLabel,
  cesareNoteCount = 4,
}: ScreenplayEditorShellProps) {
  const [underline, setUnderline] = useState<ToggleState<UnderlineKey>>(() =>
    initialState(UNDERLINE_CHIPS),
  );
  const [overlay, setOverlay] = useState<ToggleState<OverlayKey>>(() =>
    initialState(OVERLAY_CHIPS),
  );

  const tocActs = useMemo(() => acts ?? FALLBACK_ACTS, [acts]);
  const eyebrowText = eyebrow ?? "Sc. 3 · Atto I · pag. 4 / 28";
  const versionText = versionLabel ?? "v3 · 14 mag 2026 ▾";

  const toggleUnderline = (key: UnderlineKey) =>
    setUnderline((s) => ({ ...s, [key]: !s[key] }));
  const toggleOverlay = (key: OverlayKey) =>
    setOverlay((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className={styles.shell}>
      <Viewbar>
        <span className={styles.viewbarLabel}>Sottolinea:</span>
        {UNDERLINE_CHIPS.map((chip) => (
          <ToggleChip
            key={chip.key}
            label={chip.label}
            isOn={underline[chip.key]}
            onToggle={() => toggleUnderline(chip.key)}
            categoryColor={chip.color}
            aria-label={`Sottolinea ${chip.label}`}
          />
        ))}

        <ViewbarSep />

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

        <button
          type="button"
          className={styles.versionPick}
          aria-label="Seleziona versione"
          title="Versione corrente — click per cambiare"
        >
          {versionText}
        </button>
      </Viewbar>

      <div className={styles.layout}>
        <aside
          className={styles.toc}
          aria-label="Indice delle scene"
        >
          <div className={styles.tocLabel}>Indice · Atto I</div>
          {tocActs.map((act) => (
            <div key={act.name} className={styles.tocAct}>
              <div className={styles.tocActName}>{act.name}</div>
              {act.scenes.map((scene) => (
                <button
                  type="button"
                  key={`${act.name}-${scene.number}`}
                  className={[
                    styles.tocScene,
                    scene.isCurrent ? styles.tocSceneCurrent : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={scene.isCurrent ? "true" : undefined}
                >
                  <span className={styles.tocSceneNum}>sc.{scene.number}</span>
                  <span>{scene.title}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

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

        <aside className={styles.margin} aria-label="Note di Cesare">
          <div className={styles.marginLabel}>
            Note di Cesare · {cesareNoteCount}
          </div>

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
        </aside>
      </div>

      <FloatingDock
        label="SCREENPLAY"
        primaryAction={{
          label: "Esporta PDF",
          hotkey: "⌘E",
          onClick: () => {},
        }}
        secondaryActions={[
          { label: "Versione", onClick: () => {} },
          { label: "Confronta", onClick: () => {} },
        ]}
        cesareNoteCount={cesareNoteCount}
      />
    </div>
  );
}
