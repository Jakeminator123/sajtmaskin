# Hygien — hålla repot rent och dokumentationen färsk (självgående)

Den här sidan finns så att ingen ska behöva _minnas_ städrutinerna. Det mesta är
redan automatiserat i CI; du behöver i praktiken bara en knapp.

## TL;DR — en knapp före varje PR

```bash
npm run hygiene
```

- **Grönt** = allt är rent och dokumentationen stämmer. Kör vidare.
- **Rött** = kommandot skriver ut _exakt_ vad som är fel. Åtgärda det, kör igen.

Du behöver inte kunna knip eller de enskilda checkarna utantill — `hygiene`
buntar ihop dem och antingen godkänner eller pekar på problemet.

## Vad `npm run hygiene` kontrollerar

| Steg | Frågar | Om det rödar |
|---|---|---|
| `docs:check` | Stämmer genererade contract-docs med sina källor? | Kör `npm run docs:generate` och committa. |
| `docs:links` | Pekar alla aktiva Markdown-länkar på filer som finns? | Rätta/ta bort den brutna länken. |
| `plans:history:check` | Är planhistoriken (statusar/arkivrubriker) konsekvent? | Följ meddelandet — oftast en status/rubrik som glidit. |
| `check:terms:contract` | Äger ordlistan sina begrepp (inga dubbeldefinitioner)? | Registrera begreppet i glossaryn, inte på två ställen. |
| `knip:files` | Finns någon **oimporterad källfil** (dött skräp)? | Se nästa avsnitt. |
| `clean:orphans:dry` | Vilka regenererbara skräpfiler _skulle_ städas? | Bara en rapport — kör `npm run clean:orphans` för att faktiskt ta bort. |

## Full dödkods-rapport (`npm run knip`)

`npm run knip` ger hela bilden. Läs den så här — alla kategorier är **inte** lika mycket värda:

- **Unused files** → **agera.** En källfil som inget importerar är antingen skräp
  (radera) eller runtime-/tooling-laddad (då: lägg till den i `entry` i
  [`knip.json`](../../knip.json)). Det är den enda kategorin som blockerar CI.
- **Unused dependencies** → **verifiera först, ta aldrig bort blint.** Här finns
  många **falska positiver** som beror på det här repots generator-arkitektur:
  generatorn lagrar paket-_namn_ som data (t.ex. i `dep-completer.ts` /
  `import-validator.ts`) och appens shadcn-komponenter importerar meta-paketet
  `radix-ui` i stället för de enskilda `@radix-ui/*`. Alltså ser många paket
  "oanvända" ut fast de behövs. Ta bort ett paket bara efter att du grep:at hela
  repot och kört `npm run build` + `npm run typecheck` gröna.
- **Unused exports / types** → **oftast brus.** Publik API-yta och medvetet
  exporterade typer flaggas här. Bry dig bara om det när du redan städar just den
  modulen.

## Om orphan-fil-grinden (`knip:files`) rödar i CI

CI-jobbet **`dead-code`** kör samma sak. Rödar det betyder det att en källfil inte
importeras av något. Två giltiga fixar:

1. **Filen är skräp** → radera den (git-historiken är arkivet).
2. **Filen laddas runtime/av tooling** (dynamisk import, ett Python-script som
   speglar den, en CLI-entry) → lägg till dess sökväg i `entry` i
   [`knip.json`](../../knip.json). Det säger till knip "detta är en rot", så dess
   importer räknas och den flaggas inte längre.

## Städkommandon när något faktiskt ska bort

| Kommando | Gör |
|---|---|
| `npm run clean:orphans` | Tar bort regenererbart skräp (Python-cache, tomma mappar). `:dry` för förhandsvisning. |
| `npm run plans:archive:apply` | Arkiverar färdiga planer enligt livscykeln. `plans:archive` (utan `:apply`) förhandsvisar. |
| `npm run knip` | Full dödkods-rapport (se ovan om hur den läses). |

## Vad som redan är självgående (du behöver inte tänka på det)

CI (`.github/workflows/ci.yml`) kör vid varje PR och merge:

- **Blockerande:** hela `quality`-jobbet (docs:check, docs:links,
  plans:history:check, check:terms:contract m.fl.) + `dead-code`-jobbets
  orphan-fil-grind. En stale doc eller en ny oimporterad fil **kan inte mergas**.
- **Rådgivande (blockerar aldrig):** `dead-code`-jobbets fulla knip-rapport, så
  deps/exports-svansen syns utan att låsa någon ute.

Så "dokumentationen svarar uppåt" och "skräp ackumuleras inte" upprätthålls av
maskinen, inte av minnet. Bakgrund: [`documentation-lifecycle.md`](../documentation-lifecycle.md)
(canonical-owner-modellen) och [`plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc)
(plan-/historik-städning; avklarat är ett tunt index, inte ett filzoo).
