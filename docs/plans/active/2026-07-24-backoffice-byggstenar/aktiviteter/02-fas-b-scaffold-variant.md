---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice Fas B — trygg skapa/ändra-yta för scaffold och variant, med farlig zon
source: Kodläsning backoffice/pages/scaffold_lifecycle.py + scaffolds.py + ägarbeslut 2026-07-24
---

# Etapp 3 — Fas B: trygg create/edit för scaffold + variant

Master-plan: [`../00-master-plan.md`](../00-master-plan.md).
Etapp 2 (baseline-backupen) är mergad 2026-07-28 — sammanfattad i master-planen —
så förutsättningen är uppfylld.
Sedan mandatändringen 2026-07-29 (master-planen § *Mandatändring*) behöver du
**inte** stanna för ägarens granskning när fasen är klar. Fas C startar när Fas B
är **mergad** — beroendet är `danger_zone`/`confirm_by_typing` i `shared.py`, inte
ett godkännande.

## Mål

Ägaren ska kunna **skapa, klona och ändra** scaffolds och varianter utan att känna
att hela sidan är farlig, och det destruktiva ska ligga tydligt avskilt.

## B1 — tabbomläggning i `backoffice/pages/scaffold_lifecycle.py`

`render()` har idag sex tabbar: `Översikt · Skapa scaffold · Varianter · Radera
scaffold · Pipeline · Baseline`. Byt till fem, grupperade efter verb:

| Ny tabb | Innehåll (befintliga funktioner, oförändrade) |
|---|---|
| **Titta** | `_render_tree_view(...)` |
| **Skapa** | `_render_create_scaffold(...)` + `_render_create_variant(...)` + rad som pekar på **Guide** för AI-hjälp |
| **Ändra** | `_render_edit_variant(...)` + länk till *Scaffolds: titta & justera* för scaffold-metadata |
| **Farlig zon** | `_render_delete_variant(...)`, `_render_delete_scaffold(...)`, `_render_baseline_tab(...)` |
| **Underhåll** | `_render_pipeline_tools(...)` |

**Krav:** alla `_render_*`-funktioner behåller namn och signatur, så
`backoffice/test_scaffold_lifecycle_integrity.py` och
`backoffice/test_scaffold_baseline_reset.py` fortsätter gälla oförändrade.

## B2 — farlig zon som mönster

Lägg i `backoffice/shared.py` (medvetet inte skapade i Fas A, eftersom de först
används här — ingen död kod):

* `danger_zone(label: str, *, help_text: str = "")` — röd rubrik + kort förklaring,
  returnerar en container så innehållet ramas in.
* `confirm_by_typing(expected: str, key: str) -> bool` — återanvändbar typad
  bekräftelse (samma semantik som baseline-fliken redan har; **lägg inte till en
  extra bekräftelse där**, återanvänd bara mönstret för radering).

Radering av variant/scaffold ska ligga inuti `danger_zone` med samma
säkerhetskopieringslöfte som redan gäller (`backup_tree` före katalogradering).

**Vad som faktiskt är nytt per yta (kodläst 2026-07-29):** scaffold-radering
(`scaffold_lifecycle.py:2258`) och baseline-fliken (`:2541`) har redan typad
bekräftelse — för dem är detta en ren refaktor till helpern, semantiken är
oförändrad. `_render_delete_variant` (`:1395`) har däremot **bara en checkbox**,
så där tillkommer typad bekräftelse: en medveten friktionsökning på den enda
destruktiva ytan som saknar den. Det motsäger inte etapp 2:s slutsats att
"friktion var inte problemet" — den handlade om att *inte* lägga en tredje
bekräftelse ovanpå två befintliga, inte om att lämna en yta utan sin första.

## B3 — samma svenska fältnamn på alla tre ytorna

Gäller `scaffold_lifecycle.py` (skapa/ändra), `scaffolds.py` (editorn) **och**
`scaffold_wizard.py` (guiden), så det inte längre finns två språk för samma fält.
Wizarden var utelämnad i den första versionen av det här dokumentet, men har kvar
exakt samma engelska etiketter (`Allowed Build Intents`, `Prompt Hints`,
`Quality Checklist`, `Signature Motif`, `Color Mode`, `Font Pairings`,
`Theme Tokens` — verifierat 2026-07-29). Utan den blir löftet osant, och
wizarden rörs ändå i B4. Teknisk nyckel i parentes:

