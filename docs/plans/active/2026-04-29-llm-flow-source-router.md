---
id: 2026-04-29-llm-flow-source-router
status: active
created: 2026-04-29
linear: null
parent: 2026-04-28-llm-flode-startlinje
supersedes: null
---

# LLM-flow + source router 2026-04-29

Syfte: en enda router-plan för att undvika planfilshamstring medan vi parallelliserar två saker:

1. **Source inventory**: vad är runtime, referensbank, eval eller legacy?
2. **LLM-flöde**: varför känns init/prompt/build-kedjan stel, långsam eller för prompt-tung?

Den här filen ska vara parent/anchor för cloud-agenter. Skapa inte en ny planfil per spår förrän vi har valt ett konkret PR-paket.

## Princip

```text
Source-map först
  → LLM-flow audit
  → parent syntes
  → 1-3 små PR-paket
  → review/merge bara det som faktiskt förbättrar runtime
```

Cloud-agenter ska i första passet köra **read-only**. De får läsa gitignored/cursorignored material om de får explicit path, men de får inte flytta, radera eller skriva om arkitektur utan parent-beslut.

## Vågor

Rekommendation: kör som **4 + 4 spår**, men inte som åtta oberoende implementationer. Våg A är källkarta. Våg B är LLM-flow. Parent-agenten håller syntes, väljer PR-paket och stoppar dubbelarbete.

| Våg | Spår | Agent-scope | Output |
|---|---|---|---|
| A | A1 v0-mallar | `templates_v0/` som lokal referensbank: downloads, ZIP, metadata, bilder, vad får användas och vad är aldrig runtime | Kort rapport + "do/don't" |
| A | A2 dossiers | `data/dossiers/{hard,soft}` + `src/lib/gen/dossiers/`: schema, instructions-format, hard/soft, verbatim/rewritable, capability-map | Validator-/docs-förslag |
| A | A3 scaffolds | `src/lib/gen/scaffolds/`: manifest, files, registry, serialize, om formatet är för prompt-first | Formatkritik + små PR-förslag |
| A | A4 variants/fonts/shadcn | `config/scaffold-variants/`, `data/shadcn-examples/`, font registry, variant-font materialisering | Font- och reference-riskrapport |
| B | B1 prompt size/latency | static core, dynamic context, component refs, scaffold serialization, prompt dumps, timeline | Mätpunkter + topp-5 bloat |
| B | B2 Deep Brief signal chain | `site-brief-generation.ts` → scaffold/variant/dossier/BuildSpec; var tappas `qualityBar`, `visualDirection`, `requestedCapabilities` | Signal-gap + testförslag |
| B | B3 build/finalize/repair | own-engine stream → autofix → validate → verifier → repair/finalize path; var skapas repairstorm | Pipeline-risk + förenklingsförslag |
| B | B4 simple creative path | "milstolpe/BRA" + dagens robusthet: när ska kort prompt + materialiserad scaffold/template vinna? | Spec för experiment-PR |

## Read-only rapportstatus

| Spår | Status | Viktig slutsats |
|---|---|---|
| A1 v0-mallar | Klar 2026-04-29 | `templates_v0/` är lokal intake/referensbank, inte runtime. Runtime-sanning är `src/lib/templates/*` för Mallar-tabben och `src/lib/gen/scaffolds/registry.ts` för promptstyrd generation. Råa ZIP:ar, bilder, Playwright-login och v0-scraping ska inte kopplas direkt till production/codegen. |
| A2 dossiers | Ej startad | — |
| A3 scaffolds | Ej startad | — |
| A4 variants/fonts/shadcn | Ej startad | — |
| B1 prompt size/latency | Ej startad | — |
| B2 Deep Brief signal chain | Ej startad | — |
| B3 build/finalize/repair | Ej startad | — |
| B4 simple creative path | Ej startad | — |

## Gemensam rapportmall

Varje cloud-agent ska svara i samma format:

```text
1. Runtime source of truth
2. Eval/research/legacy som inte är runtime
3. Det viktigaste glappet
4. Max 3 små PR-förslag
5. Vad som inte ska göras
6. Filer som granskats
7. Confidence: låg/medel/hög
```

## Källor och ansvar

| Område | Runtime? | Källa |
|---|---|---|
| v0-mallar | Nej, lokal referensbank | `templates_v0/downloads/`, `templates_v0/out/` |
| Runtime scaffolds | Ja | `src/lib/gen/scaffolds/`, `registry.ts` |
| Scaffold variants | Ja | `config/scaffold-variants/`, `src/lib/gen/scaffold-variants/` |
| Dossiers | Ja | `data/dossiers/{hard,soft}/`, `src/lib/gen/dossiers/` |
| shadcn examples | Ja, som compact Component References | `data/shadcn-examples/`, `src/lib/gen/data/shadcn-example-loader.ts` |
| scaffold eval reports | Delvis tooling/eval, vissa latest-filer kan påverka blocklist | `data/scaffold-eval/reports/` |
| template references | Nej, kuration-input | `data/template-references/` |

## Första PR-paket efter audits

| PR | Kandidat | Varför |
|---|---|---|
| PR 1 | Source-map docs + operating docs | Stoppar begreppsförvirring: v0-mallar vs scaffolds vs variants vs dossiers |
| PR 2 | Dossier validation hardening | Fångar formatklagomål via schema/test, inte magkänsla |
| PR 3 | Variant-font materialization audit/test | Största tydliga designrisk: variant säger fontpar, scaffold startar ofta med `Inter` |
| PR 4 | Prompt-size observability | Mät innan vi kapar Core Rules/dynamic context |
| PR 5 | Simple creative path spec/MVP | Kombinera milstolpe-känsla med dagens robusthet utan rollback |

## Stopplinjer

- Flytta inte `src/lib/gen/scaffolds/` bara för att pathen är djup. Lös orientering med docs/router först.
- Gör inte `templates_v0/downloads` till runtime-input direkt. Kurera via dossier/scaffold/variant först.
- Lägg inte till nya planfiler för A1-H4. Den här filen är router tills ett konkret PR-paket behöver egen plan.
- Kör inte browser mot aktiv `/builder`-chat under användarens generation.
- Blanda inte docs-städ, schemaändring och runtime-ändring i samma PR om det går att undvika.

## Definition of done

| Krav | Bevis |
|---|---|
| A1-A4 klara | Fyra read-only rapporter finns i PR-kommentar, issue eller denna planfil |
| B1-B4 klara | Fyra LLM-flow rapporter med gemensam mall |
| Parent syntes | Max 3 rekommenderade implementation-PR:er väljs |
| Planhygien | Inga nya aktiva planfiler utan konkret PR-scope |
| Runtime-säkerhet | `npm run typecheck` krävs för implementation-PR:er; docs-only behöver bara review |
