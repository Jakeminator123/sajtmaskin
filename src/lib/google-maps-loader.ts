declare global {
  interface Window {
    google: typeof google;
    _gmapsLoaded?: boolean;
    _gmapsCallbacks?: Array<() => void>;
  }
}

export const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8aaa" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a4e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a3a" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

export const STOCKHOLM_CENTER = { lat: 59.3293, lng: 18.0686 };

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window._gmapsLoaded && window.google?.maps) return Promise.resolve();

  return new Promise((resolve) => {
    if (!window._gmapsCallbacks) {
      window._gmapsCallbacks = [];
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=sv&callback=_gmapsInit`;
      script.async = true;
      script.defer = true;
      (window as unknown as Record<string, unknown>)._gmapsInit = () => {
        window._gmapsLoaded = true;
        window._gmapsCallbacks?.forEach((cb) => cb());
        window._gmapsCallbacks = [];
      };
      document.head.appendChild(script);
    }
    if (window._gmapsLoaded) {
      resolve();
    } else {
      window._gmapsCallbacks!.push(resolve);
    }
  });
}
