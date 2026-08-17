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

| Steg                   | Frågar                                                                       | Om det rödar                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs:check`           | Stämmer genererade contract-docs med sina källor?                            | Kör `npm run docs:generate` och committa.                                                      |
| `docs:links`           | Pekar alla aktiva Markdown-länkar på filer som finns?                        | Rätta/ta bort den brutna länken.                                                               |
| `plans:history:check`  | Är planhistoriken (statusar/arkivrubriker) konsekvent?                       | Följ meddelandet — oftast en status/rubrik som glidit.                                         |
| `check:terms:contract` | Äger ordlistan sina begrepp (inga dubbeldefinitioner)?                       | Registrera begreppet i glossaryn, inte på två ställen.                                         |
| `check:bug-backlog`    | Är `BUG-SWARM-BACKLOG.md` i rätt format?                                     | Följ felet (sektioner, SM-id, inga `[x]` i Aktiv kö).                                          |
| `knip:files`           | Finns någon **oimporterad källfil** (dött skräp)?                            | Se nästa avsnitt.                                                                              |
| `clean:orphans:dry`    | Vilka regenererbara skräpfiler _skulle_ städas?                              | Bara en rapport — kör `npm run clean:orphans` för att faktiskt ta bort.                        |
| `clean:scratch`        | Vilka gitignorade scratch-träd (t.ex. `.cursor/swarms/runs`) _skulle_ kapas? | Dry-run — kör `npm run clean:scratch:apply` för att faktiskt ta bort (behåller 3 nyaste runs). |

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

| Kommando                      | Gör                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run tidy`                | Förhandsvisar **git-nivåns** städ: döda lokala brancher, avregistrerade worktrees, förlegad `.next`. Rapporterar gamla remote-brancher. `:apply` utför. Se nedan. |
| `npm run clean:orphans`       | Tar bort regenererbart skräp (Python-cache, tomma mappar). `:dry` för förhandsvisning.                                                                            |
| `npm run clean:scratch`       | Förhandsvisar städning av gitignorerat scratch (`.tmp`, `.cursor/`-ytor, `logs/`, `.env-backups`, lösa `.tmp-*`/`scratch-*` i roten). `:apply` raderar.           |
| `npm run plans:archive:apply` | Arkiverar färdiga planer enligt livscykeln. `plans:archive` (utan `:apply`) förhandsvisar.                                                                        |
| `npm run knip`                | Full dödkods-rapport (se ovan om hur den läses).                                                                                                                  |

### `tidy` — git-nivån

Skriptet: [`scripts/dev/tidy.mjs`](../../scripts/dev/tidy.mjs). Torrkörning är default. `hygiene` är en **grind** (läsande, faller med exitkod, CI blockerar på delar); `tidy` är **vaktmästaren** som städar lokalt tillstånd som ruttnar av sig självt. Därför är de skilda knappar.

| Yta             | Policy                                                                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lokala brancher | Raderas bara när remoten är borta **och** innehållet finns i `origin/master`. Omergat = pågående arbete, rörs inte.                                                                                                                          |
| Skyddade namn   | `master`, `main`, `ema`, allt med `BRA`, `rescue/*`, `dependabot/*`, `archive/*` — aldrig.                                                                                                                                                   |
| Worktrees       | `git worktree prune` på avregistrerade poster, plus en **klassning av levande worktrees**: varje sekundär yta rapporteras som `FRI` eller `behåll` med skäl. `tidy` raderar aldrig en katalog — det gör `npm run worktree:remove`. Se nedan. |
| `.next`         | Raderas om cachen är äldre än HEAD. En förlegad `.next/dev/types` pekar på borttagna rutter och ger fantomfel i `typecheck` — det hände efter en 548-commit-pull 2026-08-17.                                                                 |
| `.gitignore`    | Tar bort dubbletter av `.env*` och `.vercel` som `vercel link` / `vercel env pull` appendar, och normaliserar till LF (CLI:n skriver CRLF på Windows). Bara exakta träffar rörs, så en riktig regel kan inte försvinna.                      |
| Remote-brancher | **Bara rapport** (äldre än 30 dagar utan öppen PR). Radering är ditt beslut; arkivera gärna som `archive/*`-tagg först.                                                                                                                      |

