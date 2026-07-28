---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice — Byggstenar (scaffold/variant/byggblock/mall) begripligt och tryggt för produktägaren
source: Kodläsning (backoffice/pages/*, shared.py, tester, domain-map) + ägar-/coachbeslut 2026-07-24 + UI-verifiering med Playwright
---

# Backoffice Byggstenar — kördokument

> **Varför denna fil finns i repot:** arbetet levereras i etapper med
> ägargodkännande mellan varje. Kördokumentet ska överleva dator-, användar- och
> agentbyte, så nästa agent kan fortsätta utan att gissa.
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
| Etappleverans | En PR per etapp, stopp för ägarens granskning mellan etapperna |
| Terminologi | UI-label **Byggblock**; kod-id `dossier` kvar i paths/routes/API |

## Etappordning (ägarens beslut 2026-07-24)

```text
(1) Fas A-PR  →  (2) baseline-backup-PR  →  (3) Fas B  →  ägaren tittar
   →  (4) Fas C  →  ägaren tittar  →  (5) Fas D-förslag  →  ägaren godkänner  →  (6) Fas D
```

| # | Etapp | Aktivitetsdokument (ta ett i taget) | Status |
|---|---|---|---|
| 1 | **Fas A** — navigation, hub, språk, spara-läge | *(sammanfattad nedan)* | **Klar 2026-07-24**, PR #615 |
| 2 | **Baseline-backup** — dataförlust, egen liten PR | [`aktiviteter/01-baseline-backup.md`](aktiviteter/01-baseline-backup.md) | Ej påbörjad — **ta denna först** |
| 3 | **Fas B** — trygg create/edit för scaffold + variant | [`aktiviteter/02-fas-b-scaffold-variant.md`](aktiviteter/02-fas-b-scaffold-variant.md) | Ej påbörjad |
| 4 | **Fas C** — Byggblock i samma språk + skapa från grunden | [`aktiviteter/03-fas-c-byggblock.md`](aktiviteter/03-fas-c-byggblock.md) | Ej påbörjad |
| 5–6 | **Fas D** — AI-modellval via manifestet | [`aktiviteter/04-fas-d-ai-modellval.md`](aktiviteter/04-fas-d-ai-modellval.md) | Förslaget **godkänt 2026-07-28** (tre separata workload-poster) — kör efter Fas C |
| 7 | **P2-städ** — resterna från stringensplanen | [`aktiviteter/05-p2-stringens-stad.md`](aktiviteter/05-p2-stringens-stad.md) | Ej påbörjad — sist, eller plocka rader när en sida ändå rörs |

### Så tar en ny agent över

1. Läs det här dokumentet (beslut + etappordning), sedan **ett** aktivitetsdokument.
2. Kör bara den etappen, i **en egen PR** mot `master`, och stanna för ägarens granskning.
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

## Etapp 2 — baseline-backup (nästa, egen PR)

**Fyndet:** `_factory_reset_to_baseline` i `backoffice/pages/scaffold_lifecycle.py`
raderar filer som tillkommit efter baselinen — inklusive **ospårade** — utan att
säkerhetskopiera dem. Spårade filer finns kvar i git-historiken; ospårade finns
varken där eller i backup-lagret, alltså helt oåterkalleliga.

Design (korrigerad efter granskning):

* Bekräftelsen finns redan (kryssruta + exakt taggnamn + lista över avvikande filer) —
  **lägg inte till en tredje bekräftelse**; problemet är återställbarhet, inte friktion.
* Ordningen `git restore` → radera är redan säker och behålls.
* Det som saknas är **backup före `unlink`**, med samma fail-closed-mönster som
  scaffold-raderingen redan använder (`backup_* is None → avbryt utan att radera`).
* Ospårade filer täcks särskilt.
* Tester: backup sker före `unlink`, och misslyckad backup avbryter utan radering.
* Sidoeffekt i samma PR: Start-sidans copy "git är alltid det yttersta skyddsnätet"
  är osann för ospårade filer och ska formuleras om.

## Etapp 3 — Fas B (efter etapp 2)

* Tabbar i `scaffold_lifecycle.py` → `Titta / Skapa / Ändra / Farlig zon / Underhåll`
  (alla `_render_*`-funktioner behåller namn och signatur så befintliga tester gäller).
* `danger_zone()` + `confirm_by_typing()` läggs i `shared.py` först här, där de används.
* Svenska fältnamn med teknisk nyckel i parentes, identiska på båda ytorna:
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
