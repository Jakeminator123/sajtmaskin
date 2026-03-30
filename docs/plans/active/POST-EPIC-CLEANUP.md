# Post-epic cleanup-backlog

**Syfte:** Spåra återstående städning efter preview/sandbox-epiken — utan att blanda in i `PROJECT-STATE-AND-DIRECTION.md`. Uppdatera denna fil när punkter är klara.

**Telemetri (sandbox):** strukturerad `console.info` med prefix `[telemetry:sandbox-lifecycle]` — ingen MCP-server; loggar i runtime (t.ex. Vercel Logs). Se [`sandbox-lifecycle-telemetry.ts`](../../../src/lib/gen/sandbox-lifecycle-telemetry.ts).

## Dokumentation som berörts (samma städvåg som preview/builder-merge till `master`)

Följande **allmänna** `docs/`-ytor ändrades i leveransen (exakt diff: `git log` / `git show` på merge till `master`). Kod under `src/` listas inte här — se commit `refactor(builder): split PreviewPanel…`.

| Område | Vad som hände |
|--------|----------------|
| [`docs/README.md`](../../README.md) | Nav och pekare uppdaterade |
| [`documentation-lifecycle.md`](../../architecture/documentation-lifecycle.md) | Policy / handoffs-formulering |
| [`docs/archive/`](../../archive/) | `FINDINGS.txt` borttagen; `README.md` justerad |
| [`docs/handoffs/bilder/`](../../handoffs/bilder/) | Äldre mermaid-export-PNG borttagna (kvar i git-historik) |
| [`docs/notes/`](../../notes/) | `builder-smoke-2026-03-27.txt` borttagen (kvar i git-historik) |
| [`docs/old/README.md`](../../old/README.md) | Pekare uppdaterad |
| [`docs/plans/README.md`](../README.md) | Aktiv vs avklarat |
| [`PROJECT-STATE-AND-DIRECTION.md`](./PROJECT-STATE-AND-DIRECTION.md) | Backlog/beslut (löpande) |
| [`docs/plans/avklarat/`](../avklarat/) | `CONSOLIDATED-own-engine-platform-and-quality-v2.md` flyttad från `active/` hit; `LLM-PIPELINE-…` och `README.md` mindre uppdateringar |

## Flytta / konsolidera

- [x] `src/lib/builder/preview-session/` — klient-API + typer
- [x] `useSandboxPreviewSession` — recover/debounce/url-resync ur `useBuilderPageController`
- [x] `PreviewPanel`: `usePreviewHeartbeat`, `usePreviewIframe` under `preview-panel/hooks/`
- [x] `useBuilderSandboxPreview` — sandbox-bootstrap/retry ur controllern
- [ ] `PreviewPanel.tsx` — **fortsatt split** (huvudfil ~2,2k rader). **Redan utflyttat:**
  - [x] Typer + route-hjälpare; GET versionsfiler → `chat-version-files-fetch.ts`; previewRoutes → `hooks/usePreviewPanelPreviewRoutes.ts` + `preview-route-helpers.ts`
  - [x] Kodvy / filträd / spara fil → `usePreviewPanelCodeFiles`, `code-file-tree-utils`, `update-file-tree-content`
  - [x] Sektionsdrafts + save-handlers → `hooks/usePreviewPanelCodeDrafts.ts`
  - [x] Elementkarta, inspect-läge, placement, map-hover + relaterade effekter → `hooks/usePreviewPanelInspectMapPlacement.ts`
  - [x] Own-engine `postMessage` + preview-issue/render-outcome-telemetri → `hooks/usePreviewPanelOwnEnginePreviewTelemetry.ts` (delad `iframeRef` med `usePreviewIframe`)
  - [x] `handleCaptureClick` + pending/pulse-state → `hooks/usePreviewPanelInspectCapture.ts`
  - [ ] **Kvar i huvudfilen:** stor JSX-yta och övrig panelorkestrering (t.ex. preview/code/registry/sandbox-layout och koppling till state/props)
- [x] `useBuilderPageController` — preview-URL/override-hjälpare → `builder-page-preview-helpers.ts` (huvudhooken är fortfarande stor; vidare split senare)
- [x] `useBuilderProjectRestore` / generation-bootstrap — **ingen hook med det namnet i `src/`;** motsvarande beteende ligger i `useBuilderPageController` (auto-projekt / `lastProjectId`) respektive `useBuilderSandboxPreview` (sandbox-bootstrap). Ny extraktion bara om ni namnger ett nytt konkret steg.

## Byt namn (internt)

- [x] Zon-tabell i `docs/architecture/repo-tree.md`
- [x] Builder-state + VM: `currentPreviewUrl` / `setCurrentPreviewUrl` (tidigare `currentDemoUrl` i state, hooks och `BuilderShellContent`; borttaget duplicerat VM-fält)
- [x] Props `demoUrl` → `previewUrl` i `PreviewPanel` + `BuilderShellContent` + relaterade hooks/chrome ( **`demoUrl` behålls som nyckel** i events/API-meta där backend/kontrakt kräver det)
- [ ] API-fält `demoUrl` i JSON — **lämna** tills explicit migrering av klienter

## Eventuellt ta bort senare

- [x] Shim-kod samlad under `src/lib/gen/preview/legacy/` (importer fortfarande via `@/lib/gen/preview`)
- `/api/preview-render` och shim-kedjan — efter att telemetri visar att legacy-trafik är försumbar
- Dubbla eller föråldrade planfiler (lita på git + `docs/plans/avklarat/`)
- Döda helpervägar som grep/typcheck avslöjar

## Repo-zoner (snabbreferens)

Se [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md) § **Mentala repo-zoner (kod)**.
