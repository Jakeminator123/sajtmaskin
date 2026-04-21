# Buggrapport

Skapa en Linear-issue i team **Sajtmaskin** med label **Bug** via Linear-MCP:n (`plugin-linear-linear/save_issue`). Funkar från manuellt resonemang, från Cursor-browsern, eller från terminal-/testoutput.

## Förutsättningar (verifiera tyst innan första issue)

- Linear-MCP:n är inloggad. Snabbtest: `list_teams` ska returnera minst team `Sajtmaskin`. Om den inte gör det, stoppa och be användaren autentisera via Cursor → MCP-inställningar → Linear.
- Team-id: `91dd3987-5eb4-4c88-b455-0cd7932906be` (eller bara skicka `team: "Sajtmaskin"` — `save_issue` accepterar namn).
- Standard-label: `Bug` (id `d0e1f465-4d47-41aa-8d60-4ea7ea3e0740`). Lägg till `Improvement` eller `Feature` istället om buggen egentligen är en förbättring.

## Indatakällor

Välj den/de som finns tillgängliga:

1. **Manuellt** — användaren beskriver buggen i prompten.
2. **Cursor-browser** — använd `cursor-ide-browser` MCP:
   - `browser_tabs { action: "list" }` → hitta aktiv flik och URL.
   - `browser_snapshot` → fånga DOM-tillstånd (skicka inte hela snapshoten in i issue:t — sammanfatta).
   - `browser_console_messages` → fånga ev. console errors/warnings.
   - `browser_network_requests` → fånga failed requests (4xx/5xx) eller långsamma anrop.
   - `browser_take_screenshot` → spara skärmbild om visuell bug.
3. **Terminal/test-output** — läs senaste relevanta terminalfil under `terminals/` eller den output som just rapporterats; klipp ut den minsta reproducerbara stack tracen.

## Issue-format (obligatoriskt)

**Titel:** kort, imperativ, börja med påverkad yta. Bra exempel: `Builder: preview kraschar när scaffold saknar manifest`. Dåligt: `Det funkar inte`.

**Beskrivning (Markdown, riktiga radbrytningar — inga `\n`):**

```markdown
## Sammanfattning
Ett par rader om vad som händer och varför det är ett problem.

## Repro
1. ...
2. ...
3. ...

## Förväntat
...

## Faktiskt
...

## Bevis
- URL: <om från browsern>
- Console: <kort utdrag, max ~10 rader>
- Network: <metod + URL + status, ev. body-snippet>
- Screenshot: <bifogas via `create_attachment` om relevant>
- Repo-ref: <fil:rad eller commit-hash om koden är inblandad>

## Misstänkt orsak / scope
Frivilligt. Peka på modul/fil eller säg "okänt".
```

**Prioritet:** sätt `priority` om det är uppenbart:

- `1 Urgent` — produktion nere, dataförlust, säkerhetshål.
- `2 High` — kärnflöde brutet, ingen rimlig workaround.
- `3 Normal` — default för buggar med workaround.
- `4 Low` — kosmetiskt, edge case, sällan-trigger.
- Sätt inte `priority` alls om du är osäker — bättre att lämna tomt än att gissa.

**Labels:** alltid `["Bug"]` om det är en bug. Lägg till `Improvement` eller `Feature` *istället för* `Bug` om uppgiften visar sig vara en förbättring/önskemål.

## Anropsmönster

```ts
save_issue({
  team: "Sajtmaskin",
  title: "<titel>",
  description: "<markdown ovan>",
  labels: ["Bug"],
  // priority: 2,        // bara om uppenbart
  // links: [{ url, title }],  // browser-URL eller relaterad doc
})
```

Om buggen kommer från en specifik webbsida — lägg URL:en i `links` (`title` t.ex. "Reproducerande sida"), inte bara i beskrivningen.

För skärmdumpar: först `save_issue` → ta `id` ur svaret → `create_attachment` med bilden mot den issue:n.

## Lokal mirror i `.cursor/bugs/` (OBLIGATORISK)

Efter `save_issue` lyckats — skriv en lokal kopia av rapporten till `.cursor/bugs/`. Mappen är gitignored (förutom README) och fungerar som lokal arbetslogg/grep-yta för agenter och dig. Mappen är **inte** i `.cursorignore`, så agenter kan läsa tidigare rapporter för att t.ex. upptäcka dubletter.

**Innan du skapar:** kör en snabb dublettkontroll. Lista filer i `.cursor/bugs/` (senaste 20–30) och sök på nyckelord från titeln. Om en aktuell, oavslutad issue redan finns för samma rotorsak → skapa **inte** en ny issue, lägg istället en kommentar via `save_comment` på den existerande och rapportera tillbaka vilken issue som uppdaterades.

**Filnamn:**

```
.cursor/bugs/YYYY-MM-DD_HHMM_<LINEAR-ID>_<kort-slug>.md
```

Exempel: `.cursor/bugs/2026-04-21_1530_SAJ-42_preview-kraschar-utan-manifest.md`

