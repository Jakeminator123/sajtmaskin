---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice — Byggstenar (scaffold/variant/byggblock/mall) begripligt och tryggt för produktägaren
source: Kodläsning (backoffice/pages/*, shared.py, tester, domain-map) + ägar-/coachbeslut 2026-07-24 + UI-verifiering med Playwright
---

# Backoffice Byggstenar — kördokument

> **Varför denna fil finns i repot:** arbetet levereras i etapper, en PR per
> etapp. Ursprungligen med ägargodkännande mellan varje; sedan 2026-07-29 är
> stoppen delegerade (se § *Mandatändring*), men etappindelningen står kvar.
> Kördokumentet ska överleva dator-, användar- och agentbyte, så nästa agent kan
> fortsätta utan att gissa.
>
> **Denna fil äger hela backoffice-spåret sedan 2026-07-27.** Den äldre,
> bredare stringensplanen (2026-07-08) är raderad: kärnan levererades 2026-07-21
> och är indexerad i [`../../avklarat/README.md`](../../avklarat/README.md), medan
> dess kvarvarande P2-städ ligger som
> [`aktiviteter/05-p2-stringens-stad.md`](aktiviteter/05-p2-stringens-stad.md).
> Tidigare dokumenterades Fas A på båda ställena — nu bara här.

## Problemet (ägarens ord)

Backoffice fungerar tekniskt men känns råddig: scaffolds, variants, byggblock och
mallar ligger utspridda på flera menyval utan en gemensam mental modell, default-ytan
är full av tech-jargon, och — viktigast — **det går inte att se vad en sparning
faktiskt påverkar**, så ägaren vågar inte ändra något.

## Beslut som styr arbetet

| Beslut | Innebörd |
|---|---|
| IA-alternativ **1** | Hub + verb-namn, ingen flytt av CRUD-kod. Alternativ 2 (variant-CRUD ur `scaffold_lifecycle.py`) är opt-in och tas först efter live-demo |
| Spara-läge är acceptanskriterium | Varje redigerings-/skapayta säger i **default-ytan**: `repo` (fil i repot, prod först vid merge till `master`) · `local` (gitignorerat) · `prod` (påverkar produktion direkt) |
| Hubben äger bara byggstens-modellen | Start-Översikt = karta över alla vyer (länkar till hubben) · Control Plane = filägarskap per beslut (rörs inte) · hubben renderar förklaringar **ur docs**, ingen prosa-kopia i Python |
| Fas D separat och sist | Modellval ändrar beteende, inte bara yta. Wizarden får **inte** ärva workloaden `analyze_presentation_vision` (den hör till `src/app/api/analyze-presentation/route.ts`) |
| Etappleverans | En PR per etapp. Ursprungligen med stopp för ägarens granskning mellan etapperna; **sedan 2026-07-29 delegerat** — se nedan |
| Terminologi | UI-label **Byggblock**; kod-id `dossier` kvar i paths/routes/API |

## Etappordning (ägarens beslut 2026-07-24)

```text
(1) Fas A-PR  →  (2) baseline-backup-PR  →  (3) Fas B  →  ägaren tittar
   →  (4) Fas C  →  ägaren tittar  →  (5) Fas D-förslag  →  ägaren godkänner  →  (6) Fas D
```

| # | Etapp | Aktivitetsdokument (ta ett i taget) | Status |
|---|---|---|---|
| 1 | **Fas A** — navigation, hub, språk, spara-läge | *(sammanfattad nedan)* | **Klar 2026-07-24**, PR #615 |
| 2 | **Baseline-backup** — dataförlust, egen liten PR | *(sammanfattad nedan)* | **Klar 2026-07-28** — snapshot före restoren |
| 3 | **Fas B** — trygg create/edit för scaffold + variant | *(levererad — sammanfattad nedan, aktivitetsfilen raderad)* | **Klar 2026-07-29**, PR #649 |
| 4 | **Fas C** — Byggblock i samma språk + skapa från grunden | *(levererad — sammanfattad nedan, aktivitetsfilen raderad)* | **Klar 2026-07-29**, PR #654 |
| 5–6 | **Fas D** — AI-modellval via manifestet | [`aktiviteter/04-fas-d-ai-modellval.md`](aktiviteter/04-fas-d-ai-modellval.md) | Förslaget **godkänt 2026-07-28** (tre separata workload-poster) — **enda kvarvarande fas**, kör nu |
| 7 | **P2-städ** — resterna från stringensplanen | [`aktiviteter/05-p2-stringens-stad.md`](aktiviteter/05-p2-stringens-stad.md) | **Delvis:** P2-1 klar (#647), P2-3 klar (#650). Kvar: P2-2, P2-4, P2-5, P2-6 |

### Mandatändring 2026-07-29 — granskningsstoppen är delegerade

Ägaren har delegerat genomförandet av resterande etapper: **kör hela planen utan
att stanna mellan etapperna.** Kedjan ovan gäller fortfarande som beroendeordning,
men grinden mellan etapperna är nu bot-koll + merge
([`pr-merge-review-gate.mdc`](../../../../.cursor/rules/pr-merge-review-gate.mdc))
i stället för ägarens ögon. Fas D:s förslag var redan godkänt 2026-07-28, så
inget väntar på beslut.

Två saker som delegeringen **inte** ändrade: beroendeordningen (Fas C bygger på
Fas B:s `danger_zone`/`confirm_by_typing`; Fas D körs sist eftersom den ändrar
beteende) och kravet att varje etapp levereras i en egen PR med grön grind.
Etapper vars filer inte överlappar får köras parallellt i egna worktrees —
`shared.py` är den vanligaste kollisionspunkten, så låt en etapp åt gången äga den.

### Så tar en ny agent över

1. Läs det här dokumentet (beslut + etappordning), sedan **ett** aktivitetsdokument.
2. Kör bara den etappen, i **en egen PR** mot `master`. Sedan mandatändringen
   2026-07-29 behöver du inte stanna för ägarens granskning — men merge-grinden
   (`pr-merge-review-gate.mdc`: bot-koll, 7-min-fönstret, `merge:ready`) gäller
   oavkortat.
3. Uppdatera statuskolumnen ovan i samma PR som etappen levereras. Fas B/C och
   P2-1/P2-3 gjordes i stället i en samlad loggnings-PR efteråt, eftersom fyra
   grenar var i luften samtidigt och statusraden hade blivit en konfliktmagnet.
   Priset var att `master` en stund stod med "Ej påbörjad" på levererad kod. Är
   bara **en** etapp i luften: följ regeln som den står.
4. Rör inte senare etapper i förbigående — särskilt inte Fas D, som ändrar
   modellval. Förslaget är godkänt (2026-07-28), men Fas D körs ändå **sist**,
   efter Fas B och C.

**Kvar när detta skrivs (2026-07-29):** Fas D + P2-2, P2-4, P2-5, P2-6. Allt
annat i planen är levererat och mergat.

## Fas A — vad som landade (klar)

| Del | Filer |
|---|---|
| Hub | ny `backoffice/pages/building_blocks.py` — fyra byggstenar, kedjan `mall → scaffold + variant → byggblock → sajt`, siffror från disk, definitioner ur `docs/architecture/glossary.md`, urvalsavsnitt ur `docs/contracts/{scaffold-system,dossier-system}.md` |
| Helpers | `backoffice/shared.py`: `render_building_blocks_nav`, `render_save_scope` + `SAVE_SCOPE_PATHS/MESSAGES`, `tech_details`, `read_doc_section`, `read_markdown_table_cell`, `first_sentence` |
| Meny | `backoffice/pages/__init__.py`: verb-namn i arbetsordning, hubben först, `Scaffold Performance` → `Scaffold-poäng` i Telemetri & loggar, gamla namn/slugs som **permanenta** `?nav=`-alias |
| Copy/jargon | `scaffolds.py`, `scaffold_lifecycle.py`, `scaffold_wizard.py`, `dossiers.py`, `templates_blob.py`, `overview.py` |
| Prod-märkning | `projects_admin.py`, `database_health.py`, `log_export.py` |
| Följ-referenser | `config/dashboard/domain-map.json`, `config/control-plane/policy-registry.json`, `scripts/canvas/*`, `docs/contracts/scaffold-system.md`, `docs/schemas/scaffold-contract.md`, `docs/generated/policies.generated.md` |
| Grind | ny `backoffice/test_building_blocks_nav.py` (15 tester) |

### Menynamn: gammalt → nytt

| Gammalt | Nytt | Läge |
|---|---|---|
| *(fanns inte)* | Byggstenar: översikt | 🟢 läser |
| Scaffolds | Scaffolds: titta & justera | ✏️ redigerar |
| Scaffold Lifecycle | Scaffolds & varianter: skapa, klona, ta bort | 🔴 kan radera |
| Scaffold Wizard | Guide: ny scaffold eller variant (AI) | ✏️ redigerar |
| Dossiers (legoklossar) | Byggblock (dossiers) | 🔴 kan radera |
| Mallar → Blob-upload | Mallar (v0): inspiration & uppladdning | ⚙️ kör skript |
| Scaffold Performance | Scaffold-poäng (gruppen Telemetri & loggar) | 🟢 läser |

Gamla `?nav=`-slugs (`scaffolds`, `scaffold-lifecycle`, `wizard`, `dossiers`,
`scaffold-performance` …) och de gamla sidnamnen resolverar fortfarande — det är
testat och ska aldrig tas bort.

## Etapp 2 — baseline-backup: vad som landade (klar 2026-07-28)

**Fyndet:** `_factory_reset_to_baseline` i `backoffice/pages/scaffold_lifecycle.py`
raderade filer som tillkommit efter baselinen — inklusive **ospårade** — utan att
säkerhetskopiera dem. Spårade filer finns kvar i git-historiken; ospårade fanns
varken där eller i backup-lagret, alltså helt oåterkalleliga.

Varje dömd fil snapshotas nu till `data/backoffice/backups/files/` och syns i
sidan **Återställning**, fail-closed: kan en snapshot inte tas händer ingenting.
Ingen tredje bekräftelse tillkom (friktion var inte problemet), `BASELINE_PATHS`
och `BASELINE_TAG` är orörda.

**Tre rättelser mot den ursprungliga designen — värda att minnas:**

| Antagande i planen | Verkligheten |
|---|---|
| Backup **före `unlink`** räcker | Nej. `git restore --staged --worktree` raderar själv spårade sökvägar som inte finns i taggen, så en staged-men-ocommittad fil är redan borta när loopen körs (innehållet finns då bara som dangling blob). Snapshot-passet ligger därför **före restoren**. Det bryter inte den transaktionella ordningen — restoren körs fortfarande före varje radering — och fail-closed blir starkare: avbrott innan något alls hänt. |
| En saknad fil kan hoppas över | Nej, det gör återställningslöftet falskt. Varje sökväg git listat som avvikande **måste** finnas; annars avbryts hela åtgärden. |
| Git-output kan användas som sökväg rakt av | Nej. `core.quotePath` C-citerar `rädd.txt` till `"r\303\244dd.txt"`, och `text=True` utan explicit encoding avkodar UTF-8 som cp1252 på svensk Windows. Båda ger en sökväg som inte finns → filen hoppades över och raderades ändå. `_run_git` sätter nu `-c core.quotePath=false` + `encoding="utf-8"`. |

Copy i samma PR: baseline-fliken säger nu att filerna kan rullas tillbaka, och
Start-sidans "git är alltid det yttersta skyddsnätet" (osant för ospårade filer)
är omskriven.

**Utanför scope, medvetet:** ocommittade *ändringar* i spårade filer, som
restoren också återställer. Det är vad en fabriksåterställning är till för och
UI:t varnar för det; bara raderingarna var oåterkalleliga.

Grind: `backoffice/test_scaffold_baseline_reset.py` — 8 tester (de 3 tidigare
oförändrade). Det icke-ASCII-fallet är verifierat att falla utan
`quotePath`-fixen.

## Etapp 3 — Fas B: vad som landade (klar 2026-07-29, PR #649)

Tabbar i `scaffold_lifecycle.py` → `Titta / Skapa / Ändra / Farlig zon / Underhåll`
(alla `_render_*` behöll namn och signatur, så befintliga tester gällde oförändrat).
`danger_zone()`, `confirm_by_typing()` och `field_label()` ligger nu i `shared.py`.
Svenska fältnamn med teknisk nyckel i parentes på alla tre ytorna
(`scaffold_lifecycle.py`, `scaffolds.py`, `scaffold_wizard.py`).
`_run_checks`-garantin är orörd. 235 backoffice-tester gröna.

**Den verkliga vinsten:** variant-radering hade bara en kryssruta medan de två
andra destruktiva ytorna redan krävde inskriven text. Nu går alla tre genom samma
helper, och raderingen är fail-closed mot snapshot-lagret — kan ingen snapshot
tas händer ingenting.

**En rättelse mot designen, värd att minnas:** rutan "Vad kommer att skrivas?"
listade bara filerna wizarden själv skriver. Men "Skapa nu" sätter `swz_autorun`,
och nästa render kör efter-stegen automatiskt: `scaffolds:variant-patterns`
skriver om variantfilen och `scaffolds:variant-embeddings` bygger om hela
`config/scaffold-variants/_index/variant-embeddings.json`. En lista som utelämnar
en fil är sämre än ingen lista — hela poängen med fasen är att man ska kunna se
vad en sparning påverkar. `_autorun_writes()` redovisar dem nu med villkoret
uttalat (utan `OPENAI_API_KEY` hoppas stegen över). Testet binder planen till
skriptens faktiska `writeFileSync`-mål i stället för till en sträng, så det faller
även när ett skript byter utdata. Hittat av Codex.

## Etapp 4 — Fas C: vad som landade (klar 2026-07-29, PR #654)

`dossiers.py`: tabbar 9 → 5 (`Översikt · Lista · Redigera · Skapa · Kontroller`),
glossary-svenska etiketter (`hard` → **Kopplad**, `soft` → **Fristående**,
`defaultForCapability` → **Standardval**, `mock` → **Demoläge**, `codeFidelity` →
**Kodtrohet**), teknisk kolumnvy bakom teknik-expandern, fält-formulär för de
trygga fälten ovanpå den befintliga fail-closed-kedjan, och **"skapa byggblock
från grunden"** — kebab-case-validering och strict-schema före skrivning, aldrig
överskrivning av en befintlig katalog. 266 backoffice-tester + 27/27 dossiers.

**Lärdomen från granskningen är viktigare än featuren.** Nio bot-fynd, varav sex
var *samma* klass av fel: en yta som ser fail-closed ut men släpper igenom ett
tillstånd som `npm run dossiers:validate-all` sedan fäller. Konkret:

| Asymmetri | Varför den uppstod |
|---|---|
| Fält-editorn kunde ta bort en Kopplad dossiers demoläge, medan skapa-vägen vägrar samma sak | `mock` är valfritt för både strict-schemat och `_validate_manifest`; regeln fanns bara i skapa-koden |
| Båda skrivvägarna kunde sätta ett andra `defaultForCapability: true` för samma funktion | Unikheten är ett **kors-manifest**-krav. Båda validerarna ser ett manifest i taget och kan per konstruktion inte upptäcka det |
| Listan visade en Standardval-bock som CI inte såg, och kryssrutan kunde skriva ett äkta `true` av en sträng | `"false"` är truthy i Python medan valideraren räknar strikt `=== true`. Samma fälla på fem ställen → regeln ligger nu i `is_default_for_capability()` |
| Enum-listorna i editorn var handskrivna kopior av schemats | En kopia driftar tyst: får schemat ett nytt demoläge slutar formuläret erbjuda det utan att något fäller. Läses nu ur schemat med fallback |

Mönstret att ta med sig: **när en fail-closed-regel bara finns i en av flera
skrivvägar är den inte en regel, den är en slump.** Lägg den i en delad hjälpare
och grinda den med test, annars driftar ytorna isär så fort någon lägger till en
till.

Ett fynd avfärdades: bugbot hävdade två gånger att `confirm_by_typing` anropas
med ett `label=`-argument helpern saknar. Den läste signaturen ur
aktivitetsdokumentet, inte ur `shared.py` — koden har argumentet. Det är också
skälet att aktivitetsfilerna raderas i samma veva: en skiss som ligger kvar
efter leverans blir en falsk kontraktskälla.

**Inte gjort:** det manuella UI-varvet i webbläsaren (skapa testbyggblock → kör
`dossiers:validate-all` → radera → bekräfta zip-snapshot i Återställning).
Statiska tester når inte renderingsfel som dubbla widget-nycklar. Två av de nio
fynden låg i renderingskoden, det ena verkligt och det andra inte — precis den
yta ett live-varv täcker.

## Etapp 5–6 — Fas D (förslaget godkänt 2026-07-28)

Godkänt: **tre** egna workload-poster i `config/ai_models/manifest.json` —
`backoffice_scaffold_wizard_persona` (vision, `gpt-4o`),
`backoffice_scaffold_wizard_guide` (text, `gpt-5.4-mini`) och
`backoffice_dossier_curation` (`gpt-5.5`). Persona och guide ska **inte** slås
ihop: olika modellbehov är själva skälet till två poster. Fallbacken (behåll
tupeln i `wizard_support.py` och dokumentera varför) är därmed förkastad.
Vision-gating behålls oavsett: bilder skickas bara till modeller som posten pekar
ut som vision-kapabla.
Övrigt i D: guidens hårdkodade `gpt-4o` ersätts av manifest-värdet, skärpt
persona-kontrakt (utan att röra schema/validering), och `--model=<id>` med
manifest-default i `scripts/dossiers/curate-from-reference.ts` i stället för
hårdkodad `gpt-4o-mini`.

## Verifiering per etapp

| Kontroll | Kommando |
|---|---|
| Backoffice-tester | `npm run backoffice:test` |
| Scaffold-kontrakt | `npm run scaffolds:validate` |
| Byggblock | `npm run dossiers:validate-all` |
| Docs/terminologi | `npm run docs:check` · `npm run docs:links` · `npm run check:terms:contract` |
| Registerkarta | `node scripts/control-plane/check-registry.mjs` |
| Manuellt | Streamlit + Playwright-screenshots av de berörda ytorna |

Fas A-utfall: 123 backoffice-tester (108 → +15), 12/12 scaffold-kontrakt,
27/27 byggblock, docs-grindar och control-plane-check gröna.

**Aktuell baslinje att mäta mot: 131 gröna backoffice-tester på master
`cf7bfcbd` (2026-07-29).** Siffran 123 ovan är Fas A:s historiska utfall — den
har vuxit av etapp 2 och av arbete utanför det här spåret, så jämför alltid mot
en färsk körning, inte mot ett tal i ett plandokument.

## Kör backoffice lokalt (och i Cloud-agent-VM)

```bash
pip install -r requirements.backoffice.txt      # i VM utan pip: python3 get-pip.py --break-system-packages
npm run backoffice                              # eller: python3 -m streamlit run sajtmaskin_backoffice.py
npm run backoffice:test
```

Navigering för screenshots/deep links: `?nav=<sidnamn eller alias>` (läses vid ny
session). Efter ändringar i `backoffice/**` krävs **omstart** av Streamlit —
annars serveras gamla moduler och en screenshot kan bli missvisande.

## Explicita icke-mål

Ingen ändring av runtime-matchning (`matcher.ts`, `select.ts`, embeddings) · ingen
migrering bort från Streamlit · ingen ny auth-modell för backoffice · inga nya
begrepp utanför glossaryn · inga secrets · inga artefakter/screenshots i repot.
