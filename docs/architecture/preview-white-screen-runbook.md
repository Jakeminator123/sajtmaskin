# Runbook: vit preview, tom iframe och shim vs preview-host

**Senast uppdaterad:** 2026-04-02  
**Mål:** Snabb felsökning när preview-ytan ser **vit** ut eller **ingen** Next.js-preview syns, plus **förebyggande** åtgärder så samma klass av fel inte upprepas. `preview_host` / VM är den primära previewvägen; shim är bara en kompatibilitetsvy under migration/fallback.

**Sanning i kod:** Shim (`/api/preview-render`) byggs i `src/lib/gen/preview/`; iframe-beteende i `src/components/builder/preview-panel/PreviewPanel.tsx`; tier-2-preview i `src/lib/gen/sandbox/sandbox-preview.ts` + `preview-host/`.

---

## 1. Två helt olika preview-lager (förvirring #1)

| Lager | Vad | När det syns |
|--------|-----|----------------|
| **Kompatibilitetsvy — Shim** | Statisk HTML + React 18 från **CDN** (unpkg) + Tailwind från **cdn.tailwindcss.com** | `legacyShimPreviewUrl` eller äldre `demoUrl` pekar på `/api/preview-render?...` |
| **Primär preview — `preview_host`** | Riktig `npm run dev` i VM via preview-host | `previewUrl` / faktisk iframe-URL är normalt `*.fly.dev/{chatId}`; `engine_versions.sandbox_url` satt |

**Preflight grön** (`previewBlocked: false`) betyder inte längre “shim funkar”, utan att den aktiva versionen fortfarande kan exponeras. Preview-host kräver **`SAJTMASKIN_PREVIEW_HOST_BASE_URL`** i huvudappen och ev. auth mellan appen och preview-host. Se [`preview-deploy.md`](./preview-deploy.md) och [`docs/ENV.md`](../ENV.md).

---

## 2. Symptom → trolig orsak → var du bekräftar

### A. Helvit yta, inget felmeddelande i byggaren

1. **Shim:** React/Tailwind från CDN har inte körts eller `#root` är tom efter timeout (10 s i `PreviewPanel`).
   - **Bekräfta:** Webbläsarens DevTools → välj **iframe** `preview-iframe` → **Console** (röda fel) och **Network** (unpkg, tailwind — ska vara 200).
2. **Komponent returnerar `null`** eller kraschar innan första paint.
   - **Bekräfta:** Console i iframe; ev. `preview-error` postMessage till parent (loggas via `reportOwnEngineRenderFailure`).
3. **Preview-host:** Next-appen kraschar eller visar tom sida.
   - **Bekräfta:** Öppna **samma** `previewUrl` / iframe-URL i ny flik; läs Next/overlay-fel.

### B. Toast / röd overlay efter ~10 s: "Previewn laddade inte klart innan timeout"

- **Kod:** `preview_ready_timeout` (`describePreviewDiagnosticCode` i `preview-diagnostics.ts`).
- **Vanlig orsak:** Ingen render i `#root` inom tid — ofta CDN blockerad, eller runtime-fel utan synlig text.

### C. "Preview-fel" med röd text *inuti* iframe

- Shim fångat **compile**, **validation** eller **runtime** (`script-builder.ts`, `shims.ts`).
- Då ska **inte** vit tom yta råda; om den gör det, kan overlay-policy i `PreviewPanel` behöva ses över (se backlog).

### D. Preview-host startar aldrig

- Sök serverloggar efter: `sandbox_preview_failed_shim_fallback`, `sandbox_disabled` eller preview-host-fel/timeout från `sandbox-preview`.
- Klient: `useBuilderPageController` POST `/sandbox-preview` — vid `sandbox_disabled` finns hint i svar.
- Om buildern visar “Startar live-preview” länge utan iframe-URL: kontrollera `sandboxPending`, readiness-timeout och npm-install-fel i preview-host före du misstänker att preview “bara är statisk”.

---

## 3. Var loggar och spår hamnar

| Signal | Var |
|--------|-----|
| Preview-fel som rapporteras till backend | `POST .../versions/{versionId}/error-log` med `category: "preview"` (`PreviewPanel.tsx`) |
| SSE egen motor | `sandbox-ready`, `build-error`, `progress` step `sandbox` (`generation-stream.ts`) |
| Agent-/versionsloggar i UI | Er befintliga loggvy som läser version error-log / agent events |

**Rekommendation:** Vid support, alltid samla **chatId**, **versionId**, **aktuell preview-URL** (shim vs sandbox; äldre spår kan fortfarande heta `demoUrl`), och **screenshot av iframe-console**.

---

## 4. Förebyggande (så detta "inte ska hända igen")

1. **Preview-host i dev/prod:** Säkerställ `SAJTMASKIN_PREVIEW_HOST_BASE_URL` och att preview-host svarar på `/health` — annars blir användare kvar på shim som är känsligare för CDN.
2. **Genererad kod:** Systemprompt / kontrakt ska kräva **startbar** Next-app och **placeholders** för env (se `pre-generation-contracts.ts`, `config/prompt-static/11-behavioral-rules.md`).
3. **Scaffold:** Ogiltiga npm-versioner i `package.json` bryter preview-host `npm install` — håll `project-scaffold.ts` / låsfiler i synk med npm.
4. **Tester:** `preview.test.ts`, `preview-diagnostics.test.ts`, preview-host-/tier-2-relaterade tester vid ändringar i preview-kedjan.

---

## 5. Produkt: synlig diagnostik i UI

Byggaren visar vid iframe-fel en **kort åtgärdslista** (samma innehåll som punktlistor för respektive felkod) via `previewRunbookLinesForCode()` i `preview-diagnostics.ts`, så användaren inte bara ser en tom yta.

---

## 6. Relaterade dokument

- [`preview-deploy.md`](./preview-deploy.md) — fidelity, preview-host, verifiering och kedja  
- [`docs/ENV.md`](../ENV.md) — miljövariabler  
- [`docs/README.md`](../README.md) — nav i `docs/`
