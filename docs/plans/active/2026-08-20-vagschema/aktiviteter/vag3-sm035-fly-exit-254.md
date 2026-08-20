# Våg 3 — `SM-035`: Fly preview-host `npm install` exit 254

Backlograd: `SM-035` (Aktiv kö, P1, bekräftad prod-bugg)
Beror på: inget. Blockerar: inget.
**Inte en cloud-uppgift.** Cloud-poden har ingen Fly-åtkomst
([`cursor-cloud-agent.md`](../../../../runbooks/cursor-cloud-agent.md)). Kör
lokalt eller med ägaren närvarande.
Ägda filer: `preview-host/` + Fly-ops.

## Läget

`npm install --no-audit --include=dev` ger exit **254** i preview-VM:ens
bootstrap — fem träffar i tre chattar sedan 11 augusti, defektsignatur
`a0bc26af7689`. VM:en dör innan sajten kan starta, så det är ett plattformsfel
och inte ett generatorfel.

Vad som redan är gjort och **inte** ska göras om:

| Åtgärd | Utfall |
|---|---|
| `#1063` `classifyInstallFailure` | Orsaken syns nu i feltexten. Diagnostik, inte rotorsak |
| Diskkontroll 2026-08-20 | 29 % använt — disk utesluten |

Rotorsaken är alltså fortfarande okänd. Raden är P1 för att den träffar
produktens kärnväg: utan preview finns ingen sajt att visa.

## Uppgiften

**Diagnos före fix.** Den här raden har redan fått en förbättrad felmätning; nästa
steg är att faktiskt fånga ett fall, inte att gissa en härdning.

1. Läs `classifyInstallFailure`-utfallen för de fem träffarna ur prod: vilken
   klass har de fått sedan `#1063`? Det är den billigaste ledtråden och den finns
   redan.
2. Reproducera i en Fly-VM med samma bild och samma installkommando. Fånga hela
   `npm`-loggen (`npm_logs`/`--foreground-verbose`), inte bara exitkoden.
3. Skilj mellan de rimliga hypoteserna innan du ändrar kod: minnestryck/OOM-kill i
   VM:en, nätverksfel mot registryn, korrupt cache i den varma bilden,
   lockfile-/peer-dep-konflikt för just det projektets deps, eller att processen
   signaldödas av hostens egen lifecycle.
4. Rapportera först. Skriv rotorsaken i PR-bodyn med bevis. **Sedan** en smal
   fix.

Om VM:en inte går att reproducera i rimlig tid: leverera mätningen som PR:en —
en logg som gör nästa försök avgörande — och skriv uttryckligen att rotorsaken
inte hittades. Det är ett acceptabelt utfall och bättre än en spekulativ retry.

## Gränser

- Lägg **inte** in en blind retry på `npm install`. Det döljer signalen och kan
  dubbla installtiden på varje kall start.
- Ändra inte generatorns dep-lista (`dep-completer.ts`) för att kringgå
  problemet.
- Rör inte Fly-skalning, maskinstorlekar eller regioner utan ägarens OK — det är
  driftbeslut med kostnad.
- Skriv aldrig tokens eller secrets i logg, PR eller plan.

## Klart när

Ett av två:

- **Rotorsak funnen:** bevisad med logg, med en smal fix och ett test eller en
  guard som gör att samma orsak inte kan passera tyst igen.
- **Rotorsak inte funnen:** loggnivån/mätningen förbättrad så att nästa
  förekomst är avgörande, och `SM-035`-raden uppdaterad med vad som uteslutits.

I båda fallen: `cd preview-host; npm run test:guards` grön.

## Agentprompt

> Du är Builder i Sajtmaskin och kör **lokalt** (cloud-poden saknar Fly-åtkomst).
> Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: hitta rotorsaken till `npm install --no-audit --include=dev` exit 254 i
> Fly preview-host (`SM-035`, signatur `a0bc26af7689`). `#1063` gav
> orsaksklassning och disken är utesluten. Börja med att läsa vad
> `classifyInstallFailure` faktiskt rapporterat för de fem träffarna, försök sedan
> reproducera i en Fly-VM och fånga hela npm-loggen. Diagnos före fix.
>
> Lägg ingen blind retry. Ändra inte generatorns dep-lista. Rör inte Fly-skalning
> eller maskinstorlekar utan ägarens OK. Skriv aldrig secrets.
>
> Hittar du inte rotorsaken: leverera mätningen som PR och säg det rakt ut.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
