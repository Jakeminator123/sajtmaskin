# Live-review — mergad som advisory, aktivering är en stängd grind

Status: **Kodgrind stängd i PR. Flaggan av i koden.**
PR: [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) — kritikern
Backlograd: `SM-070` (kvar: Preview-rökprov, sedan Production)
Rökprov: [`01-preview-smoke.md`](01-preview-smoke.md)

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

## Kodgrind (stängd, flaggan fortfarande av)

De tre grindpunkterna är implementerade i koden. **Slå inte på flaggan i samma
PR.** Nästa steg är Preview-rökprovet.

1. **Retention och ägarskap.** JPEG under ägarens user-id, stabil nyckel per
   `filesRevision`, senaste paret behålls, föregående raderas efter jämförelse,
   TTL 7 dagar, delete-hook vid chat/projekt-radering.
2. **Idempotens och kostnadstak.** Atomisk claim på
   `(version_id, files_revision)`. Samtidiga/retried postchecks återanvänder
   resultatet. Max två betalda modellförsök per revision.
3. **Ärlig kontroll.** `SAJTMASKIN_LIVE_REVIEW` ∧ `OC_EDIT` ∧ persistad
   `live_review`-grant. Request-body kan inte förfalska grant. Samma AND
   stänger av både capture och LLM.

## Dokumentationsrest

PR-bodyn säger `maxDuration = 180` på tre ställen. Koden är **300** sedan
`96ee3477d`. Body-texten är inaktuell, inte koden — noterat i merge-agentens
kommentar. Rör inte koden för att matcha bodyn.

## Gränser

- Slå **inte** på `SAJTMASKIN_LIVE_REVIEW` förrän alla tre punkterna är klara,
  och gör det som ett **separat driftbeslut** — inte som del av en kodmerge.
- Kritikern förblir **advisory**. Den får inte bli en ny repair-agent och inte
  ändra verifierarens blocker-severity (det är `SM-036`).
- Rör inte användarsajtens filer i samma PR.

## Not om den lokala specen

`.cursor/swarms/SPEC-2026-08-19-live-review.md` är en ägargodkänd design som bara
finns lokalt och är gitignorerad — den dör med maskinen. Nu när `#1052` är
avgjord är frågan öppen: ska resterande steg in i repot? Det är ett ägarbeslut.

## När den här filen är inaktuell

När grinden är stängd och flaggan påslagen: väv en rad i
[`../../avklarat/README.md`](../../avklarat/README.md), arkivera `SM-070` och
radera mappen.
