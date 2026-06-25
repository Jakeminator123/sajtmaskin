---
id: 2026-06-25-preview-surface-stability-och-iframe-fokus
status: done
created: 2026-06-25
completed: 2026-06-25
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

---

## Resultat (levererat 2026-06-25)

**Status: implementerat, mergat och deployat.**

### Leverans
- PR **#241** `fix(preview): make embedded preview playable + harden preview-host reboots` — squash-mergad till `master` som `4bbbc87a28`.
- Arbetet gjordes i isolerad worktree (`feat/preview-host-stability-and-iframe-focus`), huvudcheckouten orörd.

### Bot-/extern review (alla åtgärdade i commit `2f24c2305`)
Codex gav 4× P2 — identiska med en extern review. Alla fixade:
1. `proxy.on("error")`: `sendRuntimeStartingPage` returnerar nu bool; om recovery-sidan inte kan skrivas (mid-response reset efter att headers/body redan skickats) destroy:as/avslutas svaret i stället för att lämna iframen hängande.
2+3. Recovery köar **en** `queueRuntimeBoot(restart: true)` när `!state.booting` för både levande-zombie och död runtime — tar bort manuell stop-then-queue-glappet och kringgår "stopped recently"-cooldownen. `getRuntimeStateForChat().booting` (`inflightBootByChat.has() || status==="starting"`) täcker hela boot-fönstret, så ingen reboot-storm.
4. Fokus-timern armas först när `!isLoading && !iframeError && !previewFocused`; reset i separat `previewSrc`-cleanup-effekt.

### Verifiering (grön)
`typecheck` 0 · `lint` 0 · `vitest` 27/27 · `check-unicode-regex` OK · preview-host `check` + `smoke` (passed) + `test:patch` 5/5. CI på `2f24c2305`: quality/stability/schema-drift/db-blob-sync/GitGuardian/Vercel — alla gröna.

### Deploy
- **App-sida (A):** live via Vercel prod-deploy av `master`.
- **Preview-host (B/C/D/E):** `fly deploy -a vm-fly-jakem` (legacy remote builder; depot-buildern hängde på provisionering). Machine **v33**, ny image, health passing. Recovery-vägen verifierad live: preview-URL ger graceful "Startar preview"-sida (HTTP 200 HTML), inte rå `proxy_failed`-JSON. Inga PU02 sedan deploy.

### Kvarstår (follow-ups, ej i denna leverans)
- Blue-green-restart (ny runtime på ny port, dränera gammal först).
- App-sidans in-iframe auto-retry-overlay vid mid-session-reboot.
- Vercel `[error/deploy] Project not found or access denied` (blockerar "Publicera" — separat credential/`VERCEL_PROJECT_ID`-fråga, inga secrets i git).
- **Ej slutverifierat av riktig användarklick:** snake-spelbarhet i builder-iframen + PU02-nivå under en verklig follow-up-reboot (deployat och redo; bekräftas via klick i spelplanen / "Öppna i ny flik").
