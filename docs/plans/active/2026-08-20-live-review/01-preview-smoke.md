# Live-review — Preview-rökprov (efter kod-PR)

**Gör inte det här i kod-PR:en.** Flaggan stannar av i koden
(`isLiveReviewEnabled()` kräver `1`/`true`). Det här är ett separat
driftsteg när `SM-070`-koden redan ligger på `master`.

## Förutsättningar

- Kod-PR:en för grinden är mergad (persistad grant, AND-grind, claim, Blob-TTL).
- `OC_EDIT` är på i den miljö du röker.
- Du har en builder-chatt du äger.

## Preview först

1. Sätt `SAJTMASKIN_LIVE_REVIEW=1` **bara på Vercel Preview**. Rör inte Production.
2. Öppna en Preview-deploy. Lämna kryssrutan `live_review` av. Generera en sajt.
3. Förväntat: Product Postcheck körs, **inga** JPEG, **ingen** betald critic.
   Skip-orsak `grant_off`.
4. Bocka i Extra befogenheter → Live review. Ladda om, bekräfta att krysset
   överlever (persist). Generera igen.
5. Förväntat: desktop+mobil-JPEG, ett critic-svar i postcheck, `[LIVE-REVIEW]`
   syns när Sajtagenten får en review-fråga.
6. Kör samma version om (F5 / ny postcheck). Förväntat: **ingen** andra betald
   körning — samma `filesRevision` återanvänds.
7. Ändra en fil så `filesRevision` byts. Förväntat: ny review, föregående
   JPEG raderas.
8. Bocka ur `live_review`. Ny generation. Förväntat: ingen capture.

## Production sist

Samma lista mot Production **bara om Preview var grön**. Arkivera `SM-070`
efteråt. Slå inte på Production i samma andetag som kodmerge.
