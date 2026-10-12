# LLM-pipeline

Koden äger körordning och kontrakt. Detta är en karta till de ägare som används
av builderns own-engine-generation, inte en andra definition av deras fält.

## Fas 1 — Intent och input

[Init](../../src/lib/api/engine/chats/create-chat-stream-post.ts) och
[follow-up](../../src/lib/api/engine/chats/chat-message-stream/codegen-turn.ts)
äger requesten. Codegen använder streaming-routes; en bruten ström startar inte
om generationen. Deep Brief, Byggval och tidigare versionsunderlag matas till
[orchestrate.ts](../../src/lib/gen/orchestrate.ts). Vanlig follow-up återanvänder
Snapshot-Brief; `clear-redesign` kan begära ny brief.

Den råa användartexten, user message och chatthistoriken är requestunderlag.
User prompt ska inte dupliceras som systemkontext. Typen
[GenerationInputPackage](../../src/lib/gen/generation-input-package.ts) äger
de beslutade orkestrerings-/systemdelarna; hela modellrequesten ägs fortfarande
av requestlagret.

## Fas 2 — Orkestrering och codegen

| Beslut eller gräns | Kodankare |
| --- | --- |
| Scaffold, routes, dossier-val, kontrakt och BuildSpec | [orchestrate.ts](../../src/lib/gen/orchestrate.ts), [build-spec/](../../src/lib/gen/build-spec/) |
| Finaliserat typat byggunderlag och lineage | [generation-package.ts](../../src/lib/gen/orchestrate/generation-package.ts), [generation-input-package.ts](../../src/lib/gen/generation-input-package.ts) |
| Budgeterad systemkontext och source receipt | [system-prompt/](../../src/lib/gen/system-prompt/), [config/prompt-core/](../../config/prompt-core/) |
| Modeller, verktyg och SSE | [engine.ts](../../src/lib/gen/engine.ts), [stream-format.ts](../../src/lib/gen/stream/stream-format.ts) |
| Scaffold/variant/dossier-semantik | [scaffolds/](../../src/lib/gen/scaffolds/), [scaffold-variants/](../../src/lib/gen/scaffold-variants/), [dossier-system](../contracts/dossier-system.md) |

Finalize får redan beslutade byggdelar via `GenerationFinalizeInput`.
Source receipt byggs efter promptbudgetering och får inte rekonstrueras av
konsumenter; valda källor kan vara bortprunade. Importerade projekt behåller
sin scaffold-lösa struktur och kontraktslineage.

Error-log RAG ägs av [rag/](../../src/lib/gen/rag/) och dess systemprompt-injektion.
Det produktionsgemensamma indexets råa fault-text redakteras vid rendering.
SSE-fasmätning ägs av `computeStreamPhaseTiming` i `stream-format.ts`; den är
inte samma klocka som `generation_telemetry.durationMs`. Modellernas thinking-
kanal beskrivs i [10-own-engine.md](../../config/ai_models/10-own-engine.md).

Valfri [preview-prewarm](../../src/lib/gen/preview/preview-prewarm.ts) är best effort:
den publicerar ingen version, preview-URL eller sessionpekare före finalize.
En förvärmd installation bevisar aldrig readiness. Lease, åtkomst och
övertagande följer [preview-session-contract](../schemas/preview-session-contract.md)
och [ENV](../ENV.md); aktivering kräver dess befintliga flagga.

## Fas 3 — Finalize, verifiering och preview

[Runner](../../src/lib/gen/stream/finalize-version/runner.ts) är ingången.
[Fast path](../../src/lib/gen/stream/finalize-version/fast-path.ts) äger den faktiska
ordningen: Normalize/syntax och eventuell bildmaterialisering → komplett
projektberedning/preflight → riskstyrd semantic verifier → persist → preview.
Fas-id:n för UI/telemetry finns separat i
[finalize-pipeline-contract.ts](../../src/lib/gen/stream/finalize-pipeline-contract.ts).

[prepareGeneratedProjectCandidate](../../src/lib/gen/stream/finalize-merge.ts)
delar parse/merge mot scaffold eller exakt basversion mellan runtime, partiell
repair och eval. [Preflight](../../src/lib/gen/stream/finalize-version/preflight-phase.ts)
fullbordar kandidaten med runtimefiler, env-artefakter, dossier-/routeskydd och
eventuell partiell repair **före** semantic verifier. Verifiern ser därmed hela
projektet som ska sparas, inte bara modellens emitterade del.

