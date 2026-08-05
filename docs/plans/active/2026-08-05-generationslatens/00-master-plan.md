---
status: active
owner: unassigned
topic: Generationslatens — strömmen är 79–99 % av strömfönstret (brief/orkestrering ligger före mätankaret). Steg 1 i PR #792 (ej mergad), steg 2 diagnos klar (klassningen befogad), steg 3 ägarfråga, steg 4 gated.
created: 2026-08-05
source: Prod-mätning 2026-08-05 av de två senaste användarsajterna (fyra versioner, chattarna 9cdb3e31 + 41be90f2) via read-only `/logg` + direktläsning av `generation_telemetry.meta`. Underlaget i sin helhet: [`01-matningen.md`](01-matningen.md). Ägarfråga 2026-08-05: "kan man parallellisera saker för att snabba upp allt?"
---

# Master-plan: generationslatens

## TL;DR

En generation tar 47–415 sekunder i prod **räknat från strömstart**
(`engineStartedAt`). Deep Brief (klient `/api/ai/brief` och server auto-brief)
samt orkestrering inkl. scaffold-/variant-embeddings ligger **före** det ankaret
— verifierat i [`01-matningen.md`](01-matningen.md) — så användarens faktiska
väntan är längre än tabellens totaler. **79–99 % av strömfönstret** är
codegen-strömmen; andelen av *hela* väntan är lägre. Allt efter strömmen går på
1,4–2,0 s utom i en av de fyra mätta körningarna, där verifiern ensam tog 69 s.
Bildhämtning kostar **noll** — modellen skriver Unsplash-URL:er ur minnet, så
`materialize_images` ersatte 0 bilder i samtliga versioner.

Slutsatsen styr planen: den intuitiva uppdelningen "en agent för bilder, en för
kod, en för dossiers" ger ingenting, eftersom två av de tre banorna redan kostar
noll. Den enda splitten som biter är att dela **koden**, och den är dyr.

BuildSpec-klassningen (`premium`/`heavy` på bloggen) driver tokens och
verifier-gaten, men steg 2 fann den **befogad** (multipage-promotion +
score-tröskel med dokumenterad avsikt) — ingen tröskeländring. Kvarvarande
latensspakar är steg 3 (ägarbeslut om F2-verifier) och steg 4 (parallell
codegen).

## Verifierad baseline (2026-08-05)

| Fakta | Bevis |
|---|---|
| Strömmen är 79–99 % av väggklockan **från strömstart** | Fyra versioner, `generation_telemetry.duration_ms` minus summan av `meta.postStreamSteps` — tabell i [`01-matningen.md`](01-matningen.md). Brief + orkestrering ligger **före** `engineStartedAt` (steg 2), så andelen av användarens *hela* väntan är lägre |
| Strömtiden är ~linjär i completion-tokens | 134–182 tok/s över fyra körningar och två modeller (`gpt-5.3-codex`, `gpt-5.6-sol`) |
| Bildhämtning kostar noll på kritiska vägen | `materialize_images`: `durationMs: 0`, `replacedCount: 0` i alla fyra versionerna — samtidigt som sajterna har 8–13 `images.unsplash.com`-referenser som modellen skrivit direkt |
| Verifiern tog 69,2 s och gav noll blockerare | `postStreamSteps.verifier`: `durationMs: 69226`, `blockingCount: 0`, `qualityCount: 5` |
| Verifiern var **trippel-gatead**, inte utlöst av autofix-risk | `policy.ts:58` `qualityTarget !== "standard"` → `high_quality_target`; dessutom `contextPolicy: heavy` (rad 64) och `changeScope: page-addition` (rad 67). Telemetrins `trigger: "risky_fixes"` är bara en etikett som `fast-path.ts` skriver över `verifierPolicy.reason` med |
| En bloggsajt klassades `premium` + `heavy` — **befogad** | Multipage-promotion (`policy-inference.ts:274–283`) + heavy-score ≥ 3; se diagnos i [`01-matningen.md`](01-matningen.md). Landing är en-sida → `standard`/`normal` |
| Brief + orkestrering saknas i `duration_ms`/`streamMs` | Båda före `engineStartedAt` (`generation-stream.ts:214`); embeddings i `resolve-base.ts:259–264` och `finalize-prompts.ts:86–97` |
| `/logg` kan inte visa detta på master — **åtgärdas av PR #792** | `scripts/db/dump-logs.mjs` selekterar inte `meta` för telemetri-kinden (`errors`-kinden gör det, med `truncateMetaStrings`), så mätningen ovan krävde ett engångsskript. #792 tar in `meta` på samma trunkeringsväg och lägger till `meta.streamMs` |

**Urvalet är fyra versioner från två chattar, alla F2.** Verifier-observationen
vilar på en enda körning. Det är hela skälet till att steg 1 kommer först.

## Steg

| # | Steg | Ägare i koden | Status / villkor |
|---|---|---|---|
| 1 | **Gör mätningen synlig.** `meta` med i telemetri-kinden i `dump-logs.mjs`; explicit `streamMs` som meta-nyckel; det saknade `recordPhaseDuration("materialize_images", …)`-anropet | `scripts/db/dump-logs.mjs`, `persist-telemetry.ts`, `runner.ts` | **Levererad i PR #792 — väntar på merge.** Inget av det nedan finns på master förrän den är inne. `streamMs` blev **direktmätt** vid stream→finalize-gränsen i stället för deriverat. Obs: samma ankare som `duration_ms`, så talen är jämförbara — se rättelsen i [`01-matningen.md`](01-matningen.md). Fasnamnet fanns redan i `OBSERVED_PHASES`; bara anropet saknades, så `metrics.ts` behövde inte ändras |
| 2 | **BuildSpec-klassningen.** Varför blir en bloggsajt `qualityTarget: premium` + `contextPolicy: heavy`? | `src/lib/gen/build-spec/` | **Diagnos klar — ingen tröskeländring.** Klassningen är medveten avvägning (multipage→premium, score≥3→heavy). Vill ägaren ändå pröva en lägre `heavy`-andel finns spaken redan som env (`SAJTMASKIN_CONTEXT_POLICY_HEAVY_THRESHOLD=4`) — ingen kodändring behövs. Se [`01-matningen.md`](01-matningen.md) §3 |
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
