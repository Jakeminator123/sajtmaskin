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

B1.1/B1.2 lokalt klara och granskade utan kvarvarande fynd. Den oanvända
MCP-wrappern, `generate-site-from-prompt`, dess test och knip-entry är borttagna;
fem följdytor är synkade (+11/−853, netto −842). Inga interna konsumenter eller
registrerade runtime-ingångar återstår. Env.example kräver `dossierEnvScope`;
dess oanvända scope-lösa fallback är borttagen (netto −35 rader).

KEEP: legacy-URL-shim, aktiva hostfunktioner, env-/F2/F3-skydd och den separata
runtime-env-resolverns fullkatalogläge. NEEDS-OWNER/EVIDENCE: `/api/preview-render`,
host-aliaser och äldre readiness-kontrakt. Dessa är inte raderade. Externa
råkällkonsumenter och live-runtime har inte verifierats.

Node 22.23.1: B1.1 49 docs-tester; B2.1/B1.2 102 riktade tester, typecheck,
docs-/registerkontroller och diff-check PASS. Docs-links passerar efter
snapshotåterställningen. Det inaktuella ENV-kontraktet rättades och granskades
i B2.2. Andras filer/hashes bevarade; ingen publicering.