Verifier-reparationer återbereds genom samma preflight före bekräftelsen.
Ändrad kandidat gör tidigare raw-output-bevis otillräckligt för verifier-skip.
Env-krav får granskas, men env-värden redakteras ur modellvyn och den vyn
får aldrig skriva över persisterade env-bytes. Modell-emissioner och
deterministiska tillskott hålls isär. Ägare: [fast-path.ts](../../src/lib/gen/stream/finalize-version/fast-path.ts)
och [verifier-phase.ts](../../src/lib/gen/stream/finalize-version/verifier-phase.ts).

[RepairGate](../../src/lib/gen/autofix/llm-repair-gate.ts) används för residual
efter deterministiska kontroller; samma `RepairLedger` deduplicerar arbetet
inom finalize. Warm-tsc och dossier-SDK-gränsen beskrivs i
[warm-cache-setup](../runbooks/warm-cache-setup.md).

[Eval](../../src/lib/gen/eval/runner.ts) återanvänder kandidatberedningen och
preflight. Runtimekontroller och syntax bedömer `canonicalRuntimeFiles` och
dess serialisering; råoutput och emitterad UI-yta har separata checks.
En offline-eval sparar ingen version och startar ingen preview-VM:
[eval/README.md](../../src/lib/gen/eval/README.md).

Preview är primärt en körande preview-host/VM, ägd av
[preview-session.ts](../../src/lib/gen/preview/preview-session.ts). Patch/update-
val, versionsidentitet, fallback och äldre shim-URL:er hör till
[preview-session-contract](../schemas/preview-session-contract.md).
Dossier-scopade `env.example` och pipeline-`.env.local` beskrivs i
[env-flow](../contracts/env-flow.md) och [ENV](../ENV.md); runtime-VM:ens env-merge
är en separat gräns.

## Follow-up-regler

[follow-up-freeze.ts](../../src/lib/gen/orchestrate/follow-up-freeze.ts) äger
bevarande, redesign-upplåsning och F3-capability-scope. Scaffold och variant
fryses normalt, routes är ett golv och capabilities bevaras. Explicit
borttagning vinner över promptinferens, tidigare brief, filbevis och
godkännanden; delade dossierpaths behålls för kvarvarande ägare.

I F3 begränsas capability-golvet till aktuell beställning, durabla
godkännanden och basversionens filbevis, även när resultatet är tomt.
`selectedDossierIds` är byggavsikt; endast slutligt filbevis eller explicit
borttagning rensar pending. Planerade dossier-filer kan kräva codegen även
när deras env-nycklar inte blockerar build. Saknas arbete skapar finalize-design
i stället en ny F3-version med samma filer som F2, och gatar den nya versionen.

En codegen-ström per chatt och builderns interaktionslås skyddar samtidighet.
Redis-låsfel stänger generationen med ett explicit fel. Gate/readiness använder
föredragen version så en misslyckad F3-head inte ersätter en fungerande F2-design.

## F2/F3-regler

F2 (`design`) bygger demo; F3 (`integrations`) startas genom ett explicit val.
Promptord om exempelvis Stripe får inte själva byta lifecycle stage.
Dossiers äger demo/fallback, env-enforcement och leveransbevis:
[dossier-system](../contracts/dossier-system.md), [env-flow](../contracts/env-flow.md).
Placeholders är aldrig integrationsbevis.

[runVersionPostchecks](../../src/lib/gen/verify/server-verify/verify-run.ts)
äger den sammanhållna efterkontrollen: bildförberedelse → omläst `files_revision`
→ väntad previewpersistens/readiness → serverägt produktresultat → en relevant
kvalitetsgrind. Samma versionslås och ursprungliga request-deadline följer kedjan.
[generation-stream-post-finalize.ts](../../src/lib/providers/own-engine/generation-stream-post-finalize.ts)
anropar denna ägare; klienten observerar status utan egen efterkontrollkö eller
återstart vid återöppning. GET av filer läser bara sparad snapshot, och Spara
startar inget extra bildarbete. SSE-done bevisar inte färdig versionslivscykel.

Serverns [resume-route](../../src/app/api/engine/postchecks/route.ts) använder
samma kedja och bestående återstartsbudget. Routen är inte schemalagd i
`vercel.json`; automatisk återstart efter avbruten serverkörning kräver separat
godkänd schemaläggning och runtimeverifiering. Den ska inte tillskrivas en
klientfallback som inte längre finns.

