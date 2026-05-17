import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Viewbar, FloatingDock } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useCesareOpen } from "~/features/app-shell";
import type { LocationRequirement, LocationCandidate } from "@oh-writers/domain";
import {
  locationsQueryOptions,
  addLocationCandidate,
  updateLocationCandidate,
  confirmLocationCandidate,
  removeLocationCandidate,
  syncRequirementsFromBreakdown,
} from "../server/locations.server";
import { LocationMap } from "./LocationMap";
import { LocationPanel } from "./LocationPanel";
import styles from "./LocationsPage.module.css";

interface LocationsPageProps {
  projectId: string;
}

export function LocationsPage({ projectId }: LocationsPageProps) {
  const qc = useQueryClient();
  const openCesare = useCesareOpen();
  const { data } = useSuspenseQuery(locationsQueryOptions(projectId));
  const requirements: LocationRequirement[] = data?.isOk ? data.value : [];

  const [selectedId, setSelectedId] = useState<string | null>(
    requirements[0]?.id ?? null,
  );
  const selectedReq = requirements.find((r) => r.id === selectedId) ?? null;

  const invalidate = () => qc.refetchQueries({ queryKey: ["locations", projectId] });

  const syncMutation = useMutation({
    mutationFn: () =>
      syncRequirementsFromBreakdown({ data: { projectId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addCandidateMutation = useMutation({
    mutationFn: (vars: {
      requirementId: string;
      candidate: Parameters<typeof addLocationCandidate>[0]["data"]["candidate"];
    }) =>
      addLocationCandidate({
        data: { requirementId: vars.requirementId, projectId, candidate: vars.candidate },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const updateCandidateMutation = useMutation({
    mutationFn: (vars: {
      candidateId: string;
      patch: Parameters<typeof updateLocationCandidate>[0]["data"]["patch"];
    }) =>
      updateLocationCandidate({
        data: { candidateId: vars.candidateId, projectId, patch: vars.patch },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const confirmMutation = useMutation({
    mutationFn: (vars: { requirementId: string; candidateId: string }) =>
      confirmLocationCandidate({
        data: { ...vars, projectId },
      }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const removeCandidateMutation = useMutation({
    mutationFn: (candidateId: string) =>
      removeLocationCandidate({ data: { candidateId, projectId } }).then(
        unwrapResult,
      ),
    onSuccess: invalidate,
  });

  const confirmedCount = requirements.filter((r) => r.status === "confirmed").length;

  return (
    <div className={styles.page} data-testid="locations-page">
      <Viewbar isScrolled={false} className={styles.viewbar}>
        <span className={styles.viewbarTitle}>
          LOCATION ·{" "}
          <strong>{confirmedCount}</strong> / {requirements.length} confermate
        </span>
        <span className={styles.viewbarRight} />
        <button
          type="button"
          className={styles.syncBtn}
          data-testid="sync-from-breakdown-btn"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Sincronizzazione…" : "↑ Sincronizza da breakdown"}
        </button>
      </Viewbar>

      <div className={styles.layout}>
        <LocationMap
          requirements={requirements}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <LocationPanel
          requirements={requirements}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddCandidate={(requirementId, candidate) =>
            addCandidateMutation.mutate({ requirementId, candidate })
          }
          onUpdateCandidate={(candidateId, patch) =>
            updateCandidateMutation.mutate({ candidateId, patch })
          }
          onConfirm={(requirementId, candidateId) =>
            confirmMutation.mutate({ requirementId, candidateId })
          }
          onRemoveCandidate={(candidateId) =>
            removeCandidateMutation.mutate(candidateId)
          }
        />
      </div>

      <FloatingDock
        label="LOCATION"
        primaryAction={{
          label: "Aggiungi location",
          hotkey: "⌘⇧L",
          onClick: () => undefined,
        }}
        secondaryActions={[
          { label: "Esporta", hotkey: "⌘E", onClick: () => undefined },
        ]}
        cesareNoteCount={0}
        onCesareClick={openCesare}
      />
    </div>
  );
}
