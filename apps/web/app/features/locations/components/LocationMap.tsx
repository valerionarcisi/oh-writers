import { useEffect, useRef, useState } from "react";
import type {
  LocationRequirement,
  LocationCandidate,
  LocationPhoto,
} from "@oh-writers/domain";
import { useLeaflet } from "../hooks/useLeaflet";
import { parseDrawnCircle, type DrawnCircle } from "../lib/area-search";
import { fetchOsmBoundary, type NominatimSuggestion } from "../lib/boundary";
import {
  filterCandidatesInPolygon,
  type AreaFilterResult,
} from "../lib/area-filter";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import { NominatimCombobox } from "./NominatimCombobox";
import styles from "./LocationMap.module.css";

export type { AreaFilterResult };

interface LocationMapProps {
  requirements: LocationRequirement[];
  selectedId: string | null;
  selectedCandidateId: string | null;
  /** Candidate being hovered in the list — pin is rendered larger/brighter. */
  hoveredCandidateId?: string | null;
  onSelect: (id: string) => void;
  onCandidateSelect?: (candidateId: string) => void;
  onOpenDetailModal?: (candidateId: string) => void;
  onCircleDrawn?: (circle: DrawnCircle | null) => void;
  /** External pins for area-search results (rendered with a distinct style). */
  foundPlaces?: ReadonlyArray<PlaceSuggestion>;
  /** placeId → best-matching requirement name, shown in the hollow-pin popup. */
  foundPlaceLabels?: ReadonlyMap<string, string>;
  onFoundPlaceAdd?: (suggestion: PlaceSuggestion) => void;
  /**
   * Called when the user selects an administrative area from the map search
   * (boundary filter) or draws a shape (drawn filter). Passes null to clear.
   */
  onAreaFilter?: (result: AreaFilterResult | null) => void;
  /** IDs of candidates that match the active area filter — rendered brighter. */
  highlightedCandidateIds?: ReadonlyArray<string>;
}

