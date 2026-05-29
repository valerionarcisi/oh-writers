import { useEffect, useMemo, useState } from "react";
import {
  useSuspenseQuery,
  useQuery,
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
import { syncStateQueryOptions } from "~/features/screenplay-editor";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import { discoverPlacesInArea } from "../server/discovery.server";
import { rankPlacesForScene } from "../server/rank.server";
import type { DrawnCircle } from "../lib/area-search";
import type { AreaFilterResult } from "../lib/area-filter";
import { geometryToCircle } from "../lib/area-filter";
import { buildCrossMatches } from "../lib/cross-match";
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
  const { data: syncState } = useQuery(syncStateQueryOptions(projectId));
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
  // Atmosphere ranking (spec 37c): placeId → Cesare reason, set on demand.
  const [rankReasons, setRankReasons] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [rankPending, setRankPending] = useState(false);
  // placeId → best-matching requirement for discovered places, so adding a
  // hollow pin assigns it to the right requirement without asking.
  const [discoveryTargets, setDiscoveryTargets] = useState<
    ReadonlyMap<string, { requirementId: string; requirementName: string }>
  >(new Map());
  const [lightbox, setLightbox] = useState<{
    photos: ReadonlyArray<LightboxPhoto>;
    index: number;
  } | null>(null);
  const setActiveRequirementId = useSetActiveRequirementId();

  // Affinity chips: which OTHER requirements each saved candidate could serve.
  // Recomputed only when the requirements change (resolved types are stable).
  const crossMatches = useMemo(
    () => buildCrossMatches(requirements),
    [requirements],
  );

  // placeId → popup label. Base label is the matched requirement; once ranked,
  // append Cesare's atmosphere reason (spec 37c).
  const foundPlaceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const [placeId, t] of discoveryTargets) {
      const reason = rankReasons.get(placeId);
      labels.set(
        placeId,
        reason ? `${t.requirementName} · ${reason}` : t.requirementName,
      );
    }
    // A place may have a reason without a discovery target (no match) — still show it.
    for (const [placeId, reason] of rankReasons) {
      if (!labels.has(placeId)) labels.set(placeId, reason);
    }
    return labels;
  }, [discoveryTargets, rankReasons]);

  // Discovery (spec 37 Phase 2 + 37b scene-aware): when an area is selected,
  // fetch real places of the SELECTED requirement's type and render them as
  // hollow pins. Re-runs when the selected scene changes. Cleared on dismiss.
  const [discoverySkipped, setDiscoverySkipped] = useState<string | null>(null);
  useEffect(() => {
    // A new area/scene invalidates any prior atmosphere ranking.
    setRankReasons(new Map());
    if (!areaFilter) {
      setFoundPlaces([]);
      setDiscoveryTargets(new Map());
      setDiscoverySkipped(null);
      return;
    }
    const circle =
      areaFilter.kind === "boundary"
        ? geometryToCircle(areaFilter.geojson)
        : drawnCircle;
    if (!circle) return;

    let cancelled = false;
    void (async () => {
      const response = await discoverPlacesInArea({
        data: {
          projectId,
          lat: circle.lat,
          lng: circle.lng,
          radius_m: circle.radius_m,
          requirementId: selectedId ?? undefined,
        },
      });
      if (cancelled || !response.isOk) return;
      const { places, skipped } = response.value;
      setFoundPlaces(places.map((r) => r.suggestion));
      setDiscoverySkipped(skipped ? skipped.type : null);
      setDiscoveryTargets(
        new Map(
          places
            .filter((r) => r.discovered.matches.length > 0)
            .map((r) => [
              r.suggestion.placeId,
              {
                requirementId: r.discovered.matches[0]!.requirementId,
                requirementName: r.discovered.matches[0]!.requirementName,
              },
            ]),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [areaFilter, drawnCircle, projectId, selectedId]);

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
        // Drawing a circle in production also sets the area filter (which drives
        // discovery). Mirror that here so the test hook exercises the same flow.
        setAreaFilter({
          kind: "drawn",
          label: "Area disegnata",
          matchingCandidateIds: [],
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

  // Atmosphere ranking (spec 37c) — on-demand. Reorders foundPlaces by Cesare's
  // mood-fit score and stores a one-line reason per place for the pin popup.
  const handleRankByScene = async () => {
    if (!selectedId || foundPlaces.length === 0 || rankPending) return;
    setRankPending(true);
    try {
      const response = await rankPlacesForScene({
        data: {
          projectId,
          requirementId: selectedId,
          places: foundPlaces.map((p) => ({
            placeId: p.placeId,
            name: p.name,
            types: p.types,
            rating: p.rating,
            priceLevel: p.priceLevel,
            editorialSummary: p.editorialSummary,
          })),
        },
      });
      if (!response.isOk) return;
      const order = new Map(response.value.map((r, i) => [r.placeId, i]));
      setRankReasons(new Map(response.value.map((r) => [r.placeId, r.reason])));
      setFoundPlaces((prev) =>
        [...prev].sort(
          (a, b) =>
            (order.get(a.placeId) ?? 999) - (order.get(b.placeId) ?? 999),
        ),
      );
    } finally {
      setRankPending(false);
    }
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
            crossMatches={crossMatches}
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
            foundPlaceLabels={foundPlaceLabels}
            onFoundPlaceAdd={(suggestion) => {
              // Prefer the requirement the discovery matched this place to;
              // fall back to the currently selected requirement.
              const target =
                discoveryTargets.get(suggestion.placeId)?.requirementId ??
                selectedId;
              if (target) handleAreaAddCandidate(target, suggestion);
            }}
            onAreaFilter={setAreaFilter}
            areaFilter={areaFilter}
            onClearArea={() => {
              setAreaFilter(null);
              setDrawnCircle(null);
            }}
            canRankByScene={foundPlaces.length > 0 && selectedId !== null}
            rankPending={rankPending}
            onRankByScene={handleRankByScene}
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

      {/* Spec 44 TKT-LEAD-01: page CTAs bottom-left; Cesare → BottomDock. */}
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
            label: syncMutation.isPending
              ? "Sincronizzazione…"
              : syncState?.locationsStale
                ? "⚠ Sincronizza"
                : "Sincronizza",
            hotkey: "⌘⇧S",
            onClick: () => syncMutation.mutate(),
            ariaLabel: syncState?.locationsStale
              ? "Location non sincronizzate con la versione attiva"
              : "Sincronizza da breakdown",
          },
          {
            label: exportMutation.isPending ? "Esportazione…" : "Esporta",
            hotkey: "⌘E",
            onClick: () => exportMutation.mutate(),
          },
        ]}
      />
    </div>
  );
}