GitHub-städet är redan självgående: repo-inställningen `deleteBranchOnMerge` raderar varje PR-mergad branch. Det som blir kvar är per definition omergat, och därför inget en robot ska ta.

#### Worktree-klassningen — skyddet mot att dra undan mattan för en annan agent

En worktree är en **pågående session**: agenten som äger den har sin `working_directory` där, och en katalog som försvinner under den ser ut som ett trasigt repo. `npm run worktree:remove` vägrar redan på smutsigt eller ospårat innehåll, men den vet ingenting om PR-status — en ren worktree vars PR fortfarande granskas ser ledig ut fast den inte är det.

`tidy` täpper det hålet. Tre villkor måste **alla** hålla för att en yta klassas `FRI`:

| Villkor                            | Varför                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| Ingen öppen PR på branchen         | Öppen PR = någon arbetar, oavsett hur rent trädet ser ut |
| Rent arbetsträd                    | Ocommitterat och ospårat innehåll är arbete              |
| Innehållet finns i `origin/master` | Omergat = inget att kasta                                |

Faller ett enda villkor blir svaret `behåll`, med skälet utskrivet. Svarar inte `gh` behandlas **alla** som upptagna — «vet inte» är inte «ledig». Huvudcheckouten och skyddade branchnamn (`BRA`, `rescue/*`, …) klassas aldrig som fria.

`tidy` raderar aldrig kataloger, ens med `--apply`. Den pekar bara ut vad som är fritt, och du kör `npm run worktree:remove -- <sökväg>` som kopplar loss junctions innan raderingen. Bakgrunden: en rå `git worktree remove --force` följer junctionen och **tömmer huvudcheckoutens `node_modules`** — det hände 2026-07-27.

#### Varför `.gitignore`-raden inte kan fixas i filen

Det naturliga vore att hitta en filform Vercel-CLI:n accepterar. Det går inte: 2026-08-17 testades sex länkningar mot mönstret först i env-blocket, sist i filen, med och utan blankrad före, med och utan negationer efter. CLI:n appendar sin rad på nytt varje gång `.gitignore` ändrats sedan förra körningen — två identiska körningar i rad är tysta, men en redigering armerar den igen. Antalet växer alltså långsamt av sig självt. Eftersom identiska gitignore-mönster är verkningslösa för git är dubbletten ofarlig; det enda den kostar är brus i `git status`. Därför ligger fixen i `tidy` och inte i filen.

### `clean:scratch` — retention i korthet

Skriptet: [`scripts/dev/clean-scratch.mjs`](../../scripts/dev/clean-scratch.mjs). Torrkörning är default; inget raderas utan `--apply` / `:apply`. Git-spårade filer och symlänkar/junctions rörs aldrig.

| Yta                                                                      | Policy                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `.tmp`, `.pytest_cache`, `.cursor/tmp`, `.eslintcache`                   | Wipe (rensas helt)                                       |
| `.cursor/handoffs`, `kedja`, `bugs`, `logg-internet/runs`, `swarms/runs` | Hårt antalstak: 3 nyaste, ingen åldersflykt              |
| `logs/` **mappar** (t.ex. `hydration-*`)                                 | Hårt antalstak: **2** nyaste, ingen åldersflykt          |
| `logs/` **lösa filer** (`tmp-*`, `dump-*`, `*.log`-artefakter m.m.)      | Wipe — inget referensvärde                               |
| `logs/generationslogg`, `site-observability`, `llm-segmentts-and-index`  | Orörda här — egen retention i `generation-log-writer`    |
| `.env-backups`                                                           | Åldersbaserat: 3 nyaste **eller** yngre än 14 dagar      |
| Lösa `.tmp-*` och `scratch-*.mjs`/`.json` i repo-roten                   | Wipe — mönstret är ankrat och speglar `.gitignore` exakt |

Automatisk körning (t.ex. via `predev`) är **inte** inkopplad — kör manuellt när `logs/` eller `.cursor/`-scratch vuxit.

`logs/**` ligger i `knip.json`s ignore-lista. Utan den raden räknades en sparad generationsdump (`logs/hydration-*/`, ~43 `.tsx`-filer) som "oanvända filer" och gjorde `npm run hygiene` röd lokalt — och `clean:scratch` kunde inte ta bort orsaken, eftersom mapptaket är 2 och dumpen låg inom taket. CI såg det aldrig, för `logs/` är tom där.

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
