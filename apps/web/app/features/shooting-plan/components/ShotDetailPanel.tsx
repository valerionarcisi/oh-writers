import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { ShotSizes, CameraMovements, CameraLabels } from "@oh-writers/domain";
import { updateShot, deleteShot } from "../server/shooting-plan.server";
import type { ShotView } from "../server/shooting-plan.server";
import styles from "./ShotDetailPanel.module.css";

interface ShotDetailPanelProps {
  shot: ShotView;
  shotPlanId: string;
  projectId: string;
  sceneId: string;
  onClose: () => void;
}

export function ShotDetailPanel({
  shot,
  shotPlanId,
  projectId,
  sceneId,
  onClose,
}: ShotDetailPanelProps) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["shot-plan", sceneId] });

  const [minutes, setMinutes] = useState<string>(
    shot.estimatedMinutes?.toString() ?? "",
  );
  useEffect(() => {
    setMinutes(shot.estimatedMinutes?.toString() ?? "");
  }, [shot.id, shot.estimatedMinutes]);

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateShot>[0]["data"]["patch"]) =>
      updateShot({
        data: { shotId: shot.id, shotPlanId, projectId, patch },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteShot({ data: { shotId: shot.id, shotPlanId, projectId } }).then(
        unwrapResult,
      ),
    onSuccess: () => {
      onClose();
      void invalidate();
    },
  });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Shot {shot.position + 1}</span>
        <button type="button" className={styles.close} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Dimensione</span>
          <select
            className={styles.select}
            value={shot.shotSize}
            onChange={(e) =>
              updateMutation.mutate({
                shotSize: e.target.value as ShotView["shotSize"],
              })
            }
          >
            {Object.values(ShotSizes).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Movimento</span>
          <select
            className={styles.select}
            value={shot.cameraMovement}
            onChange={(e) =>
              updateMutation.mutate({
                cameraMovement: e.target.value as ShotView["cameraMovement"],
              })
            }
          >
            {Object.values(CameraMovements).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Camera</span>
          <select
            className={styles.select}
            value={shot.cameraLabel}
            onChange={(e) =>
              updateMutation.mutate({
                cameraLabel: e.target.value as "A" | "B" | "C" | "D",
              })
            }
          >
            {Object.values(CameraLabels).map((c) => (
              <option key={c} value={c}>
                Cam {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Minuti
            <span className={styles.autoHint}>
              auto: {shot.resolvedMinutes}m
            </span>
          </span>
          <input
            type="number"
            className={styles.input}
            min={1}
            max={480}
            step={5}
            placeholder={`${shot.resolvedMinutes} (auto)`}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={() => {
              const v = minutes === "" ? null : Number(minutes);
              updateMutation.mutate({ estimatedMinutes: v });
            }}
          />
          {minutes !== "" && (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                setMinutes("");
                updateMutation.mutate({ estimatedMinutes: null });
              }}
            >
              reset auto
            </button>
          )}
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Note</span>
          <textarea
            className={styles.textarea}
            defaultValue={shot.notes ?? ""}
            onBlur={(e) =>
              updateMutation.mutate({ notes: e.target.value || null })
            }
            rows={3}
          />
        </label>
      </div>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={() => deleteMutation.mutate()}
      >
        Elimina shot
      </button>
    </div>
  );
}
