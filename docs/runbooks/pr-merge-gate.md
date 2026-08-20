# PR-merge-grinden: bakgrund och incidenter

Den operativa regeln bor i [`.cursor/rules/pr-merge.mdc`](../../.cursor/rules/pr-merge.mdc). Den här filen förklarar **varför** varje krav finns, så att regeln kan hållas kort. Läs den när du överväger att lätta på ett krav — varje rad nedan är ett fel som redan har hänt.

## GitHub-verkligheten (verifierat 2026-07-08, ruleset-kontroll 2026-07-31)

"Protect master"-rulesetet kräver **1 review + code-owner-review** (`@Jakeminator123` via `.github/CODEOWNERS`) och required status checks:

| Check | Tillagd |
|---|---|
| `quality`, `backoffice-tests`, `schema-drift` | 2026-07-08 |
| `review-window` | 2026-07-11 (workflow), läggs till i rulesetet via GitHub-API — syns inte i repo-diffen |
| `build` | 2026-07-30 via #660 |

Konsekvenser:

- Extern PR (t.ex. `chgenberg`) blockeras tills Jake godkänt — det är rulesetets syfte.
- Jakes egna PR:er kan inte självgodkännas → mergas via `gh pr merge --admin`. Admin bypassar **allt**, inklusive röda och väntande required checks. Därför är "vänta på grönt" fortsatt agent-disciplin vid `--admin`, inte något GitHub tvingar.
- Checks som **inte** är required (`stability` är warn-only, plus runtime-kontrakt) och bugbot-subagentens pass är därför verkligt skydd utöver de fyra.

## Varför sign-off-kommentaren måste komma före labeln

`merge-ready-freshness.yml` triggar bland annat på bot-`issue_comment`. Sekunder efter att en PR öppnas postar Codex och Bugbot nästan alltid en kommentar (numera ofta bara "usage limit reached"). Den körningen tar ~20 sekunder och läser PR:ens labels **och** kommentarer från API:t när den väl kommer fram. Sätts labeln inuti det fönstret, innan sign-off-kommentaren finns, ser körningen en labelad PR utan sign-off och river labeln med skälet "merge:ready utan giltig sign-off-rad" — trots grön grind och oförändrad head-SHA.

**Skarpt fall #665, 2026-07-30:** bot-kommentarer 20:12:08–09 startade två körningar 20:12:12–13 som avslutades 20:12:31–33. Labeln sattes 20:12:24 och sign-offen 20:12:27, alltså båda mitt i fönstret → labeln revs 20:12:27. Mergaren såg "författaren är inte klar" på en PR som var helt färdig.

Skrivs sign-offen först finns den när körningen läser, och dess tidsstämpel är nyare än bot-kommentarens → labeln behålls. Har det redan hänt ligger sign-offen kvar, så det räcker att sätta labeln igen.

Sign-off-raden är en **PR-kommentar**, inte PR-body, eftersom freshness-grinden använder GitHubs `created_at` på kommentaren som tidpunkt och en body inte har någon. `at:`-fältet i raden är läsbarhet för människor — det avgör ingenting, eftersom författarstyrd text inte kan vara ordningsgrund i en säkerhetsgrind.

### Kvarvarande lucka, medvetet

Sätts labeln *efter* ett otriagerat bot-fynd triggar workflowen inget — den jämför händelser mot sign-off-tiden, och en färsk sign-off är alltid nyast. Att stänga luckan kräver verdict-kunskap som workflowen inte har. Ansvaret ligger därför kvar på författaren och mergaren.

Beslutslogiken ligger i `scripts/ci/merge-ready-freshness.mjs` och är enhetstestad. `vercel[bot]` räknas på review-vägarna (Vercel Agent Review postar riktiga logikfynd där) men inte som issue-kommentar (deploy-brus).

## Varför fyndsvepet aldrig får vara ett tidsfönster

Frågan inför merge är "är varje fynd på PR:en åtgärdat på nuvarande head?", inte "har något nytt landat sedan jag sist tittade?". Ett tidsfilter felar åt båda hållen, och båda hände 2026-07-25:

