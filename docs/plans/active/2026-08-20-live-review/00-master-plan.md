# Live-review — advisory bakom stängd flagga, aktiveringsresidualer kvar

Status: **Åtkomst och claim/cache är mergade; attempt-taket är inte beständigt över alla felvägar. Aktiveringsgrinden är inte stängd och flaggan är av.**
Levererat: [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052),
[#1089](https://github.com/Jakeminator123/sajtmaskin/pull/1089) och
[#1098](https://github.com/Jakeminator123/sajtmaskin/pull/1098)
Backlograd: `SM-070` (kvar: beständig betald attempt-budget, Blob-retry,
schemalagd retention, chat-delete-hook och omprövning av #1116-överlapp före
Preview; #1116 behöver inte mergas)
Rökprov: [`01-preview-smoke.md`](01-preview-smoke.md)

Kritikern ligger på `master` som **advisory**. Hela capture-/critic-vägen kräver
`SAJTMASKIN_LIVE_REVIEW` ∧ `OC_EDIT` ∧ en persistad `live_review`-grant;
request-body är inte auktoritet. `SAJTMASKIN_LIVE_REVIEW` är default av.
Ingenting här är därför en aktiv Production-incident, men flaggan får inte
aktiveras förrän residualerna nedan är stängda och testade.

## Vad som faktiskt är levererat

| Del | Nuläge |
|---|---|
| Advisory-kritiker | #1052 gav strukturerad dom, sanningsenlig usage/error-loggning och bildbevisgrind. Kritikern ändrar inte filer och sätter inte `productBlocked`. |
| Auktorisering | #1089/#1098 kräver env-flagga, `OC_EDIT` och persistad `live_review`-grant för både capture och critic. Grant från request-body räcker inte. |
| Claim och attempt-guard | Atomisk claim/cache per `(versionId, filesRevision)` och stale takeover med CAS är landat. `modelAttempts < 2` vaktas atomiskt medan run-raden finns kvar; det är inte ett beständigt kostnadstak över delete/återskapande. |
| Robusthetsuppföljning | #1098 stängde retrybara skip, övergiven claim när persist misslyckas, serialiserad persist, stale hydrate och flera Blob-delete-/versionvalsfynd. |
| Retentionsmetadata | Varje run får `expiresAt` sju dagar framåt. Det är metadata och opportunistisk purge, inte ännu en schemalagd TTL-garanti. |

## Kvarvarande aktiveringsblockerare

1. **Same-revision-upload är inte retry-säker.**
   `liveReviewJpegFilename()` ger en stabil fil per viewport och revision.
   `uploadBlob()` använder `addRandomSuffix: false` men skickar inte
   `allowOverwrite: true`. Om Blob-uploaden lyckas men runnen avbryts innan
   referensen persisteras kan nästa försök träffa samma path, uppladdningen
   misslyckas och reviewn sluta i `no_screenshots`. Gör overwrite eller annan
   idempotent retry explicit och testlås partiell-upload→retry.

2. **Sju dagar är inte en tidsstyrd rensningsgaranti.**
   `purgeExpiredLiveReviewBlobs()` startas fire-and-forget först när en ny
   auktoriserad live-review-session börjar. `vercel.json` saknar live-review-
   cron. Projektradering purgar projektets chattar, men en fristående
   chat-delete-väg anropar inte en egen live-review-hook. Lägg schemalagd purge
   och koppla verklig chat-delete till Blob-rensningen; behåll projektpurgen.

3. **Betald attempt-budget kan nollställas på persistfel.**
   `finishLiveReviewSession()` anropar `beginPaidLiveReviewAttempt()` före
   kritikern och ökar därmed `modelAttempts`. Om resultatet sedan inte kan
   skrivas (`completeLiveReviewRun() === false`) anropas
   `abandonLiveReviewRun()`, som kan radera den körande run-raden inklusive
   räknaren. En ny claim för samma revision börjar då på noll; upprepade
   persistfel + lyckad delete kan ge fler än två betalda critic-anrop. Bevara
   budgeten över abandon/retry och testlås flera `completeRun=false` i följd.

4. **Ompröva överlappande #1116 innan driftbevis.**
   Den PR:n rör live-review-koden men är inte ett mergekrav. Granska överlappet
   självständigt, porta bara de relevanta delar som godkänns till
   residualfixarnas träd och kör om claim-, capture-, purge- och route-testerna
   innan Preview-rökprovet. Den här docs-PR:n ändrar ingen runtime eller flagga.

## Aktiveringsordning

1. Landa och verifiera de tre kodresidualerna ovan.
2. Ompröva #1116:s överlapp, porta bara godkända relevanta delar och kör om den
   kombinerade live-review-sviten. Hela #1116 behöver inte mergas.
3. Kör [`01-preview-smoke.md`](01-preview-smoke.md) med flaggan **endast i
   Vercel Preview**.
4. Dokumentera Preview-beviset. Arkivera inte `SM-070` i förväg.
5. Production-aktivering kräver en separat, uttrycklig ägaråtgärd efter grönt
   Preview-bevis — aldrig i samma kodmerge eller smoke-körning.

## Dokumentationsrest

PR-bodyn på #1052 säger `maxDuration = 180` på tre ställen. Koden är **300**
sedan `96ee3477d`. Body-texten är inaktuell, inte koden.

## Gränser

- Kritikern förblir **advisory** och får inte bli en ny repair-agent.
- Rör inte användarsajtens filer som del av aktiveringen.
- Slå inte på Production för att "testa" residualfixarna.
- #1116:s runtime-diff ska omprövas separat, inte tas in som ett implicit
  mergekrav; denna reklassificering är dokumentation-only.

## När den här planen är klar

När residualerna är mergade, #1116:s överlapp är omprövad och eventuella
godkända relevanta delar portade, Preview-rökprovet grönt och
Production-beslutet uttryckligen dokumenterat: väv en rad i
[`../../avklarat/README.md`](../../avklarat/README.md), arkivera `SM-070` och
radera mappen.
