# Åtgärdade buggar — build-flöde (2026-03-24)

Rapport över fixar från granskningarna **5829**, **7291** och **7384** (egen motor, preview/shim, sandbox, prompt assist, MCP). Ursprungliga anteckningsfiler under `buggar_/` togs bort efter implementation.

## Snabböversikt (tabell)

| Ursprung | Vad som åtgärdats |
|----------|-------------------|
| 5829 — `pendingInstructionsRef` | `captureInstructionSnapshot()` körs bara när dynamiska instruktioner *inte* redan satt ref. `scaffoldMode` borttagen från dependency-listan i `applyDynamicInstructionsForNewChat`. |
| 5829 — streamfel + artefakt | Varningstoast inkluderar `pendingStreamErrorMessage` när version/demo ändå returnerades. |
| 5829 — postMessage | Dokumenterat i `docs/architecture/preview-and-sandbox-flow.md`. |
| 7291 — post-check | Sista post-check-posten får `sandboxUrl` vid `sandbox-ready` i samma SSE-ström. |
| 7291 — deep brief | Ingen `language_mismatch`-guardrail för `source === "brief"`. |
| 7291 — MCP | Säker `JSON.parse` av `filesJson` + array-krav i `generate-site.ts`. |
| 7384 — SSE / sandbox | `await startSandboxPreview` i `generation-stream.ts` före stream stängs. |
| 7384 — demo-URL | `activeVersionMatch?.sandboxUrl` i `nextDemoUrl`-kedjan (`useBuilderPageController.ts`). |
| 7384 — `/api/sandbox` | Installfel → stoppa sandbox, **502** + `success: false`. |

## Filer i kodbasen (huvudsakliga)

- `src/app/builder/useBuilderPromptActions.ts`
- `src/lib/hooks/chat/stream-handlers.ts`
- `src/lib/providers/own-engine/generation-stream.ts`
- `src/app/builder/useBuilderPageController.ts`
- `src/app/api/sandbox/route.ts`
- `src/lib/hooks/usePromptAssist.ts`
- `src/lib/mcp/generate-site.ts`
- `docs/architecture/preview-and-sandbox-flow.md`

## Kort per tema

**Instruktioner:** Efter deep brief ska `pendingInstructionsRef` inte skrivas över av gammal React-state.

**Preview:** `sandbox-ready` ska hinna över SSE; post-check och versionsväxling ska kunna använda sandbox-URL; manuell sandbox-API väg ska inte ljuga om install.

**postMessage:** Shim vs extern sandbox — olika signaler; dokumenterat.

**Prompt / MCP:** Svensk användartext + engelsk brief ska inte kastas av språkguardrail; MCP ska inte krascha på ogiltig `filesJson`.
