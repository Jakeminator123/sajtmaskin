# Våg 2 — Källkvittot byggs av avsikt, inte av den payload som skickades

Backlograd: `SM-069`
Beror på: inget. Blockerar: inget.
Ägda filer: `src/lib/gen/orchestrate/source-receipt.ts`,
`src/lib/gen/orchestrate/finalize-prompts.ts`, `src/lib/gen/request-metadata.ts`
+ tester.

## Det verifierade fyndet

`#1060` gjorde kvittot ärligt **nedåt** — en källa som prunades bort av
textbudgeten rapporteras inte längre som framme. Det som återstår är motsatt
riktning: kvittot kan säga att variantbilden nådde prompten när den i själva
verket trängdes ut av användarens egna bilder.

`reachedPrompt` för variantreferensen är sant om **antingen** textblocket
behölls **eller** en stillbild producerades:

```
src/lib/gen/orchestrate/source-receipt.ts:76-89
      reachedPrompt:
        reachedPrompt(input.pruning, VARIANT_BLOCK_KEYS) ||
        input.variantTemplateImageAttached === true,
```

Flaggan sätts av om en attachment **byggdes**, före visionmonteringen
(`finalize-prompts.ts:152-154` → `:267-276`).
`buildVariantTemplateReferenceAttachments` tittar bara på `stillImageUrl`
(`scaffold-variants/template-inspiration.ts:415-428`) och vet ingenting om
bildtaket.

Taket ligger senare, i sändvägen, och prioriterar användarens bilder:

```
src/lib/gen/request-metadata.ts:166-182
function getVisualReferenceAttachments(attachments, max = 4) {
  ...
  return [...userImages, ...styleReferences].slice(0, max)
```

Fyra användarbilder fyller alltså kvoten och variantbilden faller bort. Det
beteendet är avsiktligt och redan testlåst (`request-metadata.test.ts:132-158`) —
det är inte det som ska ändras. Kvittot persisteras som det är
(`persist-telemetry.ts:191-193`) och skrivs aldrig om från de faktiskt skickade
delarna; `reachedPrompt` tilldelas bara i `source-receipt.ts`.

Konsekvensen är att B4/B5-arbetet — som bygger på att kvittot går att lita på —
kan mäta mot en osann rad.

## Uppgiften

Låt kvittots `reachedPrompt` för bildkällor följa den payload som faktiskt
skickades.

Ordningen i dag är: producera stillbild → sätt flaggan → bygg kvitto → kapa till
fyra. Vänd på beroendet så att kvittot får veta utfallet av kapningen. Två
rimliga vägar:

1. **Beräkna bildurvalet tidigare** och skicka det faktiska urvalet (eller ett
   `variantTemplateImageSent`-utfall) in i `buildSourceReceipt`.
2. **Rätta kvittot efter monteringen** på ett ställe, innan det persisteras, med
   samma urvalsfunktion som sändvägen använder — inte en egen kopia av regeln.

Väljer du 2: se till att alla tre sändvägarna går genom rättningen
(`create-chat-stream-post.ts:1068-1071`,
`chat-message-stream/codegen-turn.ts:503-506`, `engine.ts:106`), annars glider de
isär igen.

## Gränser

- Ändra **inte** bildtaket eller prioritetsordningen (fyra bilder,
  användarbilder först). Den är beslutad och testlåst.
- Lägg ingen andra kopia av urvalsregeln. `getVisualReferenceAttachments` är
  ägaren.
- Rör inte textbudgetens `pruning`-väg — den delen av kvittot är rätt sedan
  `#1060`.
- Ingen ny UI-yta i Selection Rationale. Kvittot ska bli sant, inte större.

## Klart när

- Ett test: fyra användarbilder + en variantstillbild → kvittots variantrad har
  `reachedPrompt: false` (eller motsvarande ärliga värde) medan textblocket
  behandlas separat.
- Ett test: en användarbild + variantstillbild → `reachedPrompt: true`.
- Befintliga `request-metadata`- och `persist-telemetry`-tester gröna och
  oförändrade i sin intention.
- `npm run typecheck` + `npx vitest run src/lib/gen/orchestrate src/lib/gen/stream` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: källkvittots `reachedPrompt` för variantreferensen sätts av att en
> stillbild **producerades**, inte av att den skickades. Fyra användarbilder
> tränger ut variantbilden ur visionpayloaden (avsiktligt tak på fyra,
> användarbilder först) men kvittot säger fortfarande att den nådde prompten. Låt
> kvittot byggas av den faktiskt skickade payloaden.
>
> Ändra inte bildtaket eller prioritetsordningen — de är beslutade och testlåsta.
> Skapa ingen andra kopia av urvalsregeln; `getVisualReferenceAttachments` är
> ägaren. Rör inte textbudgetens pruning-väg. Ingen ny UI-yta.
>
> Verifiering: `npm run typecheck`,
> `npx vitest run src/lib/gen/orchestrate src/lib/gen/stream`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
