# P18 — Preview runtime stability (landing warnings)

Status: Stängt — WSS/Fly löst (delvis, se uppdatering 2026-04-18), landing-varning verifierad och åtgärdad
Skapad: 2026-04-15
Prioritet: Låg–medel (varning, inte krasch)

## Uppdatering 2026-04-18 — HMR-spam mitigerad

Spår A var inte fullt löst. `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr` failade fortfarande flera ggr per sekund i Chrome-konsolen för builder-användare (rapporterat 2026-04-18). Roten: `proxy.ws()` är aktiverad i `preview-host/src/runtime.js:42-46` (`ws: true`) och `server.on("upgrade")` finns i `server.js:706`, men Fly's edge-proxy droppar WS-handshakes med jämna mellanrum när pathen har chatId-prefix.

Mitigering (commit `67f392774`): `patchNextConfigForPreviewBasePath` i `preview-host/src/runtime.js:409` injicerar nu en `webpack`-mutator i preview-VM:ens `next.config` som filtrerar bort `HotModuleReplacementPlugin` när `SAJTMASKIN_PREVIEW_DISABLE_HMR=true` (default-on i `spawnDevServer`-env). Webpack genererar inte HMR-klienten alls, ingen WS-handshake försöks, ingen console-spam. Hot-reload mellan kod-ändringar i preview tappas men Sajtmaskin gör full iframe-reload via refreshToken vid varje generation ändå. Sätt `SAJTMASKIN_PREVIEW_DISABLE_HMR=false` för att återaktivera HMR vid direkt VM-debug.

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

- ~~WSS/HMR mot Fly tappar anslutning~~ — DELVIS (proxy.ws aktiverad i runtime.js, Fly's edge droppar handshakes ändå; mitigerad 2026-04-18 genom att inaktivera HMR-pluginen i preview-VM via `SAJTMASKIN_PREVIEW_DISABLE_HMR`)
- ~~Reconnect-strategi med backoff~~ — inte längre relevant (HMR genereras inte alls i preview)
- ~~Fallback till polling~~ — inte längre relevant
- ~~Hydration/landing-varning~~ — verifierad som Three/Fiber-deprecation, åtgärdad via dependency-align