const PIN_COLORS: Record<string, string> = {
  confirmed: "#2d6a4f",
  visited: "#1d4ed8",
  candidate: "#88867e",
  rejected: "#b91c1c",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confermata",
  visited: "Visitata",
  candidate: "Candidata",
  rejected: "Scartata",
};

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildPopupHtml = (
  candidate: LocationCandidate,
  requirementName: string,
): string => {
  const color = PIN_COLORS[candidate.status] ?? PIN_COLORS.candidate;
  const statusLabel = STATUS_LABELS[candidate.status] ?? candidate.status;
  const photos: LocationPhoto[] = candidate.photos.slice(0, 3);

  const photoStrip = photos.length
    ? `<div style="display:flex;gap:6px;margin-top:8px">${photos
        .map(
          (p, idx) =>
            `<button type="button" data-candidate-photo="${candidate.id}" data-photo-index="${idx}" title="Apri foto" style="display:block;width:80px;height:60px;border-radius:6px;overflow:hidden;border:1px solid #d8d6cd;padding:0;cursor:pointer;background:#fff;font-family:inherit"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption ?? candidate.name)}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none" /></button>`,
        )
        .join("")}</div>`
    : "";

  const addressLine =
    candidate.address && candidate.lat != null && candidate.lng != null
      ? `<div style="font-size:11px;color:#6e6c66;margin-top:4px">📍 <a href="https://www.google.com/maps?q=${candidate.lat},${candidate.lng}" target="_blank" rel="noopener noreferrer" style="color:#6e6c66;text-decoration:underline">${escapeHtml(candidate.address)}</a></div>`
      : candidate.address
        ? `<div style="font-size:11px;color:#6e6c66;margin-top:4px">📍 ${escapeHtml(candidate.address)}</div>`
        : "";

  return `
    <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:280px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <strong style="font-size:13px;color:#1c1a17">${escapeHtml(candidate.name)}</strong>
        <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:10px;background:${color};color:white">${statusLabel}</span>
      </div>
      <div style="font-size:11px;color:#88867e">Per: ${escapeHtml(requirementName)}</div>
      ${addressLine}
      ${photoStrip}
      <button type="button" data-candidate-details="${candidate.id}" style="margin-top:10px;width:100%;padding:6px 10px;border:1px solid #d8d6cd;border-radius:6px;background:#fff;color:#1c1a17;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Vedi dettagli</button>
    </div>
  `;
};

export function LocationMap({
  requirements,
  selectedId,
  selectedCandidateId,
  hoveredCandidateId = null,
  onSelect,
  onCandidateSelect,
  onOpenDetailModal,
  onCircleDrawn,
  foundPlaces,
  foundPlaceLabels,
  onFoundPlaceAdd,
  onAreaFilter,
  highlightedCandidateIds,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const foundMarkersRef = useRef<Map<string, any>>(new Map());
  // Cluster group that holds discovery hollow pins so dense areas stay readable.
  const foundClusterRef = useRef<any>(null);
  // Tracks whether discovery pins are currently clustered, to detect layout flips.
  const foundLayoutRef = useRef<"direct" | "cluster">("direct");
  const drawLayerRef = useRef<any>(null);
  const searchRingRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null);
  const leafletReady = useLeaflet();

  // Stable refs for handlers so the popup button callback always sees fresh
  // values without re-binding markers on every render.
  const onSelectRef = useRef(onSelect);
  const onCandidateSelectRef = useRef(onCandidateSelect);
  const onOpenDetailModalRef = useRef(onOpenDetailModal);
  const onCircleDrawnRef = useRef(onCircleDrawn);
  const onFoundPlaceAddRef = useRef(onFoundPlaceAdd);
  const onAreaFilterRef = useRef(onAreaFilter);
  const requirementsRef = useRef(requirements);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onCandidateSelectRef.current = onCandidateSelect;
    onOpenDetailModalRef.current = onOpenDetailModal;
    onCircleDrawnRef.current = onCircleDrawn;
    onFoundPlaceAddRef.current = onFoundPlaceAdd;
    onAreaFilterRef.current = onAreaFilter;
    requirementsRef.current = requirements;
  }, [
    onSelect,
    onCandidateSelect,
    onOpenDetailModal,
    onCircleDrawn,
    onFoundPlaceAdd,
    onAreaFilter,
    requirements,
  ]);

  const allCandidates = requirements.flatMap((r) =>
    r.candidates.map((c) => ({ candidate: c, req: r })),
  );
  const selectedCandidatePair = selectedCandidateId
    ? (allCandidates.find((p) => p.candidate.id === selectedCandidateId) ??
      null)
    : null;
  const selectedCandidate = selectedCandidatePair?.candidate ?? null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !leafletReady) return;

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(containerRef.current, {
      center: [45.4654, 9.1859],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomleft" }).addTo(map);

    // Legend
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.innerHTML = `
        <div style="background:rgba(255,255,255,0.92);border:1px solid #d8d6cd;border-radius:8px;padding:10px 12px;font-family:system-ui,sans-serif;font-size:11px;backdrop-filter:blur(8px);margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:8px;height:8px;border-radius:50%;background:#2d6a4f;border:2px solid white"></div><span style="color:#2d6a4f;font-weight:600">Confermata</span></div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:8px;height:8px;border-radius:50%;background:#1d4ed8;border:2px solid white"></div><span style="color:#1d4ed8;font-weight:600">Visitata</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:#88867e;border:2px solid white"></div><span style="color:#6e6c66;font-weight:600">Candidata</span></div>
        </div>`;
      return div;
    };
    legend.addTo(map);

    // Leaflet.draw
    try {
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawLayerRef.current = drawnItems;

      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            shapeOptions: {
              color: "#8b3a1a",
              fillColor: "#f4dccb",
              fillOpacity: 0.3,
            },
            showArea: false,
          },
          circle: {
            shapeOptions: {
              color: "#8b3a1a",
              fillColor: "#f4dccb",
              fillOpacity: 0.3,
            },
          },
          rectangle: false,
          polyline: false,
          marker: false,
          circlemarker: false,
        },
        edit: { featureGroup: drawnItems, remove: true },
      });
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (e: any) => {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);

        const parsed = parseDrawnCircle({
          layerType: e.layerType,
          layer: e.layer,
        });
        // Backward-compat: keep the circle-only callback working.
        onCircleDrawnRef.current?.(parsed);

        // Area-filter: hit-test candidates against the drawn shape.
        const allCandidates = requirementsRef.current.flatMap((r) =>
          r.candidates.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })),
        );

        if (e.layerType === "circle" && parsed) {
          // Convert the circle to a 64-point GeoJSON polygon via @turf/circle,
          // then hit-test candidates. We use a void async IIFE so the event
          // handler can remain synchronous overall.
          void (async () => {
            const { default: turfCircle } = await import("@turf/circle");
            // Pass the raw [lng, lat] coordinate — turfCircle's getCoord()
            // accepts a position array, so we avoid @turf/helpers (its ESM
            // barrel re-exports a type that breaks Vite's strict analysis).
            const circleFeature = turfCircle(
              [parsed.lng, parsed.lat],
              parsed.radius_m / 1000, // km
              { steps: 64, units: "kilometers" },
            );
            const matchingCandidateIds = filterCandidatesInPolygon(
              allCandidates,
              circleFeature.geometry,
            );
            onAreaFilterRef.current?.({
              kind: "drawn",
              label: "Area disegnata",
              matchingCandidateIds,
            });
          })();
        } else if (e.layerType === "polygon") {
          const geojson = e.layer.toGeoJSON().geometry as GeoJSON.Geometry;
          const matchingCandidateIds = filterCandidatesInPolygon(
            allCandidates,
            geojson,
          );
          onAreaFilterRef.current?.({
            kind: "drawn",
            label: "Area disegnata",
            matchingCandidateIds,
          });
        }
      });

      map.on("draw:deleted", () => {
        onCircleDrawnRef.current?.(null);
        onAreaFilterRef.current?.(null);
      });
    } catch {
      // Leaflet.draw not loaded — skip draw controls gracefully
    }

    // Delegate clicks for popup buttons via a single map-container listener.
    // Per-popup binding was racy: when Leaflet swapped popups, `getElement()`
    // could return a stale node and `{ once: true }` consumed the handler the
    // first time it dispatched on the parent wrapper instead of the button.
    // A document-style delegated listener on the map container handles every
    // popup re-render without timing issues.
    const onMapContainerClick = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const detailsBtn = target.closest<HTMLButtonElement>(
        "[data-candidate-details]",
      );
      if (detailsBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = detailsBtn.getAttribute("data-candidate-details");
        if (!id) return;
        if (onOpenDetailModalRef.current) {
          onOpenDetailModalRef.current(id);
          return;
        }
        onCandidateSelectRef.current?.(id);
        const card = document.querySelector<HTMLElement>(
          `[data-testid="candidate-card-${id}"]`,
        );
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          const head = card.querySelector<HTMLButtonElement>("button");
          head?.click();
        }
        return;
      }
      const photoBtn = target.closest<HTMLElement>("[data-candidate-photo]");
      if (photoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const candidateId = photoBtn.getAttribute("data-candidate-photo");
        const photoIndex = Number(
          photoBtn.getAttribute("data-photo-index") ?? "0",
        );
        if (!candidateId) return;
        window.dispatchEvent(
          new CustomEvent("ohw:locations:open-lightbox", {
            detail: { candidateId, photoIndex },
          }),
        );
      }
    };
    const containerEl = containerRef.current;
    containerEl.addEventListener("click", onMapContainerClick);

    mapRef.current = map;
    // Test-only handle so E2E can drive zoom (e.g. to force pin clustering).
    (window as unknown as { __ohwLeafletMap?: unknown }).__ohwLeafletMap = map;

    return () => {
      containerEl.removeEventListener("click", onMapContainerClick);
      map.remove();
      mapRef.current = null;
      delete (window as unknown as { __ohwLeafletMap?: unknown })
        .__ohwLeafletMap;
    };
  }, [leafletReady]);

  // Sync markers — one per candidate
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !leafletReady) return;

    const highlightedIds = new Set(highlightedCandidateIds ?? []);
    const hasAreaFilter = highlightedIds.size > 0;

    const liveIds = new Set<string>();
    for (const { candidate } of allCandidates) {
      if (candidate.lat != null && candidate.lng != null) {
        liveIds.add(candidate.id);
      }
    }

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    for (const { candidate, req } of allCandidates) {
      if (candidate.lat == null || candidate.lng == null) continue;

      const isCandidateSelected = candidate.id === selectedCandidateId;
      const isCandidateHovered = candidate.id === hoveredCandidateId;
      const isReqSelected = req.id === selectedId;
      const isHighlighted = highlightedIds.has(candidate.id);
      const isDimmed = hasAreaFilter && !isHighlighted;
      const color = PIN_COLORS[candidate.status] ?? PIN_COLORS.candidate;

      // Selected > hovered > highlighted > belongs-to-active-req > default
      const radius = isCandidateSelected
        ? 11
        : isCandidateHovered
          ? 10
          : isHighlighted
            ? 9
            : isReqSelected
              ? 8
              : 6;
      const strokeColor =
        isCandidateSelected || isCandidateHovered
          ? "#8b3a1a"
          : isHighlighted
            ? "#f97316"
            : isReqSelected
              ? "#8b3a1a"
              : "white";
      const weight =
        isCandidateSelected || isCandidateHovered || isHighlighted ? 3 : 2;
      const opacity = isDimmed ? 0.35 : 1;

      const existing = markersRef.current.get(candidate.id);
      if (existing) {
        existing.setStyle({
          color: strokeColor,
          fillColor: color,
          radius,
          weight,
          opacity,
          fillOpacity: isDimmed ? 0.35 : 1,
        });
        existing.setPopupContent(buildPopupHtml(candidate, req.name));
        existing.setTooltipContent(
          `<strong style="font-size:11px">${escapeHtml(candidate.name)}</strong><br><span style="font-size:10px;color:#6e6c66">${escapeHtml(req.name)}</span>`,
        );
        continue;
      }

      const marker = L.circleMarker([candidate.lat, candidate.lng], {
        radius,
        color: strokeColor,
        fillColor: color,
        fillOpacity: isDimmed ? 0.35 : 1,
        opacity,
        weight,
      });

      marker.bindTooltip(
        `<strong style="font-size:11px">${escapeHtml(candidate.name)}</strong><br><span style="font-size:10px;color:#6e6c66">${escapeHtml(req.name)}</span>`,
        { direction: "top", offset: [0, -6] },
      );

      marker.bindPopup(buildPopupHtml(candidate, req.name), {
        maxWidth: 300,
        closeButton: true,
        autoPan: true,
      });

      marker.on("click", () => {
        // Prefer the candidate-aware callback (it also moves the requirement
        // selection). Fall back to onSelect so older parents still work.
        if (onCandidateSelectRef.current) {
          onCandidateSelectRef.current(candidate.id);
        } else {
          onSelectRef.current(req.id);
        }
      });

      marker.addTo(map);
      markersRef.current.set(candidate.id, marker);
    }
  }, [
    allCandidates,
    selectedId,
    selectedCandidateId,
    hoveredCandidateId,
    highlightedCandidateIds,
    leafletReady,
  ]);

  // Fly to selected requirement (when no specific candidate is selected)
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !selectedId || !leafletReady || selectedCandidateId)
      return;

    const req = requirements.find((r) => r.id === selectedId);
    if (!req) return;

    const candidate =
      req.candidates.find(
        (c) =>
          (c.status === "confirmed" || c.status === "visited") &&
          c.lat != null &&
          c.lng != null,
      ) ?? req.candidates.find((c) => c.lat != null && c.lng != null);

    if (candidate?.lat != null && candidate?.lng != null) {
      if (searchRingRef.current) {
        map.removeLayer(searchRingRef.current);
        searchRingRef.current = null;
      }
      map.flyTo([candidate.lat, candidate.lng], 15, { duration: 0.8 });
    } else {
      if (searchRingRef.current) {
        map.removeLayer(searchRingRef.current);
      }
      const ring = L.circle([45.4654, 9.1859], {
        radius: 5000,
        color: "#8b3a1a",
        fillColor: "#f4dccb",
        fillOpacity: 0.15,
        weight: 2,
        dashArray: "6 4",
      });
      ring.addTo(map);
      searchRingRef.current = ring;
    }
  }, [selectedId, selectedCandidateId, requirements, leafletReady]);

  // Fly to + open popup for the selected candidate
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !leafletReady || !selectedCandidate) return;

    if (selectedCandidate.lat != null && selectedCandidate.lng != null) {
      if (searchRingRef.current) {
        map.removeLayer(searchRingRef.current);
        searchRingRef.current = null;
      }
      map.flyTo([selectedCandidate.lat, selectedCandidate.lng], 16, {
        duration: 0.8,
      });
      const marker = markersRef.current.get(selectedCandidate.id);
      if (marker && !marker.isPopupOpen?.()) {
        marker.openPopup();
      }
    }
  }, [selectedCandidate, leafletReady]);

  // Sync the "found places" overlay layer — blue ring markers for area-search
  // results. Each carries an "Aggiungi come candidato" popup button.
  //
  // Phase 3: above a density threshold the markers go into a MarkerCluster group
  // so dense areas stay readable; below it (the common case) they are added
  // straight to the map so every pin is individually visible and clickable.
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !leafletReady) return;

    const places = foundPlaces ?? [];

    // Decide layout: cluster only when dense AND markercluster is available.
    const CLUSTER_THRESHOLD = 20;
    const useCluster =
      places.length > CLUSTER_THRESHOLD &&
      typeof L.markerClusterGroup === "function";

    if (useCluster && !foundClusterRef.current) {
      foundClusterRef.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        animate: false,
        zoomToBoundsOnClick: true,
      });
      map.addLayer(foundClusterRef.current);
    }
    // Tear down the cluster group when we drop back below the threshold.
    if (!useCluster && foundClusterRef.current) {
      map.removeLayer(foundClusterRef.current);
      foundClusterRef.current = null;
    }
    const cluster = useCluster ? foundClusterRef.current : null;
    const addLayer = (m: any) =>
      cluster ? cluster.addLayer(m) : map.addLayer(m);

    // On a layout flip (direct↔cluster), drop all existing markers from the old
    // layer so they are re-added below to the new one.
    const nextLayout = useCluster ? "cluster" : "direct";
    if (foundLayoutRef.current !== nextLayout) {
      foundMarkersRef.current.forEach((marker) => {
        if (foundLayoutRef.current === "cluster" && foundClusterRef.current) {
          foundClusterRef.current.removeLayer(marker);
        } else {
          map.removeLayer(marker);
        }
      });
      foundMarkersRef.current.clear();
      foundLayoutRef.current = nextLayout;
    }

    const removeLayer = (m: any) =>
      cluster ? cluster.removeLayer(m) : map.removeLayer(m);

    const liveIds = new Set(places.map((p) => p.placeId));

    foundMarkersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        removeLayer(marker);
        foundMarkersRef.current.delete(id);
      }
    });

    for (const place of places) {
      if (!place.lat || !place.lng || !place.placeId) continue;
      if (foundMarkersRef.current.has(place.placeId)) continue;

      // Use a divIcon marker (not circleMarker) so MarkerCluster can manage it
      // in the marker pane — circleMarkers live in the SVG overlay pane and are
      // not reliably clustered. The icon mimics the blue ring style.
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: "ohw-discovery-pin",
          html: '<span class="ohw-discovery-dot"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      });

      marker.bindTooltip(
        `<strong style="font-size:11px">${escapeHtml(place.name)}</strong><br><span style="font-size:10px;color:#6e6c66">${escapeHtml(place.address)}</span>`,
        { direction: "top", offset: [0, -6] },
      );

      const safeId = escapeHtml(place.placeId);
      const matchLabel = foundPlaceLabels?.get(place.placeId);
      const matchLine = matchLabel
        ? `<div style="font-size:11px;color:#1d4ed8;margin-top:6px;font-weight:600">→ adatto a: ${escapeHtml(matchLabel)}</div>`
        : "";
      marker.bindPopup(
        `
        <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:280px">
          <strong style="font-size:13px;color:#1c1a17">${escapeHtml(place.name)}</strong>
          <div style="font-size:11px;color:#6e6c66;margin-top:4px">${escapeHtml(place.address)}</div>
          ${matchLine}
          <button type="button" data-found-add="${safeId}" style="margin-top:10px;width:100%;padding:6px 10px;border:1px solid #1d4ed8;border-radius:6px;background:#1d4ed8;color:white;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">+ Aggiungi come candidato</button>
        </div>
      `,
        { maxWidth: 300, closeButton: true, autoPan: true },
      );

      marker.on("popupopen", (e: any) => {
        const popupNode: HTMLElement | null = e.popup?.getElement?.() ?? null;
        const btn = popupNode?.querySelector<HTMLButtonElement>(
          `[data-found-add="${safeId}"]`,
        );
        if (!btn) return;
        btn.addEventListener(
          "click",
          () => {
            onFoundPlaceAddRef.current?.(place);
            marker.closePopup();
          },
          { once: true },
        );
      });

      addLayer(marker);
      foundMarkersRef.current.set(place.placeId, marker);
    }
  }, [foundPlaces, foundPlaceLabels, leafletReady]);

  return (
    <div className={styles.mapWrap}>
      <div ref={containerRef} className={styles.map} />
      <MapSearchOverlay
        mapRef={mapRef}
        boundaryLayerRef={boundaryLayerRef}
        requirements={requirements}
        onAreaFilter={onAreaFilter}
      />
    </div>
  );
}

// ── Map search overlay ──────────────────────────────────────────────────────
// A NominatimCombobox anchored top-left of the map.
// - Non-administrative result: fly to the location, clear any boundary filter.
// - Administrative result: fetch the OSM boundary polygon, draw it on the map,
//   run a point-in-polygon hit-test against all candidates, emit onAreaFilter.
function MapSearchOverlay({
  mapRef,
  boundaryLayerRef,
  requirements,
  onAreaFilter,
}: {
  readonly mapRef: React.MutableRefObject<any>;
  readonly boundaryLayerRef: React.MutableRefObject<any>;
  readonly requirements: LocationRequirement[];
  readonly onAreaFilter?: (result: AreaFilterResult | null) => void;
}) {
  const [query, setQuery] = useState("");

  const clearBoundaryLayer = () => {
    const map = mapRef.current;
    if (map && boundaryLayerRef.current) {
      map.removeLayer(boundaryLayerRef.current);
      boundaryLayerRef.current = null;
    }
  };

  const handleSelect = async (suggestion: NominatimSuggestion) => {
    setQuery(suggestion.name);
    const map = mapRef.current;
    if (!map) return;

    clearBoundaryLayer();

    if (!suggestion.isAdministrative) {
      map.setView([suggestion.lat, suggestion.lng], 16, { animate: true });
      onAreaFilter?.(null);
      return;
    }

    // Fetch the boundary polygon from Nominatim
    const geometry = await fetchOsmBoundary(
      suggestion.osmId,
      suggestion.osmType,
    );

    if (!geometry) {
      // Nominatim has no polygon — just fly to the point and clear filter
      map.setView([suggestion.lat, suggestion.lng], 14, { animate: true });
      onAreaFilter?.(null);
      return;
    }

    // Draw the boundary on the map
    const L = (window as any).L;
    if (L) {
      const layer = L.geoJSON(geometry, {
        style: {
          color: "#8b3a1a",
          fillColor: "rgba(139,58,26,0.12)",
          fillOpacity: 1,
          weight: 2,
          dashArray: "6 4",
          opacity: 0.8,
        },
      });
      layer.addTo(map);
      boundaryLayerRef.current = layer;

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [24, 24], duration: 0.8 });
      }
    }

    // Hit-test all candidates
    const allCandidates = requirements.flatMap((r) =>
      r.candidates.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })),
    );

    const matchingCandidateIds = filterCandidatesInPolygon(
      allCandidates,
      geometry,
    );

    onAreaFilter?.({
      kind: "boundary",
      label: suggestion.name,
      matchingCandidateIds,
      geojson: geometry,
    });
  };

  return (
    <div className={styles.searchOverlay}>
      <NominatimCombobox
        value={query}
        onChange={setQuery}
        onSelect={handleSelect}
        placeholder="Cerca un luogo sulla mappa…"
        inputTestId="map-search-input"
      />
    </div>
  );
}
