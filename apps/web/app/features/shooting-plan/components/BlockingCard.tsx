import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { blockingQueryOptions } from "../server/blocking.server";
import { useBlocking } from "../hooks/useBlocking";
import { BlockingCanvas, type ProposedBlockingChange } from "./BlockingCanvas";
import { BlockingProposalPanel } from "./BlockingProposalPanel";
import { unwrapResult } from "@oh-writers/utils";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./BlockingCard.module.css";

interface BlockingProposalEventDetail {
  readonly sceneId?: string;
  readonly proposalId?: string;
  readonly suggestions?: ReadonlyArray<unknown>;
}

const toProposedChanges = (
  raw: ReadonlyArray<unknown>,
): ProposedBlockingChange[] => {
  const out: ProposedBlockingChange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    if (i["kind"] === "actor" && typeof i["castId"] === "string") {
      out.push({
        kind: "actor",
        castId: i["castId"] as string,
        label: typeof i["label"] === "string" ? (i["label"] as string) : "",
        x: typeof i["x"] === "number" ? (i["x"] as number) : 0,
        y: typeof i["y"] === "number" ? (i["y"] as number) : 0,
      });
    } else if (i["kind"] === "camera" && typeof i["shotId"] === "string") {
      out.push({
        kind: "camera",
        shotId: i["shotId"] as string,
        label: typeof i["label"] === "string" ? (i["label"] as string) : "",
        x: typeof i["x"] === "number" ? (i["x"] as number) : 0,
        y: typeof i["y"] === "number" ? (i["y"] as number) : 0,
        coneDirection:
          typeof i["coneDirection"] === "number"
            ? (i["coneDirection"] as number)
            : 180,
        coneAngle:
          typeof i["coneAngle"] === "number" ? (i["coneAngle"] as number) : 45,
      });
    }
  }
  return out;
};

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
  const { t } = useTranslation();
  const { data: raw } = useSuspenseQuery(blockingQueryOptions(sceneId, planId));
  const blocking = unwrapResult(raw);
  const { moveActor, moveCamera } = useBlocking(sceneId, planId);

  const [localActors, setLocalActors] = useState(blocking.actorPositions);
  const [localCameras, setLocalCameras] = useState(blocking.cameraPins);
  const [proposals, setProposals] = useState<
    ReadonlyArray<ProposedBlockingChange>
  >([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setLocalActors(blocking.actorPositions);
    setLocalCameras(blocking.cameraPins);
  }, [blocking.actorPositions, blocking.cameraPins]);

  useEffect(() => {
    const onProposal = (event: Event) => {
      const detail = (event as CustomEvent<BlockingProposalEventDetail>).detail;
      if (!detail) return;
      if (detail.sceneId && detail.sceneId !== sceneId) return;
      if (!Array.isArray(detail.suggestions)) return;
      setProposals(toProposedChanges(detail.suggestions));
    };
    window.addEventListener("ohw:cesare:blocking-proposal", onProposal);
    return () =>
      window.removeEventListener("ohw:cesare:blocking-proposal", onProposal);
  }, [sceneId]);

  // Internal helper that does NOT flip isApplying — used by handleAcceptAll
  // so the spinner stays on for the whole batch.
  const handleAcceptOneInternal = async (item: ProposedBlockingChange) => {
    if (item.kind === "actor") {
      const exists = localActors.some((a) => a.castId === item.castId);
      const newActor: ActorPosition = {
        castId: item.castId,
        label: item.label,
        x: item.x,
        y: item.y,
        arrow: null,
      };
      const final: ActorPosition[] = exists
        ? localActors.map((a) =>
            a.castId === item.castId ? { ...a, x: item.x, y: item.y } : a,
          )
        : [...localActors, newActor];
      setLocalActors(final);
      await moveActor.mutateAsync({
        sceneBlockingId: blocking.sceneBlockingId,
        positions: final,
      });
    } else {
      const existingPin = localCameras.find((c) => c.shotId === item.shotId);
      const merged: CameraPin = existingPin
        ? {
            ...existingPin,
            x: item.x,
            y: item.y,
            coneDirection: item.coneDirection,
            coneAngle: item.coneAngle,
          }
        : {
            shotId: item.shotId,
            label: item.label,
            x: item.x,
            y: item.y,
            coneDirection: item.coneDirection,
            coneAngle: item.coneAngle,
            movement: null,
          };
      const updated: CameraPin[] = existingPin
        ? localCameras.map((c) => (c.shotId === item.shotId ? merged : c))
        : [...localCameras, merged];
      setLocalCameras(updated);
      await moveCamera.mutateAsync({
        planSceneCamerasId: blocking.planSceneCamerasId,
        pin: merged,
      });
    }
  };

  const handleAcceptOne = async (item: ProposedBlockingChange) => {
    setIsApplying(true);
    try {
      await handleAcceptOneInternal(item);
      setProposals((prev) => prev.filter((p) => p !== item));
    } finally {
      setIsApplying(false);
    }
  };

  const handleAcceptAll = async () => {
    setIsApplying(true);
    try {
      for (const p of proposals) {
        // eslint-disable-next-line no-await-in-loop
        await handleAcceptOneInternal(p);
      }
      setProposals([]);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRejectOne = (item: ProposedBlockingChange) => {
    setProposals((prev) => prev.filter((p) => p !== item));
  };

  const handleRejectAll = () => {
    setProposals([]);
  };

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

  const handleCameraRotate = (shotId: string, coneDirection: number) => {
    const updated: CameraPin[] = localCameras.map((c) =>
      c.shotId === shotId ? { ...c, coneDirection } : c,
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
      aria-label={t("shootingPlan.blocking.cardAria").replace(
        "{value}",
        String(sceneNumber),
      )}
    >
      <header className={styles.header}>
        <span className={styles.label}>
          {t("shootingPlan.blocking.previewLabel").replace(
            "{value}",
            String(sceneNumber),
          )}
        </span>
        {blocking.isSuggested && (
          <span className={styles.suggeritoBadge}>
            {t("shootingPlan.blocking.suggestedBadge")}
          </span>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            disabled
            title={t("shootingPlan.blocking.comingSoon")}
          >
            {t("shootingPlan.blocking.view3d")}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onOpenEditor}
            title={t("shootingPlan.blocking.openEditorTitle")}
          >
            {t("shootingPlan.blocking.editor")}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <dl className={styles.meta}>
            <dt className={styles.metaLabel}>
              {t("shootingPlan.blocking.actors")}
            </dt>
            <dd className={styles.metaValue}>
              {localActors.map((a) => a.label).join(" · ") || "—"}
            </dd>
            <dt className={styles.metaLabel}>
              {t("shootingPlan.blocking.camera")}
            </dt>
            <dd className={styles.metaValue}>
              {localCameras.length}{" "}
              {localCameras.length === 1
                ? t("shootingPlan.blocking.positionSingular")
                : t("shootingPlan.blocking.positionPlural")}
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
            proposedChanges={proposals}
            onActorMove={handleActorMove}
            onCameraMove={handleCameraMove}
            onCameraRotate={handleCameraRotate}
            onPinClick={onShotSelect}
          />
          {proposals.length > 0 && (
            <BlockingProposalPanel
              proposals={proposals}
              onAcceptAll={() => void handleAcceptAll()}
              onRejectAll={handleRejectAll}
              onAcceptOne={(item) => void handleAcceptOne(item)}
              onRejectOne={handleRejectOne}
              isApplying={isApplying}
            />
          )}
          <div
            className={styles.legend}
            aria-label={t("shootingPlan.blocking.legendAria")}
          >
            <span
              className={styles.legendItem}
              data-kind="camera"
              aria-label={t("shootingPlan.blocking.legendCamera")}
            >
              {t("shootingPlan.blocking.legendCamera")}
            </span>
            <span
              className={styles.legendItem}
              data-kind="actor"
              aria-label={t("shootingPlan.blocking.legendCharacter")}
            >
              {t("shootingPlan.blocking.legendCharacter")}
            </span>
            <span
              className={styles.legendItem}
              data-kind="furniture"
              aria-label={t("shootingPlan.blocking.legendFurniture")}
            >
              {t("shootingPlan.blocking.legendFurniture")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
