---
status: active
owner: unassigned
topic: Generationslatens — mät strömmen först, plocka de två billiga sekundvinsterna, och låt parallell codegen förbli ett gated beslut. Tre levererbara steg plus en beslutspunkt.
created: 2026-08-05
source: Prod-mätning 2026-08-05 av de två senaste användarsajterna (fyra versioner, chattarna 9cdb3e31 + 41be90f2) via read-only `/logg` + direktläsning av `generation_telemetry.meta`. Underlaget i sin helhet: [`01-matningen.md`](01-matningen.md). Ägarfråga 2026-08-05: "kan man parallellisera saker för att snabba upp allt?"
---

# Master-plan: generationslatens

## TL;DR

En generation tar 47–415 sekunder i prod. **79–99 % av den tiden är
codegen-strömmen**; allt efter strömmen går på 1,4–2,0 s utom när verifiern
triggar, och då kostar den ensam 69 s. Bildhämtning kostar **noll** — modellen
skriver Unsplash-URL:er ur minnet, så `materialize_images` ersatte 0 bilder i
alla fyra mätta versionerna.

Slutsatsen styr planen: den intuitiva uppdelningen "en agent för bilder, en för
kod, en för dossiers" ger ingenting, eftersom två av de tre banorna redan kostar
noll. Det finns exakt två billiga sekundvinster (steg 2 och 3) och en dyr
strukturell (steg 4). Steg 1 finns för att steg 2 och 3 ska kunna beslutas på
data i stället för på ett urval om fyra körningar.

**Arbetsinsatsen är liten:** tre PR:er, ungefär en arbetsdag kod totalt. Det som
tar väggklocka är mätfönstret i steg 2, och det är passivt — det fylls av
körningar som ändå sker.

## Verifierad baseline (2026-08-05)

| Fakta | Bevis |
|---|---|
| Strömmen är 79–99 % av väggklockan | Fyra versioner, `generation_telemetry.duration_ms` minus summan av `meta.postStreamSteps` — tabell i [`01-matningen.md`](01-matningen.md) |
| Strömtiden är ~linjär i completion-tokens | 134–182 tok/s över fyra körningar och två modeller (`gpt-5.3-codex`, `gpt-5.6-sol`) |
| Bildhämtning kostar noll på kritiska vägen | `materialize_images`: `durationMs: 0`, `replacedCount: 0` i alla fyra versionerna — samtidigt som sajterna har 8–13 `images.unsplash.com`-referenser som modellen skrivit direkt |
| Verifiern kostade 69,2 s och gav noll blockerare | `postStreamSteps.verifier`: `durationMs: 69226`, `trigger: "risky_fixes"`, `blockingCount: 0`, `qualityCount: 5` |
| De 34 "risky" fixarna var alla mekaniska | `meta.autofix.fixers` — varje post har `category: "mechanical"`; `jsx-checker` (default-exporter) och `import-validator` (saknade importer) dominerar |
| Risk-klassningen är medveten, inte en bugg | `fixer-registry.test.ts` → "classifies structure/cross-file/dependency mutators as risky"; `summarizeAutofixRisk` i `pre-phases.ts:142` failar closed på okänd fixer |
| Orkestrering och dossier-val är inte mätbara poster | `resolveOrchestrationBase` är CPU + mtime-cachad `readFileSync`; enda nätverksanropet är scaffold-/variant-embeddings. Ingen egen rad i `postStreamSteps` eftersom allt ligger före strömmen |
| `/logg` kan inte visa detta idag | `scripts/db/dump-logs.mjs` selektar inte `meta` för telemetri-kinden (`errors`-kinden gör det, med `truncateMetaStrings`) — mätningen ovan krävde ett engångsskript |

**Urvalet är fyra versioner från två chattar.** Verifier-slutsatsen vilar på en
enda körning. Det är hela skälet till att steg 1 kommer först.

## Steg

