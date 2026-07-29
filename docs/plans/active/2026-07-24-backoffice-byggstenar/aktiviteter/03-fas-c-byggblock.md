---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice Fas C — Byggblock (dossiers) i samma språk och flöde, inkl. skapa från grunden
source: Kodläsning backoffice/pages/dossiers.py + docs/contracts/dossier-system.md + glossary + ägarbeslut 2026-07-24
---

# Etapp 4 — Fas C: Byggblock i samma språk och flöde

Master-plan: [`../00-master-plan.md`](../00-master-plan.md).
**Förutsätter** att Fas B ([`02-fas-b-scaffold-variant.md`](02-fas-b-scaffold-variant.md))
är **mergad** — Fas C konsumerar dess `danger_zone`/`confirm_by_typing` i
`shared.py`. Sedan mandatändringen 2026-07-29 (master-planen § *Mandatändring*)
är det ett kodberoende, inte ett godkännandeberoende, och du behöver inte stanna
för ägaren när fasen är klar.

## Nuläge

`backoffice/pages/dossiers.py` (~1 300 rader) fick sidmönstret i Fas A (rubrik,
kedjerad, spara-läge, teknik-expander), men innehållet är fortfarande
utvecklarorienterat:

* **nio** tabbar: `Översikt · Lista · Enforcement · Capability tiers · Redigera ·
  Capability map · Hälsokoll · AI-kuration · Legacy-import`;
* engelska kolumn-/fältnamn (`class`, `codeFidelity`, `defaultForCapability`, `mock`,
  `enforcement B/F/W`);
* enda editorn är en rå JSON-textarea;
* **det går inte att skapa ett byggblock från grunden** — bara AI-kuration från ett
  manuellt klonat repo under `data/template-references/repos/` eller legacy-import.

## C1–C2 — struktur

Tabbar 9 → 5:

| Ny tabb | Innehåll |
|---|---|
| **Översikt** | `_section_overview` (svenska nyckeltal) |
| **Lista** | `_section_list` (gruppvy per dossier-grupp kvar) |
| **Redigera** | `_section_edit` + `_section_delete` (radering i farlig zon-mönstret från Fas B) |
| **Skapa** | `_section_curate` (AI-kuration) + `_section_legacy_prospect` + **ny** "från grunden" (C5) |
| **Kontroller** | `_section_enforcement_overview` + `_section_capability_tiers` + `_section_capability_map` + `_section_health` som underrubriker |

`st.tabs` kör alla tab-bodies vid varje rerun — flytta inte in tunga
subprocess-anrop i default-vyn; behåll dem bakom knappar.

## C3 — glossary-svenska (UI-label, kod-id orört)

| Kod / manifest | UI-label |
|---|---|
| `hard` | **Kopplad** (kräver extern tjänst/nycklar) |
| `soft` | **Fristående** (bara npm-paket) |
| `defaultForCapability` | **Standardval** |
| `mock` | **Demoläge** (`canned`/`seed`/`success`/`visual`/`none`) |
| `codeFidelity` | **Kodtrohet** (`verbatim`/`rewritable`) |
| leverantörssyskon under samma capability | **Leverantör** |
| `enforcement` `build`/`feature-runtime`/`warn-only` | teknisk kolumn → flytta till teknik-expandern |

Kod-id, filnamn, routes och manifestfält behåller `dossier`-namnet. Kanonisk källa
för mappningen: `docs/architecture/glossary.md` — hitta inte på nya svenska ord.

## C4 — tryggare editor

Behåll rå-JSON i teknik-expandern (full kontroll), men lägg ett **fält-formulär**
ovanpå för de trygga fälten: `label`, `summarySv`, `complexity`, Standardval,
Demoläge. Samma fail-closed-kedja som idag:
`_validate_manifest` → `validate_json_against_schema(..., STRICT_SCHEMA_PATH)` →
`backup_file` → skriv. Ingen ny valideringsväg.

## C5 — "Skapa byggblock från grunden" (lägst prioritet, sist)

Formulär → manifest-skelett + `instructions.md`-stub. Krav:

* strict-schema (`docs/schemas/strict/dossier.schema.json`) måste vara **grönt före**
  skrivning — fail-closed;
* id och capability valideras som kebab-case, 2–60 tecken, **innan** något skrivs;
* **aldrig** överskrivning av en befintlig katalog under `data/dossiers/{hard,soft}/`;
* `instructions.md` ska innehålla de två obligatoriska H1-rubrikerna som
  `dossiers:validate-all` kräver (se `docs/contracts/dossier-system.md`);
* en **Kopplad** (hard) dossier måste ha `mock ≠ none` eller ligga på
  `MOCKLESS_CAPABILITY_EXCEPTIONS` — annars fäller `npm run dossiers:validate-all`.
  Formuläret ska tvinga ett demoläge, inte lämna det tomt;
* efter skapande: knapp som kör `npm run dossiers:validate-all` via `run_repo_command`.

## C6 — tester (`backoffice/test_dossiers_page.py`)

| Test | Assertion |
|---|---|
| skelett-validitet | genererat manifest passerar strict-schemat |
| ogiltiga indata | fel id/capability → ingen skrivning |
| ingen överskrivning | befintlig katalog rörs inte |
| etikett-täckning | varje `_class`- och `mock`-värde har en svensk etikett (ingen tom sträng) |

## Verifiering

```bash
npm run backoffice:test
npm run dossiers:validate-all
```

Manuellt: skapa ett testbyggblock via UI i separat worktree, kör
`dossiers:validate-all`, radera det igen och bekräfta zip-snapshot i **Återställning**.

## Acceptans

* Byggblock kan bläddras, redigeras och **skapas** utan förkunskap om capability-map
  eller schemafiler.
* Samma språk som scaffold/variant-ytorna, men systemen hålls tydligt åtskilda
  (byggblock ≠ mallar).
* Inga nya skrivvägar utan strict-schema + backup.
