# Runbook: vit preview, tom iframe och shim vs preview-host

**Senast uppdaterad:** 2026-07-11
**Mål:** Snabb felsökning när preview-ytan ser **vit** ut eller **ingen** Next.js-preview syns, plus **förebyggande** åtgärder så samma klass av fel inte upprepas. `preview_host` / VM är den primära previewvägen; shim är bara en kompatibilitetsvy under migration/fallback.

**Sanning i kod:** Shim (`/api/preview-render`) byggs i `src/lib/gen/preview/`; iframe-beteende i `src/components/builder/preview-panel/PreviewPanel.tsx`; tier-2-preview går via `src/lib/gen/preview/preview-session.ts` + `preview-host/`.

---

## 1. Två helt olika preview-lager (förvirring #1)

| Lager | Vad | När det syns |
|--------|-----|----------------|
| **Kompatibilitetsvy — Shim** | Statisk HTML + React 18 från **CDN** (unpkg) + Tailwind från **cdn.tailwindcss.com** | Flaggad diagnostik-/compat-länk till `/api/preview-render?...`; own-engine-versioner bär inte längre `legacyShimPreviewUrl` |
| **Primär preview — `preview_host`** | Riktig `npm run dev` i VM via preview-host | `previewUrl` / faktisk iframe-URL är normalt `*.fly.dev/{chatId}`; `engine_versions.sandbox_url` satt |

**Preflight grön** (`previewBlocked: false`) betyder inte längre “shim funkar”, utan att den aktiva versionen fortfarande kan exponeras. Preview-host kräver **`SAJTMASKIN_PREVIEW_HOST_BASE_URL`** i huvudappen och ev. auth mellan appen och preview-host. Se [`llm-pipeline.md`](../architecture/llm-pipeline.md) § FAS 3 och [`docs/ENV.md`](../ENV.md).

---

## 2. Symptom → trolig orsak → var du bekräftar

### A. Helvit yta, inget felmeddelande i byggaren

1. **Shim:** React/Tailwind från CDN har inte körts eller `#root` är tom efter timeout (10 s i `PreviewPanel`).
   - **Bekräfta:** Webbläsarens DevTools → välj **iframe** `preview-iframe` → **Console** (röda fel) och **Network** (unpkg, tailwind — ska vara 200).
2. **Komponent returnerar `null`** eller kraschar innan första paint.
   - **Bekräfta:** Console i iframe; ev. `preview-error` postMessage till parent (loggas via `reportOwnEngineRenderFailure`).
3. **Preview-host:** Next-appen kraschar eller visar tom sida.
   - **Bekräfta:** Öppna **samma** `previewUrl` / iframe-URL i ny flik; läs Next/overlay-fel.

### B. Toast / röd overlay efter ~45 s: "Previewn laddade inte klart innan timeout"

- **Kod:** `preview_ready_timeout` (`describePreviewDiagnosticCode` i `preview-diagnostics.ts`).
- **Timeout:** `PREVIEW_READY_TIMEOUT_MS = 45_000` i `usePreviewIframe.ts` (höjd från 10s → 45s för att ge VM-boot tid).
- **Vanlig orsak:** Ingen render i `#root` inom tid — ofta CDN blockerad, eller runtime-fel utan synlig text.

### C. "Preview-fel" med röd text *inuti* iframe

- Shim fångat **compile**, **validation** eller **runtime** (`script-builder.ts`, `shims.ts`).
- Då ska **inte** vit tom yta råda; om den gör det, kan overlay-policy i `PreviewPanel` behöva ses över (se backlog).

### E. Preview visar fel/gammal version efter restore eller följdgenerering (`version_mismatch`)

- **Symptom:** DB har en nyare/annan aktiv version än den preview-VM:en kör (prod-fall: v3 aktiv, VM körde trasiga v2). Tidigare fastnade användaren på fel preview tills manuell reload.
- **Nytt beteende (fas 4, klient-drivet — ingen ny polling-loop):**
  1. **Restore/rollback:** när `VersionHistory.performRestore` skapat den nya draftversionen triggar klienten en explicit **forced re-push** av preview-sessionen mot den återställda versionen (`forcePreviewResync(versionId)` → samma forced-restart-primitiv som `missing`/`stopped`/env-restart). Servern river den gamla VM-sessionen (`forceRestart: true`) och bootar en fräsch bunden till rätt version.
  2. **`version_mismatch` (heartbeat/iframe upptäcker drift):** `usePreviewSession` gör **ETT** automatiskt forced-restart-försök per unik `${versionId}:${previewSessionId}` (loop-skydd + befintlig 12s-debounce ⇒ ingen restart-storm). Under det automatiska försöket visas preview-lifecyclens "recovering"-tillstånd, inte mismatch-overlayn.
  3. **Fallback:** om versionen fortfarande divergerar efter det automatiska försöket visas `VersionMismatchOverlay` med en manuell **"Försök igen"** (`onForcePreviewResync`) som alltid tvingar en ny omstart (bypassar loop-skyddet).
