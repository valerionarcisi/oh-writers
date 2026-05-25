import { useEffect, useState } from "react";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { FloatingDock } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { useCesareOpen, useSetActiveRequirementId } from "~/features/app-shell";
import type {
  LocationRequirement,
  LocationCandidate,
} from "@oh-writers/domain";
import {
  locationsQueryOptions,
  addLocationCandidate,
  updateLocationCandidate,
  confirmLocationCandidate,
  removeLocationCandidate,
  syncRequirementsFromBreakdown,
} from "../server/locations.server";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import type { DrawnCircle } from "../lib/area-search";
import type { AreaFilterResult } from "../lib/area-filter";
import { useExportLocations } from "../hooks/useExportLocations";
import { LocationMap } from "./LocationMap";
import { LocationPanel } from "./LocationPanel";
import { LocationDetailModal } from "./LocationDetailModal";
import { AreaSearchPanel } from "./AreaSearchPanel";
import { PhotoLightbox, type LightboxPhoto } from "./PhotoLightbox";
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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [detailCandidateId, setDetailCandidateId] = useState<string | null>(
    null,
  );
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(
    null,
  );
  const [drawnCircle, setDrawnCircle] = useState<DrawnCircle | null>(null);
  const [foundPlaces, setFoundPlaces] = useState<PlaceSuggestion[]>([]);
  const [areaFilter, setAreaFilter] = useState<AreaFilterResult | null>(null);
  const [lightbox, setLightbox] = useState<{
    photos: ReadonlyArray<LightboxPhoto>;
    index: number;
  } | null>(null);
  const setActiveRequirementId = useSetActiveRequirementId();

  // Broadcast the selected requirement to Cesare so opening the chat from
  // anywhere on this page carries the location context implicitly.
  useEffect(() => {
    setActiveRequirementId(selectedId);
    return () => setActiveRequirementId(null);
  }, [selectedId, setActiveRequirementId]);

  const handleSelectRequirement = (id: string) => {
    setSelectedId(id);
    setSelectedCandidateId(null);
  };

  const handleMapCandidateSelect = (candidateId: string) => {
    const owningReq = requirements.find((r) =>
      r.candidates.some((c) => c.id === candidateId),
    );
    if (owningReq) setSelectedId(owningReq.id);
    setSelectedCandidateId(candidateId);
  };

  const handleOpenDetailModal = (candidateId: string) => {
    setDetailCandidateId(candidateId);
    handleMapCandidateSelect(candidateId);
  };

  // Test-only hooks: Playwright drives the modal + area-search flows without
  // depending on the Leaflet popup HTML (which is async-loaded). These events
  // are no-ops in production because they fire only when a test dispatches
  // them. Cheaper than waiting for the marker DOM to settle in CI.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) handleOpenDetailModal(detail.id);
    };
    const onDraw = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          lat: number;
          lng: number;
          radius_m: number;
        }>
      ).detail;
      if (
        typeof detail?.lat === "number" &&
        typeof detail?.lng === "number" &&
        typeof detail?.radius_m === "number"
      ) {
        setDrawnCircle({
          lat: detail.lat,
          lng: detail.lng,
          radius_m: detail.radius_m,
        });
      }
    };
    const onOpenLightbox = (e: Event) => {
      const detail = (
        e as CustomEvent<{ candidateId: string; photoIndex: number }>
      ).detail;
      if (!detail?.candidateId) return;
      for (const r of requirements) {
        const c = r.candidates.find((c) => c.id === detail.candidateId);
        if (c && c.photos.length > 0) {
          setLightbox({
            photos: c.photos.map((p) => ({ url: p.url, caption: p.caption })),
            index: Math.max(
              0,
              Math.min(detail.photoIndex ?? 0, c.photos.length - 1),
            ),
          });
          return;
        }
      }
    };
    window.addEventListener("ohw:open-detail-modal", onOpen);
    window.addEventListener("ohw:test-draw-circle", onDraw);
    window.addEventListener("ohw:locations:open-lightbox", onOpenLightbox);
    return () => {
      window.removeEventListener("ohw:open-detail-modal", onOpen);
      window.removeEventListener("ohw:test-draw-circle", onDraw);
      window.removeEventListener("ohw:locations:open-lightbox", onOpenLightbox);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  const invalidate = () =>
    qc.refetchQueries({ queryKey: ["locations", projectId] });

  const syncMutation = useMutation({
    mutationFn: () =>
      syncRequirementsFromBreakdown({ data: { projectId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const addCandidateMutation = useMutation({
    mutationFn: (vars: {
      requirementId: string;
      candidate: Parameters<
        typeof addLocationCandidate
      >[0]["data"]["candidate"];
    }) =>
      addLocationCandidate({
        data: {
          requirementId: vars.requirementId,
          projectId,
          candidate: vars.candidate,
        },
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

  const detailCandidate: LocationCandidate | null = (() => {
    if (!detailCandidateId) return null;
    for (const r of requirements) {
      const c = r.candidates.find((c) => c.id === detailCandidateId);
      if (c) return c;
    }
    return null;
  })();

  const detailRequirementId = detailCandidate
    ? (requirements.find((r) =>
        r.candidates.some((c) => c.id === detailCandidate.id),
      )?.id ?? null)
    : null;

  const handleAreaAddCandidate = (
    requirementId: string,
    suggestion: PlaceSuggestion,
  ) => {
    addCandidateMutation.mutate({
      requirementId,
      candidate: {
        name: suggestion.name,
        address: suggestion.address || null,
        lat: suggestion.lat,
        lng: suggestion.lng,
        aiSuggested: false,
        photoNames: suggestion.photos.map((p) => p.name).slice(0, 3),
      },
    });
  };

  const confirmedCount = requirements.filter(
    (r) => r.status === "confirmed",
  ).length;
  const exportMutation = useExportLocations(projectId);

  return (
    <div className={styles.page} data-testid="locations-page">
      <div className={styles.layout}>
        <div className={styles.listColumn}>
          <LocationPanel
            requirements={requirements}
            selectedId={selectedId}
            onSelect={handleSelectRequirement}
            selectedCandidateId={selectedCandidateId}
            onCandidateSelect={setSelectedCandidateId}
            onCandidateHover={setHoveredCandidateId}
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
            onAskCesare={(requirementId) => openCesare({ requirementId })}
            areaFilter={areaFilter}
            onDismissAreaFilter={() => setAreaFilter(null)}
            highlightedCandidateIds={areaFilter?.matchingCandidateIds ?? []}
          />
        </div>
        <div className={styles.mapColumn}>
          <LocationMap
            requirements={requirements}
            selectedId={selectedId}
            selectedCandidateId={selectedCandidateId}
            hoveredCandidateId={hoveredCandidateId}
            onSelect={handleSelectRequirement}
            onCandidateSelect={handleMapCandidateSelect}
            onOpenDetailModal={handleOpenDetailModal}
            onCircleDrawn={(circle) => {
              setDrawnCircle(circle);
              if (!circle) setFoundPlaces([]);
            }}
            foundPlaces={foundPlaces}
            onFoundPlaceAdd={(suggestion) => {
              if (selectedId) handleAreaAddCandidate(selectedId, suggestion);
            }}
            onAreaFilter={setAreaFilter}
            highlightedCandidateIds={areaFilter?.matchingCandidateIds ?? []}
          />
          {drawnCircle ? (
            <AreaSearchPanel
              circle={drawnCircle}
              requirements={requirements}
              defaultRequirementId={selectedId}
              onClose={() => {
                setDrawnCircle(null);
                setFoundPlaces([]);
              }}
              onAddCandidate={handleAreaAddCandidate}
            />
          ) : null}
        </div>
      </div>

      <LocationDetailModal
        candidate={detailCandidate}
        isOpen={detailCandidate !== null}
        onClose={() => setDetailCandidateId(null)}
        onCenterMap={(candidateId) => {
          handleMapCandidateSelect(candidateId);
        }}
        onUpdate={(candidateId, patch) =>
          updateCandidateMutation.mutate({ candidateId, patch })
        }
        onConfirm={(candidateId) => {
          if (detailRequirementId) {
            confirmMutation.mutate({
              requirementId: detailRequirementId,
              candidateId,
            });
          }
        }}
        onMarkVisited={(candidateId) =>
          updateCandidateMutation.mutate({
            candidateId,
            patch: { status: "visited" },
          })
        }
        onRemove={(candidateId) => removeCandidateMutation.mutate(candidateId)}
      />

      <PhotoLightbox
        photos={lightbox?.photos ?? []}
        initialIndex={lightbox?.index ?? 0}
        isOpen={lightbox !== null}
        onClose={() => setLightbox(null)}
      />

      <FloatingDock
        label="LOCATION"
        infoChips={[
          {
            label: "Confermate",
            value: `${confirmedCount} / ${requirements.length}`,
          },
        ]}
        secondaryActions={[
          {
            label: syncMutation.isPending ? "Sincronizzazione…" : "Sincronizza",
            hotkey: "⌘⇧S",
            onClick: () => syncMutation.mutate(),
            ariaLabel: "Sincronizza da breakdown",
          },
          {
            label: exportMutation.isPending ? "Esportazione…" : "Esporta",
            hotkey: "⌘E",
            onClick: () => exportMutation.mutate(),
          },
        ]}
        cesareNoteCount={0}
        onCesareClick={openCesare}
        data-testid="locations-floating-dock"
      />
    </div>
  );
}
