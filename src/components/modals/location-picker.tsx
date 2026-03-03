"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, Navigation } from "lucide-react";
import { loadGoogleMaps, DARK_MAP_STYLES, STOCKHOLM_CENTER } from "@/lib/google-maps-loader";

interface LocationPickerProps {
  value: string;
  lat?: number;
  lng?: number;
  onLocationChange: (name: string, lat: number, lng: number) => void;
  className?: string;
  inputClassName?: string;
}

export function LocationPicker({
  value,
  lat,
  lng,
  onLocationChange,
  className,
  inputClassName,
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  // Stable ref so callbacks never depend on the caller's function identity
  const onChangeRef = useRef(onLocationChange);
  useEffect(() => { onChangeRef.current = onLocationChange; }, [onLocationChange]);

  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const hasInitialCoords = lat != null && lng != null;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => setScriptLoaded(true));
  }, [apiKey]);

  const movePin = useCallback(
    (position: google.maps.LatLngLiteral) => {
      if (markerRef.current) {
        markerRef.current.setPosition(position);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(position);
      }
    },
    [],
  );

  const reverseGeocode = useCallback(
    (position: google.maps.LatLngLiteral) => {
      if (!geocoderRef.current) return;
      geocoderRef.current.geocode({ location: position }, (results, status) => {
        if (status !== "OK" || !results?.[0]) return;
        const addr = results[0];
        const city =
          addr.address_components.find((c) => c.types.includes("locality"))?.long_name ??
          addr.address_components.find((c) => c.types.includes("postal_town"))?.long_name ??
          addr.formatted_address;
        setInputValue(city);
        onChangeRef.current(city, position.lat, position.lng);
      });
    },
    [],
  );

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;
    if (mapInstanceRef.current) return;

    const center = hasInitialCoords
      ? { lat: lat!, lng: lng! }
      : STOCKHOLM_CENTER;

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: hasInitialCoords ? 13 : 5,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      styles: DARK_MAP_STYLES,
    });
    mapInstanceRef.current = map;

    const marker = new google.maps.Marker({
      map,
      position: center,
      draggable: true,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#6366f1",
        fillOpacity: 0.9,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
      title: "Dra för att justera plats",
    });
    markerRef.current = marker;

    geocoderRef.current = new google.maps.Geocoder();

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      const p = { lat: pos.lat(), lng: pos.lng() };
      reverseGeocode(p);
    });

    if (inputRef.current) {
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["geometry", "formatted_address", "address_components"],
        types: ["geocode"],
      });
      autocompleteRef.current = ac;

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const p = { lat: loc.lat(), lng: loc.lng() };
        movePin(p);
        map.setZoom(13);
        const city =
          place.address_components?.find((c) => c.types.includes("locality"))?.long_name ??
          place.address_components?.find((c) => c.types.includes("postal_town"))?.long_name ??
          place.formatted_address ??
          inputRef.current?.value ??
          "";
        setInputValue(city);
        onChangeRef.current(city, p.lat, p.lng);
      });
    }
  }, [hasInitialCoords, lat, lng, movePin, reverseGeocode]);

  useEffect(() => {
    if (scriptLoaded) initMap();
  }, [scriptLoaded, initMap]);

  useEffect(() => {
    if (hasInitialCoords) return;
    let cancelled = false;
    setGeoLoading(true);
    fetch("/api/geo")
      .then((r) => r.json())
      .then((data: { city: string | null; lat: number | null; lng: number | null }) => {
        if (cancelled) return;
        if (data.lat != null && data.lng != null) {
          const p = { lat: data.lat, lng: data.lng };
          movePin(p);
          mapInstanceRef.current?.setZoom(10);
          if (!value && data.city) {
            setInputValue(data.city);
            onChangeRef.current(data.city, p.lat, p.lng);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setGeoLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external coordinate changes to the pin
  useEffect(() => {
    if (!scriptLoaded || !hasInitialCoords) return;
    movePin({ lat: lat!, lng: lng! });
  }, [scriptLoaded, hasInitialCoords, lat, lng, movePin]);

  if (!apiKey) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onLocationChange(e.target.value, 0, 0);
        }}
        placeholder="Stockholm, Göteborg, eller annat..."
        className={inputClassName ?? className}
      />
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => {
            if (inputValue !== value) {
              onLocationChange(inputValue, lat ?? 0, lng ?? 0);
            }
          }}
          placeholder="Sök adress eller stad..."
          className={inputClassName}
        />
        {geoLoading && (
          <div className="absolute top-1/2 right-3 -translate-y-1/2">
            <Navigation className="h-4 w-4 animate-pulse text-primary" />
          </div>
        )}
      </div>

      <div className="relative mt-2 overflow-hidden rounded-xl border border-border/30">
        {!scriptLoaded && (
          <div className="flex h-[220px] items-center justify-center bg-secondary/30">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <div
          ref={mapRef}
          className="h-[220px] w-full bg-secondary/30"
          style={{ display: scriptLoaded ? "block" : "none" }}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] text-gray-400">
          <MapPin className="h-3 w-3" />
          Dra markören för att justera
        </div>
      </div>
    </div>
  );
}
