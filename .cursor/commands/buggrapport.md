# Buggrapport

Lägg in en bugg i den **enda** bugglistan: [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) (repo-rot). Ingen Linear, ingen extern tracker — lokal markdown är källan till sanning. Funkar från manuellt resonemang, Cursor-browsern eller terminal-/testoutput.

## Princip

- En reell **defekt** i nåbar kod → ny rad i **`## Aktiva produktionsbuggar`**.
- En defekt bakom avstängd feature flag → **`## Release blockers bakom feature flag`**.
- Ett **policy-/produktval** → **`## Väntar på ägarbeslut`**.
- Kan inte avgöras statiskt → **`## Risker som behöver repro`**.
- Hardening, testlucka eller städning → **`## Säkerhet, infra och teknisk skuld`**.
- Läs `BUG-SWARM-BACKLOG.md` § "Regler" innan du skriver — den styr formatet.

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

Hitta högsta befintliga bas-ID `SW-###` i `BUG-SWARM-BACKLOG.md` och arkivfilerna och inkrementera. Suffix som `SW-055A` räknas som bas `SW-055`, så nästa blir `SW-056`. ID:t ändras inte om raden senare flyttar mellan köer.

### 3. Lägg till raden

Skriv en rad i rätt sektion. Aktiva produktionsbuggar och releaseblockers använder detta format (canvas + formatkontroll läser det):

```markdown
| SW-056 | P2 | Builder | <ett kort falsifierbart fel> | `fil.ts` + funktion eller kontrakt | <minsta åtgärd> | 2026-08-05 abcdef0 |
```

- **Fel:** kort och konkret. Lägg fil/funktion i `Kodbevis` i stället för lång historik i felcellen.
- **Prio:** `P0` produktion nere/dataförlust/säkerhetshål · `P1` kärnflöde brutet utan workaround · `P2` bug med workaround · `P3` kosmetiskt/edge. Osäker → `P2`.
- **Verifierad:** datum + den master-SHA som beviset lästes mot.
- Hör fyndet hemma i en annan kö → använd den sektionens tabellformat. Checkboxar används inte; sektionen äger status.

### 4. Valfri lokal evidens (`.cursor/bugs/`)

Bara om rapporten har tung evidens (skärmdump, lång console-/network-dump) som inte ryms i en tabellcell. Mappen är **gitignored** (utom README) och är lokal arbetsyta — **inte** en parallell sanning.

Filnamn:

```text
.cursor/bugs/YYYY-MM-DD_HHMM_SW-<nnn>_<kort-slug>.md
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

- Vilken sektion + stabilt ID (`SW-###`) som lades/uppdaterades.
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
