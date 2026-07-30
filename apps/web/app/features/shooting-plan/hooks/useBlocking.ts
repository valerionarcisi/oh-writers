import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  saveActorPositions,
  saveCameraPin,
  deleteCameraPin,
  detachBlocking,
  blockingQueryOptions,
} from "../server/blocking.server";
import { unwrapResult } from "@oh-writers/utils";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";

export const useBlocking = (sceneId: string, planId: string) => {
  const qc = useQueryClient();
  const key = blockingQueryOptions(sceneId, planId).queryKey;

  const moveActor = useMutation({
    mutationFn: ({
      sceneBlockingId,
      positions,
      planSceneCamerasId,
    }: {
      sceneBlockingId: string;
      positions: ActorPosition[];
      planSceneCamerasId?: string;
    }) =>
      saveActorPositions({
        data: { sceneBlockingId, positions, planSceneCamerasId },
      }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const moveCamera = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      pin,
    }: {
      planSceneCamerasId: string;
      pin: CameraPin;
    }) =>
      saveCameraPin({ data: { planSceneCamerasId, pin } }).then(unwrapResult),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const removePin = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      shotId,
    }: {
      planSceneCamerasId: string;
      shotId: string;
    }) =>
      deleteCameraPin({ data: { planSceneCamerasId, shotId } }).then(
        unwrapResult,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const detach = useMutation({
    mutationFn: ({
      planSceneCamerasId,
      sceneBlockingId,
    }: {
      planSceneCamerasId: string;
      sceneBlockingId: string;
    }) =>
      detachBlocking({ data: { planSceneCamerasId, sceneBlockingId } }).then(
        unwrapResult,
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return { moveActor, moveCamera, removePin, detach };
};
