"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Types for our data
export interface SoilDataRow {
  code: string;
  type: string;
  upper_depth: number;
  lower_depth: number;
  longitude: number;
  latitude: number;
  project_name?: string;
  site_code?: string;
  profile_code?: string;
  element_id?: number | string;
  [key: string]: unknown;
}

interface MapViewProps {
  data: SoilDataRow[];
  selectedCodes: Set<string>;
  onSelectCodes: (codes: Set<string>) => void;
}

// Dynamic import to avoid SSR issues with Leaflet
function MapViewInner({ data, selectedCodes, onSelectCodes }: MapViewProps) {
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").CircleMarker[]>([]);
  const rectRef = useRef<import("leaflet").Rectangle | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<import("leaflet").LatLng | null>(null);
  const drawModeRef = useRef(false);

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      setL(leaflet);
    });
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || data.length === 0) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    const map = L.map(mapRef.current, {
      boxZoom: false, // Disable default box zoom so Shift+drag can be used for selection
    }).setView([0, 0], 2);
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Clear old markers
    markersRef.current = [];

    const validData = data.filter(
      (d) => d.latitude != null && d.longitude != null && !isNaN(d.latitude) && !isNaN(d.longitude)
    );

    if (validData.length === 0) return;

    // Add markers
    for (const row of validData) {
      const isSelected = selectedCodes.size === 0 || selectedCodes.has(row.code);
      const marker = L.circleMarker([row.latitude, row.longitude], {
        radius: 7,
        fillColor: isSelected ? "#E42D3A" : "#ccc",
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: isSelected ? 0.8 : 0.3,
      }).addTo(map);

      marker.bindPopup(
        `<b>Code:</b> ${row.code}<br/>` +
        `<b>Site:</b> ${row.site_code || "N/A"}<br/>` +
        `<b>Project:</b> ${row.project_name || "N/A"}<br/>` +
        `<b>Type:</b> ${row.type || "N/A"}`
      );

      marker.on("click", () => {
        if (drawModeRef.current) return; // Don't toggle during draw mode
        const newSet = new Set(selectedCodes);
        if (newSet.has(row.code)) {
          newSet.delete(row.code);
        } else {
          newSet.add(row.code);
        }
        onSelectCodes(newSet);
      });

      markersRef.current.push(marker);
    }

    // ── Rectangle selection via mouse drag when draw mode is active ──
    map.on("mousedown", (e: import("leaflet").LeafletMouseEvent) => {
      if (!drawModeRef.current) return;
      drawStartRef.current = e.latlng;
      map.dragging.disable();

      // Remove previous rectangle
      if (rectRef.current) {
        map.removeLayer(rectRef.current);
        rectRef.current = null;
      }
    });

    map.on("mousemove", (e: import("leaflet").LeafletMouseEvent) => {
      if (!drawModeRef.current || !drawStartRef.current) return;

      const bounds = L.latLngBounds(drawStartRef.current, e.latlng);

      if (rectRef.current) {
        rectRef.current.setBounds(bounds);
      } else {
        rectRef.current = L.rectangle(bounds, {
          color: "#E42D3A",
          weight: 2,
          fillColor: "#E42D3A",
          fillOpacity: 0.15,
          dashArray: "6 4",
        }).addTo(map);
      }
    });

    map.on("mouseup", () => {
      if (!drawModeRef.current || !drawStartRef.current) return;

      map.dragging.enable();

      // Select all markers within the rectangle
      if (rectRef.current) {
        const bounds = rectRef.current.getBounds();
        const newCodes = new Set<string>();

        validData.forEach((row) => {
          const latLng = L.latLng(row.latitude, row.longitude);
          if (bounds.contains(latLng)) {
            newCodes.add(row.code);
          }
        });

        if (newCodes.size > 0) {
          onSelectCodes(newCodes);
        }
      }

      drawStartRef.current = null;
    });

    // Fit bounds
    const bounds = L.latLngBounds(validData.map((d) => [d.latitude, d.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [20, 20] });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [L, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker styles when selection changes
  useEffect(() => {
    if (!L || !data.length) return;
    const validData = data.filter(
      (d) => d.latitude != null && d.longitude != null
    );
    markersRef.current.forEach((marker, i) => {
      const row = validData[i];
      if (!row) return;
      const isSelected = selectedCodes.size === 0 || selectedCodes.has(row.code);
      marker.setStyle({
        fillColor: isSelected ? "#E42D3A" : "#ccc",
        fillOpacity: isSelected ? 0.8 : 0.3,
      });
    });
  }, [L, data, selectedCodes]);

  // Toggle draw mode
  const toggleDraw = () => {
    const newMode = !drawModeRef.current;
    drawModeRef.current = newMode;
    setIsDrawing(newMode);

    if (mapInstance.current) {
      if (newMode) {
        mapInstance.current.getContainer().style.cursor = "crosshair";
      } else {
        mapInstance.current.getContainer().style.cursor = "";
        // Remove rectangle when exiting draw mode
        if (rectRef.current && mapInstance.current) {
          mapInstance.current.removeLayer(rectRef.current);
          rectRef.current = null;
        }
      }
    }
  };

  // Clear selection
  const clearSelection = () => {
    onSelectCodes(new Set());
    if (rectRef.current && mapInstance.current) {
      mapInstance.current.removeLayer(rectRef.current);
      rectRef.current = null;
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-lg" />

      {/* Selection toolbar */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        {/* Draw rectangle select button */}
        <button
          onClick={toggleDraw}
          title={isDrawing ? "Exit selection mode" : "Rectangle select (click & drag)"}
          className={`w-9 h-9 flex items-center justify-center rounded-lg shadow-lg text-sm font-bold transition ${isDrawing
            ? "bg-red-600 text-white ring-2 ring-red-400 ring-offset-1 ring-offset-zinc-900"
            : "bg-white text-zinc-700 hover:bg-zinc-100"
            }`}
        >
          ▬
        </button>

        {/* Clear selection */}
        {selectedCodes.size > 0 && (
          <button
            onClick={clearSelection}
            title="Clear selection"
            className="w-9 h-9 flex items-center justify-center rounded-lg shadow-lg bg-white text-zinc-700 hover:bg-zinc-100 text-sm transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Selection info badge */}
      {selectedCodes.size > 0 && (
        <div className="absolute bottom-3 left-3 z-[1000] px-3 py-1.5 bg-red-600/90 text-white text-xs font-medium rounded-lg shadow-lg backdrop-blur-sm">
          {selectedCodes.size} element{selectedCodes.size !== 1 ? "s" : ""} selected
        </div>
      )}

      {/* Draw mode indicator */}
      {isDrawing && (
        <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 bg-amber-500/90 text-black text-xs font-semibold rounded-lg shadow-lg backdrop-blur-sm animate-pulse">
          ⬜ Draw a rectangle to select points
        </div>
      )}
    </div>
  );
}

// No SSR wrapper
const MapView = dynamic(() => Promise.resolve(MapViewInner), { ssr: false });
export default MapView;
