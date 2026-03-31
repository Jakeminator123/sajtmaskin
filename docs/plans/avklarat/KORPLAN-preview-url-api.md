# Körplan (arkiverad): API `previewUrl`

**Status:** **Avslutad** 2026-03-30 — både **fas A** (dual-key i övergång) och **fas B** (publika svar/SSE: endast `previewUrl`) är levererade i kod.  
**Operativ backlog:** [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md).

## Vad som gäller nu (kort)

- **HTTP/SSE JSON:** nyckeln `previewUrl` för samma semantik som tidigare `demoUrl` i API-svar. **`demoUrl` skickas inte** i nya svar.
- **DB:** kolumn `demo_url` / Drizzle `versions.demoUrl` **oförändrad** (ingen rename-migrering i detta spår).
- **Inbound legacy:** `resolveInboundPreviewUrl()` i `src/lib/api/preview-url-contract.ts` — `previewUrl` först, sedan `demoUrl` (webhooks, `POST .../save`-body, gamla SSE-transkript).
- **Kodhjälpare:** `previewUrlField(url)` för svar; `readPreviewUrl()` för strikt läsning av `previewUrl`; `resolveInboundPreviewUrl()` endast där extern payload kan bära `demoUrl`.

## Historik (fas A → B)

1. **Fas A:** Dual-key (`previewUrl` + `demoUrl` med samma värde) för att migrera klienter.
2. **Fas B:** Dual-key bort från svar; klient använder `previewUrl` / `readPreviewUrl` där API är eget; `onGenerationComplete` m.m. utan duplicerad `demoUrl`.

## Verifiering (vid framtida ändringar)

`npm run typecheck` + t.ex. `npx vitest run src/lib/api/preview-url-contract.test.ts src/lib/hooks/chat/stream-handlers.test.ts src/app/api/v0/chats`.

## Referenser

- [`agent-workflows.md`](../../contributing/agent-workflows.md)  
- [`builder-entry-contract.md`](../../schemas/builder-entry-contract.md) § HTTP JSON  
- [`POST-EPIC-CLEANUP.md`](./POST-EPIC-CLEANUP.md) (äldre städspår; API-rad uppdaterad)
