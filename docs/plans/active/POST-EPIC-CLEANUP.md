# Post-epic cleanup-backlog

**Syfte:** Spåra återstående städning efter preview/sandbox-epiken — utan att blanda in i `PROJECT-STATE-AND-DIRECTION.md`. Uppdatera denna fil när punkter är klara.

**Telemetri (sandbox):** strukturerad `console.info` med prefix `[telemetry:sandbox-lifecycle]` — ingen MCP-server; loggar i runtime (t.ex. Vercel Logs). Se [`sandbox-lifecycle-telemetry.ts`](../../../src/lib/gen/sandbox-lifecycle-telemetry.ts).

## Flytta / konsolidera

- [x] `src/lib/builder/preview-session/` — klient-API + typer
- [x] `useSandboxPreviewSession` — recover/debounce/url-resync ur `useBuilderPageController`
- [x] `PreviewPanel`: `usePreviewHeartbeat`, `usePreviewIframe` under `preview-panel/hooks/`
- [x] `useBuilderSandboxPreview` — sandbox-bootstrap/retry ur controllern
- [ ] Ytterligare split av `PreviewPanel.tsx` (inspector, fil-editor-lager) — delpaneler finns redan (`PreviewPanelCode`, `PreviewPanelInspectorDev`, m.fl.); **kvar:** draft-state + handlers + träd/inspektors-orkestrering i huvudfilen (~3,9k rader)
- [ ] Eventuellt `useBuilderProjectRestore` / generation-bootstrap om gränser klarnar

## Byt namn (internt)

- [x] Zon-tabell i `docs/architecture/repo-tree.md`
- [x] Builder-state + VM: `currentPreviewUrl` / `setCurrentPreviewUrl` (tidigare `currentDemoUrl` i state, hooks och `BuilderShellContent`; borttaget duplicerat VM-fält)
- [ ] Props `demoUrl` → `previewUrl` i `PreviewPanel` när VM/BuilderShell uppdateras tillsammans
- [ ] API-fält `demoUrl` i JSON — **lämna** tills explicit migrering av klienter

## Eventuellt ta bort senare

- [x] Shim-kod samlad under `src/lib/gen/preview/legacy/` (importer fortfarande via `@/lib/gen/preview`)
- `/api/preview-render` och shim-kedjan — efter att telemetri visar att legacy-trafik är försumbar
- Dubbla eller föråldrade planfiler (lita på git + `docs/plans/avklarat/`)
- Döda helpervägar som grep/typcheck avslöjar

## Repo-zoner (snabbreferens)

Se [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md) § **Mentala repo-zoner (kod)**.
