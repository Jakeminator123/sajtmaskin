# 2026-04-23 — Showcase-bug rotorsaksfix

**TL;DR:** En genererad `/showcase`-sida renderade vit pga TS1361 (+ tre besläktade bugs) i LLM-output. Samtidigt visade UI:n "Fel" innan server-verify hunnit köra, som en separat inversion. Fyra rotorsaker adresserades i ett pass:
1. Deterministiska fixers fanns inte för dessa exakta mönster
2. Prompt-core saknade counter-examples (bara positiva)
3. Warm-tsc/warm-eslint kördes aldrig blocking i dev eftersom cachen aldrig provisionerats
4. UI-status-inversionen pre-committade `failed` baserat på verifier-LLM ensamt

## Kronologi (empirisk körning chat `341cdc37-31e5-4306-bba4-89fbb7343c2f`, version `f5ddfa39`)

| Tid | Händelse | Status |
|---|---|---|
| 14:24 | Generering start, 2 sidor (`/`, `/showcase`) | — |
| 14:32:08 | Version sparad, preflight 0 errors | `previewBlocked: false` |
| 14:32:08 | Verifier-LLM rapporterar 4 blocking findings | `verificationBlocked: true` → UI visar **"Fel"** |
| 14:32:10 | Preview startar, VM försöker `next dev` build | — |
| 14:33:39 | VM build fail: TS1361 i `app/showcase/page.tsx` | — |
| 14:35:46 | `triggerBuildErrorRepair` kör 118s LLM-repair | — |
| 14:37:24 | Repair sparar fix | `repair_available` |

Resultat för användaren: `/showcase` blank i nästan 2 minuter, UI visade "Fel" hela vägen, sen "Repair available". 118s bakgrunds-LLM-kompute onödigt spenderade.

## Fyra rotorsaker

### 1. LLM-emission: fyra buggklasser på andra sidan

```tsx
// app/showcase/page.tsx
import type { Building2, Camera, Car as CarFront } from "lucide-react";
const features = [{ icon: Building2 }];   // TS1361
<CarFront />                              // TS1361

// components/showcase-gallery.tsx
import ShowcaseVehicleCard from "@/components/showcase-vehicle";
import ShowcaseVehicle from "@/components/showcase-vehicle";  // dup source
export type ShowcaseVehicle = { ... };                         // collision

// components/contact-form-section.tsx
<HTMLFormElement onSubmit={...}>...</HTMLFormElement>          // DOM interface as JSX

// components/showcase-vehicle.tsx only:
export type ShowcaseVehicleCard = { ... };                     // type-only module, but default-imported
```

### 2. Deterministiska fixers hade luckor

- `type-only-import-fixer` är bara **envägs** (value→type), inte TS1361-riktningen
- `jsx-checker` **detekterar** `<HTMLFormElement>` men varnar bara, skriver inte om
- Ingen fixer för dubbelimport av samma source
- Ingen fixer för import + lokal `export type`-kollision
- Ingen cross-file-fixer för default-import av type-only-module

### 3. Warm-cache fail-open

`warm-typecheck.ts:22-25` säger explicit *"cache provisioning is intentionally out of scope"*, men **ingen** provisionerings-script fanns. Resultat: `cache_cold` → TS1361-klassen fångades först av VM build.

### 4. UI-statusinversion

`runner.ts:389` anropade `maybeFailVersionVerification` för **all** blocking (inklusive verifier-LLM ensamt). `verificationState="failed"` sattes synkront. Sen kör server-verify i `diagnosticOnly: true` som per design **inte** kan ändra state.

## Åtgärder (leverans denna commit)

### Fas A — 4 nya deterministiska fixers

| Fixer | Pattern | Fil |
|---|---|---|
| `value-used-from-type-import-fixer` | TS1361 | [`rules/value-used-from-type-import-fixer.ts`](../../src/lib/gen/autofix/rules/value-used-from-type-import-fixer.ts) |
| `dom-builtin-jsx-fixer` | `<HTMLxxxElement>` → `<form>` etc. | [`rules/dom-builtin-jsx-fixer.ts`](../../src/lib/gen/autofix/rules/dom-builtin-jsx-fixer.ts) |
| `duplicate-import-local-type-collision-fixer` | Dup default from same source + import/type collision | [`rules/duplicate-import-local-type-collision-fixer.ts`](../../src/lib/gen/autofix/rules/duplicate-import-local-type-collision-fixer.ts) |
| `type-only-module-default-import-fixer` | Cross-file: default import av type-only module | [`rules/type-only-module-default-import-fixer.ts`](../../src/lib/gen/autofix/rules/type-only-module-default-import-fixer.ts) |

