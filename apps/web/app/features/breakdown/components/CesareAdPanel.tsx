import { useEffect, useMemo, useState } from "react";
import {
  adAnalyze,
  type AdSuggestion,
  type AdSuggestionKind,
  type AdSuggestionSeverity,
  type AdAnalyzeInput,
} from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";
import type {
  BreakdownSceneSummary,
  ProjectBreakdownRow,
} from "../server/breakdown.server";
import styles from "./BreakdownPage.module.css";

/**
 * AD-style alerts panel — replaces the old "Cesare suggests adding element X"
 * memo list with production-side concerns (continuity, risk, coverage,
 * locations).
 *
 * The panel is the consumer boundary for the domain function `adAnalyze`. It
 * persists per-suggestion dismissals in localStorage so an ignored alert does
 * not come back after a reload.
 */

interface Props {
  projectId: string;
  scenes: BreakdownSceneSummary[];
  rows: ProjectBreakdownRow[];
  screenplayText: string;
  /** When non-null, the panel filters alerts to the active scene only. */
  activeSceneId: string | null;
  /** Jump to a scene in the script reader. */
  onOpenScene: (sceneId: string) => void;
}

const SEVERITY_LABEL_KEY: Record<AdSuggestionSeverity, TranslationKey> = {
  critical: "breakdown.ad.severity.critical",
  warn: "breakdown.ad.severity.warn",
  info: "breakdown.ad.severity.info",
};

const KIND_LABEL_KEY: Record<AdSuggestionKind, TranslationKey> = {
  continuity: "breakdown.ad.kind.continuity",
  "risk-flag": "breakdown.ad.kind.riskFlag",
  "coverage-gap": "breakdown.ad.kind.coverageGap",
  "location-consolidate": "breakdown.ad.kind.locationConsolidate",
};

const SEVERITY_CLASS: Record<AdSuggestionSeverity, string> = {
  critical: styles.adAlertCardCritical ?? "",
  warn: styles.adAlertCardWarn ?? "",
  info: styles.adAlertCardInfo ?? "",
};

const dismissKey = (projectId: string) => `ohw:ad-dismissed:${projectId}`;

const loadDismissed = (projectId: string): Set<string> => {
  if (typeof window === "undefined") return new Set();
  const raw = window.localStorage.getItem(dismissKey(projectId));
  if (!raw) return new Set();
  // Tolerate any JSON shape — fall back to empty on parse failure (no try/catch
  // for domain errors per CLAUDE.md, but JSON.parse exceptions are runtime
  // bugs we ignore at the IO boundary).
  return new Set<string>(JSON.parse(raw) as string[]);
};

const saveDismissed = (projectId: string, set: Set<string>): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    dismissKey(projectId),
    JSON.stringify([...set]),
  );
};

const buildAnalyzeInput = (
  scenes: BreakdownSceneSummary[],
  rows: ProjectBreakdownRow[],
  screenplayText: string,
): AdAnalyzeInput => ({
  scenes: scenes.map((s) => ({
    id: s.id,
    number: s.number,
    intExt: s.intExt,
    location: s.location,
    timeOfDay: s.timeOfDay,
    // pageCount and storyDay are not yet persisted on scenes — we approximate
    // pageCount from the notes length as a stop-gap and leave storyDay null.
    pageCount: estimatePageCount(s.notes),
    storyDay: null,
  })),
  occurrences: rows.flatMap((row) =>
    row.scenesPresent.map((sp) => ({
      elementId: row.element.id,
      elementName: row.element.name,
      category: row.element.category,
      sceneId: sp.sceneId,
      quantity: sp.quantity,
    })),
  ),
  screenplayText,
});

// 1 page ≈ 250 words in standard screenplay formatting; fall back to 1 page
// when notes are missing.
const estimatePageCount = (notes: string | null): number => {
  if (!notes) return 1;
  const words = notes.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, Math.round((words / 250) * 8) / 8);
};

