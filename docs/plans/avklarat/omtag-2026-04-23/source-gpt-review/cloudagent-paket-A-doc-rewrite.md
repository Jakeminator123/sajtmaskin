---
id: cloudagent-paket-A-doc-rewrite
title: Cloudagent Paket A — Dossier v1→v2 doc-omskrivningar
status: redo-för-cloudagent
created: 2026-04-21
priority: low
parent_plan: docs/plans/avklarat/dossier-cleanup-2026-04-21.md
parallel_safe_with: [cloudagent-paket-B-schema-validation]
blocked_by: []
estimated_effort: 3 timmar
suggested_runner: cloudagent (inga tester behövs — bara docs)
---

# Cloudagent Paket A — Dossier v1→v2 doc-omskrivningar

Tre dokumentfiler refererar fortfarande v1-dossier-pipen (96-pool, embeddings, scaffold-recommendations, compat-test). Inline-fixarna i `dossier-cleanup-2026-04-21.md` (D1, D2, D4, D6, D8, D9) tog hand om kortare formuleringar; dessa tre kräver omskrivning av hela sektioner och ett scope-beslut per fil.

## D3 — `docs/architecture/scaffold-system.md` sektion 3

**Var:** rad 52 + rad 62–90.

**Problem:** Diagrammet i sektion 3 visar v1-pipen (`data/dossiers/<id>/`-mappstruktur utan hard/soft-delning, `selected_files/`, `template-library.generated.json`, `derive-variants-from-dossiers.ts`, `recommendedScaffoldIds`-fält). Allt detta är borttaget i v2.

**Beslut:** vilken av dessa tre vägar?

1. **Skriv om diagrammet** mot v2 (`data/dossiers/{hard,soft}/<id>/`, capability-driven). Behåll det visuella värdet men uppdatera referenserna.
2. **Förenkla till en enradslänk** — sektion 3 hänvisar bara till `dossier-system.md` + `dossier-selection-flow.md`. Mest konsekvent med "kod är source of truth"-principen.
3. **Ta bort sektion 3 helt** — dossiers har inget att göra med scaffold-systemet i v2 (de är två separata spår).

**Rekommendation:** Alt 2. Sektion 3 förvirrar mer än den hjälper sedan dossiers blev oberoende av scaffolds.

## D5 — `docs/external-pipelines/vercel-templates-structure.md`

**Var:** rad 167–194 + 222.

**Problem:** Hela "dossier-pipeline"-sektionen + kategori-klassningen + `compat-test`-flödet beskriver v1. Filen är **kontraktsdokumentation** för en pipeline som inte längre existerar.

**Beslut:**

1. **Markera hela filen som historisk** — flytta till `docs/_archived/external-pipelines/vercel-templates-structure.md` med en pekare till v2-flödet.
2. **Skriv om mot dagens flöde** — Playwright-spec → manuell repo-clone till `data/template-references/repos/` → `npm run dossiers:curate`. Lägg fokus på AI-curation som ersätter den automatiserade pipen.

**Rekommendation:** Alt 1. v1-pipen är borta, ny pipe är tre kommandon utanför Playwright-domänen, så det rättfärdigar inte ett dedikerat external-pipelines-dokument än.

## D7 — `docs/schemas/external-template-pipeline-contract.md`

**Var:** rad 137–151 (eventuellt hela filen).

**Problem:** Påstår att runtime *inte* läser dossier-kataloger. Det är fel för own-engine v2 — `src/lib/gen/dossiers/registry.ts` walkar `data/dossiers/{hard,soft}/` direkt vid varje generering.

**Beslut:**

1. **Avgränsa scope-paragrafen** — gör det explicit att kontraktet bara gäller den **arkiverade** template-library-pipen, inte runtime-dossiers.
2. **Arkivera filen** — om template-library-pipen är död är kontraktet också irrelevant.

**Rekommendation:** Alt 2. Konsekvent med D5.

---

## Acceptansgränser för cloudagent

- 0 träffar på `data/dossiers/_index/` *som om det vore runtime-källa* i någon docs-fil utanför `_archived/`.
- 0 träffar på `recommendedScaffoldIds`, `compat-test`, `_status`-(field) i aktiva docs.
- `docs/architecture/README.md` länkar till alla aktiva dossier-docs (cheatsheet, dossier-system, dossier-selection-flow). Inga döda länkar.
- `docs/plans/README.md` listar fortfarande denna paket-A-fil tills den flyttas till `avklarat/`.
- Inga ändringar i kod eller schemas — bara docs.

## Källor cloudagent ska läsa

- Aktiv dossier-spec: `docs/architecture/dossier-system.md`
- Visuell layer: `docs/llm/dossier-selection-flow.md` + `docs/llm/llm-chain-flowchart.md`
- Cheatsheet: `docs/operating/dossier-cheatsheet.md`
- Schema: `docs/schemas/strict/dossier.schema.json`
- Glossary (uppdaterad 2026-04-21): `docs/architecture/glossary.md`
- Skill: `.cursor/skills/sajtmaskin-context/SKILL.md`
- Pipeline-rules: `.cursor/rules/pipeline-rules.mdc`

## Cloudagent-prompt

```
Du är cloudagent och tar Paket A — Dossier v1→v2 doc-omskrivningar.
Plan: docs/plans/active/cloudagent-paket-A-doc-rewrite.md

Tre filer kräver beslut + omskrivning:

D3: docs/architecture/scaffold-system.md sektion 3 (rad 52, 62-90)
    Min rekommendation: ersätt sektion 3 med en enradslänk till
    dossier-system.md + dossier-selection-flow.md. Ta bort diagrammet.

D5: docs/external-pipelines/vercel-templates-structure.md
    Min rekommendation: arkivera hela filen (flytta till
    docs/_archived/external-pipelines/) med pekare till v2-flödet.

D7: docs/schemas/external-template-pipeline-contract.md
    Min rekommendation: arkivera filen, konsekvent med D5.

Kontrollera mot acceptansgränserna i plan-filen. Inga kod-ändringar.
Inga test-körningar behövs. Skriv min plan + commit + push när klart.
Flytta sedan denna plan-fil från active/ till avklarat/.
```

---

**När detta är klart:** flytta filen till `docs/plans/avklarat/cloudagent-paket-A-doc-rewrite.md` med en kort slutstatus.
