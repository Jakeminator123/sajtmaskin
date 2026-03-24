# Build-flöde: åtgärdade punkter (2026-03-24)

Sammanfattning av åtgärder kopplade till granskningsdokumenten `buggar_/5829.md`, `buggar_/7291.md` och `buggar_/7384.md` (filer borttagna efter genomförande).

## Implementerade kodändringar

| Ursprung | Åtgärd |
|----------|--------|
| 5829 — `pendingInstructionsRef` | `captureInstructionSnapshot()` körs bara när dynamiska instruktioner **inte** satte ref (undviker att skriva över med föråldrad `customInstructions` från föregående render). Död dependency `scaffoldMode` borttagen från `applyDynamicInstructionsForNewChat`. |
| 5829 — streamfel + artefakt | Tydligare varningstoast inkluderar texten från `pendingStreamErrorMessage` när en version/demo ändå returnerades. |
| 5829 — postMessage-paritet | Dokumenterat i `docs/architecture/preview-and-sandbox-flow.md` (shim vs sandbox, iframe `load`, ev. framtida bro). |
| 7291 — post-check vs sandbox | Senaste post-check-posten uppdateras med `sandboxUrl` när `sandbox-ready` kommer i samma SSE-ström. |
| 7291 — deep brief / språk | Språkbytes-guardrail (`language_mismatch`) tillämpas inte för `source === "brief"`. |
| 7291 — MCP `filesJson` | Säker `JSON.parse` med array-kontroll och tydligt fel i `generate-site.ts`. |
| 7384 — SSE stängs före sandbox | `startSandboxPreview` **await**-as i `generation-stream.ts` innan `emitDoneWithVersion` returnerar, så `sandbox-ready` / `build-error` hinner skickas före `safeClose()`. |
| 7384 — `sandboxUrl` i UI | `nextDemoUrl`-kedjan tar med `activeVersionMatch?.sandboxUrl` före `demoUrl`. |
| 7384 — `POST /api/sandbox` | Vid misslyckad `npm install`: stoppa sandbox, returnera `502` med `success: false` och feltext. |

## Relaterad dokumentation

- `docs/architecture/preview-and-sandbox-flow.md` — uppdaterat flöde (await sandbox, postMessage/paritet, post-check).
