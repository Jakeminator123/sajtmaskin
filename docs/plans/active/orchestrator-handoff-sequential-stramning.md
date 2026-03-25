# Handoff-prompt: orchestrerad sekventiell stramning (kopiera till nästa agent)

Klistra in blocket nedan som **hela användarprompten** (gärna med prefix `/orchestrator` eller `/automation`).

---

```
/orchestrator

Du kör en **orchestrated run** som **standardflöde** — inte ad hoc parallella agenter. Följ repots orchestrator-protokoll slaviskt.

## Bakgrund — var vi befinner oss

- **Remediation-spår:** Extern review + uppföljning enligt `docs/plans/active/external-review-remediation-progress.md` (ungefärlig **whole vision ~39%**; landning ~72%; integrationer+deploy ~38% efter registry-del av W2; own-engine ~0%; scripts ~32%).
- **Sekventiella workloads:** `docs/plans/active/orchestrator-workloads-external-review.md` (W1–W5). **W1** och **W2 (registry + detektion)** är delvis levererade på `master`; **kvar inom W2:** manifest + tunnare deploy. Därefter **W3** (own-engine), **W4** (scripts/naming hygiene). W5 = valfri läsning av `.j_to_agent/structure_bugs_and_parralells/kritik/`.
- **Källtexter (kontext, ofta ej för commit):** `.j_to_agent/1.txt`, `2.txt`, `3.txt`.
- **Playwright / “spökmapp”:** **Löst** — kanonisk spec under `e2e/vercel-templates/` (spårad); `vercel_templates_levels/` valfri lokal spillra. Detaljer: `docs/architecture/vercel-templates-playwright-scaffold-integration.txt`.

## Instruktion

1. Läs `.cursor/skills/orchestrator-run/SKILL.md` och `.cursor/orchestrator/PROTOCOL.md`. Använd `.cursor/rules/terminology.mdc` för begrepp (orchestrator run, roadmap, workload, agent log, final sweep).
2. **Pre-flight:** från repo-roten kör `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1"` så färdiga körningar lämnar `run/`.
3. Skapa (eller fortsätt) en datad mapp under `.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/`.
4. Skriv **`ROADMAP.md`** först: tydliga faser, ägare per workload, acceptanskriterier, ordning (**sekventiellt** — en tung workload i taget där merge-risk finns).
5. **Starta agenter** (delegation) en i tagen enligt roadmap: för varje steg `workloads/…`, `agent-logs/…`, `verification/…` när steget är klart.
6. **Filtyper och ytor** du förväntas röra vid fortsatt stramning (beroende på workload):
   - **Plan/progress:** `docs/plans/active/external-review-remediation-progress.md`, `orchestrator-workloads-external-review.md`, denna handoff-fil vid behov.
   - **App:** `src/` (landing, `integrationRegistry`, `detect-integrations`, layout, builder-relaterat för W2/W3).
   - **Skript & kontrakt:** `scripts/`, rot-`package.json`, `vitest.config.ts`, `tsconfig.json`, `vercel_template_cli.py`, `hamta_sidor*.py`.
   - **Research (offline):** `research/external-templates/` (rå discovery, template-library — dokumentera om du ändrar hur intag beskrivs).
   - **E2E / Playwright (om aktuellt):** `e2e/` (lokalt påbörjad kopia av Vercel-templates-spec — synka med `package.json` och docs om ni väljer spårad kanonisk sökväg).
   - **Orchestrator-artefakter:** endast under `.cursor/orchestrator/run/…` (run-mappen är gitignorerad utom `run/README.md`; **varaktiga** slutsatser lyfts till `docs/`).
7. **Dokumentera och städa:** uppdatera progress-tabeller, rätta uppenbar doc-drift, ta bort kvarlämnade temporära filer i *spårade* ytor om du skapat dem. Ingen omfattande orelaterad refaktor.
8. **Avslut:** `FINAL_SWEEP.md` + `FINAL_REPORT.md`; kör arkiveringsskriptet med `-RunName` enligt PROTOCOL; lägg kort rad i `.cursor/orchestrator/run-summaries.md` om protokollet kräver det.
9. **Git:** när leveransen är sammanhängande: `git add` endast reporelevanta filer, **commit** med tydlig subject (gärna helhets-% i remediation-stil, t.ex. `chore: remediation ~NNpct — …`), **push** till `master` (eller aktiv branch).

Kör nu.
```

---

## Lokalt för den som skapade denna fil

- Uppföljning: vid behov städa bort lokal `vercel_templates_levels/` när du verifierat att inget unikt finns där; läs `vercel-templates-playwright-scaffold-integration.txt` innan du rör scaffold-pipeline.
- **2026-03-25:** Run `2026-03-25-external-review-w2` arkiverad (se `.cursor/orchestrator/archive/` + `run-summaries.md`); leverans på `master`: `a171e6ce` (W2-registry, Vitest `e2e/**`-exclude).
