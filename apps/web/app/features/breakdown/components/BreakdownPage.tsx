import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  FloatingDock,
  Popover,
  SegmentedControl,
  Skeleton,
  VersionTrigger,
  Viewbar,
  ViewbarSep,
} from "@oh-writers/ui";
import { useVersionsDrawer } from "~/features/versions";
import {
  useVersions,
  syncStateQueryOptions,
} from "~/features/screenplay-editor";
import { DraftMetaBadge } from "~/features/projects";
import { useCesareOpen, useSetActiveScene } from "~/features/app-shell";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
} from "@oh-writers/domain";
import {
  breakdownContextOptions,
  breakdownForSceneOptions,
  projectBreakdownOptions,
  useRunAutoSpoglio,
  useSetOccurrenceStatus,
  useArchiveBreakdownElement,
  useUpdateBreakdownElement,
  useRemoveBreakdownOccurrence,
} from "../hooks/useBreakdown";
import { ScriptReader, type ScriptReaderHandle } from "./ScriptReader";
import { ExportBreakdownModal } from "./ExportBreakdownModal";
import { ProjectBreakdownView } from "./ProjectBreakdownView";
import { BreakdownMatrix } from "./BreakdownMatrix";
import { useAdAlertStats } from "./CesareAdPanel";
import { BreakdownRecapStrip } from "./BreakdownRecapStrip";
import type { ElementForMatch } from "../lib/pm-plugins/find-occurrences";
import type { CesareSuggestionLite } from "../lib/pm-plugins/map-suggestions";
import type {
  BreakdownSceneSummary,
  ProjectBreakdownRow,
  SceneOccurrenceWithElement,
} from "../server/breakdown.server";
import styles from "./BreakdownPage.module.css";

interface Props {
  projectId: string;
}

type UnderlineKey =
  | "cast"
  | "locations"
  | "props"
  | "costumes"
  | "photography"
  | "sound";

type ViewTab = "per-scene" | "per-project" | "matrice";

type CtxMode = "main" | "rename" | "category";

interface ContextMenuState {
  x: number;
  y: number;
  elementId: string;
  category: BreakdownCategory | null;
  name: string;
  occurrenceId: string | null;
  mode: CtxMode;
}

const UNDERLINE_CHIPS: ReadonlyArray<{
  key: UnderlineKey;
  label: string;
  color: string;
  defaultOn: boolean;
}> = [
  { key: "cast", label: "Cast", color: "var(--ds-cat-cast)", defaultOn: true },
  {
    key: "locations",
    label: "Locations",
    color: "var(--ds-cat-locations)",
    defaultOn: true,
  },
  {
    key: "props",
    label: "Props",
    color: "var(--ds-cat-scenografia)",
    defaultOn: true,
  },
  {
    key: "costumes",
    label: "Costumi",
    color: "var(--ds-cat-costumi)",
    defaultOn: false,
  },
  {
    key: "photography",
    label: "Fotografia",
    color: "var(--ds-cat-fotografia)",
    defaultOn: false,
  },
  {
    key: "sound",
    label: "Suono",
    color: "var(--ds-cat-suono)",
    defaultOn: false,
  },
];

const initialUnderlineState = (): Record<UnderlineKey, boolean> =>
  UNDERLINE_CHIPS.reduce(
    (acc, c) => ({ ...acc, [c.key]: c.defaultOn }),
    {} as Record<UnderlineKey, boolean>,
  );

const formatHeading = (scene: BreakdownSceneSummary): string => {
  const tod = scene.timeOfDay ? ` — ${scene.timeOfDay.toUpperCase()}` : "";
  return `${scene.intExt}. ${scene.location.toUpperCase()}${tod}`;
};

export function BreakdownPage({ projectId }: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.empty}>
          <Skeleton
            lines={4}
            widths={["100%", "100%", "100%", "60%"]}
            ariaLabel="Caricamento spoglio"
          />
        </div>
      }
    >
      <BreakdownPageContent projectId={projectId} />
    </Suspense>
  );
}

