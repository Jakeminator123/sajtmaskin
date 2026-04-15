# P18 — Preview runtime stability (landing warnings)

Status: Stängt — WSS/Fly löst, landing-varning verifierad och åtgärdad
Skapad: 2026-04-15
Prioritet: Låg–medel (varning, inte krasch)

## Uppdatering 2026-04-15

**Spår A (WSS/HMR-stabilitet) — STÄNGT.** Fly-proxyn fungerar nu stabilt; inga rapporterade reconnect-loopar.

**Spår B (gul landing-varning) — STÄNGT.**

Verifiering med Playwright visade:

1. Ingen stabil, reproducerbar hydration-mismatch i appkoden.
2. Varningen som sågs på landningssidan kom från Three/Fiber-lagret:
   - `THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
3. Stack-trace pekade in i `@react-three/fiber` store-init (Canvas root), inte i egen komponentlogik.
4. Åtgärd:
   - uppgradering: `@react-three/fiber` `^9.6.0`
   - kompatibilitetsjustering: `three` `^0.182.0` + `@types/three` `^0.182.0`
5. Efter ändring försvann Clock-deprecationen i verifierad browser-körning.

Notering:
- Kvarvarande WebGL-driver-varningar (`GPU stall due to ReadPixels`) sågs i headless Chromium/CI-lik testmiljö och klassas som miljö-/driver-specifik observability, inte app-hydrationfel.

## Avklarat

- ~~WSS/HMR mot Fly tappar anslutning~~ — LÖST
- ~~Reconnect-strategi med backoff~~ — inte längre relevant
- ~~Fallback till polling~~ — inte längre relevant
- ~~Hydration/landing-varning~~ — verifierad som Three/Fiber-deprecation, åtgärdad via dependency-align
