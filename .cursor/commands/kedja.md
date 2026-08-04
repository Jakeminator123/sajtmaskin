# /kedja — stegad buggfix-pipeline

Kör **en** bugg genom sju steg. Billiga agenter gör det mekaniska, du (orkestratorn) fattar besluten. Det som gör kedjan möjlig är **steg 2**: ett failande test. Utan objektivt grönt/rött blir domarsteget en åsikt, och då är hela poängen borta.

**Fix mode** — till skillnad från `/automat` (audit) skriver den här kod. All skrivning sker i **egna worktrees**, aldrig i huvudcheckouten. Ingen commit, push eller PR.

## Argument

| Kommando | Betyder |
|---|---|
| `/kedja <bugg eller backlog-rad>` | kör pipelinen på den buggen |
| `/kedja` | fråga användaren vilken bugg — välj aldrig själv |
| `... kandidater=3` | 3 fix-kandidater i steg 5 i stället för 2 |

Modellval kommer från [`.cursor/README.md § Modellval för subagenter`](../README.md#modellval-för-subagenter-kanonisk-tabell). Hitta inte på slugar.

## Stoppvillkor — läs dessa först

Pipelinen ska **avbrytas och rapportera**, inte improvisera, när:

- steg 0 inte kan formulera ett körbart acceptanskriterium,
- steg 2:s test blir **grönt** på orörd kod (då är fyndet eller kriteriet fel, inte koden),
- steg 4 inte kan peka ut en rotorsak — två motstridiga hypoteser är ett stoppvillkor, inte ett myntkast,
- ingen kandidat är grön efter **en** extra runda,
- fixen växer utanför den beskrivna buggen (`mvp-scope-freeze.mdc`), rör protected paths eller >10 filer.

## Steg

### 0. Ram — du själv, ingen subagent

Skriv tre rader och visa dem för användaren innan du fortsätter:

- **Bugg:** en mening + `fil:rad`-ankare.
- **Acceptans:** ett **körbart** kommando som är rött nu och grönt efter fixen (`npx vitest run <fil>`).
- **Utanför scope:** vad du medvetet inte rör.

Kommer du från `BUG-SWARM-BACKLOG.md`: läs raden ordagrant. Kolumnen "Beslut / nästa steg" innehåller ofta ägaren, testet som måste skrivas om, och fällor. Den är indata, inte bakgrund.

### 1. Arbetsyta

En worktree per kandidat, aldrig arbete i huvudcheckouten:

```powershell
git worktree add ..\sajtmaskin-kedja-<slug>-a -b kedja/<slug>-a
npm run worktree:link -- ..\sajtmaskin-kedja-<slug>-a
```

Upprepa med `-b`, `-c` … per kandidat. `worktree:link` kräver att worktreet redan är registrerat, så ordningen är låst. Använd **aldrig** `git worktree remove --force` direkt (junction-fällan tömmer huvudcheckoutens `node_modules`).

### 2. Repro — 1 agent, skrivrätt, `cursor-grok-4.5-high`

Agenten skriver **två** saker i kandidat **a**:s worktree:

- **Det röda testet** — buggen. Ska faila nu.
- **Minst ett motprov** — ett test som är grönt nu och som fixen **inte får bryta**.

Motprovet är inte valfritt. Ett rött test säger bara "detta får inte hända"; utan motprov är "stäng av funktionen helt" ett fullt giltigt sätt att bli grön. Frågan agenten ska svara på är: *vilket är det närmaste fallet som fortfarande MÅSTE fungera?* För en vakt som ska sluta trigga är svaret alltid det legitima fall som ligger närmast det felaktiga.

**Grind:** kör själv båda i den worktreen. Är det röda testet **grönt** → stopp. Ett test som passerar på orörd kod bevisar att fyndet inte stämmer, och då är fixen fel sak att bygga. Rapportera det som ett resultat — det är ett bra utfall, inte ett misslyckande.

Kopiera testfilen till övriga kandidat-worktrees när den är verifierat röd, så alla döms av exakt samma prov.

### 3. Lokalisera — 3 parallella, `readonly: true`, `composer-2.5-fast`

Tre konkurrerande hypoteser om rotorsaken, en agent var, max 5 rader vardera. De ser samma testutskrift men får olika ingångar (kodvägen, anropsplatserna, testet självt).

### 4. Välj rotorsak — du själv

Läs koden på de ankare hypoteserna pekar ut. Enas två eller fler om samma ställe är det en stark signal. Motsäger de varandra: kör steg 3 igen med en skarpare fråga, **en** gång. Fortfarande oklart → stopp.

### 5. Fixa — N parallella, skrivrätt, `cursor-grok-4.5-high`

En agent per worktree, samma rotorsak, men **uttryckligen olika ansats** — du namnger ansatsen per kandidat i prompten. Låter du dem välja själva får du samma svar N gånger: de har ju samma rotorsak, samma test och samma modell, så de konvergerar.

Kan du inte formulera två genuint olika ansatser: kör **en** kandidat. Två identiska diffar är inte best-of-2, det är dubbel kostnad för en enda röst.

Varje agent får bara röra den utpekade ägaren plus testet, och ska hålla diffen minimal.

### 6. Döm — du själv, maskinellt

Per kandidat, i den ordningen (billigast först):

1. `npx vitest run <testfil>` — **både** det röda testet och motprovet. Rött i någotdera betyder utslagen.
2. Övriga tester i samma mapp — fångar den som fick testet grönt genom att bryta något annat.
3. `npm run typecheck` — bara på kandidater som klarat 1 och 2.
4. `node scripts/dev/check-unicode-regex.mjs` om diffen rör regex.

**Vinnare = minsta diff som klarar allt.** Är två kandidater semantiskt identiska räknas de som **en** — notera det i rapporten, för det betyder att steg 5 inte gav någon spridning.

Är alla röda: en extra runda där varje agent får sin egen felutskrift. Sedan stopp.

### 7. Grind — bugbot-subagent på vinnarens diff

`subagent_type: "bugbot"`, `readonly: true`, `description: "Bugbot"`. Detta är det obligatoriska passet ur `workflow.mdc`, inte ett extra lager. Fynd triageras som vanligt: fixa i diffen, logga i backloggen, eller avfärda med en rad.

## Efter körning

1. Skriv varje kandidats diff till `.cursor/kedja/<YYYY-MM-DD_HHMM>/kandidat-<x>.diff` **innan** du tar bort något.
2. Ta bort de förlorande worktreesen: `npm run worktree:remove -- <sökväg> --force`. Det tar bort katalogen men **lämnar branchen kvar** — radera den också: `git branch -D kedja/<slug>-<x>`. Missas det blir varje körning en föräldralös branch rikare.
3. **Behåll vinnarens worktree, ocommittad.** Commit, push och PR sker bara på explicit begäran (`git.mdc`).
4. Rapportera kort: bugg, acceptanskriterium, rotorsak, kandidat × utfall, bugbot-fynd, sökväg till vinnaren.

Blev något kvar — avbruten körning, misslyckad teardown, gammal branch — sopa upp med `npm run kedja:clean` (torrkörning) och sedan `node scripts/cursor/kedja-clean.mjs --yes --keep <vinnaren>`. Skriptet sparar diffar innan det raderar och vägrar röra en worktree vars tillstånd det inte kan läsa. Flaggorna måste gå via `node`: npm äter `--yes` och `--keep` innan de når skriptet.

Backlog-raden bockas **inte** av automatiskt. Det görs manuellt när fixen är mergad.

## Anti-mönster

- Hoppa över steg 2 för att buggen "är uppenbar". Utan rött test finns ingen domare, och då är pipelinen bara en dyrare `/818`.
- Skriva kod i huvudcheckouten, eller `git checkout` där (`agent-worktree.mdc`).
- Låta fix-agenterna välja rotorsak själva — de får en, du valde den i steg 4.
- Bredda fixen till närliggande fynd som dyker upp på vägen. Logga dem via `/buggrapport` i stället.
- Loopa mer än en extra runda. Två röda rundor är ett svar: buggen är för stor för kedjan.

## Projekt-skill

Promptmallar per steg, worktree-recept och rapportformat: [`.cursor/skills/kedja-fix-pipeline/SKILL.md`](../skills/kedja-fix-pipeline/SKILL.md).
