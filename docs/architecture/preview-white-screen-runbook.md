# Runbook: vit preview, tom iframe och shim vs sandbox

**Senast uppdaterad:** 2026-03-27  
**Mål:** Snabb felsökning när preview-ytan ser **vit** ut eller **ingen** Next.js-preview syns, plus **förebyggande** åtgärder så samma klass av fel inte upprepas.

**Sanning i kod:** Shim (`/api/preview-render`) byggs i `src/lib/gen/preview/`; iframe-beteende i `src/components/builder/PreviewPanel.tsx`; sandbox i `src/lib/gen/sandbox-preview.ts` + `src/lib/mcp/runtime-url.ts`.

---

## 1. Två helt olika preview-lager (förvirring #1)

| Lager | Vad | När det syns |
|--------|-----|----------------|
| **Tier 1 — Shim** | Statisk HTML + React 18 från **CDN** (unpkg) + Tailwind från **cdn.tailwindcss.com** | `demoUrl` pekar på `/api/preview-render?...` |
| **Tier 2 — Sandbox** | Riktig `npm run dev` i Vercel Sandbox | `demoUrl` är `*.vercel.run` / sandbox-host; `engine_versions.sandbox_url` satt |

**Preflight grön** (`previewBlocked: false`) betyder **inte** att sandbox körts — bara att statiska filkontroller passerade. Sandbox kräver **server-miljö** (`VERCEL_OIDC_TOKEN` eller `VERCEL_TOKEN` + team + project). Se [`preview-deploy.md`](./preview-deploy.md) och [`docs/ENV.md`](../ENV.md).

---

## 2. Symptom → trolig orsak → var du bekräftar

### A. Helvit yta, inget felmeddelande i byggaren

1. **Shim:** React/Tailwind från CDN har inte körts eller `#root` är tom efter timeout (10 s i `PreviewPanel`).
   - **Bekräfta:** Webbläsarens DevTools → välj **iframe** `preview-iframe` → **Console** (röda fel) och **Network** (unpkg, tailwind — ska vara 200).
2. **Komponent returnerar `null`** eller kraschar innan första paint.
   - **Bekräfta:** Console i iframe; ev. `preview-error` postMessage till parent (loggas via `reportOwnEngineRenderFailure`).
3. **Sandbox:** Next-appen kraschar eller visar tom sida.
   - **Bekräfta:** Öppna **samma** `demoUrl` i ny flik; läs Next/overlay-fel.

### B. Toast / röd overlay efter ~10 s: "Previewn laddade inte klart innan timeout"

- **Kod:** `preview_ready_timeout` (`describePreviewDiagnosticCode` i `preview-diagnostics.ts`).
- **Vanlig orsak:** Ingen render i `#root` inom tid — ofta CDN blockerad, eller runtime-fel utan synlig text.

### C. "Preview-fel" med röd text *inuti* iframe

- Shim fångat **compile**, **validation** eller **runtime** (`script-builder.ts`, `shims.ts`).
- Då ska **inte** vit tom yta råda; om den gör det, kan overlay-policy i `PreviewPanel` behöva ses över (se backlog).

### D. Sandbox startar aldrig

- Sök serverloggar efter: `sandbox_preview_failed_shim_fallback`, `sandbox_disabled`, `code: "sandbox_disabled"` (503).
- Klient: `useBuilderPageController` POST `/sandbox-preview` — vid `sandbox_disabled` finns hint i svar.

---

## 3. Var loggar och spår hamnar

| Signal | Var |
|--------|-----|
| Preview-fel som rapporteras till backend | `POST .../versions/{versionId}/error-log` med `category: "preview"` (`PreviewPanel.tsx`) |
| SSE egen motor | `sandbox-ready`, `build-error`, `progress` step `sandbox` (`generation-stream.ts`) |
| Agent-/versionsloggar i UI | Er befintliga loggvy som läser version error-log / agent events |

**Rekommendation:** Vid support, alltid samla **chatId**, **versionId**, **demoUrl** (shim vs sandbox), och **screenshot av iframe-console**.

---

## 4. Förebyggande (så detta "inte ska hända igen")

1. **Sandbox i dev/prod:** Säkerställ Vercel Sandbox-credentials enligt `docs/ENV.md` — annars blir användare kvar på shim som är känsligare för CDN.
2. **Genererad kod:** Systemprompt / kontrakt ska kräva **startbar** Next-app och **placeholders** för env (se `pre-generation-contracts.ts`, `config/prompt-static/11-behavioral-rules.md`).
3. **Scaffold:** Ogiltiga npm-versioner i `package.json` bryter sandbox `npm install` — håll `project-scaffold.ts` / låsfiler i synk med npm.
4. **Tester:** `preview.test.ts`, `preview-diagnostics.test.ts`, sandbox-relaterade tester vid ändringar i preview-kedjan.

---

## 5. Produkt: synlig diagnostik i UI

Byggaren visar vid iframe-fel en **kort åtgärdslista** (samma innehåll som punktlistor för respektive felkod) via `previewRunbookLinesForCode()` i `preview-diagnostics.ts`, så användaren inte bara ser en tom yta.

---

## 6. Relaterade dokument

- [`preview-deploy.md`](./preview-deploy.md) — fidelity, sandbox, kedja  
- [`docs/ENV.md`](../ENV.md) — miljövariabler  
- [`docs/README.md`](../README.md) — nav i `docs/`
