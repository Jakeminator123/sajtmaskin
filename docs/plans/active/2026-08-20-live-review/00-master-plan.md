# Live-review — mergad som advisory, aktivering är en stängd grind

Status: **Mergad. Flaggan av.**
PR: [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) — mergad
2026-08-20T20:18Z som `2078883723`, head `3027e287b`
Backlograd: `SM-070` (aktiveringsgrinden)

Steg 1 av kritikern ligger på `master`. Den är **advisory** och hela vägen bakom
`SAJTMASKIN_LIVE_REVIEW`, som är av i kod (`env.ts:221-222`;
`isLiveReviewEnabled()` kräver `"1"` eller `"true"`, `live-review.ts:91-94`).
Ingenting i den här planen är alltså en aktiv incident — det är en grind som ska
vara stängd innan flaggan vänds.

## Vad som landade

| P1 före merge | Utfall |
|---|---|
| Knyt LLM-usage till generationen | `runWithLlmUsageContext` + chat/version/user/session på product-postcheck |
| Logga misslyckanden sanningsenligt | `ok: false` + stabil `errorCode` (`review_error`, `invalid_model_output`, `model_unavailable`) |
| Kräv en faktiskt bifogad bild | Dubbel grind: `no_screenshots` före `runLiveReview` (`live-review.ts:636-638`) och `reviewWithModel` vägrar noll bilddelar (`:462-465`). `isAttachableScreenshotUrl` kräver `http:`/`https:`, så relativ och `blob:` faller (`:118-125`) |
| Triagera de sju reviewtrådarna | Alla sju var filade mot gamla headen `c5ed09592` och prövades om mot `3027e287b` före merge — åtgärdade i sak, inte flyttade. Bevisen ligger i merge-agentens grindkommentar på PR:en |

Loggraden säger nu `Live review skipped: <orsak>.` i stället för att påstå att
skärmbilder togs — det var merge-agentens P2-fynd 19 augusti.

## Kvar: grinden före aktivering

Tre punkter, och de ska stängas **samtidigt** som flaggan vänds. Slå inte på
flaggan i samma ändring som en delfix.

1. **Retention och ägarskap.** JPEG:erna läggs publikt i Blob under ett
   syntetiskt användar-id, utan media-rad, delete-hook eller retention. Bestäm
   ägare, lagringstid och raderingsväg — och implementera dem.
2. **Idempotens och kostnadstak.** Samma version kan köras om. Unik eller
   overwrite-säker blobnyckel, claim/cache per version + revision, och ett
   försvarbart tak per generation.
3. **Ärlig kontroll.** Befogenheten `live_review` måste faktiskt gatera
   körningen. Etapp 1 gaterar inget på den, så kryssrutan lovar mer än den gör.
   Toggle av får inte köra review; toggle på får inte låtsas fungera när
   env-flaggan är av. Alternativt: dölj kontrollen tills punkt 1 och 2 är klara.

Ordning: (1) före (2), eftersom retentionmodellen avgör hur blobnyckeln får se ut.

## Dokumentationsrest

PR-bodyn säger `maxDuration = 180` på tre ställen. Koden är **300** sedan
`96ee3477d`. Body-texten är inaktuell, inte koden — noterat i merge-agentens
kommentar. Rör inte koden för att matcha bodyn.

## Gränser

- Slå **inte** på `SAJTMASKIN_LIVE_REVIEW` förrän alla tre punkterna är klara,
  och gör det som ett **separat driftbeslut** — inte som del av en kodmerge.
- Kritikern förblir **advisory**. Den får inte bli en ny repair-agent och inte
  ändra verifierarens blocker-severity (`SM-036` stängdes i #1080).
- Rör inte användarsajtens filer i samma PR.

## Not om den lokala specen

`.cursor/swarms/SPEC-2026-08-19-live-review.md` är en ägargodkänd design som bara
finns lokalt och är gitignorerad — den dör med maskinen. Nu när `#1052` är
avgjord är frågan öppen: ska resterande steg in i repot? Det är ett ägarbeslut.

## När den här filen är inaktuell

När grinden är stängd och flaggan påslagen: väv en rad i
[`../../avklarat/README.md`](../../avklarat/README.md), arkivera `SM-070` och
radera mappen.
