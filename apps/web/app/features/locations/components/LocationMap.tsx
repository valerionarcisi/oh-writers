import { useEffect, useRef } from "react";
import type { LocationRequirement } from "@oh-writers/domain";
import { useLeaflet } from "../hooks/useLeaflet";
import styles from "./LocationMap.module.css";

interface LocationMapProps {
  requirements: LocationRequirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const PIN_COLORS: Record<string, string> = {
  confirmed: "#2d6a4f",
  visited: "#1d4ed8",
  candidate: "#88867e",
};

export function LocationMap({ requirements, selectedId, onSelect }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const drawLayerRef = useRef<any>(null);
  const searchRingRef = useRef<any>(null);
  const leafletReady = useLeaflet();

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
            shapeOptions: { color: "#8b3a1a", fillColor: "#f4dccb", fillOpacity: 0.3 },
            showArea: false,
          },
          circle: {
            shapeOptions: { color: "#8b3a1a", fillColor: "#f4dccb", fillOpacity: 0.3 },
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
      });
    } catch {
      // Leaflet.draw not loaded — skip draw controls gracefully
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [leafletReady]);

  // Sync markers whenever requirements change
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !leafletReady) return;

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!requirements.find((r) => r.id === id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    for (const req of requirements) {
      const candidate = req.candidates.find(
        (c) =>
          c.status === "confirmed" ||
          c.status === "visited" ||
          c.status === "candidate",
      );
      if (!candidate?.lat || !candidate?.lng) continue;

      const isSelected = req.id === selectedId;
      const color =
        candidate.status === "confirmed"
          ? PIN_COLORS.confirmed
          : candidate.status === "visited"
            ? PIN_COLORS.visited
            : PIN_COLORS.candidate;

      const existing = markersRef.current.get(req.id);
      if (existing) {
        existing.setStyle({
          color: isSelected ? "#8b3a1a" : color,
          fillColor: color,
          radius: isSelected ? 10 : 7,
          weight: isSelected ? 3 : 2,
        });
        continue;
      }

      const marker = L.circleMarker([candidate.lat, candidate.lng], {
        radius: isSelected ? 10 : 7,
        color: isSelected ? "#8b3a1a" : color,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      });

      marker.bindTooltip(
        `<strong style="font-size:11px">${req.name}</strong><br><span style="font-size:10px;color:#6e6c66">${candidate.name}</span>`,
        { direction: "top", offset: [0, -6] },
      );

      marker.on("click", () => onSelect(req.id));
      marker.addTo(map);
      markersRef.current.set(req.id, marker);
    }
  }, [requirements, selectedId, onSelect, leafletReady]);

  // Fly to selected requirement
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !selectedId || !leafletReady) return;

    const req = requirements.find((r) => r.id === selectedId);
    if (!req) return;

    const candidate = req.candidates.find(
      (c) => c.status === "confirmed" || c.status === "visited",
    );

    if (candidate?.lat && candidate?.lng) {
      // Remove pending ring if exists
      if (searchRingRef.current) {
        map.removeLayer(searchRingRef.current);
        searchRingRef.current = null;
      }
      map.flyTo([candidate.lat, candidate.lng], 15, { duration: 0.8 });
    } else {
      // Show search ring for requirements without a location
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
  }, [selectedId, requirements, leafletReady]);

  return (
    <div className={styles.mapWrap}>
      <div ref={containerRef} className={styles.map} />
    </div>
  );
}
