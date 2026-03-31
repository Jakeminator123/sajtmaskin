# Post-epic cleanup-backlog (arkiverad)

**Status:** Avslutad **2026-03-30**. Denna fil ligger i `avklarat/` som **historik**; operativ backlog: [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md).

**Syfte (när filen var aktiv):** Spåra städning efter preview/sandbox-epiken — utan att blanda in i `PROJECT-STATE`.

**Telemetri (sandbox):** strukturerad `console.info` med prefix `[telemetry:sandbox-lifecycle]` — ingen MCP-server; loggar i runtime (t.ex. Vercel Logs). Se [`sandbox-lifecycle-telemetry.ts`](../../../src/lib/gen/sandbox-lifecycle-telemetry.ts).

## Dokumentation som berörts (städvåg till `master`)

Följande **allmänna** `docs/`-ytor ändrades i leveransen (exakt diff: `git log` / `git show`). Kod under `src/` listas inte här — se merge-commits för preview/builder-split.

| Område | Vad som hände |
|--------|----------------|
| [`docs/README.md`](../../../README.md) | Nav och pekare uppdaterade |
| [`documentation-lifecycle.md`](../../../architecture/documentation-lifecycle.md) | Policy / handoffs-formulering |
| [`docs/archive/`](../../../archive/) | `FINDINGS.txt` borttagen; `README.md` justerad |
| [`docs/handoffs/bilder/`](../../../handoffs/bilder/) | Äldre mermaid-export-PNG borttagna (kvar i git-historik) |
| [`docs/notes/`](../../../notes/) | `builder-smoke-2026-03-27.txt` borttagen (kvar i git-historik) |
| [`docs/old/README.md`](../../../old/README.md) | Pekare uppdaterad |
| [`docs/plans/README.md`](../README.md) | Aktiv vs avklarat |
| [`PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md) | Backlog/beslut (löpande) |
| `docs/plans/avklarat/` | Konsoliderad plan m.m. (se övriga filer här) |

## Flytta / konsolidera (levererat)

- [x] `src/lib/builder/preview-session/` — klient-API + typer
- [x] `useSandboxPreviewSession` — recover/debounce/url-resync ur `useBuilderPageController`
- [x] `PreviewPanel`: `usePreviewHeartbeat`, `usePreviewIframe` under `preview-panel/hooks/`
- [x] `useBuilderSandboxPreview` — sandbox-bootstrap/retry ur controllern
- [x] `PreviewPanel.tsx` — split klar för epikens syfte (**~718 rader** huvudfil efter sista passet). **Utflyttat:**
  - [x] Typer + route-hjälpare; GET versionsfiler → `chat-version-files-fetch.ts`; previewRoutes → `hooks/usePreviewPanelPreviewRoutes.ts` + `preview-route-helpers.ts`
  - [x] Kodvy / filträd / spara fil → `usePreviewPanelCodeFiles`, `code-file-tree-utils`, `update-file-tree-content`
  - [x] Sektionsdrafts + save-handlers → `hooks/usePreviewPanelCodeDrafts.ts`
  - [x] Kodvyns sektionsredigerare + raw/CodeBlock-yta → `PreviewPanelCodeSectionEditors.tsx` (~1,5k rader)
  - [x] Elementkarta, inspect-läge, placement, map-hover + relaterade effekter → `hooks/usePreviewPanelInspectMapPlacement.ts`
  - [x] Own-engine `postMessage` + preview-issue/render-outcome-telemetri → `hooks/usePreviewPanelOwnEnginePreviewTelemetry.ts` (delad `iframeRef` med `usePreviewIframe`)
  - [x] `handleCaptureClick` + pending/pulse-state → `hooks/usePreviewPanelInspectCapture.ts`
- [x] `useBuilderPageController` — preview-URL/override-hjälpare → `builder-page-preview-helpers.ts`
- [x] `useBuilderProjectRestore` / generation-bootstrap — **ingen hook med det namnet i `src/`;** motsvarande beteende ligger i `useBuilderPageController` respektive `useBuilderSandboxPreview`.

## Byt namn (internt)

- [x] Zon-tabell i `docs/architecture/repo-tree.md`
- [x] Builder-state + VM: `currentPreviewUrl` / `setCurrentPreviewUrl` (tidigare `currentDemoUrl` i state, hooks och `BuilderShellContent`; borttaget duplicerat VM-fält)
- [x] Props `demoUrl` → `previewUrl` i `PreviewPanel` + `BuilderShellContent` + relaterade hooks/chrome ( **`demoUrl` behålls som nyckel** i events/API-meta där backend/kontrakt kräver det)
- [x] API-fält: publika svar använder `previewUrl` (ingen `demoUrl` i svar); inbound legacy kvar — se [`KORPLAN-preview-url-api.md`](./KORPLAN-preview-url-api.md)

## Eventuellt ta bort senare (parking lot — inte del av epikens scope)

- [x] Shim-kod samlad under `src/lib/gen/preview/legacy/` (importera `@/lib/gen/preview/legacy/compatibility-shim` eller `build-preview-document`; ingen barrel-`index` under `gen/preview`)
- `/api/preview-render` och shim-kedjan — efter att telemetri visar att legacy-trafik är försumbar
- Dubbla eller föråldrade planfiler (lita på git + `docs/plans/avklarat/`)
- Döda helpervägar som grep/typcheck avslöjar

## Repo-zoner (snabbreferens)

Se [`docs/architecture/repo-tree.md`](../../../architecture/repo-tree.md) § **Mentala repo-zoner (kod)**.