F2:s RenderGate och strömmad F3:s ReleaseGate/readiness ägs av serverkedjan.
Den explicita deterministiska finalize-design-forken behåller sitt gate-anrop
via [runF3FinalizeAction](../../src/lib/builder/f3-finalize-action.ts).
En oläsbar postcheck-dom är aldrig pass; F3 släpper bara
`passed` eller `allowed_skip`. Gate mot exakt version/revision, lease, promotion,
`superseded` och readiness/deploy-paritet ägs av
[quality-gate-flow](quality-gate-flow.md) och
[engine-version-lifecycle.ts](../../src/lib/db/engine-version-lifecycle.ts).

F3 tool-only-continuation är durabel och har en loop-breaker. Godkännande
tvingar codegen; avvisande avslutar utan generation. En live-marker får
auto-godkännas en gång, men en marker från återläst historik får inte auto-köras.
Retry-rundorna kan debiteras. Ägare: [f3-continuation.ts](../../src/lib/gen/stream/f3-continuation.ts)
och [f3-continuation-phase.ts](../../src/lib/api/engine/chats/chat-message-stream/f3-continuation-phase.ts).

## Fast Edit Lane

[quick-edit/](../../src/lib/gen/quick-edit/) skapar en immutable minor-version
från exakta ändringar utan LLM, scaffold-rematch eller dossier-selection.
Den körs inte på F3-versioner. Syntaxgrinden avvisar försämrad parsbarhet;
kodvyns mänskliga sparning kan uttryckligen stänga av grinden för halvskriven kod.
Inspector-borttagning kräver en adresserbar AST-nod och får inte göra filen oparsbar.
Preview patchas när kontraktet tillåter det, annars startas full preview.

## Generationskostnad och credit-debitering

Kodankare: [llm-usage.ts](../../src/lib/db/services/llm-usage.ts) för anrop/tokens,
[generation-billing.ts](../../src/lib/db/services/generation-billing.ts) för
versionsbunden settlement/avstämning och
[credits-handler.ts](../../src/lib/api/engine/chats/credits-handler.ts) för admission.
Rate card: [pricing.json](../../config/ai_models/pricing.json).

Debitering bygger på loggad usage och en fryst prisregel per version. Kostnad
och saldo lagras som heltal:

```text
providerCostOre = round(providerCostMicroUsd × usdToSekOre / 1 000 000)
billableOre     = round(providerCostOre × markupBasisPoints / 10 000)
credits         = ceil(billableOre / sekPerCreditOre)
```

Reasoning räknas inte igen ovanpå output. Cache-kategorier och long-context-pris
beräknas per anrop; senare adminändringar skriver inte om historiska transaktioner.
Det är en kostnadsberäkning från usage/rate card, inte slutlig leverantörsfaktura.
Organisationsvid kontoavstämning är adminskyddad serverfunktion, aldrig
debiteringens hot path eller en klientexponerad adminnyckel. Webhooken äger inte
vanlig strömmad usage.

Finalize etablerar billing-marker och append-only claim-nycklar före best-effort
usage-attachning. Settlement låser billing-/användarraden och uppdaterar saldo,
transaktion och billing atomiskt; otillräckligt saldo får inte bli negativt.
Sena repair-/verifier-anrop avstäms idempotent först när finalize-markören finns.
Usage ensam får aldrig claima en slutförd version eller gratisrättigheten.

Manuell repair av äldre/importerad version kräver egen icke-gratis admission.
Den skapar en marker med `free_generation_eligible = false` och en DB-tidsgräns
för ny usage; nya claims flyttar inte tidsgränsen eller den frysta prisregeln.
VM-quality-gaten använder ingen LLM och skapar inte en sådan marker.

Anonyma får inte generera. Ett konto har en kostnadsfri slutförd own-engine-
version, skyddad av samma användarlås; den förblir gratis vid idempotent/sen
usage. Testkonton får kostnadsspår utan credit-drag. Saknat usage/pris innebär
avstämningsbehov utan reservdrag, oberoende av gratisrättigheten. Informations-
API:t annonserar gratisrättigheten endast för explicit codegen.

Durabla pending-rader och claims ger admin en retryväg om attachning bröts.
Avstämning får också ta upp nya marker-avgränsade usage-rader; saknad billingrad
infereras aldrig ur usage. Ekonomispåret saknar innehålls-FK och överlever normal
innehållsstädning. Operatören granskar utfallet i `/admin/genereringar`.