| Idag | Nytt |
|---|---|
| Label | Namn (`label`) |
| Description | Beskrivning (`description`) |
| Tags (one per line) | Matchord, en per rad (`tags`) |
| Prompt Hints (one per line) | Instruktioner till own-engine (`promptHints`) |
| Quality Checklist (one per line) | Kvalitetskrav (`qualityChecklist`) |
| Allowed Build Intents | Får användas för (`allowedBuildIntents`) |
| Site Kind | Typ av sajt (`siteKind`) |
| Complexity | Komplexitet (`complexity`) |
| Structure/Content Profile | Struktur (`structureProfile`) / Innehåll (`contentProfile`) |
| Signature Motif | Visuellt signum (`signatureMotif`) |
| Color Mode | Ljus eller mörk (`colorMode`) |
| Font Pairings | Typsnittspar (`fontPairings`) |
| Theme Tokens | Färg-/formvärden (`themeTokens`) |
| Signature layouts/motifs/antiPatterns | Signaturmönster: layouter / motiv / undvik (`signaturePatterns`) |

Ändra **inte** valideringsreglerna (kebab-case-krav, minsta antal rader, tvingad
startvariant, `_SIG_MIN_*`) — bara etiketterna och hjälptexterna.

Kanonisk källa för de svenska orden är `docs/architecture/glossary.md`; hitta
inte på nya.

## B4 — wizarden som rekommenderad väg

* `Vad kommer att skrivas?`-sammanfattning före checklistan i steg 4 (filer + spara-läge).
* `_run_checks`-garantin är oförändrad: inget skrivs förrän checklistan är grön.
* Spara-läget är redan steg-styrt sedan Fas A (`_save_scope_for_step`) — behåll det.

## B5 — tester

* Utöka `backoffice/test_scaffold_lifecycle_integrity.py`: create-scaffold-valideringen
  (kebab-case, minsta antal rader, tvingad startvariant) står kvar efter omläggningen.
* Nytt/utökat test som asserterar att **alla tre** destruktiva ytorna (variant,
  scaffold, baseline) ligger bakom typad bekräftelse — variantytan är den som
  faktiskt ändras, de andra två är regressionsskydd för refaktorn.
* Om `danger_zone`/`confirm_by_typing` blir rena funktioner: enhetstesta dem.

Baslinje att mäta mot: **131 gröna backoffice-tester** på master `cf7bfcbd`
(`npm run backoffice:test`).

## B6 — opt-in, endast på ägarens begäran

Alternativ 2: flytta variant-CRUD ur `scaffold_lifecycle.py` (2 675 rader per
2026-07-29 — filen växte av baseline-backupen, så mät själv i stället för att
lita på ett radantal i ett plandokument) till
`backoffice/pages/scaffold_variants.py` med egen menypost. Kräver att privata
helpers som testerna importerar följer med. **Gör inte detta ospecificerat.**

## Verifiering

```bash
npm run backoffice:test
npm run scaffolds:validate
```

Manuellt i **separat git-worktree** (så huvudcheckouten hålls ren):
skapa `test-plan-scaffold` + variant via UI → screenshot → radera via *Farlig zon* →
`git status` rent → snapshots syns i **Återställning**. Starta om Streamlit efter
kodändringar, annars serveras gamla moduler.

## Acceptans

* Menyn och tabbarna svarar på *var tittar jag / var ändrar jag / var skapar jag*.
* Skapa scaffold **och** variant fungerar end-to-end via UI med validering + backup.
* Allt destruktivt ligger i en uttalad farlig zon med typad bekräftelse — inklusive
  variant-radering, som tidigare bara hade en checkbox.
* Samma fältnamn på **alla tre** ytorna (`scaffold_lifecycle.py`, `scaffolds.py`,
  `scaffold_wizard.py`); inga ändrade valideringsregler.
