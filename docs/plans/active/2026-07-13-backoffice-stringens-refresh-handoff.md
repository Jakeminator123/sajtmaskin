---
status: active
owner: unassigned
created: 2026-07-13
topic: Handoff — verifiera och "refresha" backoffice-stringensplanen mot nuvarande repo innan implementation
source: Orkestrator-granskning 2026-07-13 (gh pr list / git log senaste 4 dygn) — planens nulägesbild hann bli delvis stale
relates_to: docs/plans/active/2026-07-08-backoffice-stringens-plan.md
---

# Handoff: refresha backoffice-stringensplanen

> **Detta är ett uppdrag till en agent, inte en implementation.** Läs hela briefet,
> gör en **read-only** verifieringsrunda, och leverera en **uppdaterad plan** (diff mot
> `2026-07-08-backoffice-stringens-plan.md`) + en kort delta-tabell. Implementera
> ingenting i denna runda utan att stämma av med ägaren först.

## Varför

Backoffice-stringensplanen (`docs/plans/active/2026-07-08-backoffice-stringens-plan.md`)
skrevs 2026-07-08 som en read-only granskning: 9 rangordnade fynd (P0–P2) + ett
5-fas-förslag. Sedan dess har repot ändrats — bl.a. växte panelen och dossier-ytan
byggdes om. Planens **nulägesbild och dossier-specifika fynd riskerar därför vara
stale**. Innan någon börjar implementera fas 1–5 ska underlaget verifieras om mot
dagens kod.

### Känd drift sedan 2026-07-08 (verifierat 2026-07-13)

| Vad planen säger | Vad som gäller nu | Källa |
|---|---|---|
| "34 registrerade sidor" | **37** sidor (`PageSpec(`-räkning i `backoffice/pages/__init__.py`) | `Select-String PageSpec\(` |
| Dossier-sidan = enkel tabell | **Dossier-kategorivy + radera + skapa-inom-kategori** tillagt | PR #500 (`0cc7205bd`) |
| — | per-dossier mock-invariant-hint i backoffice | PR #502 (`0ab6a8cd9`) |
| — | fler backoffice-touch: cross-tenant fixText-lås, F3-flöde | PR #467 (`1ec8b4bdd`), #493 (`10b5fec06`) |

De **strukturella** fynden (2 `PAGE_GROUPS`, ~halva sidorna saknar `render_where_panel`,
dubbla manifest-editorer) höll fortfarande vid stickprov 2026-07-13 — men verifiera varje
fynd på nytt, lita inte på den här tabellen.

## Uppdrag (i ordning)

### 1. Verifiera nulägesbilden om
Kör om varje siffra i planens "Nulägesbild"-tabell mot koden och notera avvikelser:
- Antal `PageSpec(` i `backoffice/pages/__init__.py` (sidor) och `PAGE_GROUPS`.
- Antal sidor med `render_where_panel(` (grep i `backoffice/pages/*.py`).
- Antal poster i `config/dashboard/domain-map.json` (`pages`-nycklar) vs antal sidor.
- Antal testfiler `backoffice/test_*.py` och antal tester (kör `pytest backoffice -q` eller motsvarande, läs bara utfallet).
- Radantal per sida (min/max) — bekräfta att `scaffold_lifecycle.py` fortfarande är störst.

### 2. Triagera de 9 fynden mot dagens kod
För **varje** rangordnat fynd i planen, sätt en status:
`fortfarande giltigt` / `delvis åtgärdat` / `åtgärdat` / `inaktuellt`, med file:line-bevis.
Extra viktigt givet driften:
- **P0 #1 (domain-map-täckning):** har de nya/ombyggda dossier-sidorna post i `domain-map.json`? Är `test_domain_map_parity.py` fortfarande enkelriktad?
- **P1 #3 (scaffold-trippeln) + #2 (dubbla manifest-editorer):** oförändrade?
- **P1 #4 (grupp-uppdelning):** är `PAGE_GROUPS` fortfarande 2? Passar de 5–6 föreslagna klustren fortfarande de 37 sidorna, eller behövs ett nytt kluster (t.ex. dossier-kategorivyn)?
- **P2 #8 (testluckor):** täcker någon ny test de moduler planen pekar ut (särskilt `projects_admin.py` destruktiv radering, `scaffold_lifecycle.py`, `dossiers.py`)?
- **P2 #9 (terminologi-drift):** stämmer UI-texterna mot `docs/architecture/glossary.md` (RenderGate/ReleaseGate/Normalize/RepairGate, `own-engine`)?

### 3. Leverera en uppdaterad plan
- Uppdatera `2026-07-08-backoffice-stringens-plan.md` **in place** (behåll historiken, lägg en `## Refresh 2026-07-13`-sektion + rätta nulägessiffrorna) — eller skriv en tydlig diff/patch som ägaren kan granska.
- Lägg en kort **delta-tabell**: "fynd → status → ev. ny/ändrad rekommendation".
- Om ett fynd är åtgärdat: notera vilken PR/commit som gjorde det.
- Behåll fas-indelningen men märk faser som ändrats av driften.

## Konkreta paths & kommandon (PowerShell)

```powershell
# Sidor + grupper
Select-String -Path backoffice/pages/__init__.py -Pattern "PageSpec\(","PAGE_GROUPS"
# Where-panel-täckning
Get-ChildItem backoffice/pages/*.py | ForEach-Object { if (Select-String -Path $_ -Pattern "render_where_panel\(" -Quiet) { $_.Name } }
# Domain-map
Get-Content config/dashboard/domain-map.json | ConvertFrom-Json | Select-Object -ExpandProperty pages | Get-Member -MemberType NoteProperty | Measure-Object
# Tester
Get-ChildItem backoffice/test_*.py | Select-Object Name
# Vad har rört backoffice nyligen
git log --since="10 days ago" --oneline -- backoffice/ config/dashboard/domain-map.json
```

Relevanta filer: `backoffice/app_main.py`, `backoffice/shared.py`,
`backoffice/pages/__init__.py`, `backoffice/pages/*.py`, `config/dashboard/domain-map.json`,
`docs/architecture/glossary.md`, `.cursor/skills/sajtmaskin-context/SKILL.md`
("backoffice måste spegla faktisk runtime, inte aspiration").

## Regler / ramar

- **Read-only i undersökningsfasen.** Ändra bara plan-doc:en (docs), inte backoffice-kod, förrän ägaren prioriterat en fas.
- Följ `.cursor/rules/plan-lifecycle.mdc` (docs speglar runtime, ersätt gammal text — lägg inte nya lager), `terminology.mdc` (kodnamn på engelska; RenderGate/ReleaseGate/Normalize/RepairGate/own-engine), `response-format.mdc` och `bash-och-pwsh.mdc`.
- Ingen git-åtgärd (commit/push/PR) utan explicit begäran.

## Icke-mål (samma som ursprungsplanen)

- Ingen ny backoffice-auth/behörighetsmodell.
- Ingen migrering bort från Streamlit.
- Ingen ändring av *vilka* data sidorna visar — bara hur sant, hittbart och enhetligt.

## Leverabel (definition of done för denna runda)

- [ ] Nulägesbildens siffror verifierade om (37 sidor m.m.) och rättade i plan-doc:en.
- [ ] Alla 9 fynd triagerade med status + file:line-bevis.
- [ ] Delta-tabell "fynd → status → ev. ny rekommendation".
- [ ] Fas-planen märkt/justerad där driften påverkat den.
- [ ] Inga kodändringar i `backoffice/` (om inte ägaren uttryckligen bett om en fas).
