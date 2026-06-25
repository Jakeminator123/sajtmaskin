---
id: 2026-06-25-preview-surface-stability-och-iframe-fokus
status: in-progress
created: 2026-06-25
linear: null
parent: null
supersedes: null
---

# Preview-surface-stabilitet + iframe-fokus (F2 live-preview)

Smal fix-plan för de verifierade rotorsakerna bakom användarrapporterna: vit skärm,
blå flimmer, `{"error":"proxy_failed","message":"socket hang up"}`, konstant Fly
`[PU02] connection closed before message completed` och "snake renderar men går inte
att spela". Den genererade koden är verifierat korrekt — felen sitter i **preview-ytan**
(builder-iframe + preview-host på Fly), inte i codegen.

Kod är source of truth. Allt nedan är verifierat mot repo 2026-06-25.

---

## Rotorsaker (verifierat) → åtgärd

| # | Rotorsak | Var | Åtgärd |
|---|---|---|---|
| A | Builder-iframen får aldrig tangentbordsfokus; ingen "klicka för att spela"-ledtråd | `PreviewPanelFrame.tsx` (`<iframe id="preview-iframe">`) | Fokusera iframen vid användarklick + icke-blockerande fokus-ledtråd |
| B | Avsiktlig `restart`-boot dödar `next dev` abrupt → `socket hang up`/PU02 i pågående requests; HMR-WS:en återansluter i en storm under reboot | `preview-host/src/runtime.js` (`bootRuntimeForSession`, `proxyPreviewUpgrade`, `stopChildProcessTree`) | Håll HMR-WS:en tyst (no-op) när runtime inte kör/bootar (stoppar PU02-stormen); konfigurerbar drain-fördröjning innan SIGKILL |
| C+E | `proxy.on("error")` återhämtar bara `ECONNREFUSED`; reset/socket-hang-up ger rå `proxy_failed`-JSON i iframen och ingen recycling av zombie-runtime | `preview-host/src/runtime.js` (`proxy.on("error")`) | Behandla reset/hang-up som recoverable → recycla runtime + servera vänlig auto-reloadande "Startar om preview…"-sida i stället för JSON |
| D | Next.js stdout/stderr ytliggörs aldrig i runtime-loggar (README handoff #5) | `preview-host/src/runtime.js` (`spawnDevServer`) | Ringbuffert av senaste rader + flush av tail till runtime-loggen vid onormal exit |

---

## Konkreta ändringar

### App-sida (builder) — A
`src/components/builder/preview-panel/PreviewPanelFrame.tsx`
- Fokusera `iframeRef.current` (+ `contentWindow.focus()` i try/catch) vid `onMouseDown` på preview-ytan.
- Detektera när iframen fått fokus via `window` `blur` + `document.activeElement` och göm ledtråden.
- Icke-blockerande (`pointer-events-none`) ledtråd "Klicka i previewn för att styra med tangentbordet" som auto-göms efter fokus eller kort timeout. Återställs när `previewSrc` ändras (reload).
- Overlay-gating verifierad: inspect/placement/Composer-overlays renderas bara när deras läge är på (`showInspectOverlay`/`showPlacementOverlay`/`showComposerOverlay` i `PreviewPanel.tsx`), så de sväljer inte klick i idle-läge. Ingen ändring krävs där.

### Preview-host (Fly) — B, C+E, D
`preview-host/src/runtime.js`
- **C+E (högst hävstång):** generalisera `proxy.on("error")` så reset/`socket hang up`/`ECONNRESET`/`EPIPE`/`ECONNABORTED` hanteras som recoverable: recycla runtime (stop + reboot) när den ser ut att köra (zombie) eller är nere, och servera `sendRuntimeStartingPage` (auto-reload var 4:e s, ny "Startar om…"-text) i stället för rå JSON. Dedupar mot pågående boot för att undvika restart-storm.
- **B (HMR no-storm):** i `proxyPreviewUpgrade`, när HMR-proxyn är på men runtime inte kör/bootar, håll HMR-WS:en tyst via befintliga `acceptAndHoldWebSocket` i stället för att proxya mot en död port (som annars ger ECONNREFUSED → destroy → reconnect-storm → PU02).
- **B (drain):** gör SIGTERM→SIGKILL-fönstret i `stopChildProcessTree` konfigurerbart via `PREVIEW_HOST_RUNTIME_DRAIN_MS` (default oförändrat 5000 ms) så pågående svar hinner klart.
- **D (observability):** ringbuffert (senaste ~60 rader) av `next dev` stdout/stderr per tracked runtime; flush av tail till runtime-loggen vid onormal exit (`!ignoreExit`). Rena stopp (hibernate/destroy/restart) dumpar inget.

Alla preview-host-ändringar är bakåtkompatibla och defaultar till dagens beteende där en ny knob införs.

---

## Risk / reversibilitet

| Ändring | Risk | Reversibel |
|---|---|---|
| A iframe-fokus + ledtråd | Låg (ren UI; ledtråd är pointer-events-none) | Ja (revert filen) |
| C+E reset-recovery + vänlig sida | Låg–medel (bredare recovery-väg; dedupas mot boot) | Ja (revert hunk) |
| B HMR-WS hold under reboot | Låg (bara när runtime nere + HMR-proxy på; ersätter en redan trasig väg) | Ja |
| B drain-knob | Låg (default = dagens 5000 ms) | Ja (`PREVIEW_HOST_RUNTIME_DRAIN_MS`) |
| D stdout/stderr-tail | Låg (in-memory buffert; flush bara vid onormal exit) | Ja |

---

## Kräver follow-up `fly deploy` för att aktiveras

Preview-host-ändringarna (B/C/D/E) körs på Fly-appen `vm-fly-jakem` och blir **inte** live
av en merge — de aktiveras först av `fly deploy -a vm-fly-jakem` (kodbaserad PR, ingen deploy
i denna leverans). App-sidan (A) går live via vanlig Vercel-deploy av master.

## Avgränsat / utanför scope

- **Blue-green-restart** (starta ny runtime på ny port, dränera gamla först): högre värde men
  invasivt (skriva filer under levande process, dubbelt RAM) → follow-up.
- **App-sidans auto-retry-overlay** i en redan laddad iframe: server-sidans vänliga
  auto-reloadande sida täcker huvudfallet (full navigering vid reload). Finare in-iframe
  poll/retry = follow-up.
- **Vercel `[error/deploy] Project not found or access denied`**: separat deploy/credential-fråga
  (`VERCEL_PROJECT_ID`/token/team-scope), blockerar "Publicera" inte preview. Spåras separat,
  fixas inte här (inga secrets i git).

## Verifiering (innan PR)

- Repo-rot: `npm run typecheck`, `npm run lint`, riktad `npx vitest run` (preview-panel).
- Preview-host: `npm run check`, `npm run smoke`.
