# Kostnadsrapporten ljuger

Våg 1 · **Lokalt, inte cloud** · Ur svärmläsning, ej omverifierad

## Varför lokalt

Fixen ska bevisas med siffror före och efter mot riktig data, och Backoffice-testerna
är Python. Cloud-podar saknar ofta både fungerande Postgres och `pip`
([`cursor-cloud-agent.md`](../../../../runbooks/cursor-cloud-agent.md)). En cloud-agent
kan skriva koden men inte visa att den stämmer — och det är beviset som är poängen.

## Detta är ett rapporteringsfel, inte ett debiteringsfel

`calculateModelCost` räknar redan rätt per anrop. **Rör inte
runtime-debiteringen.** Bara rapporten.

## Fynd 1 — huvudtotalen underskattar

`scripts/db/generation-cost.mjs` (kring rad 198) prissätter **summerade** tokens
med `applyLongContext: false`. Modeller med long-context-påslag blir därför för
billiga i totalen. Den exakta per-anropsledgern (`cost_microusd`) visas bara som
en bildtext i `backoffice/pages/generation_cost.py` (kring rad 274-278).

Två siffror i samma vy säger olika saker, och den mest framträdande är den
felaktiga. Kostnadsbeslut fattas på den.

**Fix:** låt huvudtotalen bli summan av per-anropsledgern, eller räkna om per rad
med rätt long-context-flagga. Välj det som gör ledgern till enda sanning — inte
två parallella beräkningar som råkar stämma överens.

## Fynd 2 — «Prislista verifierad» visar fel datum

`backoffice/pages/generation_cost.py` (kring rad 317-318) visar
`generated_at[:10]`, alltså datumet rapporten **kördes**. Rätt fält är
`pricingVerifiedAt` (finns i `generation-cost.mjs` kring rad 312 och i prisfilen,
där verifieringsdatumet är 2026-08-12).

Etiketten påstår alltså att prislistan är verifierad idag, varje gång någon
öppnar vyn.

**Fix:** visa `pricing.verifiedAt`. Saknas fältet — skriv «okänt», aldrig dagens
datum.

## Bekräfta först

Radnumren kommer från en läs-svärm och är inte omverifierade.
`backoffice/pages/generation_cost.py` ändrades av
[#1044](https://github.com/Jakeminator123/sajtmaskin/pull/1044) samma dag. Läs
båda filerna innan du rör dem.

## Verifiering

```powershell
npm run typecheck
npm run backoffice:test
npm run lint:py
```

Kör rapporten mot dev och klistra in före/efter-siffrorna i PR-beskrivningen.
Nytt test krävs som låser att **huvudtotal == ledgersumma** för samma period.

## Gör inte

- Rör inte `calculateModelCost` eller någon annan runtime-debitering.
- Lägg inte till en tredje kostnadssiffra i vyn — ta bort motsägelsen i stället.
