# 03 — Docs-sanering: en läsyta per fakta, noll antalsprosa

**Mål:** handskrivna docs slutar påstå saker som projektionen/manifesten äger. Verifierad drift
rättas, antalsprosa förbjuds, överlapp raderas eller blir pekare.
**Byggmodell:** billig (`cursor-grok-4.5`). **Beroenden:** plan 01 mergad (annars konflikt i
`docs/generated/`); parallell med 02.

## Verifierade fel som rättas (kontrollerade mot disk 2026-08-11)

| Fil | Fel | Rättelse |
|---|---|---|
| `docs/llm/dossier-selection-flow.md:187` | "27 dossiers över 23 capabilities (18 hard, 9 soft)" | Ersätt hela § Nuvarande pool med pekare till projektionen/`docs/generated/` |
| `docs/contracts/dossier-system.md:245` | "Satt på 10 av 11 hard-dossiers" | Formulera utan antal ("alla hard utom analytics-undantaget") |
| `docs/contracts/dossier-system.md:149,173` | vercel-analytics påstås ha warn-only-nyckel | Manifestet har `envVars: []` — rätta rationale (ingen nyckel alls; self-disable) |
| `docs/contracts/dossier-system.md:179-180` | pekar på `dossiers.py` för MOCK_LABELS/requires_f3 | Peka på faktisk ägare (efter plan 02: projektionen + `dossier-axes.ts`) |
| `src/lib/builder/dossier-overview.ts:165`-kommentar | upprepar warn-only-påståendet om analytics | Synka kommentaren med manifestet |

## Steg

1. Rätta tabellen ovan. Kontrollera samtidigt `validate-manifest.ts`-rationale-strängar
   som gör samma analytics-påstående.
2. **Anti-antal-regel:** sök igenom `docs/` efter hårdkodade poolantal
   (`\d+ dossiers`, `\d+ capabilities`, "X hard", "Y soft") och ersätt med pekare till
   `docs/generated/capabilities.generated.md` / projektionen. Lägg en mening om regeln i
   `docs/documentation-lifecycle.md`: *handskriven text får inte räkna poolen*.
3. **Banta `docs/llm/dossier-cheatsheet.md`** till kort användarguide (per handoff-principen:
   den ska inte duplicera sanningsmodellen).
4. **Ta in `FUSKLAPP-BYGGBLOCK.md`** (finns som utkast på branch `chore/dossier-begreppskarta`)
   i repo-roten; länka från `README.md`/`AGENTS.md`-läsordningen. Fusklappen har inga antal
   och deklarerar att koden vinner — håll den så.
5. **Radera** (inte bara flagga) stycken i handskrivna docs som ordagrant duplicerar vad
   `docs/generated/*` nu visar. Varje radering listas i PR-beskrivningen med ersättande yta.
   Är ersättaren oklar → lämna kvar och lista som kandidat i stället.
6. `docs/plans/avklarat/2026-07-08-dossier-legacy-import.md:18` ("18 hard + 18 soft") är
   historik — rör den inte; arkivprosa räknas inte som sanningsyta.

## Raderingar (förväntade, listas i PR:en)

- § Nuvarande pool-antal i `dossier-selection-flow.md`
- dubblerande mock-tabellrader i cheatsheeten
- ev. övriga antalsställen som anti-antal-svepet hittar

## Verifiering

`npm run docs:check`, `npm run docs:links`, `npm run hygiene`; diff-läsning att ingen
kanonisk regel ändrats i sak (bara var den står).

## Definition of done

Alla fem verifierade fel rättade; noll hårdkodade poolantal i handskrivna docs;
fusklappen i roten och länkad; raderingslista i PR:en; bugbot-pass dokumenterat.
