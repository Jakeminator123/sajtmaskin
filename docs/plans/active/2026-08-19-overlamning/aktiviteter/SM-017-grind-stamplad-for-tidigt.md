# Grinden stämplas grön innan den körts

**Klar 2026-08-20 — [#1068](https://github.com/Jakeminator123/sajtmaskin/pull/1068).**

Våg 3 · Cloud · `SM-017` · Rapporteringsfel med prod-träff

## Målet

Backoffice och telemetrin visar grön kvalitetsgrind på versioner där
produktkontrollen faktiskt blockerade. Alla fyra designversioner i proddumpen
19 augusti hade `quality_gate_result: preflight_passed` samtidigt som användaren
såg «1 spärr».

En grind som rapporterar grönt när den stoppat något är värre än ingen grind:
den stänger frågan.

## Fyndet

Finalize stämplar `quality_gate_result` **före** preview och postcheck. Fältet
är i praktiken preflight + verifier, men det läses som slutligt gate-utfall.
Postchecken skriver aldrig tillbaka.

Ankare (omverifiera — filerna rörs ofta):

- `src/lib/gen/stream/finalize-version/persist-telemetry.ts:249-258`
- `src/lib/db/services/generation-telemetry.ts:695-781` (stämplar om till
  `preflight_passed` efter repair — fortfarande utan postcheck)

Signatur i error-loggen: `d7432b0d977d`.

## Fix

Samma kolumn, inte en ny tabell. Två vägar är godtagbara:

1. Skriv ett postcheck-utfall (t.ex. `product_blocked`) efter att postchecken
   kört, **bakåtkompatibelt** — befintliga enum-värden får inte sluta gälla.
2. Eller: låt läsaren (Backoffice) slå ihop `quality_gate_result` med senaste
   `product_postcheck.summary` så den visade grinden speglar båda.

Välj den som gör **en** källa till sanning. Bygg inte båda.

## Gör inte

- Ingen ny tabell och ingen ny telemetri-kolumn.
- Bryt inte enum-bakåtkompatibiliteten — det finns befintliga konsumenter.
- Rör inte `product-postcheck.ts` (ägs av `fake_form`-paketet i samma våg).
- Ändra inte vad som faktiskt blockerar — bara vad som rapporteras.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/gen/stream src/lib/db/services
```

Nytt test krävs: en version där postchecken satte `productBlocked` får inte
rapporteras som grön grind.
