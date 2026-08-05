---
status: active
owner: unassigned
topic: Generationslatens — strömmen är 79–99 % av väggklockan. Gör mätningen synlig, angrip BuildSpec-klassningen som driver både tokens och verifier-gaten, och låt parallell codegen förbli ett gated beslut.
created: 2026-08-05
source: Prod-mätning 2026-08-05 av de två senaste användarsajterna (fyra versioner, chattarna 9cdb3e31 + 41be90f2) via read-only `/logg` + direktläsning av `generation_telemetry.meta`. Underlaget i sin helhet: [`01-matningen.md`](01-matningen.md). Ägarfråga 2026-08-05: "kan man parallellisera saker för att snabba upp allt?"
---

# Master-plan: generationslatens

## TL;DR

En generation tar 47–415 sekunder i prod. **79–99 % av den tiden är
codegen-strömmen.** Allt efter strömmen går på 1,4–2,0 s utom i en av de fyra
mätta körningarna, där verifiern ensam tog 69 s. Bildhämtning kostar **noll** —
modellen skriver Unsplash-URL:er ur minnet, så `materialize_images` ersatte 0
bilder i samtliga versioner.

Slutsatsen styr planen: den intuitiva uppdelningen "en agent för bilder, en för
kod, en för dossiers" ger ingenting, eftersom två av de tre banorna redan kostar
noll. Den enda splitten som biter är att dela **koden**, och den är dyr.

Före den finns en spak som ingen letat efter: **BuildSpec-klassningen**. Den
tunga körningen fick `qualityTarget: premium` + `contextPolicy: heavy` på en
vanlig bloggsajt, och den klassningen driver både prompt-storleken (121k tokens),
outputen (59k tokens) och — via `resolveVerifierPassPolicy` — den 69 s långa
verifiern. En klassning, tre kostnader.

**Arbetsinsatsen är liten:** tre PR:er, ungefär en arbetsdag kod totalt.

## Verifierad baseline (2026-08-05)

| Fakta | Bevis |
|---|---|
| Strömmen är 79–99 % av väggklockan | Fyra versioner, `generation_telemetry.duration_ms` minus summan av `meta.postStreamSteps` — tabell i [`01-matningen.md`](01-matningen.md) |
| Strömtiden är ~linjär i completion-tokens | 134–182 tok/s över fyra körningar och två modeller (`gpt-5.3-codex`, `gpt-5.6-sol`) |
| Bildhämtning kostar noll på kritiska vägen | `materialize_images`: `durationMs: 0`, `replacedCount: 0` i alla fyra versionerna — samtidigt som sajterna har 8–13 `images.unsplash.com`-referenser som modellen skrivit direkt |
| Verifiern tog 69,2 s och gav noll blockerare | `postStreamSteps.verifier`: `durationMs: 69226`, `blockingCount: 0`, `qualityCount: 5` |
| Verifiern var **trippel-gatead**, inte utlöst av autofix-risk | `policy.ts:58` `qualityTarget !== "standard"` → `high_quality_target`; dessutom `contextPolicy: heavy` (rad 64) och `changeScope: page-addition` (rad 67). Telemetrins `trigger: "risky_fixes"` är bara en etikett som `fast-path.ts` skriver över `verifierPolicy.reason` med |
| En bloggsajt klassades `premium` + `heavy` | `meta.buildSpec` för `9cdb3e31` v1 — mot `standard` + `normal` för landing-sajten |
| Orkestrering och dossier-val är inte mätbara poster | `resolveOrchestrationBase` är CPU + mtime-cachad `readFileSync`; enda nätverksanropet är scaffold-/variant-embeddings |
| `/logg` kan inte visa detta idag | `scripts/db/dump-logs.mjs` selektar inte `meta` för telemetri-kinden (`errors`-kinden gör det, med `truncateMetaStrings`) — mätningen ovan krävde ett engångsskript |

**Urvalet är fyra versioner från två chattar, alla F2.** Verifier-observationen
vilar på en enda körning. Det är hela skälet till att steg 1 kommer först.

## Steg

| # | Steg | Ägare i koden | Status / villkor |
|---|---|---|---|
| 1 | **Gör mätningen synlig.** `meta` med i telemetri-kinden i `dump-logs.mjs`; explicit `streamMs` som meta-nyckel; det saknade `recordPhaseDuration("materialize_images", …)`-anropet | `scripts/db/dump-logs.mjs`, `persist-telemetry.ts`, `runner.ts` | **Levererad** (`feat/telemetry-stream-visibility`). `streamMs` blev **direktmätt** vid stream→finalize-gränsen, inte deriverat — brief och orkestrering ingår alltså inte. Fasnamnet fanns redan i `OBSERVED_PHASES`; bara anropet saknades, så `metrics.ts` behövde inte ändras |
| 2 | **BuildSpec-klassningen.** Varför blir en bloggsajt `qualityTarget: premium` + `contextPolicy: heavy`? Klassningen driver prompt-storlek, output och verifier-gaten på en gång | `src/lib/gen/build-spec/` | **Klar att ta efter steg 1.** ~3–4 h + A/B mot samma prompt. Kvalitetsrisk → mät utfall, inte bara tid |
| 3 | **Verifierns proportionalitet i F2.** Tre oberoende villkor tvingar ett 69 s LLM-pass på en design-preview vars gate ändå ägs av klientens RenderGate | `resolveVerifierPassPolicy` i `policy.ts` | **Ägarfråga, inte tröskeljustering.** Kodändringen är liten; beslutet är det inte. Se risknoten |
| 4 | **Parallell codegen** — kontraktspass, N workers per filgrupp, merge | Fas 2–3 i sin helhet | **Beslutspunkt, inte beställt arbete.** Kräver ägar-OK enligt `mvp-scope-freeze.mdc`. Se [`02-parallell-codegen.md`](02-parallell-codegen.md) |

