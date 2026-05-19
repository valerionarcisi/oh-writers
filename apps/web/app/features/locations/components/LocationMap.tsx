import { useEffect, useRef, useState } from "react";
import type {
  LocationRequirement,
  LocationCandidate,
  LocationPhoto,
} from "@oh-writers/domain";
import { useLeaflet } from "../hooks/useLeaflet";
import { parseDrawnCircle, type DrawnCircle } from "../lib/area-search";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import { PlacesCombobox } from "./PlacesCombobox";
import styles from "./LocationMap.module.css";

interface LocationMapProps {
  requirements: LocationRequirement[];
  selectedId: string | null;
  selectedCandidateId: string | null;
  onSelect: (id: string) => void;
  onCandidateSelect?: (candidateId: string) => void;
  onOpenDetailModal?: (candidateId: string) => void;
  onCircleDrawn?: (circle: DrawnCircle | null) => void;
  /** External pins for area-search results (rendered with a distinct style). */
  foundPlaces?: ReadonlyArray<PlaceSuggestion>;
  onFoundPlaceAdd?: (suggestion: PlaceSuggestion) => void;
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
  onSelect,
  onCandidateSelect,
  onOpenDetailModal,
  onCircleDrawn,
  foundPlaces,
  onFoundPlaceAdd,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const foundMarkersRef = useRef<Map<string, any>>(new Map());
  const drawLayerRef = useRef<any>(null);
  const searchRingRef = useRef<any>(null);
  const leafletReady = useLeaflet();

  // Stable refs for handlers so the popup button callback always sees fresh
  // values without re-binding markers on every render.
  const onSelectRef = useRef(onSelect);
  const onCandidateSelectRef = useRef(onCandidateSelect);
  const onOpenDetailModalRef = useRef(onOpenDetailModal);
  const onCircleDrawnRef = useRef(onCircleDrawn);
  const onFoundPlaceAddRef = useRef(onFoundPlaceAdd);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onCandidateSelectRef.current = onCandidateSelect;
    onOpenDetailModalRef.current = onOpenDetailModal;
    onCircleDrawnRef.current = onCircleDrawn;
    onFoundPlaceAddRef.current = onFoundPlaceAdd;
  }, [
    onSelect,
    onCandidateSelect,
    onOpenDetailModal,
    onCircleDrawn,
    onFoundPlaceAdd,
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

        // Publish the parsed circle so the parent can render the area-search
        // panel. Non-circle shapes (e.g. polygon) leave the panel closed —
        // the panel is intentionally scoped to "draw a circle" UX for now.
        const parsed = parseDrawnCircle({
          layerType: e.layerType,
          layer: e.layer,
        });
        onCircleDrawnRef.current?.(parsed);
      });

      map.on("draw:deleted", () => {
        onCircleDrawnRef.current?.(null);
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

    return () => {
      containerEl.removeEventListener("click", onMapContainerClick);
      map.remove();
      mapRef.current = null;
    };
  }, [leafletReady]);

  // Sync markers — one per candidate
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !leafletReady) return;

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
      const isReqSelected = req.id === selectedId;
      const color = PIN_COLORS[candidate.status] ?? PIN_COLORS.candidate;

      // Selected candidate gets the strongest emphasis; otherwise the marker
      // belongs to the active requirement → mild emphasis; otherwise default.
      const radius = isCandidateSelected ? 11 : isReqSelected ? 8 : 6;
      const strokeColor = isCandidateSelected
        ? "#8b3a1a"
        : isReqSelected
          ? "#8b3a1a"
          : "white";
      const weight = isCandidateSelected ? 3 : isReqSelected ? 2 : 2;

      const existing = markersRef.current.get(candidate.id);
      if (existing) {
        existing.setStyle({
          color: strokeColor,
          fillColor: color,
          radius,
          weight,
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
        fillOpacity: 1,
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
  }, [allCandidates, selectedId, selectedCandidateId, leafletReady]);

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
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !leafletReady) return;

    const places = foundPlaces ?? [];
    const liveIds = new Set(places.map((p) => p.placeId));

    foundMarkersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        map.removeLayer(marker);
        foundMarkersRef.current.delete(id);
      }
    });

    for (const place of places) {
      if (!place.lat || !place.lng || !place.placeId) continue;
      if (foundMarkersRef.current.has(place.placeId)) continue;

      const marker = L.circleMarker([place.lat, place.lng], {
        radius: 8,
        color: "#1d4ed8",
        fillColor: "#dbeafe",
        fillOpacity: 0.9,
        weight: 3,
      });

      marker.bindTooltip(
        `<strong style="font-size:11px">${escapeHtml(place.name)}</strong><br><span style="font-size:10px;color:#6e6c66">${escapeHtml(place.address)}</span>`,
        { direction: "top", offset: [0, -6] },
      );

      const safeId = escapeHtml(place.placeId);
      marker.bindPopup(
        `
        <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:280px">
          <strong style="font-size:13px;color:#1c1a17">${escapeHtml(place.name)}</strong>
          <div style="font-size:11px;color:#6e6c66;margin-top:4px">${escapeHtml(place.address)}</div>
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

      marker.addTo(map);
      foundMarkersRef.current.set(place.placeId, marker);
    }
  }, [foundPlaces, leafletReady]);

  return (
    <div className={styles.mapWrap}>
      <div ref={containerRef} className={styles.map} />
      <MapSearchOverlay
        onSelect={(s) => {
          const map = mapRef.current;
          if (!map) return;
          map.setView([s.lat, s.lng], 16, { animate: true });
        }}
      />
    </div>
  );
}

// ── Map search overlay ──────────────────────────────────────────────────────
// A small PlacesCombobox anchored top-left of the map. Picking a result
// re-centres the map on the chosen place; no candidate is added — the user
// can then open the popup and decide what to do (add candidate from the
// AreaSearchPanel, drop a marker manually, etc).
function MapSearchOverlay({
  onSelect,
}: {
  readonly onSelect: (s: PlaceSuggestion) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className={styles.searchOverlay}>
      <PlacesCombobox
        value={query}
        onChange={setQuery}
        onSelect={(s) => {
          onSelect(s);
          setQuery(s.name);
        }}
        placeholder="Cerca un luogo sulla mappa…"
        inputTestId="map-search-input"
      />
    </div>
  );
}
