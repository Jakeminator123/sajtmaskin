# Live-review — Preview-rökprov efter kodresidualer och överlappsprövning

**Kör inte detta ännu och inte i en kod-PR.** `SAJTMASKIN_LIVE_REVIEW` förblir
av. Rökprovet är ett separat driftsteg först när kriterierna nedan ligger på
samma Preview-deploy.

## Hårda förutsättningar

- #1089/#1098:s persistade grant, AND-grind och atomiska claim/cache finns kvar.
- Den betalda attempt-budgeten överlever `completeRun=false` följt av
  abandon/reclaim för samma revision; ett test med upprepade persistfel visar
  att kritikern ändå anropas högst två gånger.
- Same-revision-upload är overwrite-/retry-säker och har ett test för partiell
  desktop-/mobil-upload följd av retry utan `no_screenshots`.
- 7d-rensningen har en schemalagd Vercel-cron och verklig chat-delete anropar
  live-review-purgen; projektraderingens befintliga purge är bevarad.
- #1116:s överlapp är självständigt omprövat; endast godkända relevanta delar
  är vid behov portade och den kombinerade claim-, capture-, purge- och
  product-postcheck-sviten är grön. Hela #1116 behöver inte mergas.
- `OC_EDIT` är på i Preview och du har en builder-chatt du äger.

Saknas en punkt: stoppa. Preview-rökprovet kompenserar inte för en kodresidual.

## Preview först

1. Sätt `SAJTMASKIN_LIVE_REVIEW=1` **bara på Vercel Preview**. Rör inte
   Production.
2. Öppna rätt Preview-deploy. Lämna `live_review` av och generera en sajt.
3. Förväntat: Product Postcheck körs, **inga** JPEG och **ingen** betald critic;
   skip-orsak `grant_off`.
4. Bocka i Extra befogenheter → Live review. Ladda om och bekräfta att granten
   är persistad. Generera igen.
5. Förväntat: desktop+mobil-JPEG, ett critic-svar i postcheck och
   `[LIVE-REVIEW]` när Sajtagenten får en review-fråga. Resultatet är advisory;
   användarfiler och `productBlocked` ändras inte.
6. Kör samma version/revision igen. Förväntat: ingen ny betald körning; cached
   resultat används.
7. Reproducera den testade partiella upload-/retry-vägen mot samma revision.
   Förväntat: overwrite/idempotent retry lyckas och ger inte `no_screenshots`.
8. Ändra en fil så `filesRevision` byts. Förväntat: en ny review och föregående
   JPEG rensas efter lyckad jämförelse.
9. Bocka ur `live_review` och generera igen. Förväntat: ingen capture.
10. Verifiera separat att cron rensar en förfallen fixture och att chat-delete
    tar dess Blob-data; kontrollera att andra chattar/projekt är orörda.

## Production är en separat ägaråtgärd

Dokumentera Preview-resultatet och lämna Production orörd. Ett grönt rökprov
är underlag för ett senare uttryckligt ägarbeslut; det sätter inte flaggan i
Production automatiskt och får inte kombineras med kodmerge eller Preview-
körningen. Arkivera inte `SM-070` innan kriterierna i masterplanen är uppfyllda
och beslutet är dokumenterat.