## Tung påverkan per steg (docs, backoffice, scheman)

Inget av stegen kräver DB-migration. Det är ett medvetet val:
`generation_telemetry.meta` är JSONB, så nya nycklar går in utan att röra
`MIGRATION_ORDER` eller prod-apply-kedjan i `db-env-parity.mdc`. Väljer någon en
riktig kolumn i stället växer steg 1 från två timmar till ett migrationsärende.

| Steg | Docs | Backoffice | Schema / kontrakt | Tester |
|---|---|---|---|---|
| 1 | `.cursor/skills/logg/SKILL.md` (kolumnlistan för telemetri-kinden) | `pages/observability.py` läser histogrammet `sajtmaskin_phase_duration_ms` — får en ny fas | Inget. Ny meta-nyckel i JSONB | `persist-telemetry.test.ts`, `metrics.test.ts` |
| 2 | `docs/architecture/llm-pipeline.md` Fas 2 (BuildSpec-avsnittet) | Ingen | Ingen — `qualityTarget`/`contextPolicy` är interna BuildSpec-fält | BuildSpec-testerna i `src/lib/gen/build-spec/` |
| 3 | `docs/architecture/llm-pipeline.md` Fas 3 punkt 6 beskriver gaten · `docs/schemas/quality-gate.md` om gate-semantiken rör sig | `pages/observability.py` (`sajtmaskin_verifier_blocking_total` + fasen `verifier`) och `pages/llm_flode_telemetry.py` (`verifier_skipped_by_policy`, `verifier_skipped_safe_fixes_only`) | Ingen schemaändring, men **ett medvetet skyddsnät sänks** | `finalize-version.test.ts`, `policy`-testerna |
| 4 | Fas 2–3 skrivs om i grunden, inte kompletteras · `docs/schemas/orchestration-signal-contract.md` | `pages/generation_history.py` antar en rad per generation | `engine_generation_logs`, credit-flödet och SSE-kontraktet antar alla **en** ström | Hela finalize-sviten |

Kör `npm run docs:generate` + `docs:check` + `docs:links` enligt
`pipeline-rules.mdc` när steg 2 eller 3 rör en canonical owner.

## Risknot på steg 3

Verifiern på den tunga körningen var gatead av **tre oberoende villkor** — vart
och ett hade räckt. Att ta bort ett av dem flyttar bara beslutet till nästa.
Frågan är därför inte "vilken tröskel är fel" utan **"ska en F2-preview köra ett
69-sekunders LLM-pass alls, när RenderGate ändå ägs av klienten?"**

Det är ett ägarbeslut, inte en refaktorering. Två saker gör det icke-trivialt:

- `verificationPolicy: "strict"` ligger före alla andra villkor och ska fortsätta
  göra det. Ändringen får bara röra de mjuka signalerna.
- `summarizeAutofixRisk` failar closed på okänd fixer (`pre-phases.ts:142`), och
  `fixer-registry.test.ts` slår uttryckligen fast att struktur- och
  cross-file-muterare ska vara risky. **Rör inte den klassningen som genväg** —
  den påverkade inte den mätta körningen ändå, eftersom `hasLlmFixesInValidate`
  (en LLM-fixer kördes i `validate_syntax`) blockerar `safe_fixes_only`-hoppet
  oavsett hur fixarna är klassade.

Faller beslutet på "nej, verifiern stannar": skriv ner det och stryk steget. Det
är ett giltigt utfall.

## Utanför scope

- **Bildpipelinen.** Den kostar noll på kritiska vägen. Den asynkrona
  blob-materialiseringen efter `done` och HEAD-valideringen rör inte
  användarens väntetid.
- **Dossier- och capability-selektionen.** Registry-uppslag i minnet. Att göra
  det till ett parallellt agentsteg skulle lägga till latens, inte ta bort.
- **Fixer-riskklassningen.** Se risknoten — smal effekt, och den gällde inte den
  mätta körningen.
- **Modellbyte.** Produkt- och kvalitetsfråga, inte pipeline-fråga.
- **`promote-guard-unavailable`.** Mätningen hittade en annan defekt i samma
  loggar: chatt 41be90f2 fastnade i `verifying`/`draft` trots grön grind
  (`quality-gate:promote-guard-unavailable`, "promotion deferred (retryable)").
  Korrekthetsbugg, inte latens — hör hemma i `BUG-SWARM-BACKLOG.md`.

## När planen är klar

Steg 1 mergat, steg 2 och 3 antingen levererade eller nedskrivna med skäl, och
ett ja/nej på steg 4 ⇒ väv in som rad i [`../../avklarat/README.md`](../../avklarat/README.md)
och radera mappen. Uppdatera [`../README.md`](../README.md) i samma PR.