- **Var du bekräftar:** `logPreviewLifecycleTelemetry` `kind: "recover"`, `phase: "started"` med `detail: "version_mismatch_auto_resync"` (auto) resp. `"manual_force_resync"` (knapp); serverns `/api/engine/chats/{chatId}/preview-status` returnerar `status: "version_mismatch"` med `mismatchDirection`.

### D. Preview-host startar aldrig

- Sök serverloggar efter: `preview_failed`, `preview_session_disabled` eller preview-host-fel/timeout från `preview-session`.
- Klient: `useBuilderPageController` POST `/preview-session` — vid `preview_session_disabled` finns hint i svar.
- Om buildern visar “Startar live-preview” länge utan iframe-URL: kontrollera `previewPending`, preview-status och npm-install-fel i preview-host före du misstänker att preview “bara är statisk”.
- Med prewarm-kod deployad ska skelett-HTML aldrig proxyas. `prewarm:true` och
  intern `prewarmReplacementPending` använder hostens auto-refreshande HTTP-sida
  och nekar alla WS-upgrades tills riktig runtime passerat readiness. Vid
  `status:error` blir sidan stabil 503 utan refresh/auto-requeue; retry görs
  explicit från appen. `409 prewarm_superseded` är terminalt. `429
  prewarm_rate_limited` retryas inte automatiskt, men en senare user-retry får
  försöka efter lease release/expiry.
- Persisted `status:"starting"` efter host-restart är inte en aktiv boot. Ett
  status-/previewbesök ska återköa booten; om inte, kontrollera att Fly-hosten
  kör versionen med `getRuntimeStateForChat().booting` baserad på in-memory-kön.

---

## 3. Var loggar och spår hamnar

| Signal | Var |
|--------|-----|
| Preview-fel som rapporteras till backend | `POST .../versions/{versionId}/error-log` med `category: "preview"` (`PreviewPanel.tsx`) |
| SSE egen motor | `preview-ready`, `build-error`, `progress` step `verifier` / finalize-steg (`generation-stream.ts`) |
| Agent-/versionsloggar i UI | Er befintliga loggvy som läser version error-log / agent events |

**Rekommendation:** Vid support, alltid samla **chatId**, **versionId**, **aktuell preview-URL** (shim vs preview-session; äldre spår kan fortfarande heta `demoUrl` eller `sandboxUrl`), och **screenshot av iframe-console**.

---

## 4. Förebyggande (så detta "inte ska hända igen")

1. **Preview-host i dev/prod:** Säkerställ `SAJTMASKIN_PREVIEW_HOST_BASE_URL` och att preview-host svarar på `/health` — annars blir användare kvar på shim som är känsligare för CDN. Optional prewarm kräver dessutom `SAJTMASKIN_PREVIEW_HOST_API_KEY`; utan den ska prewarm skippas, inte använda förutsägbar hash.
2. **Genererad kod:** Systemprompt / kontrakt ska kräva **startbar** Next-app och **placeholders** för env (se `pre-generation-contracts.ts`, `config/prompt-core/01-behavioral-contract.md`).
3. **Scaffold:** Ogiltiga npm-versioner i `package.json` bryter preview-host `npm install` — håll `project-scaffold.ts` / låsfiler i synk med npm.
4. **Tester:** `preview.test.ts`, `preview-diagnostics.test.ts`, preview-host-/tier-2-relaterade tester vid ändringar i preview-kedjan.
5. **Prewarm deploy:** kör i `preview-host/`:
   `npm run check`, `npm run test:guards`, `npm run test:proxy-contract`,
   `npm run smoke`; deploya sedan Fly-hosten och verifiera `/health` samt
   admin-endpoints **före** appen. `SAJTMASKIN_PREVIEW_PREWARM` är explicit
   `false` i Vercel Production, Preview och Development; ändra till `true`
   först när hostversionen är live och mätning uttryckligen ska börja.

---

## 5. Produkt: synlig diagnostik i UI

Byggaren visar vid iframe-fel en **kort åtgärdslista** (samma innehåll som punktlistor för respektive felkod) via `previewRunbookLinesForCode()` i `preview-diagnostics.ts`, så användaren inte bara ser en tom yta.

---

## 6. Relaterade dokument

- [`llm-pipeline.md`](../architecture/llm-pipeline.md) § FAS 3 — fidelity, preview-host, verifiering och kedja  
- [`docs/ENV.md`](../ENV.md) — miljövariabler  
- [`docs/README.md`](../README.md) — nav i `docs/`
