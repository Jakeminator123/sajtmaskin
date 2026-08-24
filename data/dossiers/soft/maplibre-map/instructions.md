# When to use

- The brief declares the `map-display` capability — the site should SHOW a map: a "hitta hit"/contact section, store locations, event venue, service area.
- Works with zero configuration: MapLibre GL renders OpenFreeMap vector tiles without any API key or account, so the map is fully live in F2 preview and stays free in production.

Do not use it for:

- Address search, geocoding, routing or "near me" features — those need a real location-services provider (future hard capability), not this display map.
- A static decorative image of a map (just use an image).

# How to integrate

1. Emit the verbatim `components/map-display.tsx` exactly as provided (its MapLibre v6 worker URL, SSR-safe lazy init, cleanup and fallback are load-bearing).
2. Add `maplibre-gl` to `package.json` dependencies.
3. Mount `MapDisplay` in the relevant section and pass real place data as props:

```tsx
import { MapDisplay } from "@/components/map-display";

<MapDisplay
  title="Hitta till oss"
  zoom={14}
  markers={[
    { name: "Butiken på Söder", lng: 18.0649, lat: 59.3128, description: "Götgatan 22, Stockholm" },
  ]}
/>
```

- `markers` items are `[lng, lat]`-based: `lng` is longitude (18.x for Stockholm), `lat` is latitude (59.x). Do not swap them.
- `center` defaults to the first marker — usually omit it.
- Props are read once on mount; pass a `key` if you must re-render with new markers.
- Use plausible coordinates for the business's actual city. If the exact address is unknown, pick a central coordinate in the right city and keep the description generic.
- If the site defines a strict CSP, allow `blob:` in `worker-src` and allow `https://cdn.jsdelivr.net` plus `https://tiles.openfreemap.org` in the relevant worker/connect directives. The exact-version worker is executable code; do not silently weaken an existing CSP.

# UX rules

- Place the map in context (address, opening hours, contact details next to it) — never as a lonely full-page iframe-lookalike.
- The component uses cooperative gestures (ctrl/cmd + scroll to zoom) so the page never loses scroll — do not disable this.
- Keep marker count modest (1-10). For many locations, pair the map with a text list.
- The default height (360-420px) suits most sections; override with `className` on the wrapper if the layout needs it.

# Avoid

- Do not import `maplibre-gl` at module scope in OTHER files or render it during SSR — the library needs `window`; only this component's lazy init pattern is safe.
- Do not remove or rewrite the version-matched `setWorkerUrl()` call. Next.js otherwise mounts MapLibre v6 without starting its ESM worker: controls and markers appear over a gray surface, but no vector tiles are requested.
- Do not swap the OpenFreeMap style URL for a provider that requires an API key (Mapbox, Google) — that breaks the key-free contract of this capability.
- Do not remove the error fallback or the cleanup (`map.remove()`) — leaking GL contexts crashes long-lived previews.
- Do not use this component for geocoding/search — it displays fixed coordinates only.

# Verification

- The section renders a skeleton, then real vector tiles, without any env keys set.
- Network inspection shows successful `.pbf` tile requests after the worker starts; controls or markers alone are not proof that the map loaded.
- Scroll the page over the map — the page scrolls (no scroll hijack); ctrl/cmd + scroll zooms the map.
- Click a marker — a popup with the place name (and description) opens.
- Simulate offline tiles (devtools network block) — the location list fallback renders instead of a broken gray box.
- No console errors about `window is not defined` during SSR/build.