- Tidsstämpel = lokal tid (Stockholm). Hämta via `Get-Date -Format "yyyy-MM-dd_HHmm"` i PowerShell, eller `date +"%Y-%m-%d_%H%M"` i bash.
- `LINEAR-ID` = `identifier` från `save_issue`-svaret (t.ex. `SAJ-42`). Om Linear-anropet misslyckats: använd `SAJ-PENDING` och säg det i slutsvaret.
- Slug: 3–6 ord, kebab-case, transliterera å→a, ä→a, ö→o.

**Filinnehåll:**

```markdown
---
linear_id: SAJ-42
linear_url: https://linear.app/sajtmaskin/issue/SAJ-42
created_at: 2026-04-21T15:30:00+02:00
labels: [Bug]
priority: 3
source: browser   # browser | manual | terminal | test
---

# <samma titel som Linear-issuen>

<samma markdown som skickades till `save_issue.description`, oförändrad>
```

- `linear_url` byggs från `identifier` i svaret: `https://linear.app/sajtmaskin/issue/<IDENTIFIER>`. Om `save_issue` returnerar ett `url`-fält, använd det istället.
- Ändra **inte** rapportens innehåll mellan Linear och lokal kopia — de ska vara identiska. Den lokala filen är en frusen snapshot.
- Länka **inte** tillbaka till lokal sökväg från Linear-issuen (path är förutsägbar via `LINEAR-ID` om någon dev behöver hitta filen, och lokala paths är inte meningsfulla för andra maskiner).

Läs `.cursor/bugs/README.md` om något i konventionen är oklart.

## Slutsvar till användaren

Efter lyckad skapelse, rapportera kort:

- Issue-identifier (t.ex. `SAJ-42`) och full URL.
- Sökväg till lokal mirror (`.cursor/bugs/...`).
- Vilken prioritet och labels som sattes.
- Om dublett-check hittade en existerande issue och en kommentar lades istället → säg vilken issue som uppdaterades och länken dit.
- Om något medvetet utelämnades (t.ex. screenshot-attachment hoppades över för att browsern var stängd, eller lokal fil skrevs med `SAJ-PENDING` för att Linear-anropet failade).

Skapa **inte** flera issues för samma rotorsak i samma session — slå ihop till en issue med flera repro-steg, eller länka relaterade issues via `relatedTo`.

## När det inte ska bli en issue

- Användaren ber bara om en idé/diskussion utan att be om filing.
- Felet är redan en pågående konversation och ska fixas direkt i samma session — då räcker en TODO i koden eller en kort note i slutsvaret.
- Om du är osäker: fråga "Ska detta in som Linear-issue?" innan du anropar `save_issue`.

## Cloud / Background Agent (Cursor Background Agents)

Background Agents kör i en ephemeral VM. Det förändrar tre saker mot lokalt flöde — agenten **måste** vara medveten:

1. **Linear-pluginen är redan enabled i `.cursor/settings.json`** (committad), så Background Agents ärver `plugins.linear.enabled: true` automatiskt. Det som **inte** ärvs är OAuth-auth — den är knuten till en Cursor-user/agent, inte till repo:t. Om `list_teams` failar eller returnerar tomt i Background Agent: stoppa, skapa **ingen** issue (annars hamnar buggen i fel workspace eller försvinner). Rapportera i agentens slutmeddelande att Linear-auth saknas så användaren kan koppla in den via Cursor → Background Agents → autentisera Linear-pluginen för agenten. Inget behöver läggas till i `.cursor/mcp.json` eller settings — bara auth.
2. **Lokal mirror i `.cursor/bugs/` är gitignored** — filen skrivs i VM:n men **pushas aldrig**. Det är OK: Linear är källan-till-sanning. Skriv ändå filen lokalt under körningen så att efterföljande steg i samma agent-session kan grep:a den (t.ex. om agenten skapar flera relaterade rapporter i en körning).
3. **Dublett-check får inte förlita sig på lokala filer** (de finns inte mellan körningar i cloud). Använd istället `list_issues` mot Linear:

   ```ts
   list_issues({
     team: "Sajtmaskin",
     query: "<2-4 nyckelord från titeln>",
     // valfritt: filtrera bort Done/Cancelled via state om scopet växer
   })
   ```

   Om en aktuell oavslutad issue matchar samma rotorsak → `save_comment` på den befintliga, skapa **inte** ny. Returnera vilken issue som uppdaterades.

**Identifiera körkontext:** sätt `source` i frontmattern till `cloud-agent` (utöver `browser | manual | terminal | test`) när rapporten skapas av en Background Agent, så det är synligt i Linear-beskrivningens "skapad av"-kontext.

**Inga extra triggers nödvändiga.** Background Agents kör de uppgifter de fått. Om en task ska auto-fila buggar (t.ex. efter en misslyckad CI-körning), inkludera "kör `/buggrapport` om något misslyckades och rapporten inte redan finns i Linear" i task-prompten. Inget hook-script behövs.
