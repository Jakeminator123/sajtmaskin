# B1 — ta bort verklig legacy

Utförare: 2. Beroende: registrering; skrivning först efter tilldelning.
Status: se [körbordet](../00-master-plan.md).

## Kandidater, inte redan godkända raderingar

| Yta | Utgångsfynd | Nästa handling |
|---|---|---|
| `src/lib/mcp/generate-site.ts` + `src/lib/own-engine/generate-site-from-prompt.ts` | Ingen intern anropare hittad för första exporten; markerad som entry i `knip.json` | Bekräfta entry-/extern konsument. Ta bort kedjan om oanvänd, annars tunn adapter till huvudvägen. |
| `src/lib/gen/preview/legacy/` och `/api/preview-render` | Renderaren avstängd som standard | Separera rendering från hantering av gamla URL:er. Route/feature-radering kräver befintligt trafik-/ägarunderlag. |
| `src/lib/gen/preview/preview-host-client.ts` | `sandboxId`, äldre `projectId`, äldre readiness-kontrakt | Normalisera vid host-adaptern. Radera aliases först när stödda hosts/klienter är kända. |
| `src/lib/gen/preview/env-local.ts` | Full placeholder-katalog när filskope saknas | Kontrollera direkta och indirekta callers; gör nytt kontrakt explicit och ta bort onödig fallback. |
| Tunna wrappers/undantag kring dessa ytor | Möjlig överflödighet | Radera endast där ingen egen semantik eller kompatibilitet försvinner. |

Ändra inte aktiv deploy bara för `/api/v0` i namnet. Gammalt filnamn, `legacy`
eller noll textsökträffar ensamt räcker inte. Läs exakta entrypoints och exporter;
lägg inte veckor på ett trafikunderlag som blockerar en enda kandidat.

## Klart och verifiering

Varje kandidat får REMOVE/CONSOLIDATE/KEEP/NEEDS-OWNER/EVIDENCE med en kort
motivering. Radering tar med exports, tester som bara testar borttagen funktion,
knip-undantag och relevanta docs. Behåll test för kvarvarande kompatibilitet.
Kör referenssökning efteråt, typecheck och berörda tester. Runtimeflaggor ändras
inte för att möjliggöra en snabbare cleanup.

## Resultat

B1.0 readonly-recon klar på `b5b7474e…`. REMOVE: den separata MCP-wrappern,
`generate-site-from-prompt` med eget test och just dess `knip`-entry; enda
kodkedjan är wrapper → generator. KEEP: legacy-URL-shim, aktiva hostfunktioner
och env-/F2/F3-skydd. NEEDS-OWNER/EVIDENCE: `/api/preview-render`, host-aliaser
och äldre readiness-kontrakt. CONSOLIDATE-kandidat: fullkatalog-fallbacken i
env-local, men den kräver separat caller-kontrakt. B1.1 ska ta bort den döda
MCP-kedjan samt uppdatera docs-test, genererad modellprojektion och två
configöversikter. Ingen fil ändrades under recon.

B1.1 implementerad lokalt: tre filer raderade och fem följdytor synkade,
`+11/−853` (netto `−842`). Node 22.23.1; 49 docs-tester, typecheck,
`docs:check` och `git diff --check` passerade. `docs:links` blockeras tills den
nya planmappen Git-spåras vid integration. A1-filernas hashvärden bevarades.
Ingen commit/push; readonly-review klar.

Readonly-review fann inga konkreta fynd: inga kvarvarande interna konsumenter
eller registrerade runtime-ingångar, och knip/docs/projektion är samstämmiga.
Bevisgräns: externa råkällkonsumenter utanför repot och live-runtime är inte
verifierade. Preview/env/host-kandidaterna är fortsatt uppskjutna, inte raderade.
