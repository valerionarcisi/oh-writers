import { useState, useEffect, useCallback } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  blockingQueryOptions,
  saveLocationPrimitives,
} from "../../server/blocking.server";
import {
  BlockingEditorToolbar,
  type EditorTool,
} from "./BlockingEditorToolbar";
import { BlockingEditorCanvas } from "./BlockingEditorCanvas";
import { unwrapResult } from "@oh-writers/utils";
import type { Primitive } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./BlockingEditorPage.module.css";

interface BlockingEditorPageProps {
  sceneId: string;
  planId: string;
  onClose: () => void;
}

export function BlockingEditorPage({
  sceneId,
  planId,
  onClose,
}: BlockingEditorPageProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: raw } = useSuspenseQuery(blockingQueryOptions(sceneId, planId));
  const blocking = unwrapResult(raw);

  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [snapOn, setSnapOn] = useState(true);
  const [history, setHistory] = useState<Primitive[][]>([
    blocking.location.primitives,
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const current = history[historyIdx] ?? blocking.location.primitives;

  const saveMutation = useMutation({
    mutationFn: (primitives: Primitive[]) =>
      saveLocationPrimitives({
        data: { locationId: blocking.locationId, primitives },
      }).then(unwrapResult),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: blockingQueryOptions(sceneId, planId).queryKey,
      });
    },
  });

  const handleChange = useCallback(
    (primitives: Primitive[]) => {
      const next = history.slice(0, historyIdx + 1);
      next.push(primitives);
      setHistory(next);
      setHistoryIdx(next.length - 1);
      void saveMutation.mutateAsync(primitives);
    },
    [history, historyIdx, saveMutation],
  );

  const undo = useCallback(() => {
    if (historyIdx > 0) setHistoryIdx((i) => i - 1);
  }, [historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) setHistoryIdx((i) => i + 1);
  }, [historyIdx, history.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, onClose]);

  return (
    <div className={styles.page}>
      <BlockingEditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        snapOn={snapOn}
        onSnapToggle={() => setSnapOn((s) => !s)}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onClose={onClose}
      />
      <div className={styles.body}>
        <aside className={styles.layers}>
          <p className={styles.layerTitle}>
            {t("shootingPlan.editorPage.layer")}
          </p>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked />{" "}
            {t("shootingPlan.editorPage.location")}
          </label>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked />{" "}
            {t("shootingPlan.editorPage.actors")}
          </label>
          <label className={styles.layerItem}>
            <input type="checkbox" defaultChecked />{" "}
            {t("shootingPlan.editorPage.cameras")}
          </label>
        </aside>
        <main className={styles.canvas}>
          <BlockingEditorCanvas
            primitives={current}
            widthCm={blocking.location.widthCm}
            heightCm={blocking.location.heightCm}
            activeTool={activeTool}
            snapOn={snapOn}
            onChange={handleChange}
          />
        </main>
      </div>
    </div>
  );
}
