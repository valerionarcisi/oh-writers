import { useEffect, useState } from "react";
import {
  Viewbar,
  ViewbarSep,
  FloatingDock,
} from "@oh-writers/ui";
import styles from "./SchedulePageV2.module.css";

type ViewTab = "day" | "all" | "byScene";
type PlanKey = "A" | "B" | "C";

type Shot = {
  id: string;
  label: string;
  duration: string;
  leftPct: number;
  widthPct: number;
  isSuggested?: boolean;
  tooltip: string;
};

type Plan = {
  key: PlanKey;
  hotkey: "1" | "2" | "3";
  name: string;
  sub: string;
  time: string;
  shots: Shot[];
};

const PLANS: readonly Plan[] = [
  {
    key: "A",
    hotkey: "1",
    name: "Piano A · Sala",
    sub: "Master + copertura",
    time: "3h 40m",
    shots: [
      { id: "a1", label: "SC.3 — Master", duration: "45'", leftPct: 1, widthPct: 22, tooltip: "SC.3 · Master · 45 min" },
      { id: "a2", label: "SC.3 — CU Giulia", duration: "30'", leftPct: 24, widthPct: 14, tooltip: "SC.3 · CU Giulia · 30 min" },
      { id: "a3", label: "SC.3 — CU Sergio", duration: "30'", leftPct: 39, widthPct: 14, tooltip: "SC.3 · CU Sergio · 30 min" },
      { id: "a4", label: "SC.3 — OTS", duration: "25'", leftPct: 54, widthPct: 12, isSuggested: true, tooltip: "SC.3 · OTS — suggerito da Cesare" },
      { id: "a5", label: "SC.7 — Master", duration: "40'", leftPct: 67, widthPct: 18, tooltip: "SC.7 · Master · 40 min" },
    ],
  },
  {
    key: "B",
    hotkey: "2",
    name: "Piano B · Cucina",
    sub: "Insert + dettagli",
    time: "1h 50m",
    shots: [
      { id: "b1", label: "SC.5 — Wide", duration: "25'", leftPct: 38, widthPct: 12, tooltip: "SC.5 · Wide · 25 min" },
      { id: "b2", label: "SC.5 — Insert", duration: "20'", leftPct: 51, widthPct: 10, tooltip: "SC.5 · Insert · 20 min" },
      { id: "b3", label: "SC.5 — Reverse", duration: "30'", leftPct: 62, widthPct: 14, isSuggested: true, tooltip: "SC.5 · Reverse — suggerito da Cesare" },
    ],
  },
  {
    key: "C",
    hotkey: "3",
    name: "Piano C · Esterno",
    sub: "Notte · luce naturale",
    time: "1h 50m",
    shots: [
      { id: "c1", label: "SC.4 — Wide", duration: "15'", leftPct: 78, widthPct: 8, tooltip: "SC.4 · Wide · 15 min" },
      { id: "c2", label: "SC.4 — Tracking", duration: "22'", leftPct: 87, widthPct: 11, tooltip: "SC.4 · Tracking · 22 min" },
    ],
  },
];

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"] as const;

interface SchedulePageV2Props {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  projectId: string;
}