Alla med fullständiga tester. Registrerade i [`fixer-registry.ts`](../../src/lib/gen/autofix/fixer-registry.ts), wire:ade i `pipeline.ts` (pre-syntax) eller `finalize-merge.ts` (post-merge, cross-file).

### Fas B — Prompt-core counter-examples

Tre ❌-block i [`02-component-contract.md`](../../config/prompt-core/02-component-contract.md) som explicit visar **vad man inte får göra** (icons med `import type`, `<HTMLFormElement>` som JSX, `import X` + `export type X`-kollision). Follow-up-not tillagd i [`omtag-07-static-core-type-imports.md`](../plans/avklarat/omtag-2026-04-23/07-static-core-type-imports.md).

### Fas C — Warm-cache provisionering

Ny [`scripts/provision-warm-cache.ts`](../../scripts/provision-warm-cache.ts) + npm-scripts (`provision:warm-cache`, `provision:warm-cache:force`) + `.env.local`-flaggor (`SAJTMASKIN_PRE_VM_TYPECHECK=true`). Symlink-strategi för `node_modules` (O(1) setup, always in sync med repot). Just nu bara `landing-page`. Doc: [`docs/howto/warm-cache-setup.md`](../howto/warm-cache-setup.md).

### Fas D — UI-statusinversion

- `runner.ts` pre-committar nu `failed` **endast** för preflight hard errors (syntax/parse/merge). Verifier-LLM-only blocking låter state stanna i `pending` → UI visar "Verifying".
- `server-verify.ts` (diagnostic_only-grenen) resolverar terminalt via `failVersionVerification` både på pass och fail, så versionen aldrig fastnar i `pending`.

State-maskinen dokumenterad i [`docs/arch/version-status-state-machine.md`](../arch/version-status-state-machine.md).

### Fas E — Städning

- `fixer-registry.ts` kompletterad med alla 4 nya fixers + metadata
- State-machine-diagram arkiverat
- PARKED.md uppdaterad (UI-flip är fortfarande kvar som separat spår)

## Tester som kördes

- `src/lib/gen/autofix/**` → 27 filer, 217 tester passerar
- `src/lib/gen/stream/finalize-version.test.ts` → 30 tester passerar (+1 ny för "verifier blocking no longer pre-commits failed")
- `src/lib/gen/preview/warm-typecheck.test.ts` + `warm-eslint.test.ts` → passerar (med och utan provisionerad cache)
- `fixer-registry.test.ts` → 10 tester passerar (registry parity-check med nya entries)

## Manuell verifiering

Provisioneringsscriptet körs utan fel:
```
[provision-warm-cache] Scaffolds: landing-page
  landing-page: nm=symlinked tsconfig=written eslint=written (7ms)
```

Cache-katalog verifierad: `node_modules`, `tsconfig.json`, `eslint.config.mjs` alla på plats.

Återstår: köra om den ursprungliga prompten i dev med flaggorna på och bekräfta att `/showcase` renderar korrekt vid första preview + att "Fel"-badgen inte visas förrän server-verify faktiskt landat.

## Riskbild

- **Nya fixers kan missa edge-cases.** Tester täcker happy path + några kända varianter. Om nya regressioner dyker upp i prod-telemetri ska fixerns AST-heuristik skärpas, inte rullas tillbaka.
- **Warm-cache symlink på Windows** kräver Developer Mode aktiverad. Scriptet printar tydlig fel-instruktion om det fallerar.
- **Fas D ändrar state-transitioner.** `PreviewPanelEmptyState`, `VersionDiagnosticsDialog` och andra UI-komponenter läser `verificationState`. Manuell audit i nästa pass (se PARKED).

— 2026-04-23 kväll, claude-4.6-sonnet
