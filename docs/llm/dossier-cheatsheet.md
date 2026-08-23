# Dossier cheatsheet

Kort användarguide. Full sanningsmodell:
[`docs/contracts/dossier-system.md`](../contracts/dossier-system.md).
Begreppsöversikt: [`FUSKLAPP-BYGGBLOCK.md`](../../övrigt/FUSKLAPP-BYGGBLOCK.md).
Aktuell katalog: [`docs/generated/capabilities.generated.md`](../generated/capabilities.generated.md)
/ [`docs/generated/dossiers.generated.md`](../generated/dossiers.generated.md).

| Behöver du… | Läs |
|---|---|
| Urval + prompt-injection | [`dossier-selection-flow.md`](dossier-selection-flow.md) |
| Skriva ny dossier | [`dossier-author-template.md`](dossier-author-template.md) |
| Axlar / design–integration / mock | [`dossier-system.md` § Tre oberoende axlar](../contracts/dossier-system.md#tre-oberoende-axlar-läs-denna-innan-du-drar-en-slutsats-om-en-dossier) |
| D2–D4 och ordningen | [`dossier-förenkling`](../plans/active/2026-08-19-dossier-forenkling/00-master-plan.md) |

## Tre axlar (kort)

Ingen följer av någon annan. Vanligaste felslutet: "Kopplad ⇒ kräver integrationsbygge".

| Axel | Fråga | Källa |
|---|---|---|
| Kopplad / Fristående | Deklarerad provider-/integrationskoppling? | mappen `hard/` vs `soft/` |
| Demoläge (`mock`) | Designläge utan livekonfiguration? | `manifest.mock` |
| Kräver integrationsbygge | Eget integrationssteg? | `dossierRequiresF3()` (intern kodterm F3) |

Exempel: `vercel-analytics` är Kopplad, har `envVars: []`, men kräver inte ett
separat integrationsbygge enligt `dossierRequiresF3()`. `resend-contact-form`
kräver integrationsbygge för serverfilen, inte för build-nycklar.

## Toggle

```text
SAJTMASKIN_DOSSIER_PIPELINE=true   # på (kod-default)
SAJTMASKIN_DOSSIER_PIPELINE=false  # av (explicit opt-out)
```

## Lägg till dossier (minimum)

1. Mapp `data/dossiers/<hard|soft>/<id>/` + `manifest.json` + `instructions.md`.
2. `hard` → icke-tom `providers`; `soft` → utelämna fältet. Hard: `mock ≠ none`
   om capabilityn inte står i `MOCKLESS_CAPABILITY_EXCEPTIONS`.
3. Sätt `$schema` till `../../../../docs/schemas/strict/dossier.schema.json` för
   editorstöd och samma maskinläsbara kontrakt som runtime/backoffice använder.
4. `npm run dossiers:validate-all` (CI-blockerande).
5. Bygg om capability-map (`npm run dossiers:capability-map:write` eller backoffice).

Ny leverantör under befintlig capability, AI-kuration och borttagningschecklista:
[`dossier-system.md`](../contracts/dossier-system.md).

## Schemat är körbart, inte bara dokumentation

`docs/schemas/strict/dossier.schema.json` importeras av
`src/lib/gen/dossiers/validate-manifest.ts` och kompileras med AJV. Ogiltiga
manifest utesluts ur runtime-poolen. Backoffice validerar mot samma fil före
skrivning och läser enumvärden därifrån. JSON Schema äger formen; TypeScript,
validatorns korsregler och runtimekod äger den fulla semantiken.

## D2 → D3 → D4

Dessa är en kvarvarande kvalitets-/underhållbarhetskedja. Det redan fungerande
produktflödet blockeras inte av dem.

- **D2:** `configInputs` för värden som fylls i hos Sajtmaskin och
  `providerSetup` för verifierbara steg hos leverantören. `envVars` fortsätter
  äga configured/readiness tills en separat migration beslutas.
- **D3:** bygg en intern `HardDossierIntegration` som samlar hard-dossierns
  promptbidrag. Refaktor, inte en ny LLM-agent eller pipelinefas.
- **D4:** ge alla nio hard-dossiers `selected-sections` och verifiera att
  `When to use`, `How to integrate` och `Avoid` faktiskt når modellen.

Kör strikt **D2 → D3 → D4**. Ta inte bort ”Bygg integrationer” och ändra inte
`SELECTED_SECTION_CHAR_CAP = 480` i detta spår.

## Verifiera generering

Logg efter prompt som behöver en capability:

```text
[orchestrate] dossiers_selected { count: 1, byCapability: { payments: ["stripe-checkout"] } }
```

Oupplöst capability → `dossier_capability_unresolved`. Saknad required env →
`[UNCONFIGURED …]` i `## Available Dossiers`. Detaljer i
[`dossier-selection-flow.md`](dossier-selection-flow.md).

## Vanliga filändringar

| Vad | Var |
|---|---|
| Capability LLM kan deklarera | `src/lib/builder/site-brief-generation.ts` |
| Urval | `src/lib/gen/dossiers/select.ts` |
| Prompt-render | `src/lib/gen/system-prompt/sections/dossiers.ts` |
| Schema + runtimevalidering | `docs/schemas/strict/dossier.schema.json` + `src/lib/gen/dossiers/validate-manifest.ts` + `types.ts` |
| Backoffice | `backoffice/pages/dossiers.py` (+ `dossiers_lib/`) |
| Statusord | `src/lib/builder/dossier-overview.ts` |

**Inga embeddings** i dossier-urvalet (deterministiskt). Scaffold-pick använder
fortfarande embeddings — separat system.
