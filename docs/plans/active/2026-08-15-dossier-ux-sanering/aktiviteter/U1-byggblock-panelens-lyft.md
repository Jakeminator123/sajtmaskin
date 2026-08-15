# U1 — Byggblock-ytans lyft: större, tydligare, snyggare

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Ägarens ord (2026-08-15): ytan är **för liten** och **ful**. I dag är
Byggblock en header-popover (`PreviewPanelDossiers` + `DossiersPopoverView`)
som trängs med: två flikar (Inkopplade/Bläddra katalog), env-redigering i
expanderade rader, Egna nycklar, statusbadges och katalognotiser.

## Uppgift

- **Ersätt** popovern med en större yta (dialog/sheet i builderns befintliga
  mönster — ingen ny parallell yta-klass, `mvp-scope-freeze.mdc`).
- Per block, i ett sammanhang: `summarySv`, status (från lifecycle-resolvern),
  demoläge förklarat på svenska («utan nyckel svarar chatten med låtsassvar»),
  saknade nycklar med `setupUrl`-länkar, placering (från K2), och blockets enda
  nästa åtgärd.
- Grupprubrikerna (10 st, `dossier-groups.ts`) behålls som sortering.
- Design enligt befintligt designsystem — inga nya visuella specialkomponenter
  utanför det.

## Beroenden

Kör efter K1 (informationsägarskapet) och gärna ihop med K2 (stage-flödet bor i
samma yta). Ägaren vill se förslag före implementation — ta fram 1–2 skisser
eller en enkel prototyp och få OK.

## Vad som INTE ingår

- Ingen ändring av selektion, status eller env-lagring (ägs av K1/K2/B-spåret).
- Ingen ny statusmodell.

## Verifiering

- Komponenttester + screenshot-jämförelse i preview.
- `npm run typecheck`.
- Tillgänglighet: tab-ordning och `prefers-reduced-motion` respekteras.

## Klart när

Ägaren godkänner utseendet; all funktion från popovern finns kvar (eller är
medvetet borttagen); popover-koden raderad.