export function CesareAdPanel({
  projectId,
  scenes,
  rows,
  screenplayText,
  activeSceneId,
  onOpenScene,
}: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissed(projectId),
  );

  useEffect(() => {
    setDismissed(loadDismissed(projectId));
  }, [projectId]);

  const suggestions = useMemo(
    () => adAnalyze(buildAnalyzeInput(scenes, rows, screenplayText)),
    [scenes, rows, screenplayText],
  );

  const visible = useMemo(() => {
    const filtered = suggestions.filter((s) => !dismissed.has(s.id));
    if (activeSceneId) {
      return filtered.filter(
        (s) => s.sceneId === activeSceneId || s.sceneId === null,
      );
    }
    return filtered;
  }, [suggestions, dismissed, activeSceneId]);

  const ignore = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(projectId, next);
      return next;
    });
  };

  if (visible.length === 0) {
    return (
      <p className={styles.adAlertEmpty}>{t("breakdown.ad.empty")}</p>
    );
  }

  return (
    <div className={styles.adAlerts} data-testid="cesare-ad-panel">
      {visible.map((s) => (
        <AdAlertCard
          key={s.id}
          suggestion={s}
          onOpenScene={onOpenScene}
          onIgnore={ignore}
        />
      ))}
    </div>
  );
}

interface CardProps {
  suggestion: AdSuggestion;
  onOpenScene: (sceneId: string) => void;
  onIgnore: (id: string) => void;
}

function AdAlertCard({ suggestion, onOpenScene, onIgnore }: CardProps) {
  const { t } = useTranslation();
  return (
    <article
      className={[
        styles.adAlertCard,
        SEVERITY_CLASS[suggestion.severity],
      ].join(" ")}
      data-testid={`ad-alert-${suggestion.kind}`}
      data-severity={suggestion.severity}
    >
      <header className={styles.adAlertHead}>
        <span className={styles.adAlertEyebrow}>
          {t(KIND_LABEL_KEY[suggestion.kind])}
        </span>
        <span className={styles.adAlertSeverity}>
          {t(SEVERITY_LABEL_KEY[suggestion.severity])}
        </span>
        {suggestion.sceneNumber !== null && (
          <span className={styles.adAlertSceneTag}>
            SC. {suggestion.sceneNumber}
          </span>
        )}
      </header>
      <p className={styles.adAlertTitle}>{suggestion.title}</p>
      <p className={styles.adAlertBody}>{suggestion.body}</p>
      <div className={styles.adAlertActions}>
        {suggestion.sceneId && (
          <button
            type="button"
            className={styles.adAlertBtn}
            onClick={() => onOpenScene(suggestion.sceneId!)}
          >
            {t("breakdown.ad.openScenePrefix")}
            {suggestion.sceneNumber ?? ""}
          </button>
        )}
        {suggestion.suggestedAction && (
          <button
            type="button"
            className={[styles.adAlertBtn, styles.adAlertBtnPrimary].join(" ")}
            onClick={() => onOpenScene(suggestion.sceneId ?? "")}
          >
            {suggestion.suggestedAction}
          </button>
        )}
        <button
          type="button"
          className={styles.adAlertBtn}
          onClick={() => onIgnore(suggestion.id)}
        >
          {t("breakdown.ad.ignore")}
        </button>
      </div>
    </article>
  );
}

/** Compute the total visible alerts (after dismissals) — exposed for the
 *  viewbar counter so the page can show "Cesare · N alert (M critici)".
 */
export function useAdAlertStats(
  projectId: string,
  scenes: BreakdownSceneSummary[],
  rows: ProjectBreakdownRow[],
  screenplayText: string,
  activeSceneId?: string | null,
): { total: number; critical: number } {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    loadDismissed(projectId),
  );

  useEffect(() => {
    setDismissed(loadDismissed(projectId));
    const onStorage = (e: StorageEvent) => {
      if (e.key === dismissKey(projectId)) {
        setDismissed(loadDismissed(projectId));
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return;
  }, [projectId]);

  return useMemo(() => {
    const all = adAnalyze(buildAnalyzeInput(scenes, rows, screenplayText));
    let visible = all.filter((s) => !dismissed.has(s.id));
    // Mirror the panel's scene filter: when a scene is active, count only
    // alerts attached to that scene (plus global ones with no sceneId).
    if (activeSceneId) {
      visible = visible.filter(
        (s) => s.sceneId === activeSceneId || s.sceneId === null,
      );
    }
    return {
      total: visible.length,
      critical: visible.filter((s) => s.severity === "critical").length,
    };
  }, [scenes, rows, screenplayText, dismissed, activeSceneId]);
}
