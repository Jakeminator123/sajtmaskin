# Preview- och verifieringslivscykel: förenkling (2026-07)

Mål: färre iframe-reloads, ingen klickblockerande verifiering, en gate-ägare per
lifecycle-steg och ett neutralt `superseded`-utfall. Baserad på kodkartläggning
av master (2026-07-23) + 14 dagars prod-telemetri.

## Nuvarande kedja (kartlagd)

```text
generation stream → finalize → post-finalize policy → preview-session →
preview-ready/done (SSE) → klient post-check → quality gate (F2/F3) →
server-verify (F3) → repair → promotion → deploy
```

### Gate-/check-inventering

| Kontroll | Startas av | Kollar | Blockerar | Dubblett? |
| --- | --- | --- | --- | --- |
| Preflight (parse/merge) | finalize (server) | struktur, imports | preview vid `previewBlocked` | nej |
| Normalize/autofix | finalize (server) | mekaniska fixar | nej | nej |
| Verifier-LLM | finalize (server, signalstyrd) | semantiska blockers | promotion (via `verificationBlocked` → diagnosticOnly) | nej |
| RenderGate (F2 quality gate) | **klienten** (`runTier2VerifyLane` → `POST /quality-gate`) | `typecheck` (advisory, render-first) | inte preview; promotion tills körd | nej — enkelägd sedan M#vlane1 (2026-07-13) |
| ReleaseGate (F3 quality gate) | server-verify (post-finalize) **och** klientens post-check-lane | `typecheck + build` | F3-promotion/deploy | **ja — fixas här** (lease-race, 409-brus) |
| Deterministisk F3-fork-gate | klienten (`runF3FinalizeAction`) | `typecheck + build` | F3-promotion | nej (enda ägare för den vägen) |
| Bildvalidering | klient post-check | bild-URL:er | nej | nej (men sekventiell) |
| CapabilitySmoke (product postcheck) | klient post-check | produktflöden | F3-start vid `productBlocked` | nej (men sekventiell) |
| Deploy-gate | `POST /api/v0/deployments` | `verification_state`/`release_state` | deploy | nej |

### Tillståndspåverkan

- `pending → verifying → passed/failed`; `release_state: draft → promoted`.
- F2-deploy blockeras bara av `failed`; F3-deploy kräver `passed` eller `promoted`.
- Version-picker (`selectPreferredEngineVersion`) = nyaste icke-failade — promotion styr inte valet.
- **Supersede-buggen:** `markVersionSupersededByRepair` skrev terminalt `failed`
  → röd "Fel"-badge på en version som bara ersatts, och klientens post-checks
  ignorerade `superseded` i gate-svaret → rosa felkort + repair mot gammal
  version. Ingen avbrytning av pågående verify när ny version skapas.

### Reload-/frysningskällor (klient)

- Iframe laddar om vid både `setCurrentPreviewUrl` och token-bump (`?t=`).
- Bump-källor: progressiv mid-stream (2 stängda kodblock), `preview-ready`,
  `done`, bootstrap-svar, sidnav (dubbel: imperativ `iframe.src` + parent-bump),
  `useSendMessage` (bump även när URL oförändrad).
- Full overlay (`PreviewPanelFrame`, 350 ms debounce / 6 s cap) blockerar klick
  och drivs av `previewPending` även när en levande preview redan visas.
- `/preview-session`-svaret väntade på `updateVersionPreviewUrl` med
  lås-retry (2 s × 3 + 300 ms) i responsvägen — samma versionsrad som
  verify-leasen håller.

## Prod-baseline (14 dagar, 2026-07-23, read-only)

- 50 körningar: 46 `preview_ready`, 0 `preview_failed` — previewn fungerar
  oberoende av gate-utfall.
- Gate-utfall: typecheck failade 5/44 (F2-advisory i praktiken), build 3/14,
  `install` kostar 28 s/körning i verify-lanen.
- 9 × `quality-gate:superseded` + 4 × `server-verify:superseded` (~26 % av
  versionerna) — kärnan i "versioner tappar bort sig".
- Versionslägen: 23 promoted / 20 failed / 19 pending — många falskt röda av
  supersede.
- `quality-gate:lint`-error-raderna kom från gamla manifestet; lint togs bort ur
  F3-listan 2026-07-22.

## Signaler som måste behållas

- Riktigt F3-buildfel → `failed` + deploy 409 (`resolveDeployReleaseGate`).
- Verifier-blockers → `diagnosticOnly` (aldrig promotion/false-green).
- Server-repair-ingången för reparerbara gate-fel.
- `preview_success`-telemetrins runtime-ready-kvitto (M#pv1).
- CapabilitySmoke `productBlocked` → blockerar F3-start.

## Ändringar i denna PR

1. **Stabil preview:** ta bort progressiv mid-stream-bump; URL-sättning och
   token-bump blir alternativ (aldrig båda); skip när URL+session oförändrad;
   en reload-ägare för sidnav.
2. **Icke-blockerande UX:** `previewPending` driver statusremsan, inte full
   overlay, när en levande preview-URL redan renderar.
3. **Frikopplat lås:** preview-URL-persistensen flyttas till `after()` —
   `/preview-session`-svaret väntar aldrig på verify-låset.
4. **En F3-ägare:** klientens post-check-lane skippar `POST /quality-gate` för
   `lifecycleStage === "integrations"` — server-verify äger; UI följer via
   befintlig status-polling.
5. **Neutral supersede:** nytt `verification_state`-värde `superseded`
   (TEXT-kolumn, ingen migration): neutral "Ersatt"-label, ingen repair, inget
   rosa kort, exkluderas som preferred, blockeras för deploy som failed.
   Historiska prod-rader behåller `failed` (förväntat).
6. **Städning:** stale lint-doc, pipeline-doc, glossary, backlog; parallell
   bildvalidering + CapabilitySmoke.

## Medvetet utanför scope (avgränsad follow-up)

- **Runtime-ready som enda iframe-swap-signal:** kräver att preview-ready-SSE
  och bootstrap-svaret delas i `queued` vs `runtime-ready` och att klienten
  håller kvar gammal session tills kvittot kommer. Reload-dedupen i denna PR
  tar bort symptomen (multipla reloads) till bråkdelen av risken; ombyggnaden
  kan tas separat om hack kvarstår vid cold boot.
- F2 auto-promotion vid `preview_ready` — promotion-/deploykontraktet behålls
  oförändrat.
- Preview-hostens (Fly) verify-lane och `install`-kostnaden (28 s) — separat
  optimering.
