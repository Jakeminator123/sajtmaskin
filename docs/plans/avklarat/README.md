# Arkiverade planer (`avklarat/`)

Bulk-innehåll som tidigare låg här finns i **git-historik** (filer kan saknas i din klon). **Operativ backlog:** [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md).

## Kort historik (behålls här så `active/` inte duplicerar handoff)

| Avslutat | Var sanningen finns nu |
|----------|-------------------------|
| **2026-03-31** — Storstädning repo/kod/docs (STORDSTAD); kod-epik klar, **Fas D** (backup → tömning → rök) kvar som operativ lista i samma fil | [`STORDSTAD-repo-kod-databas.md`](./STORDSTAD-repo-kod-databas.md) · backlog: [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md) |
| **2026-03-30** — LLM-pipeline (agent-handoff `NEXT-AGENT-LLM-PIPELINE-LIFT.md` borttagen; runbook flyttad hit) | [`LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](./LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md) · handoff-prompt finns i **git-historik** vid behov. |
| **2026-03-30** — Own-engine preview: stängd läcka `demoUrl`/shim vs `sandboxUrl` (klient `useBuilderCallbacks`, GET chat/versions, `legacyShimPreviewUrl`, PreviewPanel, telemetri `/api/preview-render`) | [`preview-deploy.md`](../../architecture/preview-deploy.md) · [`builder-generation.md`](../../architecture/builder-generation.md) · [`PROJECT-STATE` §5](../active/PROJECT-STATE-AND-DIRECTION.md) (tabellraden om stängd läcka). Cursor-plan `own-engine-preview-sandbox-canonical` under `~/.cursor/plans/` kan tas bort manuellt om du inte behöver den. |
| **2026-03-30** — Konsoliderad own-engine + kvalitetsplan (stor roadmap, gamla agentprompten) flyttad ur `active/` | [`CONSOLIDATED-own-engine-platform-and-quality-v2.md`](./CONSOLIDATED-own-engine-platform-and-quality-v2.md) · operativ sanning: [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md) |
| **2026-03-30** — Post-epic cleanup (PreviewPanel-split, docs-städ, merge-flöde) | [`POST-EPIC-CLEANUP.md`](./POST-EPIC-CLEANUP.md) · kod: `PreviewPanel.tsx` + `PreviewPanelCodeSectionEditors.tsx` m.fl. under `preview-panel/` |
| **2026-03-30** — API/SSE: `previewUrl` som enda svarsfält (fas B); inbound `demoUrl` kvar | [`KORPLAN-preview-url-api.md`](./KORPLAN-preview-url-api.md) · `src/lib/api/preview-url-contract.ts` |