| PR | Fel |
|---|---|
| #610 | Mergades förbi ett Vercel-fynd som låg åtta minuter före filtret. Författarens sista fix kapades och fick bli #619 |
| #613 | Blockerades på tre fynd som redan var åtgärdade på en tidigare commit |

Därför: jämför varje fynds `original_commit_id` mot head och kontrollera i koden om det ligger bakåt.

## Varför sent arbete går i en ny PR

2026-07-25 landade en plan-commit i #607 samtidigt som den mergades, och fick brytas ut till #608 i efterhand. En mergare som ser grönt CI och en färdig-ut-seende PR har inget sätt att veta att en commit är på väg. Därför: öppna aldrig en icke-draft PR med arbete kvar att pusha.

## Varför dashboard-auto-mergaren är av

Beslut 2026-07-09. Cursor-dashboardens "PR-mergare" mergade allmänt och kringgick grinden via admin — **#468 mergades till master med en oåtgärdad P1 och 0 reviews**. Den kräver dessutom Cursor-billing för att ens starta.

Automationen bor inte i repot och lyder **inte** `.cursor/rules` — bara dashboard-inställningen stoppar den. Slår du på den igen: ge den samma grind och `merge:ready`-krav i dess dashboard-prompt, annars är den tillbaka i "dum"-läget.

Samma skäl ligger bakom rollspliten mellan billig bevakare och dyr beslutsfattare: en svag agent som mergar är en false-green-risk.

## Bot-granskarnas tillgänglighet över tid

| Datum | Händelse |
|---|---|
| 2026-07-02 | Codex av (credits slut) |
| 2026-07-08 | Codex tillbaka |
| 2026-08-01 | GitHub-Bugbot **och** Codex slog i taket samtidigt — #703/#704 stod utan externa ögon |
| 2026-08-20 | Samma sak hela kvällen under en åttafiligs våg (#1069–#1077): GitHub-Bugbot, Codex **och** «Find critical bugs» alla usage-limitade. `pr-ai-review` var enda externa granskaren — och räckte: den postade uttömmande review per head-SHA och fann verkliga fynd i #1073, #1076 och #1077. Den lokala `bugbot`-subagenten bar resten |

Den GitHub-integrerade Bugbot:en delar teamets budget och postar `Bugbot couldn't run - usage limit reached` när den tar slut. **Slut budget på GitHub är inget skäl att hoppa till manuell review** — den lokala `bugbot`-subagenten är en egen väg med egen budget. Det är hela poängen med fallback-stegen i regeln.

En Codex-kommentar som **bara** är "usage limit" betyder att den är av → icke-blockerande, inte ett gap.

## Två fällor som kostade tid 2026-08-20

**«Docs-only» skyddar inte mot kontraktstester.** Genvägen till master i
[`git.mdc`](../../.cursor/rules/git.mdc) gäller docs — men flera tester *läser*
`docs/`. En rad i `docs/decisions/README.md` vars kanoniska källa pekade på en
planfil fällde `registry.test.ts`, och master hade rött `quality` i ~40 minuter.
`docs:links` och `check:bug-backlog` var gröna hela tiden; de kontrollerar inte
den regeln. **Kör `npx vitest run src/lib/control-plane` före varje docs-push
till master** som rör `docs/decisions/`, glossaryn eller planroutern. Samma
kontroll fångade senare 13 brutna länkar i nyspårade skills innan de nådde
master — den är billig och betalar sig.

**`cancelled` är inte `failure`.** CI:s concurrency-grupp avbryter en pågående
körning när en ny commit landar på samma ref. En `quality: cancelled` på en
äldre commit betyder alltså «ersatt», inte «trasig» — läs alltid checken på
**nuvarande** head innan du drar slutsatsen att master är röd.

## Meta vs produkt (håll planen isär)

| Plan | Vad | Format |
|---|---|---|
| **Meta** | Modeller/verktyg som bygger Sajtmaskin: Cursor, Codex-review, `Task`-subagenter | slug, t.ex. `claude-opus-4-8-thinking-max` |
| **Produkt** | Modeller i `config/ai_models/manifest.json` som betjänar användarsajter | id, t.ex. `gpt-5.5`, `openai/gpt-5.5` |

Ange alltid vilket plan ett fynd hör till så de inte blandas ihop.
