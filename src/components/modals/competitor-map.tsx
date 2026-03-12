"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, ExternalLink, Loader2, Plus } from "lucide-react";
import { loadGoogleMaps, DARK_MAP_STYLES, STOCKHOLM_CENTER } from "@/lib/google-maps-loader";

interface Competitor {
  name: string;
  description: string;
  website?: string;
  lat?: number;
  lng?: number;
  isInspiration?: boolean;
}

interface CompetitorMapProps {
  competitors: Competitor[];
  centerLat?: number;
  centerLng?: number;
  onAddInspiration?: (url: string) => void;
  isLoading?: boolean;
}

export function CompetitorMap({
  competitors,
  centerLat,
  centerLng,
  onAddInspiration,
  isLoading = false,
}: CompetitorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then(() => {
      if (!cancelled) {
        setScriptLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;
    const center = { lat: centerLat || STOCKHOLM_CENTER.lat, lng: centerLng || STOCKHOLM_CENTER.lng };
    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      styles: DARK_MAP_STYLES,
    });
    mapInstanceRef.current = map;
  }, [centerLat, centerLng]);

  useEffect(() => {
    if (scriptLoaded) initMap();
  }, [scriptLoaded, initMap]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasValidCoords = false;

    competitors.forEach((comp) => {
      if (!comp.lat || !comp.lng) return;
      hasValidCoords = true;
      const position = { lat: comp.lat, lng: comp.lng };
      bounds.extend(position);

      const marker = new google.maps.Marker({
        map,
        position,
        title: comp.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: comp.isInspiration ? "#10b981" : "#6366f1",
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => setSelectedCompetitor(comp));
      markersRef.current.push(marker);
    });

    if (hasValidCoords && competitors.length > 1) {
      map.fitBounds(bounds, 60);
    }
  }, [competitors]);

  if (!apiKey) {
    return (
      <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin className="h-4 w-4" />
          Karta ej tillgänglig (Google Maps API-nyckel saknas)
        </div>
        {competitors.length > 0 && (
          <div className="mt-3 space-y-2">
            {competitors.map((c, i) => (
              <CompetitorCard key={i} competitor={c} onAddInspiration={onAddInspiration} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-gray-700/50">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/80">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Kartlägger konkurrenter...
            </div>
          </div>
        )}
        <div ref={mapRef} className="h-48 w-full bg-gray-900" />
      </div>

      {selectedCompetitor && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{selectedCompetitor.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedCompetitor.description}</p>
            </div>
            <div className="flex gap-1">
              {selectedCompetitor.website && (
                <a
                  href={selectedCompetitor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {selectedCompetitor.website && onAddInspiration && (
                <button
                  onClick={() => onAddInspiration(selectedCompetitor.website!)}
                  className="rounded p-1 text-primary hover:bg-primary/10"
                  title="Lägg till som inspiration"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {competitors.length > 0 && (
        <div className="space-y-1.5">
          {competitors.map((c, i) => (
            <CompetitorCard key={i} competitor={c} onAddInspiration={onAddInspiration} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorCard({
  competitor,
  onAddInspiration,
}: {
  competitor: Competitor;
  onAddInspiration?: (url: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-700/30 bg-gray-900/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${competitor.isInspiration ? "bg-emerald-400" : "bg-indigo-400"}`}
          />
          <span className="truncate text-xs font-medium text-foreground">{competitor.name}</span>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{competitor.description}</p>
      </div>
      {competitor.website && onAddInspiration && (
        <button
          onClick={() => onAddInspiration(competitor.website!)}
          className="shrink-0 rounded px-2 py-1 text-[10px] text-primary transition hover:bg-primary/10"
        >
          + Inspiration
        </button>
      )}
    </div>
  );
}
