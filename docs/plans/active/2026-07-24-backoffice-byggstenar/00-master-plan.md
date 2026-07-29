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
| 3 | **Fas B** — trygg create/edit för scaffold + variant | [`aktiviteter/02-fas-b-scaffold-variant.md`](aktiviteter/02-fas-b-scaffold-variant.md) | Ej påbörjad |
| 4 | **Fas C** — Byggblock i samma språk + skapa från grunden | [`aktiviteter/03-fas-c-byggblock.md`](aktiviteter/03-fas-c-byggblock.md) | Ej påbörjad |
| 5–6 | **Fas D** — AI-modellval via manifestet | [`aktiviteter/04-fas-d-ai-modellval.md`](aktiviteter/04-fas-d-ai-modellval.md) | Förslaget **godkänt 2026-07-28** (tre separata workload-poster) — kör efter Fas C |
| 7 | **P2-städ** — resterna från stringensplanen | [`aktiviteter/05-p2-stringens-stad.md`](aktiviteter/05-p2-stringens-stad.md) | Ej påbörjad — sist, eller plocka rader när en sida ändå rörs |

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
3. Uppdatera statuskolumnen ovan i samma PR som etappen levereras.
4. Rör inte senare etapper i förbigående — särskilt inte Fas D, som ändrar
   modellval. Förslaget är godkänt (2026-07-28), men Fas D körs ändå **sist**,
   efter Fas B och C.

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

## Etapp 3 — Fas B (efter etapp 2)

* Tabbar i `scaffold_lifecycle.py` → `Titta / Skapa / Ändra / Farlig zon / Underhåll`
  (alla `_render_*`-funktioner behåller namn och signatur så befintliga tester gäller).
* `danger_zone()` + `confirm_by_typing()` läggs i `shared.py` först här, där de används.
  Scaffold-radering och baseline har redan typad bekräftelse (ren refaktor);
  variant-radering har bara en checkbox och **får** den i Fas B.
* Svenska fältnamn med teknisk nyckel i parentes, identiska på alla tre ytorna
  (`scaffold_lifecycle.py`, `scaffolds.py` och — tillagt 2026-07-29 — `scaffold_wizard.py`):
  Namn (`label`), Beskrivning (`description`), Matchord (`tags`), Instruktioner till
  own-engine (`promptHints`), Kvalitetskrav (`qualityChecklist`), Får användas för
  (`allowedBuildIntents`), Typ av sajt (`siteKind`), Komplexitet (`complexity`),
  Visuellt signum (`signatureMotif`), Ljus eller mörk (`colorMode`).
* Wizarden märks som rekommenderad väg; `_run_checks`-garantin ändras inte.
* Manuellt UI-test av skapa + radera scaffold i **separat git-worktree** så
  huvudcheckouten hålls ren.

## Etapp 4 — Fas C

* `dossiers.py`: tabbar 9 → 5 (`Översikt · Lista · Redigera · Skapa · Kontroller`).
* Glossary-svenska: `hard` → **Kopplad**, `soft` → **Fristående**,
  `defaultForCapability` → **Standardval**, `mock` → **Demoläge**,
  `codeFidelity` → **Kodtrohet**; teknisk kolumnvy bakom teknik-expandern.
* Fält-formulär för de trygga fälten ovanpå samma fail-closed-kedja
  (`_validate_manifest` + strict-schema + `backup_file`); rå-JSON kvar för full kontroll.
* **Sist:** "Skapa byggblock från grunden" — strict-schema grönt före skrivning,
  aldrig överskrivning av befintlig katalog, följt av `npm run dossiers:validate-all`.

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
