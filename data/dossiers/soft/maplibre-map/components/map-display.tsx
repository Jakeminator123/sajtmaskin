"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapMarker {
  /** Visible place name (popup heading + fallback list label). */
  name: string;
  /** Longitude (east/west). Note the [lng, lat] order used by MapLibre. */
  lng: number;
  /** Latitude (north/south). */
  lat: number;
  /** Optional one-line detail shown in the popup and the fallback list. */
  description?: string;
}

export interface MapDisplayProps {
  /** Map center as [lng, lat]. Defaults to the first marker, else Stockholm. */
  center?: [number, number];
  /** Initial zoom level. 12-15 suits a city/neighborhood view. */
  zoom?: number;
  /** Places to pin. Read once on mount — remount (change `key`) to replace. */
  markers?: MapMarker[];
  /** Accessible label + fallback heading, e.g. "Hitta till butiken". */
  title?: string;
  className?: string;
}

const DEFAULT_MARKERS: MapMarker[] = [
  { name: "Huvudkontoret", lng: 18.0686, lat: 59.3293, description: "Sveavägen 1, Stockholm" },
];

/**
 * Interactive map on MapLibre GL + OpenFreeMap vector tiles. No API key and
 * no account required, so the map is fully functional in preview and stays
 * free in production. The map library loads lazily inside useEffect (SSR-safe
 * by construction) and the component degrades to a readable location list if
 * tiles or WebGL are unavailable.
 */
export function MapDisplay({
  center,
  zoom = 13,
  markers = DEFAULT_MARKERS,
  title = "Karta",
  className,
}: MapDisplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Mount-time snapshot on purpose: recreating a GL map on every prop change
  // is expensive and flickers. Callers that need new markers/center remount
  // with a `key`. The ref keeps the effect single-run without lint suppressions.
  const initialRef = useRef({ center, zoom, markers });

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        const el = containerRef.current;
        if (cancelled || !el) return;
        const init = initialRef.current;
        const resolvedCenter: [number, number] =
          init.center ??
          (init.markers[0] ? [init.markers[0].lng, init.markers[0].lat] : [18.0686, 59.3293]);

        map = new maplibregl.Map({
          container: el,
          // OpenFreeMap: key-free, account-free vector tiles.
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: resolvedCenter,
          zoom: init.zoom,
          // Require ctrl/cmd + scroll (two fingers on touch) so an embedded
          // map never hijacks page scrolling.
          cooperativeGestures: true,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        for (const marker of init.markers) {
          const popup = new maplibregl.Popup({ offset: 24, closeButton: false });
          const heading = document.createElement("strong");
          heading.textContent = marker.name;
          popup.setDOMContent(heading);
          if (marker.description) {
            const detail = document.createElement("div");
            detail.textContent = marker.description;
            heading.insertAdjacentElement("afterend", detail);
          }
          new maplibregl.Marker().setLngLat([marker.lng, marker.lat]).setPopup(popup).addTo(map);
        }

        map.on("load", () => {
          if (!cancelled) setStatus("ready");
        });
        map.on("error", () => {
          // Tile/style fetch failures land here; keep the map if it already
          // rendered, otherwise fall back to the list.
          if (!cancelled) setStatus((prev) => (prev === "loading" ? "error" : prev));
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  if (status === "error") {
    return (
      <div
        role="region"
        aria-label={title}
        className={[
          "rounded-lg border border-border bg-muted/40 p-4 text-sm",
          className ?? "",
        ]
          .join(" ")
          .trim()}
      >
        <p className="font-medium text-foreground">{title}</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {initialRef.current.markers.map((marker) => (
            <li key={`${marker.name}-${marker.lng}-${marker.lat}`}>
              <span className="text-foreground">{marker.name}</span>
              {marker.description ? ` — ${marker.description}` : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs">Kartan kunde inte laddas just nu.</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={title}
      className={["relative overflow-hidden rounded-lg border border-border", className ?? ""]
        .join(" ")
        .trim()}
    >
      {status === "loading" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 animate-pulse bg-muted"
        />
      )}
      <div ref={containerRef} className="h-[360px] w-full md:h-[420px]" />
    </div>
  );
}
