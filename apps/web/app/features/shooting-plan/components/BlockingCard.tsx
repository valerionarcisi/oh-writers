import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { blockingQueryOptions } from "../server/blocking.server";
import { useBlocking } from "../hooks/useCesareBlocking";
import { BlockingCanvas } from "./BlockingCanvas";
import { unwrapResult } from "@oh-writers/utils";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";
import styles from "./BlockingCard.module.css";

interface BlockingCardProps {
  sceneId: string;
  planId: string;
  sceneNumber: number | string;
  selectedShotId?: string | null;
  onShotSelect?: (shotId: string) => void;
  onOpenEditor?: () => void;
}

export function BlockingCard({
  sceneId,
  planId,
  sceneNumber,
  selectedShotId,
  onShotSelect,
  onOpenEditor,
}: BlockingCardProps) {
  const { data: raw } = useSuspenseQuery(blockingQueryOptions(sceneId, planId));
  const blocking = unwrapResult(raw);
  const { moveActor, moveCamera } = useBlocking(sceneId, planId);

  const [localActors, setLocalActors] = useState(blocking.actorPositions);
  const [localCameras, setLocalCameras] = useState(blocking.cameraPins);

  useEffect(() => {
    setLocalActors(blocking.actorPositions);
    setLocalCameras(blocking.cameraPins);
  }, [blocking.actorPositions, blocking.cameraPins]);

  const handleActorMove = (castId: string, x: number, y: number) => {
    const updated: ActorPosition[] = localActors.map((a) =>
      a.castId === castId ? { ...a, x, y } : a,
    );
    setLocalActors(updated);
    void moveActor.mutateAsync({
      sceneBlockingId: blocking.sceneBlockingId,
      positions: updated,
    });
  };

  const handleCameraMove = (shotId: string, x: number, y: number) => {
    const updated: CameraPin[] = localCameras.map((c) =>
      c.shotId === shotId ? { ...c, x, y } : c,
    );
    setLocalCameras(updated);
    const pin = updated.find((c) => c.shotId === shotId);
    if (pin) {
      void moveCamera.mutateAsync({
        planSceneCamerasId: blocking.planSceneCamerasId,
        pin,
      });
    }
  };

  return (
    <section
      className={styles.card}
      aria-label={`Blocking — SC.${sceneNumber}`}
    >
      <header className={styles.header}>
        <span className={styles.label}>
          ANTEPRIMA BLOCKING · SC.{sceneNumber}
        </span>
        {blocking.isSuggested && (
          <span className={styles.suggeritoBadge}>SUGGERITO</span>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            disabled
            title="Prossimamente"
          >
            ⌘V Vista 3D
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onOpenEditor}
            title="Apri blocking editor (⌘B)"
          >
            ⌘B Editor
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <dl className={styles.meta}>
            <dt className={styles.metaLabel}>Attori</dt>
            <dd className={styles.metaValue}>
              {localActors.map((a) => a.label).join(" · ") || "—"}
            </dd>
            <dt className={styles.metaLabel}>Camera</dt>
            <dd className={styles.metaValue}>
              {localCameras.length}{" "}
              {localCameras.length === 1 ? "posizione" : "posizioni"}
            </dd>
          </dl>
          {!blocking.detachedActors && (
            <button type="button" className={styles.detachBtn} disabled>
              Detach blocking
            </button>
          )}
        </aside>

        <div className={styles.canvasWrapper}>
          <BlockingCanvas
            primitives={blocking.location.primitives}
            actorPositions={localActors}
            cameraPins={localCameras}
            widthCm={blocking.location.widthCm}
            heightCm={blocking.location.heightCm}
            selectedShotId={selectedShotId}
            onActorMove={handleActorMove}
            onCameraMove={handleCameraMove}
            onPinClick={onShotSelect}
          />
          <div className={styles.legend}>
            <span className={styles.legendItem} data-kind="camera">
              ■ CAMERA
            </span>
            <span className={styles.legendItem} data-kind="actor">
              ● PERSONAGGIO
            </span>
            <span className={styles.legendItem} data-kind="furniture">
              □ ARREDO
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
