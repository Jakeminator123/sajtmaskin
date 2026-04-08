# Arkitektur — översikt

**Senast strukturerad om:** 2026-03-27 (fyra huvuddokument; utförligt arkiv under `docs/architecture/archive/` finns **inte** — återfinns vid behov med `git log` / `git show` på historiska sökvägar).

**Vad det här är:** en **ingångs**-sammanfattning i vanlig markdown — inte en tjänst, MCP-server eller “hub” i teknisk mening. Den här mappen beskriver **hur Sajtmaskin är uppbyggt** (egen motor, builder, preview, integrationer, repo). Produktordlista för agenter: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc). Nav i hela `docs/`: [`docs/README.md`](../README.md).

## Snabb orientering (rot-träd)

[Karta över rotmappar och två “data”-begrepp](./repo-tree.md) — läs före du gräver i detalj nedan.

## De fyra huvuddokumenten

| Dokument | Vad det täcker |
|----------|----------------|
| [system-overview.md](./system-overview.md) | Motorflöde, modellager, builder-entry (`BuildMethod`), handoff till planer |
| [builder-generation.md](./builder-generation.md) | Promptlager, modellval & trace, SSE, generation loop, UX-kontrakt, projektinställningar |
| [llm-input-blocks.md](./llm-input-blocks.md) | Steg 3: vad som når modellen (system vs user-turn vs historik), budget/pruning |
| [preview-deploy.md](./preview-deploy.md) | Tier-2 preview via `preview_host` / VM, preview-session lifecycle, legacy shim/compat, fidelity tiers, deploy-precheck |
| [preview-white-screen-runbook.md](./preview-white-screen-runbook.md) | Vit/tom preview: felsökning, loggar, förebyggande; speglar UI-runbook |
| [repository-and-platform.md](./repository-and-platform.md) | Mappar & terminologi, doc-livscykel, repo-hygien, skript/scaffolds, kände fel, v0-deprecation, Vercel-mallar/webhooks, övriga integrationer |

## Dokumentlivscykel

Policy: [`documentation-lifecycle.md`](./documentation-lifecycle.md).

## Snabblänkar (kod som sanning)

- `src/lib/gen/` — egen motor, stream, preview, sandbox
- `src/lib/models/catalog.ts` — byggprofiler / modell-ID
- `config/ai_models/manifest.json` — manifest för modeller
- `docs/schemas/README.md` — schema-dokumentation
