import { useEffect, useRef, useState } from "react";
import { useTranslation } from "~/features/i18n";
import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./PlanPicker.module.css";

interface PlanPickerProps {
  scenarios: ScenarioView[];
  visibleScenarioIds: Set<string>;
  onToggleVisible: (scenarioId: string) => void;
  onCreatePlan: (init: "empty" | "copy" | "pattern") => void;
}

export function PlanPicker({
  scenarios,
  visibleScenarioIds,
  onToggleVisible,
  onCreatePlan,
}: PlanPickerProps) {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (addWrapRef.current && !addWrapRef.current.contains(e.target as Node))
        setPopoverOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [popoverOpen]);

  return (
    <div
      className={styles.root}
      role="group"
      aria-label={t("shootingPlan.picker.regionAria")}
    >
      <span className={styles.label}>{t("shootingPlan.picker.show")}</span>
      {scenarios.map((s) => {
        const visible = visibleScenarioIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={styles.pill}
            data-visible={visible || undefined}
            onClick={() => onToggleVisible(s.id)}
          >
            <span className={styles.check}>{visible ? "✓" : "○"}</span>
            <span>{s.name}</span>
          </button>
        );
      })}

      <div ref={addWrapRef} className={styles.addWrap}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setPopoverOpen((o) => !o)}
        >
          {t("shootingPlan.picker.addPlan")}
        </button>
        {popoverOpen && (
          <div className={styles.popover} role="menu">
            <div className={styles.popoverLabel}>
              {t("shootingPlan.picker.createAs")}
            </div>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("empty");
              }}
            >
              {t("shootingPlan.picker.empty")}
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("copy");
              }}
              disabled={scenarios.length === 0}
            >
              {t("shootingPlan.picker.copyActive")}
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("pattern");
              }}
            >
              {t("shootingPlan.picker.fromPattern")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