export function SchedulePageV2(_props: SchedulePageV2Props) {
  const [tab, setTab] = useState<ViewTab>("day");
  const [confirmed, setConfirmed] = useState<PlanKey>("A");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "1") setConfirmed("A");
      else if (e.key === "2") setConfirmed("B");
      else if (e.key === "3") setConfirmed("C");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Viewbar>
        <button
          type="button"
          className={`${styles.filter} ${tab === "day" ? styles.isActive : ""}`}
          onClick={() => setTab("day")}
          aria-pressed={tab === "day"}
        >
          Giorno 4
        </button>
        <button
          type="button"
          className={`${styles.filter} ${tab === "all" ? styles.isActive : ""}`}
          onClick={() => setTab("all")}
          aria-pressed={tab === "all"}
        >
          Tutti i giorni
        </button>
        <button
          type="button"
          className={`${styles.filter} ${tab === "byScene" ? styles.isActive : ""}`}
          onClick={() => setTab("byScene")}
          aria-pressed={tab === "byScene"}
        >
          Per scena
        </button>
        <ViewbarSep />
        <span className={styles.viewbarRight} />
        <button type="button" className={styles.filter}>
          v2 · 14 mag 2026 ▾
        </button>
      </Viewbar>

      <main className={styles.page} data-testid="schedule-page-v2">
        <DayHeader />
        <SceneRenderBlock />
        <OrConfirmHeader />
        <TimeRuler />

        <fieldset
          style={{ border: 0, padding: 0, margin: 0 }}
          aria-label="Scelta del piano della giornata"
        >
          <legend className="visually-hidden" style={{ position: "absolute", clip: "rect(0 0 0 0)" }}>
            Scelta del piano della giornata (mutualmente esclusivi)
          </legend>

          {PLANS.map((plan, i) => (
            <PlanTrack
              key={plan.key}
              plan={plan}
              isConfirmed={confirmed === plan.key}
              onConfirm={() => setConfirmed(plan.key)}
              isFirst={i === 0}
            />
          ))}
        </fieldset>

        <DaySummary />
      </main>

      <FloatingDock
        label="PIANO"
        primaryAction={{
          label: "Pre-fill da breakdown",
          hotkey: "⌘⇧P",
          onClick: () => undefined,
        }}
        secondaryActions={[
          { label: "Esporta", hotkey: "⌘E", onClick: () => undefined },
          { label: "Stampa", hotkey: "⌘P", onClick: () => undefined },
        ]}
        cesareNoteCount={2}
      />
    </>
  );
}

function DayHeader() {
  return (
    <div className={styles.dayHead}>
      <div>
        <div className={styles.dayEyebrow}>
          Giornata 4 · martedì 2 giugno 2026 · Pizzeria Sottoscala
        </div>
        <h1 className={styles.dayTitle}>3 piani candidati</h1>
      </div>
      <div className={styles.dayMeta}>
        <span>6 scene</span>
        <span>22 inquadrature</span>
        <span>7h 20m / 8h</span>
      </div>
    </div>
  );
}

function SceneRenderBlock() {
  return (
    <div className={styles.sceneRender}>
      <div className={styles.renderInfo}>
        <div className={styles.renderInfoEyebrow}>Anteprima blocking · Sc.3</div>
        <h3 className={styles.renderInfoTitle}>Int. Pizzeria Sottoscala</h3>
        <dl className={styles.renderInfoMeta}>
          <div>
            <dt>Personaggi</dt> <dd>Giulia · Sergio · Cameriere</dd>
          </div>
          <div>
            <dt>Camera</dt> <dd>3 posizioni (master + due CU)</dd>
          </div>
          <div>
            <dt>Luce</dt> <dd>Pratica calda + key da finestra</dd>
          </div>
          <div>
            <dt>Note</dt> <dd>Tavolo centrale, finestra a SO</dd>
          </div>
        </dl>
        <div className={styles.renderInfoCta}>
          ⇧⌘V · vista 3D · ⇧⌘B · blocking editor
        </div>
      </div>
      <div className={styles.renderCanvas}>
        <FloorplanSvg />
        <div className={styles.renderLegend}>
          <span className={`${styles.legendItem} ${styles.legendCam}`}>Camera</span>
          <span className={`${styles.legendItem} ${styles.legendChar}`}>Personaggio</span>
          <span className={`${styles.legendItem} ${styles.legendObj}`}>Arredo</span>
        </div>
      </div>
    </div>
  );
}