| # | Steg | Ägare i koden | Status / villkor |
|---|---|---|---|
| 1 | **Gör mätningen synlig.** `meta` med i telemetri-kinden i `dump-logs.mjs`; explicit `streamMs` som meta-nyckel; det saknade `recordPhaseDuration("materialize_images", …)`-anropet | `scripts/db/dump-logs.mjs`, `persist-telemetry.ts`, `src/lib/observability/metrics.ts` | **Klar att ta direkt.** Rent additivt, ingen beteendeändring. ~2 h |
| 2 | **Smalna verifier-triggern** så rent additiva importfixar inte längre räknas som `risky_fixes` | `resolveVerifierPassPolicy` + `fast-path.ts`, `fixer-registry.ts` | **Gated på mätfönster** — kräver steg 1 + ~15–20 init-körningar. Kodändringen är ~2 h; fönstret är passivt |
| 3 | **Kapa outputen.** Trösklarna för `qualityTarget: premium` / `contextPolicy: heavy` och scaffold-serialiseringens budget | `src/lib/gen/build-spec/`, `src/lib/gen/system-prompt/` | **Klar att ta efter steg 1.** ~3–4 h + A/B mot samma prompt. Kvalitetsrisk → mät utfall, inte bara tid |
| 4 | **Parallell codegen** — kontraktspass, N workers per filgrupp, merge | Fas 2–3 i sin helhet | **Beslutspunkt, inte beställt arbete.** Kräver ägar-OK enligt `mvp-scope-freeze.mdc`. Se [`02-parallell-codegen.md`](02-parallell-codegen.md) |

## Tung påverkan per steg (docs, backoffice, scheman)

Ingen av de tre levererbara stegen kräver DB-migration. Det är ett medvetet val:
`generation_telemetry.meta` är JSONB, så nya nycklar går in utan att röra
`MIGRATION_ORDER` eller prod-apply-kedjan i `db-env-parity.mdc`. Väljer någon en
riktig kolumn i stället växer steg 1 från två timmar till ett migrationsärende.

| Steg | Docs | Backoffice | Schema / kontrakt | Tester |
|---|---|---|---|---|
| 1 | `.cursor/skills/logg/SKILL.md` (kolumnlistan för telemetri-kinden) | `pages/observability.py` läser histogrammet `sajtmaskin_phase_duration_ms` — får en ny fas | Inget. Ny meta-nyckel i JSONB | `persist-telemetry.test.ts`, `metrics.test.ts` |
| 2 | `docs/architecture/llm-pipeline.md` Fas 3 punkt 6 beskriver exakt denna gate · `docs/schemas/quality-gate.md` om gate-semantiken rör sig | `pages/selection_rationale.py` + `pages/generation_history.py` visar verifier-utfall | Ingen schemaändring, men **ett medvetet skyddsnät sänks** — se risknoten nedan | `finalize-version.test.ts`, `fixer-registry.test.ts` |
| 3 | `docs/architecture/llm-pipeline.md` Fas 2 (BuildSpec-avsnittet) | Ingen | Ingen | BuildSpec-testerna i `src/lib/gen/build-spec/` |
| 4 | Fas 2–3 skrivs om i grunden, inte kompletteras · `docs/schemas/orchestration-signal-contract.md` | `pages/generation_history.py` antar en rad per generation | `engine_generation_logs`, credit-flödet och SSE-kontraktet antar alla **en** ström | Hela finalize-sviten |

Kör `npm run docs:generate` + `docs:check` + `docs:links` enligt
`pipeline-rules.mdc` när steg 2 eller 3 rör en canonical owner.

## Risknot på steg 2

Verifiern triggar på `risky_fixes` för att `summarizeAutofixRisk` failar closed:
en fixer utan auditerad klassning räknas som risky. Att flytta
`import-validator` och `jsx-checker` ur den kategorin är att sänka ett medvetet
skyddsnät, inte att rätta ett misstag. Villkoret är därför hårt: **smalna
triggern bara om mätfönstret visar att `trigger: risky_fixes` i praktiken aldrig
ger `blockingCount > 0`.** Visar det motsatsen är rätt utfall att låta gaten stå
och skriva ner varför.

## Utanför scope

- **Bildpipelinen.** Den kostar noll på kritiska vägen. Den asynkrona
  blob-materialiseringen efter `done` och HEAD-valideringen rör inte
  användarens väntetid och ska inte optimeras här.
- **Dossier- och capability-selektionen.** Registry-uppslag i minnet. Att göra
  det till ett parallellt agentsteg skulle lägga till latens, inte ta bort.
- **Modellbyte.** Att välja en snabbare modell är en produkt- och
  kvalitetsfråga, inte en pipeline-fråga. Ligger hos ägaren.
- **`promote-guard-unavailable`.** Mätningen hittade en annan defekt i samma
  loggar: chatt 41be90f2 fastnade i `verifying`/`draft` trots grön grind
  (`quality-gate:promote-guard-unavailable`, "promotion deferred (retryable)").
  Det är en korrekthetsbugg, inte latens — hör hemma i `BUG-SWARM-BACKLOG.md`.

## När planen är klar

Steg 1 mergat, steg 2 och 3 antingen levererade eller nedskrivna med skäl, och
ett ja/nej på steg 4 ⇒ väv in som rad i [`../../avklarat/README.md`](../../avklarat/README.md)
och radera mappen. Uppdatera [`../README.md`](../README.md) i samma PR.
