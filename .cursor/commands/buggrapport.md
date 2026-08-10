# Buggrapport

Lägg in en bugg i den **enda** bugglistan: [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) (repo-rot). Ingen Linear, ingen extern tracker — lokal markdown är källan till sanning. Funkar från manuellt resonemang, Cursor-browsern eller terminal-/testoutput.

## Princip

- En reell **defekt** (systemet gör fel) → ny `[ ]`-rad i sektionen **`## Aktiv kö`**.
- Ett **policy-/produktval** (systemet gör som tänkt men vi kan välja annorlunda) → rad i **`## Väntar på ägarbeslut`**, inte Aktiv kö. Raden ska ha beslutsägare + deadline/trigger.
- Kan inte avgöras statiskt (kräver repro/livekörning) → **`## Behöver repro`**, med exakt vad som ska köras.
- Hardening, testlucka, dokumentations- eller arkitekturskuld → **`## Säkerhet, infra och teknisk skuld`**. Det är ingen produktbugg och ska inte inflatera kön.
- Läs `BUG-SWARM-BACKLOG.md` § "Hur den hålls sann" innan du skriver — den styr formatet.

## Indatakällor

Välj den/de som finns:

1. **Manuellt** — användaren beskriver buggen i prompten.
2. **Cursor-browser** — `cursor-ide-browser` MCP:
   - `browser_tabs { action: "list" }` → aktiv flik + URL.
   - `browser_snapshot` → DOM-tillstånd (sammanfatta, klistra inte in hela).
   - `browser_console_messages` → console errors/warnings.
   - `browser_network_requests` → failed requests (4xx/5xx) eller långsamma anrop.
   - `browser_take_screenshot` → spara skärmbild om visuell bug (se evidens-fil nedan).
3. **Terminal/test-output** — läs senaste relevanta `terminals/`-fil eller rapporterad output; klipp ut minsta reproducerbara stack trace.

## Steg

### 1. Dublettkontroll (OBLIGATORISK)

Innan du lägger till: sök i backloggen + lokal evidens-mapp på 2–4 nyckelord ur titeln.

```powershell
Select-String -Path BUG-SWARM-BACKLOG.md -Pattern "<nyckelord>"
Get-ChildItem .cursor/bugs/ -Filter *.md | Select-String -Pattern "<nyckelord>"
```

Finns en aktuell öppen rad för samma rotorsak → **uppdatera den raden** (skärp ankare/repro) i stället för att lägga en ny. Rapportera vilken rad som uppdaterades.

### 2. Tilldela ID

Två olika ID, båda krävs för en Aktiv kö-rad:

- **Stabilt rad-ID `SM-###`** — radens identitet. Hitta högsta befintliga `SM-` i `BUG-SWARM-BACKLOG.md` **och** i [`docs/plans/avklarat/bug-swarm/README.md`](../../docs/plans/avklarat/bug-swarm/README.md) (fältet "Högsta förbrukade"), och ta nästa lediga nummer. **Återanvänd aldrig** ett nummer, inte ens från en arkiverad rad (äldre arkiv = git-historik).
- **Källa-tag `M#<n>`** — varifrån fyndet kom. Manuellt rapporterade buggar inkrementerar högsta `M#` (`M#1`, `M#2`, …). Saknas någon → börja på `M#1`.

### 3. Lägg till raden

Skriv en `[ ]`-rad i rätt sektion. Aktiv kö använder 7-kolumnsformatet (det är detta canvas + formatkontrollen läser), och `Fynd`-cellen **måste** börja med det stabila ID:t:

```markdown
| [ ] | Öppen bug | P2 | `SM-###` **<kort fynd>:** <fil:rad-ankare + varför det är fel> | M#<n> | <minsta åtgärd / nästa steg> |
```

- **Fynd:** kort, konkret, med kod-ankare (`fil.ts:rad`) om koden är inblandad. **En** falsifierbar premiss per rad — är den bred, dela raden.
- **Prio:** `P0` produktion nere/dataförlust/säkerhetshål · `P1` kärnflöde brutet utan workaround · `P2` bug med workaround · `P3` kosmetiskt/edge. Osäker → `P2`.
- Hör fyndet egentligen hemma i `Väntar på ägarbeslut`, `Behöver repro` eller skuldsektionen → använd de sektionernas format i stället (ingen 7-kolumns-kryssruta där).

### 4. Valfri lokal evidens (`.cursor/bugs/`)

Bara om rapporten har tung evidens (skärmdump, lång console-/network-dump) som inte ryms i en tabellcell. Mappen är **gitignored** (utom README) och är lokal arbetsyta — **inte** en parallell sanning.

Filnamn:

```text
.cursor/bugs/YYYY-MM-DD_HHMM_M<n>_<kort-slug>.md
```

- Tidsstämpel = lokal tid: `Get-Date -Format "yyyy-MM-dd_HHmm"`.
- Slug: 3–6 ord, kebab-case, transliterera å→a, ä→a, ö→o.
- Innehåll: fri markdown (sammanfattning, repro, förväntat/faktiskt, bevis). Referera filen från backlog-raden bara om den behövs.
- Skärmdumpar: spara bildfilen bredvid `.md`:n och länka relativt.

## Format för fyndtext (rekommenderat)

Håll cellen kort, men en bra fyndtext täcker: vad händer, var (fil/route), varför det är fel. Exempel:

`Builder: preview kraschar när scaffold saknar manifest (PreviewPanel.tsx:170) — ingen fallback, vit iframe`

Undvik `Det funkar inte`.

## Slutsvar till användaren

- Vilken sektion + källa-id (`M#<n>`) som lades/uppdaterades.
- Prio.
- Ev. lokal evidens-fil (`.cursor/bugs/...`).
- Om dublett-check hittade en befintlig rad och den uppdaterades i stället → säg vilken.
- **Backlog-raden är en spårad git-ändring** — den persisteras först vid commit. Commit/push bara på explicit begäran (`git.mdc`).

## När det INTE ska bli en rad

- Användaren ber bara om en idé/diskussion.
- Felet fixas direkt i samma session → en kort note i slutsvaret räcker (eller fixa + logga om PR-review-gaten kräver det).
- Osäker → fråga "Ska detta in i backloggen?" innan du skriver.

Skapa inte flera rader för samma rotorsak — slå ihop till en rad med flera repro-steg.

## Cloud / Background Agent

Background Agents kör i en ephemeral VM men `BUG-SWARM-BACKLOG.md` är **spårad i git** — så en tillagd rad följer med agentens branch/commit (till skillnad från den gamla Linear-mirror-modellen). Dublettkoll görs mot själva filen (`Select-String`), inte mot någon extern tjänst. `.cursor/bugs/`-evidens är fortfarande gitignored och pushas inte.