function FloorplanSvg() {
  return (
    <svg viewBox="0 0 600 220" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Planimetria scena 3">
      <rect x="40" y="20" width="520" height="180" fill="none" stroke="#d8d6cd" strokeWidth="2" rx="4" />
      <line x1="40" y1="50" x2="40" y2="110" stroke="#8b3a1a" strokeWidth="4" strokeLinecap="round" />
      <text x="20" y="80" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#71706a" textAnchor="middle" transform="rotate(-90 20 80)">FINESTRA</text>
      <line x1="540" y1="170" x2="560" y2="200" stroke="#a09e96" strokeWidth="2" />
      <text x="555" y="215" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#a09e96" textAnchor="end">PORTA</text>
      <rect x="120" y="60" width="60" height="40" fill="#e2dfd6" stroke="#a09e96" strokeWidth="1" rx="2" />
      <rect x="260" y="90" width="80" height="50" fill="#f4dccb" stroke="#8b3a1a" strokeWidth="1.5" rx="2" />
      <text x="300" y="120" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#8b3a1a" textAnchor="middle" fontWeight="500">TAVOLO PRINCIPALE</text>
      <rect x="420" y="60" width="60" height="40" fill="#e2dfd6" stroke="#a09e96" strokeWidth="1" rx="2" />
      <rect x="420" y="140" width="60" height="40" fill="#e2dfd6" stroke="#a09e96" strokeWidth="1" rx="2" />
      <rect x="120" y="160" width="120" height="20" fill="#ebe9e3" stroke="#a09e96" strokeWidth="1" rx="2" />
      <text x="180" y="174" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#71706a" textAnchor="middle">BANCO</text>
      <g>
        <circle cx="280" cy="100" r="7" fill="#5a6b3c" />
        <text x="280" y="84" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#5a6b3c" textAnchor="middle" fontWeight="600">GIULIA</text>
      </g>
      <g>
        <circle cx="320" cy="130" r="7" fill="#5a6b3c" />
        <text x="320" y="156" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#5a6b3c" textAnchor="middle" fontWeight="600">SERGIO</text>
      </g>
      <g>
        <circle cx="180" cy="155" r="6" fill="#a09e96" />
        <text x="180" y="200" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#a09e96" textAnchor="middle">CAMERIERE</text>
      </g>
      <g>
        <rect x="380" y="50" width="14" height="10" fill="#8b3a1a" rx="1" />
        <path d="M 380 60 L 360 100 L 400 100 Z" fill="#8b3a1a" opacity="0.15" stroke="#8b3a1a" strokeWidth="1" strokeDasharray="2,2" />
        <text x="387" y="44" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#8b3a1a" textAnchor="middle" fontWeight="600">A · MASTER</text>
      </g>
      <g>
        <rect x="200" y="95" width="12" height="9" fill="#8b3a1a" rx="1" />
        <path d="M 212 99 L 270 95 L 270 110 Z" fill="#8b3a1a" opacity="0.15" stroke="#8b3a1a" strokeWidth="1" strokeDasharray="2,2" />
        <text x="205" y="90" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#8b3a1a" textAnchor="middle" fontWeight="600">B · CU G</text>
      </g>
      <g>
        <rect x="380" y="135" width="12" height="9" fill="#8b3a1a" rx="1" />
        <path d="M 380 139 L 340 130 L 340 145 Z" fill="#8b3a1a" opacity="0.15" stroke="#8b3a1a" strokeWidth="1" strokeDasharray="2,2" />
        <text x="386" y="158" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#8b3a1a" textAnchor="middle" fontWeight="600">C · CU S</text>
      </g>
    </svg>
  );
}

function OrConfirmHeader() {
  return (
    <div className={styles.orHeader}>
      <div className={styles.orHeaderIcon} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M9 6l-6 6 6 6" />
        </svg>
      </div>
      <div className={styles.orHeaderText}>
        <div className={styles.orHeaderTitle}>Quale piano confermi per la giornata?</div>
        <div className={styles.orHeaderSub}>
          I 3 piani sono mutualmente esclusivi — solo uno verrà eseguito. Clicca il pallino o premi 1·2·3.
        </div>
      </div>
      <span className={styles.orHeaderShortcut} aria-hidden="true">
        1 · 2 · 3
      </span>
    </div>
  );
}

