# Dossier cheatsheet

Kort användarguide. Full sanningsmodell:
[`docs/contracts/dossier-system.md`](../contracts/dossier-system.md).
Begreppsöversikt: [`FUSKLAPP-BYGGBLOCK.md`](../../FUSKLAPP-BYGGBLOCK.md).
Aktuell katalog: [`docs/generated/capabilities.generated.md`](../generated/capabilities.generated.md)
/ [`docs/generated/dossiers.generated.md`](../generated/dossiers.generated.md).

| Behöver du… | Läs |
|---|---|
| Urval + prompt-injection | [`dossier-selection-flow.md`](dossier-selection-flow.md) |
| Skriva ny dossier | [`dossier-author-template.md`](dossier-author-template.md) |
| Axlar / F2–F3 / mock | [`dossier-system.md` § Tre oberoende axlar](../contracts/dossier-system.md#tre-oberoende-axlar-läs-denna-innan-du-drar-en-slutsats-om-en-dossier) |

## Tre axlar (kort)

Ingen följer av någon annan. Vanligaste felslutet: "Kopplad ⇒ kräver F3".

| Axel | Fråga | Källa |
|---|---|---|
| Kopplad / Fristående | Extern provider? | mappen `hard/` vs `soft/` |
| Demoläge (`mock`) | F2 utan nyckel? | `manifest.mock` |
| Kräver F3 | Eget integrationssteg? | `dossierRequiresF3()` |

Exempel: `vercel-analytics` är Kopplad, har `envVars: []`, kräver inte F3.
`resend-contact-form` kräver F3 för serverfilen, inte för build-nycklar.

## Toggle

```
SAJTMASKIN_DOSSIER_PIPELINE=true   # på (kod-default)
SAJTMASKIN_DOSSIER_PIPELINE=false  # av (explicit opt-out)
```

## Lägg till dossier (minimum)

1. Mapp `data/dossiers/<hard|soft>/<id>/` + `manifest.json` + `instructions.md`.
2. `hard` → icke-tom `providers`; `soft` → utelämna fältet. Hard: `mock ≠ none`
   om capabilityn inte står i `MOCKLESS_CAPABILITY_EXCEPTIONS`.
3. `npm run dossiers:validate-all` (CI-blockerande).
4. Bygg om capability-map (`npm run dossiers:capability-map:write` eller backoffice).

Ny leverantör under befintlig capability, AI-kuration och borttagningschecklista:
[`dossier-system.md`](../contracts/dossier-system.md).

## Verifiera generering

Logg efter prompt som behöver en capability:

```
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
| Prompt-render | `src/lib/gen/system-prompt/` |
| Schema | `docs/schemas/strict/dossier.schema.json` + `src/lib/gen/dossiers/types.ts` |
| Backoffice | `backoffice/pages/dossiers.py` (+ `dossiers_lib/`) |

**Inga embeddings** i dossier-urvalet (deterministiskt). Scaffold-pick använder
fortfarande embeddings — separat system.
