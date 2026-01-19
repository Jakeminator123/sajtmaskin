"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Search, Loader2, X, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationPickerProps {
  value: string;
  onChange: (
    location: string,
    coordinates?: { lat: number; lng: number }
  ) => void;
  placeholder?: string;
  className?: string;
}

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
  }
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Sök efter adress eller plats...",
  className = "",
}: LocationPickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [showMap, setShowMap] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(
    null
  );
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load Google Maps script (with deduplication to prevent multiple loads)
  useEffect(() => {
    // Check if already loaded
    if (window.google?.maps) {
      setIsScriptLoaded(true);
      return;
    }

    // Check if script is already in DOM (prevents duplicate loading)
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existingScript) {
      // Script exists but not loaded yet - wait for it
      existingScript.addEventListener("load", () => setIsScriptLoaded(true));
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("[LocationPicker] Google Maps API key not configured");
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=sv`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setIsScriptLoaded(true);
    };

    script.onerror = () => {
      console.error("[LocationPicker] Failed to load Google Maps script");
    };

    document.head.appendChild(script);
  }, []);

  // Initialize services when script loads
  useEffect(() => {
    if (isScriptLoaded && window.google?.maps) {
      autocompleteServiceRef.current =
        new google.maps.places.AutocompleteService();

      // Create a dummy div for PlacesService (required by API)
      const dummyDiv = document.createElement("div");
      placesServiceRef.current = new google.maps.places.PlacesService(dummyDiv);
    }
  }, [isScriptLoaded]);

  // Initialize map when shown
  useEffect(() => {
    if (
      showMap &&
      mapRef.current &&
      isScriptLoaded &&
      !mapInstanceRef.current
    ) {
      // Default to Stockholm if no coords
      const center = selectedCoords || { lat: 59.3293, lng: 18.0686 };

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: selectedCoords ? 15 : 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
          {
            elementType: "labels.text.stroke",
            stylers: [{ color: "#1a1a2e" }],
          },
          { elementType: "labels.text.fill", stylers: [{ color: "#8b8ba7" }] },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#2d2d44" }],
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#0f0f1a" }],
          },
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      });

      // Add click handler to map
      mapInstanceRef.current.addListener(
        "click",
        (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            setSelectedCoords(coords);
            updateMarker(coords);

            // Reverse geocode to get address
            reverseGeocode(coords);
          }
        }
      );

      // Add marker if we have coords
      if (selectedCoords) {
        updateMarker(selectedCoords);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, isScriptLoaded, selectedCoords]);

  // Update marker position
  const updateMarker = useCallback((coords: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;

    if (markerRef.current) {
      markerRef.current.setPosition(coords);
    } else {
      markerRef.current = new google.maps.Marker({
        position: coords,
        map: mapInstanceRef.current,
        animation: google.maps.Animation.DROP,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#a855f7",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    }

    mapInstanceRef.current.panTo(coords);
  }, []);

  // Reverse geocode coordinates to address
  const reverseGeocode = useCallback(
    (coords: { lat: number; lng: number }) => {
      if (!isScriptLoaded) return;

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: coords }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const address = results[0].formatted_address;
          setInputValue(address);
          onChange(address, coords);
        }
      });
    },
    [isScriptLoaded, onChange]
  );

  // Search for places
  const searchPlaces = useCallback((query: string) => {
    if (!query.trim() || !autocompleteServiceRef.current) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: "se" }, // Limit to Sweden
        types: ["geocode", "establishment"],
      },
      (predictions, status) => {
        setIsLoading(false);

        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          predictions
        ) {
          setSuggestions(predictions as PlacePrediction[]);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onChange(newValue);

      // Debounce search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        searchPlaces(newValue);
      }, 300);
    },
    [onChange, searchPlaces]
  );

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback(
    (suggestion: PlacePrediction) => {
      if (!placesServiceRef.current) return;

      setShowSuggestions(false);
      setInputValue(suggestion.description);

      // Get place details for coordinates
      placesServiceRef.current.getDetails(
        { placeId: suggestion.place_id, fields: ["geometry"] },
        (place, status) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            place?.geometry?.location
          ) {
            const coords = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            };
            setSelectedCoords(coords);
            onChange(suggestion.description, coords);

            // Update map if visible
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo(coords);
              mapInstanceRef.current.setZoom(15);
              updateMarker(coords);
            }
          } else {
            onChange(suggestion.description);
          }
        }
      );
    },
    [onChange, updateMarker]
  );

  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setSelectedCoords(coords);
        reverseGeocode(coords);
        setIsLoading(false);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(coords);
          mapInstanceRef.current.setZoom(15);
          updateMarker(coords);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, [reverseGeocode, updateMarker]);

  // Sync external value changes
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={placeholder}
            className="w-full pl-12 pr-12 py-4 bg-gray-800 border-2 border-gray-700 text-base text-white placeholder-gray-400 focus:border-brand-teal/50 focus:outline-none focus:ring-2 focus:ring-brand-teal/20 transition-all hover:border-gray-600"
          />
          {isLoading ? (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 animate-spin" />
          ) : inputValue ? (
            <button
              onClick={() => {
                setInputValue("");
                onChange("");
                setSelectedCoords(null);
                setSuggestions([]);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-2 bg-black border border-gray-700 shadow-xl overflow-hidden">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.place_id}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
              >
                <div className="font-medium text-white">
                  {suggestion.structured_formatting.main_text}
                </div>
                <div className="text-sm text-gray-400">
                  {suggestion.structured_formatting.secondary_text}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={getCurrentLocation}
          disabled={isLoading}
          className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <Navigation className="h-4 w-4" />
          Min plats
        </Button>

        {isScriptLoaded && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMap(!showMap)}
            className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <MapPin className="h-4 w-4" />
            {showMap ? "Dölj karta" : "Visa karta"}
          </Button>
        )}
      </div>

      {/* Map */}
      {showMap && isScriptLoaded && (
        <div className="relative overflow-hidden border border-gray-700">
          <div ref={mapRef} className="w-full h-[300px]" />
          <div className="absolute bottom-3 left-3 right-3 bg-black/90 backdrop-blur-sm px-3 py-2 text-xs text-gray-400">
            Klicka på kartan för att välja plats
          </div>
        </div>
      )}

      {/* Selected coordinates display */}
      {selectedCoords && (
        <p className="text-xs text-gray-500">
          📍 Koordinater: {selectedCoords.lat.toFixed(6)},{" "}
          {selectedCoords.lng.toFixed(6)}
        </p>
      )}

      {/* Fallback if Google Maps not available */}
      {!isScriptLoaded && (
        <p className="text-xs text-gray-500">
          <Search className="inline h-3 w-3 mr-1" />
          Skriv in din adress manuellt (Google Maps laddas...)
        </p>
      )}
    </div>
  );
}