function TimeRuler() {
  return (
    <div className={styles.ruler} aria-hidden="true">
      <div className={styles.rulerLabel}>Ore</div>
      <div className={styles.rulerMarks}>
        {HOURS.map((hour, i) => (
          <div
            key={hour}
            className={styles.rulerTick}
            style={{ left: `${(i / (HOURS.length - 1)) * 100}%` }}
          >
            <span>{hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PlanTrackProps {
  plan: Plan;
  isConfirmed: boolean;
  onConfirm: () => void;
  isFirst: boolean;
}

function PlanTrack({ plan, isConfirmed, onConfirm, isFirst }: PlanTrackProps) {
  const planClass =
    plan.key === "A" ? styles.plan1 : plan.key === "B" ? styles.plan2 : styles.plan3;
  const timeClass =
    plan.key === "A"
      ? styles.planTime1
      : plan.key === "B"
        ? styles.planTime2
        : styles.planTime3;

  return (
    <div
      className={[
        styles.plan,
        planClass,
        isConfirmed ? styles.isConfirmed : "",
        isFirst ? styles.firstPlan : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={styles.planMeta}
        onClick={onConfirm}
        role="radio"
        aria-checked={isConfirmed}
        aria-label={`Conferma ${plan.name} (${plan.hotkey})`}
      >
        <span className={styles.planRadio} aria-hidden="true" />
        <span className={styles.planName}>{plan.name}</span>
        <span className={styles.planSub}>{plan.sub}</span>
        <span className={`${styles.planTime} ${timeClass}`}>{plan.time}</span>
        <span className={styles.planBadge}>
          {isConfirmed ? "CONFERMATO" : "CANDIDATO"}
        </span>
      </button>

      <div className={styles.planTrack}>
        {isFirst && isConfirmed && <CesareCard />}
        {plan.shots.map((shot) => (
          <button
            key={shot.id}
            type="button"
            className={`${styles.shot} ${shot.isSuggested ? styles.shotSuggested : ""}`}
            style={{ left: `${shot.leftPct}%`, width: `${shot.widthPct}%` }}
            title={shot.tooltip}
            aria-label={shot.tooltip}
          >
            <span className={styles.shotLabel}>{shot.label}</span>
            <span className={styles.shotSub}>{shot.duration}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CesareCard() {
  return (
    <aside className={styles.cesareCard} aria-label="Suggerimento di Cesare">
      <div className={styles.cesareCardHead}>Cesare · Aiuto regia</div>
      <div className={styles.cesareCardText}>
        Piano A sta accumulando 3h 40m con sole 3 scene. Considera split: sposta sc.7 su Piano B per recuperare luce.
      </div>
      <div className={styles.cesareCardActions}>
        <button type="button" className={`${styles.cesareBtn} ${styles.cesareBtnPrimary}`}>
          Sposta su B
        </button>
        <button type="button" className={styles.cesareBtn}>
          Spiega
        </button>
        <button type="button" className={styles.cesareBtn}>
          Ignora
        </button>
      </div>
    </aside>
  );
}

function DaySummary() {
  return (
    <div className={styles.summary}>
      <div className={styles.sumCard}>
        <div className={styles.sumLabel}>Tempo previsto</div>
        <div className={styles.sumNum}>7h 20m</div>
        <div className={styles.sumFoot}>su 8h disponibili</div>
      </div>
      <div className={styles.sumCard}>
        <div className={styles.sumLabel}>Costo giornata</div>
        <div className={styles.sumNum}>48.500 €</div>
        <div className={styles.sumFoot}>+ 4% vs media</div>
      </div>
      <div className={styles.sumCard}>
        <div className={styles.sumLabel}>Cast richiesto</div>
        <div className={styles.sumNum}>5</div>
        <div className={styles.sumFoot}>3 principali · 2 secondari</div>
      </div>
      <div className={styles.sumCard}>
        <div className={styles.sumLabel}>Suggerite da Cesare</div>
        <div className={`${styles.sumNum} ${styles.sumNumAgent}`}>3</div>
        <div className={styles.sumFoot}>inquadrature pre-fill</div>
      </div>
    </div>
  );
}
