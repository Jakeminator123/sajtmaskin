# Preview och sandbox — demo-URL-flöde (own engine)

**Senast uppdaterad:** 2026-03-25 (fidelity / build vs dev, sandbox-felsökning)

Det här dokumentet beskriver hur **demo-URL** och **förhandsvisning** fungerar när användaren promptar i buildern med **egen motor** (inte v0-fallback). För Vercel Sandbox-autentisering, se [vercel-sandbox-credentials.md](./vercel-sandbox-credentials.md).

**Driftnorm (ephemeral):** se avsnitt [Ephemeral preview vs långlivade stödtjänster](#ephemeral-preview-vs-långlivade-stödtjänster) — kort sagt: **ingen** “alltid varm sandbox per projekt” som standard; shim + **on-demand** sandbox för aktiv iteration.

## Demo-URL-prioritet i UI

När en version har både **shim-URL** (`/api/preview-render`) och **`sandbox_url`** i databasen prioriteras **sandbox** före extern v0-hostad preview och före shim, så att du ser full Next-runtime när den finns.

## Två faser: snabb HTML-shim, sedan riktig Next.js (valfritt)

Efter att en version sparats får klienten nästan alltid en **`demoUrl` direkt i SSE `done`**-eventet. Den pekar på **`/api/preview-render`** (byggd av `buildPreviewUrl` i [`src/lib/gen/preview/index.ts`](../../src/lib/gen/preview/index.ts)). Den routen renderar en **självständig HTML-sida** med CDN Tailwind + React UMD — en **snabb visuell approximation**, inte en full Next.js-server.

Om sandbox är konfigurerad (`isSandboxConfigured()` i [`src/lib/mcp/runtime-url.ts`](../../src/lib/mcp/runtime-url.ts)) startar servern efter `done` en riktig miljö via [`startSandboxPreview`](../../src/lib/gen/sandbox-preview.ts) (**`npm install`** sedan **`npm run dev`** i `@vercel/sandbox`, se [`createSandboxRuntimeFromFiles`](../../src/lib/mcp/runtime-url.ts)). **`npm run build` körs inte** i det här flödet — du får en **Next.js dev-server** på sandlådans URL, inte en statisk export och inte `next start` efter production build. **SSE-strömmen väntar** på att sandbox-steget slutförts (eller fel rapporterats) innan anslutningen stängs, så att `sandbox-ready` / `build-error` hinner levereras till klienten. Resultatet skickas som:

- **`sandbox-ready`** — `sandboxUrl` ersätter `demoUrl` i klienten ([`stream-handlers.ts`](../../src/lib/hooks/chat/stream-handlers.ts)).
- **`build-error`** — fel från t.ex. `npm install` (toast + progress).

Därför kan användaren **först** se shim-URL:en i några sekunder, sedan bytas till sandbox-domänen när den är klar.

### «Hög fidelity» vs shim (praktisk tolkning)

| Läge | Vad som körs | Ungefär som |
|------|----------------|---------------|
| **Shim** (`/api/preview-render?…`) | En **servergenererad HTML-sida** (CDN Tailwind, React UMD) | Snabb **statisk approximation** av utseendet — **inte** hela Next-runtime. |
| **Sandbox** (`*.vercel.run` / sandbox-host) | **`npm install`** + **`npm run dev`** i isolerad miljö | Riktig **Next dev**-app; närmare lokal `npm run dev` än shim. **Inte** samma som `npm run build && npm run start`. |

### Vanliga symtom

- **`502` / `SANDBOX_NOT_LISTENING`:** proxyn når inte processen på förväntad port (t.ex. `next dev` har inte hunnit lyssna, kraschat, eller timeout). Inte samma fel som «trasig statisk fil».
- **`WebSocket` till `/_next/webpack-hmr` som failar** mot en sandbox-/preview-host: HMR är **dev-server**-artefakt; i blandade miljöer (inbäddad preview, fel bas-URL) kan det bli **brus i konsolen** utan att det förklarar hela appbeteendet.
- **Två «Agentlogg»-block** (olika promptlängd / metadata): ofta **två SSE-körningar** — t.ex. första stannar på **kontraktsfråga** (metadata visar infererat `persisted` m.m.), andra kör **efter ditt svar** med kort användartext; **data mode** i UI kan ändras när svaret tolkas som «ingen vald DB än» (produktlogik), inte för att preview plötsligt blev statisk.

```mermaid
sequenceDiagram
  participant UI as Builder_UI
  participant API as OwnEngine_Stream
  participant Fin as finalizeAndSaveVersion
  participant SB as startSandboxPreview

  UI->>API: POST stream
  API->>Fin: spara version files_json
  Fin-->>API: previewUrl via buildPreviewUrl
  API->>UI: SSE done demoUrl equals previewUrl
  opt isSandboxConfigured
    API->>SB: await startSandboxPreview (innan stream stängs)
    SB-->>UI: sandbox-ready eller build-error
    Note over UI: demoUrl uppdateras till sandboxUrl; post-check använder sandbox-URL om den kommit
  end
```

## Var i koden

| Steg | Fil / symbol |
|------|----------------|
| Final `previewUrl` | [`finalize-version.ts`](../../src/lib/gen/stream/finalize-version.ts) — `buildPreviewUrl(chatId, version.id)` om preflight inte blockerar preview |
| SSE `done` | [`generation-stream.ts`](../../src/lib/providers/own-engine/generation-stream.ts) — `demoUrl: finalized.previewUrl` |
| Sandbox efter `done` | Samma fil — `startSandboxPreview(parseCodeProject(...).files)` |
| SSE-kontrakt | [`builder-stream-contract.ts`](../../src/lib/gen/stream/builder-stream-contract.ts) — `sandbox-ready`, `build-error` |
| Klient | [`stream-handlers.ts`](../../src/lib/hooks/chat/stream-handlers.ts) — uppdaterar `currentDemoUrl` |
| HTML-shim | [`preview-render/route.ts`](../../src/app/api/preview-render/route.ts), [`buildPreviewHtml`](../../src/lib/gen/preview/index.ts) |
| DB: sparad sandbox-URL | [`engine_versions.sandbox_url`](../../src/lib/db/schema.ts) — uppdateras vid lyckad sandbox |

## PreviewPanel och `postMessage`

[`PreviewPanel.tsx`](../../src/components/builder/PreviewPanel.tsx) lyssnar på `postMessage` från iframen (`sajtmaskin-preview`) för **own-engine shim** (navigation, `preview-ready`, `preview-error`). En **sandbox-URL** är en vanlig Next-app på annan host — samma postMessage-protokoll gäller **inte** automatiskt där (kräver injicerad bro i den genererade appen om ni vill ha identiska signaler).

**Praktisk paritet idag:** För shim pollar panelen egen DOM och `preview-ready`; för **sandbox** (och andra externa URL:er) används iframe-`load` för att släppa laddningsindikator (`handleIframeLoad`), men strukturerade fel/navigationshändelser från `postMessage` finns bara där shim-skriptet skickar dem. Versionssynk: om API:t returnerar `sandboxUrl` på en version prioriteras den i demo-URL-kedjan när användaren byter aktiv version ([`useBuilderPageController`](../../src/app/builder/useBuilderPageController.ts)).

## MCP-generering (annan väg)

[`generate-site.ts`](../../src/lib/mcp/generate-site.ts) (`generateSiteFromPrompt`) väljer runtime explicit:

- `runtimeMode === "sandbox"` → `createSandboxRuntimeFromFiles` direkt efter finalize.
- annars → `buildOwnEnginePreviewRuntime` (preview-URL mot samma chat/version).

Det är **inte** samma SSE-kedja som builder-stream; dokumentera skillnaden om du felsöker MCP vs UI.

## Lagring och paritet med "hel app"

- **Sanningskälla för genererad kod:** `engine_versions.files_json` (+ valfri `sandbox_url`).
- **Modellen instrueras** (bl.a. [`08-scaffold-starters.md`](../../config/prompt-static/08-scaffold-starters.md)) att målet är **`next build`** och full npm-upplösning — i linje med sandbox, inte med shim-begränsningar.
- **Shim** är ett **komplement** för snabb feedback; arkitektoniskt är **sandbox** (eller deploy) den som validerar full Next/React.

## Env-placeholders för genererade sajter (medvetet inte auto-injicerade)

För **slutanvändarens** genererade Next-projekt finns ett repo-kontrakt under [`config/ai_models/`](../../config/ai_models/) (`generatedSiteIntegrationPlaceholders` + `40-generated-site-integration-placeholders.env.txt`) och Node-hjälparen `readGeneratedSitePlaceholdersEnvText()` i [`load-generated-site-placeholders.ts`](../../src/lib/ai-models/load-generated-site-placeholders.ts). **Sajtmaskin kopplar ännu inte in** den filen automatiskt i preview eller sandbox; nästa steg är att vid behov anropa läsaren när sandbox eller MCP skriver miljö till den genererade appen. Se [`config/ai_models/_READ_ME_FIRST.md`](../../config/ai_models/_READ_ME_FIRST.md) (avsnitt Handoff).

## Ephemeral preview vs långlivade stödtjänster

**Produktspåret (användare / builder)** ska bete sig **ephemeral**:

| Steg | Kostnad / livslängd | Kommentar |
|------|---------------------|-----------|
| **HTML-shim** (`/api/preview-render`) | Låg, per laddning | Alltid tillgänglig approximation direkt efter `done`. |
| **Vercel Sandbox** (`startSandboxPreview`) | Högre, **startas vid behov** | Körs när sandbox är konfigurerad och flödet ska validera riktig Next/npm — inte tänkt som permanent värd för alla gamla versioner. |
| **Deploy till Vercel** | Produktions-URL | Långlivad yta för slutkund; separat från dev-preview. |

**Undvik** som standardarkitektur: en dedikerad, ständigt igång full Next-runtime **per** inaktivt kundprojekt — det skalar dåligt mot kostnad och komplexitet.

**Långlivade eller tunga stödtjänster** (repo-/dev-läge, inte samma sak som slutanvändarens preview):

| Tjänst | Var | Syfte |
|--------|-----|--------|
| **Inspector / capture worker** | `services/inspector-worker/`, `infra/inspector-worker/docker-compose.yml` | Playwright-liknande fångst; kan köras lokalt eller i **en** delad container/VM. |
| **Vercel-templates discovery** | `e2e/vercel-templates/` (Playwright), `research/external-templates/` | Offline research → dossiers/artifacts; **inte** builder-preview. |
| **Repo-cache / rå discovery** | `research/external-templates/repo-cache/`, `raw-discovery/` (gitignored) | Kuratering och skrap; ska inte blandas ihop med runtime-preview. |

**Praktisk vägledning:** håll **en** stabil Linux-VM eller container-värd för inspector och liknande batch-jobb om de ska ligga uppe kontinuerligt; låt **sandbox** vara **on-demand** kopplad till aktiv generering eller explicit användaråtgärd. För skillnad mellan **app-runtime**, **MCP** och **Cursor-orchestrator**, se [`docs/contributing/agent-workflows.md`](../contributing/agent-workflows.md).

*Sektionen ovan motsvarar även rekommendationen i `.j_to_agent/3.txt` (extern granskning): ephemeral preview/sandbox som norm, separat värd för långlivade stödtjänster.*

## Relaterad dokumentation

- [vercel-sandbox-credentials.md](./vercel-sandbox-credentials.md)
- [prompt-tree.md](./prompt-tree.md) — hur systemprompten byggs
- [integrations-and-data.md](../schemas/integrations-and-data.md) — tabeller för versioner och `project_data`