function BreakdownPageContent({ projectId }: Props) {
  const { data: ctx } = useSuspenseQuery(breakdownContextOptions(projectId));
  const versionId = ctx.screenplayVersionId;
  const { data: syncState } = useQuery(syncStateQueryOptions(projectId));
  const canEdit = ctx.canEdit;
  const scenes = ctx.scenes;
  const { open: openVersionsDrawer } = useVersionsDrawer();
  // Cesare is now driven exclusively by the shell-level BottomDock — the
  // local pill was removed (TKT-LEAD-01). Hook stays mounted so future
  // page-scoped Cesare entry points (RecapStrip, inline affordances) can
  // continue to call it without re-introducing the import.
  const _openCesare = useCesareOpen();
  void _openCesare;

  const { data: versionsResult } = useVersions(ctx.screenplayId ?? "");
  const screenplayVersions = versionsResult?.isOk ? versionsResult.value : [];
  const currentVersion = screenplayVersions.find((v) => v.id === versionId);
  const screenplayVersionLabel = currentVersion?.label ?? null;

  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    scenes[0]?.id ?? null,
  );
  const activeScene =
    scenes.find((s) => s.id === activeSceneId) ?? scenes[0] ?? null;
  const activeSceneIdx = activeScene
    ? scenes.findIndex((s) => s.id === activeScene.id) + 1
    : 0;

  // Sync active scene to app-level context so Cesare always has the current scene
  const setActiveScene = useSetActiveScene();
  useEffect(() => {
    if (activeScene) {
      setActiveScene({ sceneId: activeScene.id, sceneNumber: activeSceneIdx });
    }
    return () => setActiveScene(null);
  }, [activeScene?.id, activeSceneIdx, setActiveScene]);

  const [underline, setUnderline] = useState(initialUnderlineState);
  const toggleUnderline = (key: UnderlineKey) =>
    setUnderline((s) => ({ ...s, [key]: !s[key] }));
  const [underlineOpen, setUnderlineOpen] = useState(false);
  const underlineWrapRef = useRef<HTMLDivElement>(null);
  const underlineActiveCount = UNDERLINE_CHIPS.reduce(
    (n, c) => (underline[c.key] ? n + 1 : n),
    0,
  );

  const [viewTab, setViewTab] = useState<ViewTab>("per-scene");
  const [exportOpen, setExportOpen] = useState(false);
  const [indiceOpen, setIndiceOpen] = useState(false);
  const [indiceQuery, setIndiceQuery] = useState("");
  const indiceSearchRef = useRef<HTMLInputElement>(null);
  const indiceWrapRef = useRef<HTMLDivElement>(null);

  // Auto-spoglio on mount, same guard pattern as v1.
  // Skipped under MOCK_AI (E2E suite): the mock seed already pre-populates
  // breakdown rows and the mutation triggers a layout shift mid-test that
  // races the Cesare sheet interaction. The dedicated auto-spoglio specs
  // exercise this path explicitly on a real-AI build.
  const autoSpoglio = useRunAutoSpoglio(projectId, versionId);
  const autoSpoglioStartedRef = useRef(false);
  useEffect(() => {
    if (import.meta.env.MOCK_AI) return;
    if (!canEdit) return;
    if (versionId.length === 0) return;
    if (autoSpoglioStartedRef.current) return;
    if (!autoSpoglio.isIdle) return;
    autoSpoglioStartedRef.current = true;
    autoSpoglio.mutate();
  }, [autoSpoglio, canEdit, versionId]);

  // Project-wide breakdown rows → highlight elements (all scenes).
  const { data: projectRows } = useQuery(
    projectBreakdownOptions(projectId, versionId),
  );
  const allRows: ProjectBreakdownRow[] = projectRows ?? [];

  const elementsForHighlight: ElementForMatch[] = allRows.map((row) => ({
    id: row.element.id,
    name: row.element.name,
    category: row.element.category,
    isStale: row.hasStale,
  }));

  // Scene-level occurrences for the active scene → drives right panel.
  const { data: sceneData } = useQuery(
    breakdownForSceneOptions(activeScene?.id ?? "", versionId),
  );
  const sceneOccurrences: SceneOccurrenceWithElement[] = sceneData ?? [];

  const suggestions: CesareSuggestionLite[] = sceneOccurrences
    .filter((d) => d.occurrence.cesareStatus === "pending")
    .map((d) => ({
      category: d.element.category,
      name: d.element.name,
      occurrenceId: d.occurrence.id,
    }));

  const pendingCount = sceneOccurrences.filter(
    (o) => o.occurrence.cesareStatus === "pending",
  ).length;

  // AD alert stats — used to be wired into the FloatingDock badge (TKT-LEAD-01
  // removed that pill). The hook stays so its side-effects (alert collection
  // + invalidation) keep working; future surfaces (RecapStrip, Cesare badge)
  // can re-attach the count without re-introducing the call site.
  const _adStats = useAdAlertStats(
    projectId,
    scenes,
    allRows,
    ctx.versionContent ?? "",
    activeScene?.id ?? null,
  );
  void _adStats;

  // Scene → element count for the Indice popover badges.
  const scenesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allRows) {
      for (const sp of row.scenesPresent) {
        counts.set(sp.sceneId, (counts.get(sp.sceneId) ?? 0) + sp.quantity);
      }
    }
    return scenes.map((s) => ({ scene: s, count: counts.get(s.id) ?? 0 }));
  }, [allRows, scenes]);

  const scriptReaderRef = useRef<ScriptReaderHandle>(null);

  const handleSceneSelect = (sceneId: string) => {
    setActiveSceneId(sceneId);
    setIndiceOpen(false);
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx >= 0) scriptReaderRef.current?.scrollToScene(idx + 1);
  };

  // ─── Hover tooltip on underlined elements ───────────────────────────────
  type HoverTooltip = {
    x: number;
    y: number;
    name: string;
    category: BreakdownCategory;
    occurrenceId: string | null;
    isPending: boolean;
  };
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip when pointer moves away from both the screenplay and the tooltip.
  // We use document pointermove instead of React synthetic events because ProseMirror
  // intercepts and re-dispatches events in ways that make mouseover/mouseleave unreliable.
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hoverTooltip) return;
    const onMove = (e: PointerEvent) => {
      const top = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;
      const overTooltip =
        tooltipRef.current != null &&
        top != null &&
        (tooltipRef.current === top || tooltipRef.current.contains(top));
      const overElement = top?.closest?.("[data-element-id]") != null;
      if (overTooltip || overElement) {
        if (hoverCloseTimerRef.current)
          clearTimeout(hoverCloseTimerRef.current);
      } else {
        if (hoverCloseTimerRef.current)
          clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = setTimeout(() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoverTooltip(null);
        }, 80);
      }
    };
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    };
  }, [hoverTooltip]);

  const handleScreenplayMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const elNode = target?.closest<HTMLElement>("[data-element-id]");
    if (!elNode) return;
    const elementId = elNode.getAttribute("data-element-id") ?? "";
    const category = (elNode.getAttribute("data-cat") ??
      null) as BreakdownCategory | null;
    if (!category) return;
    const isGhost = elNode.getAttribute("data-ghost") === "true";
    const ghostOccurrenceId = elNode.getAttribute("data-occurrence-id") ?? null;
    const occ = sceneOccurrences.find((o) => o.element.id === elementId);
    const name = occ?.element.name ?? elNode.textContent?.trim() ?? "";
    const isPending = isGhost || occ?.occurrence.cesareStatus === "pending";
    const occurrenceId = isGhost
      ? ghostOccurrenceId
      : (occ?.occurrence.id ?? null);
    const rect = elNode.getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoverTooltip({
        x: rect.left,
        y: rect.bottom + 6,
        name,
        category,
        occurrenceId,
        isPending,
      });
    }, 180);
  };

  const handleScreenplayMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  const handleTooltipMouseEnter = () => undefined;
  const handleTooltipMouseLeave = () => undefined;

  const removeOcc = useRemoveBreakdownOccurrence();

  const handleHoverRemove = () => {
    if (!hoverTooltip?.occurrenceId) return;
    removeOcc.mutate({ projectId, occurrenceId: hoverTooltip.occurrenceId });
    setHoverTooltip(null);
  };

  const handleHoverAccept = () => {
    if (!hoverTooltip?.occurrenceId) return;
    setStatus.mutate({
      occurrenceIds: [hoverTooltip.occurrenceId],
      status: "accepted",
    });
    flashFeedback(`Confermato «${hoverTooltip.name}»`);
    setHoverTooltip(null);
  };

  const handleHoverReject = () => {
    if (!hoverTooltip?.occurrenceId) return;
    removeOcc.mutate({ projectId, occurrenceId: hoverTooltip.occurrenceId });
    flashFeedback(`Scartato «${hoverTooltip.name}»`);
    setHoverTooltip(null);
  };

  // ─── Context menu (right-click on highlighted element) ──────────────────
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const screenplayContainerRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const setStatus = useSetOccurrenceStatus(activeScene?.id ?? "", versionId);
  const archiveEl = useArchiveBreakdownElement();
  const updateEl = useUpdateBreakdownElement();

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        ctxMenuRef.current &&
        !ctxMenuRef.current.contains(e.target as Node)
      ) {
        closeCtxMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCtxMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ctxMenu, closeCtxMenu]);

  // Focus the first focusable item when the menu opens or switches mode.
  useEffect(() => {
    if (!ctxMenu) return;
    const node = ctxMenuRef.current;
    if (!node) return;
    if (ctxMenu.mode === "rename") {
      const input = node.querySelector<HTMLInputElement>("input[type='text']");
      input?.focus();
      input?.select();
      return;
    }
    const first = node.querySelector<HTMLButtonElement>("[role='menuitem']");
    first?.focus();
  }, [ctxMenu]);

  const handleScreenplayContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null;
    const elNode = target?.closest<HTMLElement>("[data-element-id]");
    if (!elNode) return;
    event.preventDefault();

    const elementId = elNode.getAttribute("data-element-id") ?? "";
    const category = (elNode.getAttribute("data-cat") ??
      null) as BreakdownCategory | null;

    // Find the occurrence for this element in the active scene (if any).
    const occ = sceneOccurrences.find((o) => o.element.id === elementId);
    const name = occ?.element.name ?? elNode.textContent?.trim() ?? "";

    setCtxMenu({
      x: event.clientX,
      y: event.clientY,
      elementId,
      category,
      name,
      occurrenceId: occ?.occurrence.id ?? null,
      mode: "main",
    });
  };

  const handleCtxArrowKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      ctxMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      ) ?? [],
    );
    if (items.length === 0) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    const next =
      e.key === "ArrowDown"
        ? (idx + 1) % items.length
        : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const flashFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => setActionFeedback(null), 1800);
  }, []);

  const handleConfirm = () => {
    if (ctxMenu?.occurrenceId) {
      const elName = ctxMenu.name;
      setStatus.mutate({
        occurrenceIds: [ctxMenu.occurrenceId],
        status: "accepted",
      });
      flashFeedback(`Confermato «${elName}»`);
    }
    closeCtxMenu();
  };

  const handleRemove = () => {
    if (ctxMenu?.elementId) {
      const elName = ctxMenu.name;
      archiveEl.mutate({ elementId: ctxMenu.elementId });
      flashFeedback(`Rimosso «${elName}»`);
    }
    closeCtxMenu();
  };

  const handleOpenRename = () => {
    setCtxMenu((m) => (m ? { ...m, mode: "rename" } : m));
  };

  const handleOpenCategory = () => {
    setCtxMenu((m) => (m ? { ...m, mode: "category" } : m));
  };

  const handleCommitRename = (nextName: string) => {
    if (!ctxMenu) return;
    const trimmed = nextName.trim();
    if (trimmed.length === 0 || trimmed === ctxMenu.name) {
      closeCtxMenu();
      return;
    }
    updateEl.mutate({
      elementId: ctxMenu.elementId,
      patch: { name: trimmed },
    });
    flashFeedback(`Rinominato «${ctxMenu.name}» → «${trimmed}»`);
    closeCtxMenu();
  };

  const handleCommitCategory = (nextCat: BreakdownCategory) => {
    if (!ctxMenu) return;
    if (nextCat === ctxMenu.category) {
      closeCtxMenu();
      return;
    }
    updateEl.mutate({
      elementId: ctxMenu.elementId,
      patch: { category: nextCat },
    });
    flashFeedback(`«${ctxMenu.name}» → ${CATEGORY_META[nextCat].labelIt}`);
    closeCtxMenu();
  };

  // ─── Indice popover keyboard shortcut (Cmd/Ctrl + K) ────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIndiceOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (indiceOpen) {
      // Defer focus so Popover is mounted.
      requestAnimationFrame(() => indiceSearchRef.current?.focus());
    }
  }, [indiceOpen]);

  const filteredScenes =
    indiceQuery.trim().length === 0
      ? scenesWithCounts
      : scenesWithCounts.filter(({ scene }) => {
          const q = indiceQuery.toLowerCase();
          return (
            scene.location.toLowerCase().includes(q) ||
            scene.heading.toLowerCase().includes(q) ||
            String(scene.number).includes(q)
          );
        });

  const totalScenes = scenes.length;

  // Toggle the data-scrolled flag on the viewbar so it shrinks once the user
  // moves past the top. Scrolling can happen on AppShell's #main-content or
  // on the window itself depending on viewport height — listen on both.
  const [isScrolled, setScrolled] = useState(false);
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

  return (
    <main className={styles.page} data-testid="breakdown-page-v2">
      {/* ─── VIEWBAR ─── */}
      <div
        className={styles.viewbarWrap}
        data-scrolled={isScrolled || undefined}
      >
        <Viewbar>
          <div className={styles.viewbarLeft}>
            <SegmentedControl
              options={[
                { id: "per-scene", label: "Per scena" },
                { id: "per-project", label: "Per progetto" },
                { id: "matrice", label: "Matrice" },
              ]}
              activeId={viewTab}
              onSelect={(id) => setViewTab(id as ViewTab)}
              ariaLabel="Vista breakdown"
            />
          </div>
          <ViewbarSep />
          {viewTab === "per-scene" && (
            <div className={styles.viewbarCenter}>
              <div className={styles.indiceWrap} ref={underlineWrapRef}>
                <button
                  type="button"
                  className={styles.underlineTrigger}
                  aria-haspopup="dialog"
                  aria-expanded={underlineOpen}
                  onClick={() => setUnderlineOpen((o) => !o)}
                  data-testid="breakdown-underline-trigger"
                >
                  <span className={styles.underlineTriggerPrefix}>
                    Sottolinea
                  </span>
                  <span className={styles.underlineTriggerCount}>
                    {underlineActiveCount}
                  </span>
                  <span aria-hidden="true">▾</span>
                </button>

                <Popover
                  isOpen={underlineOpen}
                  onClose={() => setUnderlineOpen(false)}
                  placement="bottom-center"
                  width={240}
                >
                  <div
                    className={styles.underlineList}
                    role="group"
                    aria-label="Categorie sottolineate"
                  >
                    {UNDERLINE_CHIPS.map((chip) => {
                      const isOn = underline[chip.key];
                      return (
                        <label
                          key={chip.key}
                          className={styles.underlineRow}
                          // @ts-expect-error CSS custom property
                          style={{ "--cat-color": chip.color }}
                        >
                          <input
                            type="checkbox"
                            checked={isOn}
                            onChange={() => toggleUnderline(chip.key)}
                            aria-label={`Mostra sottolineature ${chip.label}`}
                          />
                          <span
                            className={styles.underlineDot}
                            aria-hidden="true"
                          />
                          <span className={styles.underlineLabel}>
                            {chip.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Popover>
              </div>
            </div>
          )}
          {viewTab !== "per-scene" && <div className={styles.viewbarCenter} />}
          <ViewbarSep />
          {/* "Per scena" is the default V2 view; tabs are visual but the
              first is active. Other views fall back to v1 by route. */}
          <div className={styles.viewbarRight}>
            {/* TODO(audit-2026-05-15): restore Indice popover once scene-click
                anchor logic scrolls to the correct breakdown scene block.
                The popover items have no working onClick handler today. */}
            {false && (
              <div className={styles.indiceWrap} ref={indiceWrapRef}>
                <button
                  type="button"
                  className={styles.pillBtn}
                  aria-haspopup="dialog"
                  aria-expanded={indiceOpen}
                  onClick={() => setIndiceOpen((o) => !o)}
                  data-testid="breakdown-indice-trigger"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M3 12h18M3 18h12" />
                  </svg>
                  Indice
                  <span className={styles.badgeCount} data-num>
                    {activeSceneIdx}/{totalScenes}
                  </span>
                  ▾
                </button>

                <Popover
                  isOpen={indiceOpen}
                  onClose={() => setIndiceOpen(false)}
                  placement="bottom-end"
                  width={320}
                >
                  <div className={styles.popSearch}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                      style={{ color: "var(--ds-text-3)" }}
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      ref={indiceSearchRef}
                      type="text"
                      value={indiceQuery}
                      onChange={(e) => setIndiceQuery(e.target.value)}
                      placeholder="Cerca scena o luogo…"
                      aria-label="Cerca scena"
                    />
                    <span className={styles.popKbd}>⌘K</span>
                  </div>
                  {filteredScenes.length === 0 ? (
                    <p className={styles.popAct}>Nessuna scena trovata.</p>
                  ) : (
                    filteredScenes.map(({ scene, count }) => {
                      const isCurrent = scene.id === activeScene?.id;
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          className={[
                            styles.popItem,
                            isCurrent ? styles.popItemCurrent : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleSceneSelect(scene.id)}
                        >
                          <span className="n">SC.{scene.fountainNumber}</span>
                          <span className="lbl">{formatHeading(scene)}</span>
                          <span className={styles.popKbd} data-num>
                            {count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </Popover>
              </div>
            )}

            <DraftMetaBadge projectId={projectId} />
            <VersionTrigger
              variant="pill"
              versionLabel={screenplayVersionLabel ?? undefined}
              menuItems={[
                ...screenplayVersions.map((v, idx) => ({
                  id: `version-${v.id}`,
                  label:
                    v.id === versionId
                      ? `● ${v.label ?? `Versione ${idx + 1}`}`
                      : (v.label ?? `Versione ${idx + 1}`),
                  onSelect: () => {
                    if (ctx.screenplayId) {
                      openVersionsDrawer({
                        kind: "screenplay",
                        screenplayId: ctx.screenplayId,
                      });
                    }
                  },
                  tone:
                    v.id === versionId
                      ? ("default" as const)
                      : ("muted" as const),
                })),
                {
                  id: "open-drawer",
                  label: "Apri Versioni →",
                  onSelect: () => {
                    if (ctx.screenplayId) {
                      openVersionsDrawer({
                        kind: "screenplay",
                        screenplayId: ctx.screenplayId,
                      });
                    }
                  },
                },
              ]}
            />
          </div>
        </Viewbar>
      </div>

      {syncState?.breakdownStale && !autoSpoglio.isPending && (
        <div
          className={styles.statusBanner}
          role="alert"
          data-testid="breakdown-stale-banner"
        >
          La versione attiva della sceneggiatura è cambiata — rigenera il
          breakdown per allinearlo.
        </div>
      )}

      {autoSpoglio.isPending && (
        <div
          className={styles.statusBanner}
          role="status"
          data-testid="auto-spoglio-banner"
        >
          Auto-spoglio in corso…
        </div>
      )}

      {/* ─── LAYOUT ─── */}
      {viewTab === "per-project" && (
        <section
          className={styles.tableWrap}
          data-testid="breakdown-table-view"
        >
          <ProjectBreakdownView
            projectId={projectId}
            versionId={versionId}
            canEdit={canEdit}
          />
        </section>
      )}

      {viewTab === "matrice" && (
        <section
          className={styles.tableWrap}
          data-testid="breakdown-matrix-view"
        >
          <BreakdownMatrix
            projectId={projectId}
            versionId={versionId}
            scenes={scenes}
            canEdit={canEdit}
          />
        </section>
      )}

      {viewTab === "per-scene" && (
        <>
          <BreakdownRecapStrip
            projectId={projectId}
            scene={activeScene}
            sceneNumber={activeSceneIdx}
            versionId={versionId}
          />
          <div className={styles.layout}>
            <div
              ref={screenplayContainerRef}
              className={styles.screenplay}
              onContextMenu={handleScreenplayContextMenu}
              onMouseOver={handleScreenplayMouseOver}
              onMouseLeave={handleScreenplayMouseLeave}
              data-show-cast={underline.cast}
              data-show-locations={underline.locations}
              data-show-props={underline.props}
              data-show-costumes={underline.costumes}
              data-show-photography={underline.photography}
              data-show-sound={underline.sound}
              data-testid="breakdown-screenplay"
            >
              {ctx.versionContent ? (
                <ScriptReader
                  ref={scriptReaderRef}
                  projectId={projectId}
                  versionId={versionId}
                  versionContent={ctx.versionContent}
                  scenes={scenes}
                  elements={elementsForHighlight}
                  suggestions={suggestions}
                  canEdit={canEdit}
                  activeSceneId={activeScene?.id ?? null}
                  onActiveSceneChange={setActiveSceneId}
                />
              ) : (
                <p className={styles.empty}>
                  Nessuna versione disponibile per questa sceneggiatura.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── HOVER TOOLTIP ─── */}
      {hoverTooltip && (
        <div
          ref={tooltipRef}
          className={styles.hoverTooltip}
          style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
        >
          <span
            className={styles.hoverTooltipCat}
            style={{
              color: `var(${CATEGORY_META[hoverTooltip.category]?.colorToken ?? "--ds-text-mute"})`,
            }}
          >
            {CATEGORY_META[hoverTooltip.category]?.labelIt ??
              hoverTooltip.category}
          </span>
          <span className={styles.hoverTooltipName}>{hoverTooltip.name}</span>
          {canEdit && hoverTooltip.isPending ? (
            <>
              <button
                type="button"
                className={styles.hoverTooltipAccept}
                disabled={!hoverTooltip.occurrenceId || setStatus.isPending}
                onClick={handleHoverAccept}
              >
                Accetta
              </button>
              <button
                type="button"
                className={styles.hoverTooltipReject}
                disabled={!hoverTooltip.occurrenceId || removeOcc.isPending}
                onClick={handleHoverReject}
              >
                Scarta
              </button>
            </>
          ) : canEdit ? (
            <button
              type="button"
              className={styles.hoverTooltipRemove}
              disabled={!hoverTooltip.occurrenceId || removeOcc.isPending}
              onClick={handleHoverRemove}
              title={
                hoverTooltip.occurrenceId
                  ? "Rimuovi dalla scena"
                  : "Seleziona una scena per rimuovere"
              }
              aria-label="Rimuovi dalla scena"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      )}

      {/* ─── CONTEXT MENU ─── */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className={styles.ctx}
          style={{
            left: ctxMenu.x,
            top: ctxMenu.y,
            // @ts-expect-error CSS custom property
            "--cat-color": ctxMenu.category
              ? `var(${CATEGORY_META[ctxMenu.category].colorToken})`
              : "var(--ds-text-3)",
          }}
          role="menu"
          aria-label={`Azioni elemento ${ctxMenu.name}`}
          onKeyDown={handleCtxArrowKey}
          data-testid="breakdown-context-menu"
        >
          <div className={styles.ctxHead}>
            <span className="dot" aria-hidden="true" />
            {ctxMenu.category
              ? CATEGORY_META[ctxMenu.category].labelIt
              : "Elemento"}{" "}
            · <b>{ctxMenu.name}</b>
          </div>
          {ctxMenu.mode === "main" && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.ctxItem}
                onClick={handleConfirm}
                disabled={!ctxMenu.occurrenceId}
              >
                <span aria-hidden="true">✓</span>
                <span>Conferma elemento</span>
                <span className={styles.ctxKbd}>↵</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.ctxItem}
                onClick={handleOpenCategory}
                data-testid="ctx-change-category"
              >
                <span aria-hidden="true">↔</span>
                <span>Cambia categoria</span>
                <span className={styles.ctxKbd}>⇧C</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.ctxItem}
                onClick={handleOpenRename}
                data-testid="ctx-rename"
              >
                <span aria-hidden="true">✎</span>
                <span>Modifica nome</span>
              </button>
              <div className={styles.ctxSep} aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className={[styles.ctxItem, styles.isDanger].join(" ")}
                onClick={handleRemove}
              >
                <span aria-hidden="true">🗑</span>
                <span>Rimuovi dallo spoglio</span>
                <span className={styles.ctxKbd}>⌫</span>
              </button>
            </>
          )}

          {ctxMenu.mode === "rename" && (
            <RenameForm
              initialName={ctxMenu.name}
              onCommit={handleCommitRename}
              onCancel={closeCtxMenu}
            />
          )}

          {ctxMenu.mode === "category" && (
            <div
              className={styles.ctxCategoryList}
              data-testid="ctx-category-list"
            >
              {BREAKDOWN_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const colorVar = `var(${meta.colorToken})`;
                const isCurrent = cat === ctxMenu.category;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="menuitem"
                    className={styles.ctxItem}
                    onClick={() => handleCommitCategory(cat)}
                    aria-current={isCurrent || undefined}
                    data-testid={`ctx-category-option-${cat}`}
                  >
                    <span
                      aria-hidden="true"
                      className={styles.ctxCatDot}
                      // @ts-expect-error CSS custom property
                      style={{ "--cat-color": colorVar }}
                    />
                    <span>{meta.labelIt}</span>
                    {isCurrent && (
                      <span className={styles.ctxKbd} aria-hidden="true">
                        ●
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── PAGE-SCOPED CTAs (bottom-left) ───
       * Spec 44 TKT-LEAD-01: the BottomDock owns the bottom-right corner
       * + the universal ✦ Cesare button. The per-page FloatingDock anchors
       * bottom-LEFT (default) and no longer renders its own Cesare pill —
       * one Cesare surface, one command centre. */}
      <FloatingDock
        primaryAction={{
          label: "Ri-spogliare con AI",
          hotkey: "⌘R",
          onClick: () => {
            /* TODO wire — same as v1 streamFullSpoglio */
          },
        }}
        secondaryActions={[
          {
            label: "Esporta",
            hotkey: "⌘E",
            onClick: () => setExportOpen(true),
          },
        ]}
      />

      <ExportBreakdownModal
        projectId={projectId}
        versionId={versionId}
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      {actionFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={styles.actionFeedback}
          data-testid="breakdown-action-feedback"
        >
          {actionFeedback}
        </div>
      )}
    </main>
  );
}

/* ────────────────────────── Cesare panel ────────────────────────────
 * Moved to `CesareAdPanel.tsx` — the legacy memo-style panel that suggested
 * "aggiungere oggetto X" was removed in favour of production-side AD alerts.
 */

interface RenameFormProps {
  initialName: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}

function RenameForm({ initialName, onCommit, onCancel }: RenameFormProps) {
  const [value, setValue] = useState(initialName);
  return (
    <form
      className={styles.ctxRenameForm}
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(value);
      }}
    >
      <input
        type="text"
        value={value}
        maxLength={200}
        className={styles.ctxRenameInput}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label="Nuovo nome elemento"
        data-testid="ctx-rename-input"
      />
      <div className={styles.ctxRenameActions}>
        <button
          type="button"
          className={styles.ctxRenameBtn}
          onClick={onCancel}
        >
          Annulla
        </button>
        <button
          type="submit"
          className={[styles.ctxRenameBtn, styles.ctxRenameBtnPrimary].join(
            " ",
          )}
          data-testid="ctx-rename-save"
        >
          Salva
        </button>
      </div>
    </form>
  );
}
